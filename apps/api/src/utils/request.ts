import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";

export function parseBody<S extends z.ZodTypeAny>(reply: FastifyReply, schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Expose validation details in development only; return generic message in production
    const message = process.env.NODE_ENV === "production"
      ? "Invalid request body"
      : parsed.error.issues.map((issue) => issue.message).join(", ");
    throw reply.badRequest(message);
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
  if (typeof incomingSecret !== "string") {
    throw reply.unauthorized("Invalid webhook secret");
  }
  const expected = Buffer.from(env.WEBHOOK_SHARED_SECRET);
  const received = Buffer.from(incomingSecret);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw reply.unauthorized("Invalid webhook secret");
  }
}
