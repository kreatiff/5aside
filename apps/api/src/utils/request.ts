import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";

export function parseBody<S extends z.ZodTypeAny>(reply: FastifyReply, schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw reply.badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

export function parseUuidParam(request: FastifyRequest, reply: FastifyReply, key: string): string {
  const params = request.params as Record<string, unknown>;
  const parsed = z.string().uuid().safeParse(params[key]);
  if (!parsed.success) {
    throw reply.badRequest(`Invalid ${key}`);
  }
  return parsed.data;
}

export function assertWebhookSecret(request: FastifyRequest, reply: FastifyReply): void {
  const incomingSecret = request.headers["x-webhook-secret"];
  if (incomingSecret !== env.WEBHOOK_SHARED_SECRET) {
    throw reply.unauthorized("Invalid webhook secret");
  }
}
