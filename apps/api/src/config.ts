import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  WEBHOOK_SHARED_SECRET: z.string().min(16).default("dev-webhook-secret"),
  DEFAULT_GAME_FEE_CENTS: z.coerce.number().int().positive().default(1000),
  APP_TIMEZONE: z.string().default("America/New_York"),
  DISABLE_AUTH: z.string().optional()
});

export const env = EnvSchema.parse(process.env);
