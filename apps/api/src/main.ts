import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import staticFiles from "@fastify/static";

import { env } from "./config.js";
import { pool } from "./db/pool.js";

import { authPlugin } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { adminRoutes } from "./routes/admin.js";
import { playerRoutes } from "./routes/players.js";
import { gameRoutes } from "./routes/games.js";
import { settingsRoutes } from "./routes/settings.js";
import { importRoutes } from "./routes/imports.js";
import { reconciliationRoutes } from "./routes/reconciliation.js";
import { ledgerRoutes } from "./routes/ledger.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  await app.register(sensible);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : true,
    credentials: true
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(adminRoutes);
  await app.register(playerRoutes);
  await app.register(gameRoutes);
  await app.register(settingsRoutes);
  await app.register(importRoutes);
  await app.register(reconciliationRoutes);
  await app.register(ledgerRoutes);

  if (env.NODE_ENV === "production") {
    const webDistPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
    await app.register(staticFiles, { root: webDistPath, wildcard: false });
    app.setNotFoundHandler((_request, reply) => {
      if (_request.url.startsWith("/api")) {
        return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Route not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isMainModule) {
  void start();

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await pool.end();
    process.exit(0);
  });
}
