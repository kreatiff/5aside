import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  WEBHOOK_SHARED_SECRET: z.string().min(16).default("dev-webhook-secret"),
  DEFAULT_GAME_FEE_CENTS: z.coerce.number().int().positive().default(1000),
  APP_TIMEZONE: z.string().default("America/New_York")
});

export const env = EnvSchema.parse(process.env);
