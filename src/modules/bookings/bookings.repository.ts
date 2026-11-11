import type { Pool, PoolClient } from "pg";
import type { BookingCursor } from "../../utils/pagination.js";
import type { CreateBookingInput } from "./bookings.schema.js";

export type BookingResponse = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: string;
};

export type CreateOutcome =
  | { kind: "created"; booking: BookingResponse }
  | { kind: "slot_missing" }
  | { kind: "slot_started" }
  | { kind: "slot_booked" };

export type StoredResponse = {
  status: number;
  body: BookingResponse | { error: string };
};

export type IdempotentOutcome =
  | { kind: "complete"; response: StoredResponse }
  | { kind: "key_reused" };

type BookingRow = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: Date;
};

function toResponse(row: BookingRow): BookingResponse {
  return {
    id: row.id,
    slot_id: row.slot_id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

async function createInTransaction(
  client: PoolClient,
  input: CreateBookingInput,
  id: string,
): Promise<CreateOutcome> {
  const slot = await client.query<{ started: boolean }>(
    "SELECT starts_at <= clock_timestamp() AS started FROM slots WHERE id = $1",
    [input.slot_id],
  );
  if (slot.rowCount === 0) {
    return { kind: "slot_missing" };
  }
  if (slot.rows[0]?.started) {
    return { kind: "slot_started" };
  }

  const inserted = await client.query<BookingRow>(
    `INSERT INTO bookings (id, slot_id, name, email, status)
     VALUES ($1, $2, $3, $4, 'confirmed')
     ON CONFLICT (slot_id) WHERE status = 'confirmed' DO NOTHING
     RETURNING id, slot_id, name, email, status, created_at`,
    [id, input.slot_id, input.name, input.email],
  );
  const row = inserted.rows[0];
  if (row === undefined) {
    return { kind: "slot_booked" };
  }
  return { kind: "created", booking: toResponse(row) };
}

export class BookingsRepository {
  constructor(private readonly pool: Pool) {}

  async recordAttempt(
    email: string,
    now: Date,
    windowSeconds: number,
  ): Promise<{ attempts: number; retryAfterSeconds: number }> {
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const windowEnd = new Date(windowStart.getTime() + windowMs);
    const result = await this.pool.query<{ attempts: number }>(
      `INSERT INTO booking_rate_limits (email, window_start, attempts)
       VALUES ($1, $2, 1)
       ON CONFLICT (email) DO UPDATE
       SET window_start = CASE
             WHEN booking_rate_limits.window_start < EXCLUDED.window_start
             THEN EXCLUDED.window_start ELSE booking_rate_limits.window_start
           END,
           attempts = CASE
             WHEN booking_rate_limits.window_start < EXCLUDED.window_start
             THEN 1 ELSE booking_rate_limits.attempts + 1
           END
       RETURNING attempts`,
      [email, windowStart],
    );
    const remaining = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);
    return {
      attempts: result.rows[0]?.attempts ?? 1,
      retryAfterSeconds: Math.max(1, remaining),
    };
  }

  async create(input: CreateBookingInput, id: string): Promise<CreateOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await createInTransaction(client, input, id);
      await client.query("COMMIT");
      return outcome;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createIdempotent(
    input: CreateBookingInput,
    id: string,
    key: string,
    callerHash: string,
    fingerprint: string,
  ): Promise<IdempotentOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO idempotency_keys (key, caller_hash, request_fingerprint)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, caller_hash) DO NOTHING
         RETURNING key`,
        [key, callerHash, fingerprint],
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query<{
          request_fingerprint: string;
          response_status: number | null;
          response_body: StoredResponse["body"] | null;
        }>(
          `SELECT request_fingerprint, response_status, response_body
           FROM idempotency_keys WHERE key = $1 AND caller_hash = $2`,
          [key, callerHash],
        );
        const record = existing.rows[0];
        if (record === undefined) {
          throw new Error("Idempotency record disappeared during replay");
        }
        if (record.request_fingerprint !== fingerprint) {
          await client.query("COMMIT");
          return { kind: "key_reused" };
        }
        if (record.response_status === null || record.response_body === null) {
          throw new Error("Idempotency record has no saved response");
        }
        await client.query("COMMIT");
        return {
          kind: "complete",
          response: { status: record.response_status, body: record.response_body },
        };
      }

      const outcome = await createInTransaction(client, input, id);
      const response = toStoredResponse(outcome);
      await client.query(
        `UPDATE idempotency_keys
         SET response_status = $3, response_body = $4
         WHERE key = $1 AND caller_hash = $2`,
        [key, callerHash, response.status, JSON.stringify(response.body)],
      );
      await client.query("COMMIT");
      return { kind: "complete", response };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findIdempotent(
    key: string,
    callerHash: string,
  ): Promise<{ fingerprint: string; response: StoredResponse } | null> {
    const result = await this.pool.query<{
      request_fingerprint: string;
      response_status: number | null;
      response_body: StoredResponse["body"] | null;
    }>(
      `SELECT request_fingerprint, response_status, response_body
       FROM idempotency_keys WHERE key = $1 AND caller_hash = $2`,
      [key, callerHash],
    );
    const record = result.rows[0];
    if (record === undefined) {
      return null;
    }
    if (record.response_status === null || record.response_body === null) {
      throw new Error("Idempotency record has no saved response");
    }
    return {
      fingerprint: record.request_fingerprint,
      response: { status: record.response_status, body: record.response_body },
    };
  }

  async findById(id: string): Promise<BookingResponse | null> {
    const result = await this.pool.query<BookingRow>(
      `SELECT id, slot_id, name, email, status, created_at
       FROM bookings WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toResponse(row);
  }

  async listByEmail(
    email: string,
    limit: number,
    cursor: BookingCursor | undefined,
  ): Promise<{ bookings: BookingResponse[]; nextCursor: BookingCursor | null }> {
    const result = await this.pool.query<BookingRow>(
      `SELECT id, slot_id, name, email, status, created_at
       FROM bookings
       WHERE email = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) > ($2, $3))
       ORDER BY created_at ASC, id ASC
       LIMIT $4`,
      [email, cursor?.created_at ?? null, cursor?.id ?? null, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      bookings: rows.map(toResponse),
      nextCursor: hasMore && last !== undefined
        ? { created_at: last.created_at.toISOString(), id: last.id }
        : null,
    };
  }

  async cancel(id: string): Promise<"cancelled" | "already_cancelled" | "not_found"> {
    const result = await this.pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND status = 'confirmed'
       RETURNING id`,
      [id],
    );
    if (result.rowCount !== 0) {
      return "cancelled";
    }

    const existing = await this.pool.query<{ status: string }>(
      "SELECT status FROM bookings WHERE id = $1",
      [id],
    );
    return existing.rows[0] === undefined ? "not_found" : "already_cancelled";
  }

}

function toStoredResponse(outcome: CreateOutcome): StoredResponse {
  switch (outcome.kind) {
    case "created":
      return { status: 201, body: outcome.booking };
    case "slot_missing":
      return { status: 404, body: { error: "Slot not found" } };
    case "slot_started":
      return { status: 400, body: { error: "Slot has already started" } };
    case "slot_booked":
      return { status: 409, body: { error: "Slot is already booked" } };
  }
}
