import pg from "pg";
import type { AppConfig } from "../config/env.js";

export function createPool(config: AppConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "clinic-booking-api",
  });
}
