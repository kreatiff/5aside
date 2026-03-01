import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReconcileResolveSchema } from "@fiveaside/contracts";
import { isChargeableStatus } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { toIso } from "../utils/mappers.js";
import { insertLedgerEntry } from "../services/ledger.js";

export async function reconciliationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/reconciliation-queue", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    const countResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM reconciliation_queue`);
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
      resolved_at: Date | string | null;
    }>(
      `SELECT id, item_type, source_record_id, payload, suggested_player_id, confidence, reason, status, resolved_by, resolved_at
       FROM reconciliation_queue
       ORDER BY status ASC, confidence DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      data: result.rows.map((row) => ({
        id: row.id,
        itemType: row.item_type,
        sourceRecordId: row.source_record_id,
        payload: row.payload,
        suggestedPlayerId: row.suggested_player_id,
        confidence: Number(row.confidence),
        reason: row.reason,
        status: row.status,
        resolvedBy: row.resolved_by,
        resolvedAt: toIso(row.resolved_at)
      })),
      total,
      limit,
      offset
    };
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
        throw reply.notFound("Queue item not found");
      }
      if (queueItem.rows[0]!.status !== "open") {
        throw reply.conflict("Queue item is already resolved or dismissed");
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
            throw reply.notFound("Game not found for queue item");
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
          throw reply.notFound("Bank transaction not found for queue item");
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
}
