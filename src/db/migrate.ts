import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { loadDatabaseUrl } from "../config/env.js";

async function migrate(): Promise<void> {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(path.resolve("migrations")))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();

    for (const name of files) {
      const { rowCount } = await pool.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (rowCount !== 0) {
        continue;
      }

      const sql = await readFile(path.resolve("migrations", name), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.info(`Applied migration ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed", error);
  process.exitCode = 1;
});
