import type { FastifyInstance } from "fastify";
import { AdjustmentCreateSchema } from "@fiveaside/contracts";
import { withTransaction } from "../db/helpers.js";
import { parseBody } from "../utils/request.js";
import { insertLedgerEntry } from "../services/ledger.js";

export async function ledgerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.post("/api/ledger/adjustments", async (request, reply) => {
    const body = parseBody(reply, AdjustmentCreateSchema, request.body);
    await withTransaction(async (client) => {
      await insertLedgerEntry(client, {
        playerId: body.playerId,
        type: "adjustment",
        amountCents: body.amountCents,
        adjustmentReason: body.reason ?? null
      });
    });
    reply.code(201);
    return { ok: true };
  });
}
