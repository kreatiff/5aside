import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import staticFiles from "@fastify/static";

import { env } from "./config.js";
import { pool } from "./db/pool.js";

import { authPlugin } from "./middleware/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { adminRoutes } from "./routes/admin.js";
import { playerRoutes } from "./routes/players.js";
import { gameRoutes } from "./routes/games.js";
import { settingsRoutes } from "./routes/settings.js";
import { importRoutes } from "./routes/imports.js";
import { reconciliationRoutes } from "./routes/reconciliation.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { transactionRoutes } from "./routes/transactions.js";
import { paymentMatrixRoutes } from "./routes/payment-matrix.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  await app.register(sensible);
  await app.register(cookie);

  // Security headers — disable CSP in dev to avoid Vite HMR issues
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
        connectSrc: ["'self'", "https://n8n.dominus.casa"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
      }
    } : false,
    crossOriginEmbedderPolicy: false
  });

  // Rate limiting — stricter for auth/webhook endpoints via per-route config
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
    credentials: true
  });

  // Global error handler — sanitize PostgreSQL errors before sending to client
  app.setErrorHandler((error, request, reply) => {
    // PostgreSQL error codes are 5-character uppercase alphanumeric strings
    if (error && typeof (error as any).code === "string" && /^[0-9A-Z]{5}$/.test((error as any).code)) {
      request.log.error({ err: error }, "Database error");
      return reply.code(500).send({ statusCode: 500, error: "Internal Server Error", message: "An internal error occurred" });
    }
    // Re-throw all other errors for Fastify's default handler
    throw error;
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authPlugin);

  await app.register(dashboardRoutes);
  await app.register(adminRoutes);
  await app.register(playerRoutes);
  await app.register(gameRoutes);
  await app.register(settingsRoutes);
  await app.register(importRoutes);
  await app.register(reconciliationRoutes);
  await app.register(ledgerRoutes);
  await app.register(transactionRoutes);
  await app.register(paymentMatrixRoutes);

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
