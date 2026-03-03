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
    if (env.DISABLE_AUTH === "true") {
      request.admin = { id: null, email: "dev@localhost", role: "admin" } as any;
      return;
    }

    try {
      await request.jwtVerify();
      const user = request.user as any;
      request.admin = { id: user.sub, email: user.email, role: user.role };
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
