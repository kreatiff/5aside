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
    try {
      await request.jwtVerify();
      // The decoded token will be added to request.user by standard fastify-jwt behavior.
      // We map it to request.admin for our app's specific types.
      request.admin = request.user as any;
    } catch (err) {
      reply.unauthorized("Authentication required");
    }
  });
});

// Since we register as a plugin, we export a typed signature for the hook
declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
