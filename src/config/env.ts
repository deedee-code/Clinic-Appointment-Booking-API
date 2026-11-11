import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) {
    dotenv.config({ path, override: false, quiet: true });
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

const databaseUrlSchema = z.string().min(1);

export type AppConfig = {
  apiKey: string;
  databaseUrl: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  trustProxy: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return {
    apiKey: parsed.data.API_KEY,
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    rateLimitMax: parsed.data.RATE_LIMIT_MAX,
    rateLimitWindowSeconds: parsed.data.RATE_LIMIT_WINDOW_SECONDS,
    trustProxy: parsed.data.TRUST_PROXY === "true",
  };
}

export function loadDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const parsed = databaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!parsed.success) {
    throw new Error("Invalid environment configuration: DATABASE_URL");
  }
  return parsed.data;
}
