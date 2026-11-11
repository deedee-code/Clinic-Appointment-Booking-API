import type { Pool, PoolClient } from "pg";
import type { ListSlotsQuery, ResetSlotsInput } from "./slots.schema.js";

export type SlotResponse = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
};

export class SlotsRepository {
  constructor(private readonly pool: Pool) {}

  async list(query: ListSlotsQuery): Promise<SlotResponse[]> {
    const result = await this.pool.query<{
      id: string;
      provider: string;
      starts_at: Date;
      ends_at: Date;
      available: boolean;
    }>(
      `SELECT s.id, s.provider, s.starts_at, s.ends_at,
              NOT EXISTS (
                SELECT 1 FROM bookings b
                WHERE b.slot_id = s.id AND b.status = 'confirmed'
              ) AS available
       FROM slots s
       WHERE ($1::text IS NULL OR s.provider = $1)
       ORDER BY s.starts_at ASC, s.id ASC`,
      [query.provider ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      start: row.starts_at.toISOString(),
      end: row.ends_at.toISOString(),
      available: row.available,
    }));
  }

  async replace(input: ResetSlotsInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM bookings");
      await client.query("DELETE FROM slots");
      for (const slot of input.slots) {
        await client.query(
          `INSERT INTO slots (id, provider, starts_at, ends_at)
           VALUES ($1, $2, $3, $4)`,
          [slot.id, slot.provider, slot.start, slot.end],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
