import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db/helpers.js";
import { toIso } from "../utils/mappers.js";

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/bank-transactions", async (request) => {
    const limitParsed = z.coerce.number().int().min(1).max(10000).default(1000).safeParse((request.query as any).limit);
    const limit = limitParsed.success ? limitParsed.data : 1000;

    const { rows } = await query<{
      id: string;
      external_txn_id: string | null;
      posted_at_utc: Date | string;
      amount_cents: number;
      description_raw: string;
      source_ref: string | null;
      created_at: Date | string;
      matched_player_id: string | null;
      matched_player_name: string | null;
      status: string;
    }>(
      `SELECT
         bt.id,
         bt.external_txn_id,
         bt.posted_at_utc,
         bt.amount_cents,
         bt.description_raw,
         bt.source_ref,
         bt.created_at,
         le.player_id AS matched_player_id,
         p.display_name AS matched_player_name,
         CASE
           WHEN le.id IS NOT NULL THEN 'matched'
           WHEN rq.id IS NOT NULL AND rq.status = 'open' THEN 'pending'
           WHEN rq.id IS NOT NULL AND rq.status = 'dismissed' THEN 'dismissed'
           ELSE 'matched'
         END AS status
       FROM bank_transactions bt
       LEFT JOIN ledger_entries le ON le.bank_transaction_id = bt.id AND le.type = 'payment'
       LEFT JOIN players p ON le.player_id = p.id
       LEFT JOIN reconciliation_queue rq ON rq.source_record_id = bt.id AND rq.item_type = 'bank_transaction'
       ORDER BY bt.posted_at_utc DESC
       LIMIT $1`,
      [limit]
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        externalTxnId: r.external_txn_id,
        postedAt: toIso(r.posted_at_utc),
        amountCents: Number(r.amount_cents),
        description: r.description_raw,
        sourceRef: r.source_ref,
        matchedPlayerId: r.matched_player_id,
        matchedPlayerName: r.matched_player_name,
        status: r.status,
        createdAt: toIso(r.created_at),
      })),
    };
  });
  
  app.post("/api/transactions/manual", async (request, reply) => {
    const { ManualTransactionCreateSchema } = await import("@fiveaside/contracts");
    const { parseBody } = await import("../utils/request.js");
    const { withTransaction } = await import("../db/helpers.js");
    const { insertLedgerEntry } = await import("../services/ledger.js");
    
    const body = parseBody(reply, ManualTransactionCreateSchema, request.body);
    
    const isOutgoing = body.direction === "outgoing";
    const venueCategory = (body.paymentType === "game_fee" || body.paymentType === "equipment") 
      ? (body.paymentType === "game_fee" ? "game_fees" : "equipment") 
      : null;
    
    let description = body.description || `Manual ${body.paymentType} ${body.direction}`;
    
    await withTransaction(async (client) => {
      // 1. Insert into bank_transactions
      const btResult = await client.query<{ id: string }>(
        `INSERT INTO bank_transactions (
          posted_at_utc, 
          amount_cents, 
          description_raw, 
          source_ref, 
          is_outgoing, 
          venue_category
        ) VALUES ($1, $2, $3, 'manual', $4, $5)
        RETURNING id`,
        [body.date, body.amountCents, description, isOutgoing, venueCategory]
      );
      
      const bankTransactionId = btResult.rows[0]!.id;
      
      // 2. If it's a player payment, record in ledger
      if (body.paymentType === "player") {
        if (!body.playerId) {
          throw new Error("playerId is required for player payments");
        }
        
        // Incoming payment (player paying) reduces balance (negative)
        // Outgoing payment (refund to player) increases balance (positive)
        const ledgerAmount = isOutgoing ? body.amountCents : -body.amountCents;
        
        await insertLedgerEntry(client, {
          playerId: body.playerId,
          type: "payment",
          amountCents: ledgerAmount,
          bankTransactionId,
          adjustmentReason: body.description || `Manual ${body.direction} payment`,
          createdAt: body.date
        });
      }
    });

    reply.code(201);
    return { ok: true };
  });
}
