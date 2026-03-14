import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    cookie: {
      cookieName: "refreshToken",
      signed: false
    }
  });

  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    // Hardcoded admin context for Cloudflare Access (internal auth removed)
    request.admin = { 
      id: "00000000-0000-0000-0000-000000000000", // Default UUID
      email: "admin@5aside.internal", 
      role: "admin" 
    } as any;
  });
});

// Since we register as a plugin, we export a typed signature for the hook
declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
