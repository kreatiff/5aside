import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReconcileResolveSchema } from "@fiveaside/contracts";
import { isChargeableStatus } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { toIso } from "../utils/mappers.js";
import { insertLedgerEntry } from "../services/ledger.js";
import { rescanAllPendingTransactions } from "../services/bank-import.js";

export async function reconciliationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/reconciliation-queue", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    const countResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM reconciliation_queue WHERE status = 'open'`);
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<{
      id: string;
      item_type: "attendance" | "bank_transaction";
      source_record_id: string;
      payload: Record<string, unknown> | null;
      suggested_player_id: string | null;
      confidence: string | number;
      reason: string;
      status: "open" | "resolved" | "dismissed";
      resolved_by: string | null;
      created_at: Date | string;
      resolved_at: Date | string | null;
      bt_description: string | null;
      bt_external_id: string | null;
      bt_source_ref: string | null;
      bt_amount: number | null;
    }>(
      `SELECT
         rq.id, rq.item_type, rq.source_record_id, rq.payload, rq.suggested_player_id,
         rq.confidence, rq.reason, rq.status, rq.resolved_by, rq.created_at, rq.resolved_at,
         bt.description_raw as bt_description,
         bt.external_txn_id as bt_external_id,
         bt.source_ref as bt_source_ref,
         bt.amount_cents as bt_amount
       FROM reconciliation_queue rq
       LEFT JOIN bank_transactions bt ON rq.item_type = 'bank_transaction' AND rq.source_record_id = bt.id
       WHERE rq.status = 'open'
       ORDER BY rq.confidence DESC, rq.id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      data: result.rows.map((row) => {
        let enhancedPayload = row.payload || {};

        // Inject bank transaction details into payload for the frontend
        if (row.item_type === 'bank_transaction') {
          enhancedPayload = {
            ...enhancedPayload,
            descriptionRaw: row.bt_description,
            externalTxnId: row.bt_external_id,
            sourceRef: row.bt_source_ref,
            amountCents: row.bt_amount ? Number(row.bt_amount) : 0,
          };
        }

        return {
          id: row.id,
          itemType: row.item_type,
          sourceRecordId: row.source_record_id,
          payload: enhancedPayload,
          suggestedPlayerId: row.suggested_player_id,
          confidence: Number(row.confidence),
          reason: row.reason,
          status: row.status,
          resolvedBy: row.resolved_by,
          createdAt: toIso(row.created_at),
          resolvedAt: toIso(row.resolved_at)
        };
      }),
      total,
      limit,
      offset
    };
  });

  app.post("/api/reconciliation-queue/rescan", async (request, reply) => {
    const result = await withTransaction(async (client) => {
      const mappedCount = await rescanAllPendingTransactions(client);
      return { mappedCount };
    });

    return reply.status(200).send({
      transactionsMapped: result.mappedCount
    });
  });

  app.post("/api/reconciliation-queue/:id/resolve", async (request, reply) => {
    const queueId = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, ReconcileResolveSchema, request.body);
    const adminId = request.admin.id;

    const result = await withTransaction(async (client) => {
      const queueItem = await client.query<{
        id: string;
        item_type: "attendance" | "bank_transaction";
        source_record_id: string;
        payload: Record<string, unknown> | null;
        status: string;
      }>(
        `SELECT id, item_type, source_record_id, payload, status
         FROM reconciliation_queue
         WHERE id = $1
         FOR UPDATE`,
        [queueId]
      );
      if (queueItem.rowCount === 0) {
        throw app.httpErrors.notFound("Queue item not found");
      }
      if (queueItem.rows[0]!.status !== "open") {
        throw app.httpErrors.conflict("Queue item is already resolved or dismissed");
      }

      const item = queueItem.rows[0]!;
      if (item.item_type === "attendance") {
        const payload = item.payload ?? {};
        const sourceStatus = String(payload.sourceStatus ?? "unknown");
        const sourceRef = payload.sourceRef ? String(payload.sourceRef) : null;
        const chargeable = isChargeableStatus(sourceStatus);

        const attendance = await client.query<{ id: string }>(
          `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [item.source_record_id, body.playerId, sourceStatus, chargeable, sourceRef]
        );

        if (chargeable) {
          const game = await client.query<{ fee_cents: number }>(`SELECT fee_cents FROM games WHERE id = $1`, [item.source_record_id]);
          if (game.rowCount === 0) {
            throw app.httpErrors.notFound("Game not found for queue item");
          }
          await insertLedgerEntry(client, {
            playerId: body.playerId,
            type: "charge",
            amountCents: game.rows[0]!.fee_cents,
            gameId: item.source_record_id,
            attendanceId: attendance.rows[0]!.id
          });
        }
      } else {
        const transaction = await client.query<{ amount_cents: number }>(
          `SELECT amount_cents FROM bank_transactions WHERE id = $1`,
          [item.source_record_id]
        );
        if (transaction.rowCount === 0) {
          throw app.httpErrors.notFound("Bank transaction not found for queue item");
        }

        await insertLedgerEntry(client, {
          playerId: body.playerId,
          type: "payment",
          amountCents: -transaction.rows[0]!.amount_cents,
          bankTransactionId: item.source_record_id
        });
      }

      await client.query(
        `UPDATE reconciliation_queue
         SET status = 'resolved',
             resolved_by = $1,
             resolved_at = NOW(),
             suggested_player_id = $2
         WHERE id = $3`,
        [adminId, body.playerId, queueId]
      );

      return { resolved: true };
    });

    return result;
  });

  app.post("/api/reconciliation-queue/:id/dismiss", async (request, reply) => {
    const queueId = parseUuidParam(request, reply, "id");
    const adminId = request.admin.id;

    const result = await query(
      `UPDATE reconciliation_queue
       SET status = 'dismissed',
           resolved_by = $1,
           resolved_at = NOW()
       WHERE id = $2 AND status = 'open'`,
      [adminId, queueId]
    );

    if (result.rowCount === 0) {
      throw app.httpErrors.notFound("Queue item not found or already resolved");
    }

    return { dismissed: true };
  });
}
