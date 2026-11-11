import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { buildApp } from "../src/app.js";

const apiKey = "test-api-key-for-booking-assessment";
const future = "2099-12-10T09:00:00.000Z";
const futureEnd = "2099-12-10T09:30:00.000Z";
const past = "2000-12-10T09:00:00.000Z";

const database = await PGlite.create();
const databaseServer = new PGLiteSocketServer({
  db: database,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 1,
});
let pool: pg.Pool;
let app: Awaited<ReturnType<typeof buildApp>>;
const config = {
  apiKey,
  databaseUrl: "postgres://test:test@localhost/test",
  port: 3000,
  nodeEnv: "test" as const,
  rateLimitMax: 5,
  rateLimitWindowSeconds: 60,
  trustProxy: false,
};
async function seedSlots(): Promise<void> {
  const slots = [
    { id: "s1", provider: "Dr Ade", start: future, end: futureEnd },
    { id: "s2", provider: "Dr Obi", start: "2099-12-11T09:00:00.000Z", end: "2099-12-11T09:30:00.000Z" },
    { id: "s3", provider: "Dr Mensah", start: "2099-12-12T09:00:00.000Z", end: "2099-12-12T09:30:00.000Z" },
    { id: "past-slot", provider: "Dr Ade", start: past, end: "2000-12-10T09:30:00.000Z" },
  ];
  await app.inject({
    method: "POST",
    url: "/reset",
    headers: { "x-api-key": apiKey },
    payload: { slots },
  });
}

async function createBooking(
  slotId: string,
  email: string,
  headers: Record<string, string> = {},
  name = "Test Patient",
) {
  return app.inject({
    method: "POST",
    url: "/bookings",
    headers: { "x-api-key": apiKey, ...headers },
    payload: { slot_id: slotId, name, email },
  });
}

beforeAll(async () => {
  await databaseServer.start();
  const [host, port] = databaseServer.getServerConn().split(":");
  if (host === undefined || port === undefined) {
    throw new Error("Embedded PostgreSQL server did not provide a valid address");
  }
  pool = new pg.Pool({
    host,
    port: Number(port),
    database: "postgres",
    user: "postgres",
    password: "postgres",
    max: 1,
    ssl: false,
  });
  app = await buildApp({ config, pool });
  const migration = await readFile(path.resolve("migrations/001_initial.sql"), "utf8");
  for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
});

beforeEach(async () => {
  await seedSlots();
});

afterAll(async () => {
  await app.close();
  await databaseServer.stop();
  await database.close();
});

describe("booking API contract", () => {
  it("serves the Morrowfield booking page without exposing the API key in source", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    const page = response.body.replace(/\s+/g, " ");
    expect(page).toContain("Morrowfield Medical");
    expect(page).toContain("Book an appointment");
    expect(page).toContain("online service for booking clinic appointments");
    expect(response.body).toContain('type="module" src="/js/main.js"');
    expect(response.body).not.toContain("api-key");
    const module = await app.inject({ method: "GET", url: "/js/main.js" });
    expect(module.statusCode).toBe(200);
    expect(module.headers["content-type"]).toContain("javascript");
    const script = await readFile(path.resolve("public/js/api.js"), "utf8");
    expect(script).not.toContain("X-API-Key");
  });

  it("serves Swagger UI and the authenticated contract OpenAPI document", async () => {
    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect(ui.statusCode).toBe(200);
    expect(ui.body).toContain("swagger-ui");

    const document = await app.inject({ method: "GET", url: "/docs/json" });
    expect(document.statusCode).toBe(200);
    expect(document.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "Morrowfield Medical Booking API" },
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
      },
    });
    expect(document.json().paths).toHaveProperty("/slots");
    expect(document.json().paths).toHaveProperty("/bookings");
    expect(document.json().paths).toHaveProperty("/bookings/{id}");
    expect(document.json().paths).toHaveProperty("/reset");
    expect(document.json().paths).not.toHaveProperty("/web/slots");
  });

  it("proxies patient routes with server-side auth and preserves idempotency", async () => {
    const slots = await app.inject({ method: "GET", url: "/web/slots" });
    expect(slots.statusCode).toBe(200);
    expect(slots.json().slots).toHaveLength(4);

    const payload = { slot_id: "s1", name: "Ada Obi", email: "ada@example.com" };
    const headers = { "idempotency-key": "web-proxy-booking-1" };
    const created = await app.inject({
      method: "POST",
      url: "/web/bookings",
      headers,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/web/bookings",
      headers,
      payload,
    });
    expect(replay.statusCode).toBe(created.statusCode);
    expect(replay.json()).toEqual(created.json());

    const lookup = await app.inject({ method: "GET", url: `/web/bookings/${created.json().id}` });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toEqual(created.json());

    const history = await app.inject({ method: "GET", url: "/web/bookings?email=ada%40example.com" });
    expect(history.statusCode).toBe(200);
    expect(history.json().bookings).toHaveLength(1);

    const conflict = await app.inject({
      method: "POST",
      url: "/web/bookings",
      headers: { "idempotency-key": "web-proxy-conflict" },
      payload: { ...payload, email: "other@example.com" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(Object.keys(conflict.json())).toEqual(["error"]);

    const cancelled = await app.inject({
      method: "DELETE",
      url: `/web/bookings/${created.json().id}`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe("cancelled");
    const cancelledAgain = await app.inject({
      method: "DELETE",
      url: `/web/bookings/${created.json().id}`,
    });
    expect(cancelledAgain.statusCode).toBe(409);
    expect(Object.keys(cancelledAgain.json())).toEqual(["error"]);
    expect((await app.inject({ method: "POST", url: "/web/reset", payload: {} })).statusCode).toBe(404);
  });

  it("forwards the proxy Retry-After header for booking rate limits", async () => {
    let response: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await app.inject({
        method: "POST",
        url: "/web/bookings",
        headers: { "idempotency-key": `web-rate-limit-${attempt}` },
        payload: { slot_id: "s2", name: "Test Patient", email: "limit@example.com" },
      });
    }
    expect(response?.statusCode).toBe(429);
    expect(response?.headers["retry-after"]).toMatch(/^\d+$/);
    expect(Object.keys(response?.json() ?? {})).toEqual(["error"]);
  });

  it("requires the API key on protected endpoints and returns the standard error shape", async () => {
    const response = await app.inject({ method: "GET", url: "/slots" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it("lists slots in time order and matches provider exactly", async () => {
    const all = await app.inject({ method: "GET", url: "/slots", headers: { "x-api-key": apiKey } });
    expect(all.statusCode).toBe(200);
    expect(all.json().slots.map((slot: { id: string }) => slot.id)).toEqual(["past-slot", "s1", "s2", "s3"]);

    const filtered = await app.inject({
      method: "GET",
      url: "/slots?provider=Dr%20Ade",
      headers: { "x-api-key": apiKey },
    });
    expect(filtered.json().slots.map((slot: { id: string }) => slot.id)).toEqual(["past-slot", "s1"]);
  });

  it("validates reset input and returns an empty 200 response on success", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/reset",
      headers: { "x-api-key": apiKey },
      payload: { slots: [], unexpected: true },
    });
    expect(invalid.statusCode).toBe(400);
    expect(Object.keys(invalid.json())).toEqual(["error"]);

    const response = await app.inject({
      method: "POST",
      url: "/reset",
      headers: { "x-api-key": apiKey },
      payload: { slots: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
  });

  it("normalizes booking data and returns the booking on create and lookup", async () => {
    const created = await createBooking("s1", "  ADA@Example.com  ", {}, "  Ada Obi  ");
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      slot_id: "s1",
      name: "Ada Obi",
      email: "ada@example.com",
      status: "confirmed",
    });

    const lookup = await app.inject({
      method: "GET",
      url: `/bookings/${created.json().id}`,
      headers: { "x-api-key": apiKey },
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toEqual(created.json());
  });

  it.each([
    [{ slot_id: "s1", name: "", email: "valid@example.com" }],
    [{ slot_id: "s1", name: "Name", email: "not-an-email" }],
    [{ slot_id: "s1", name: "Name", email: "valid@example.com", extra: "field" }],
    [{ slot_id: "", name: "Name", email: "valid@example.com" }],
  ])("returns 400 for invalid booking bodies", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-api-key": apiKey },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json())).toEqual(["error"]);
  });

  it("returns 404 for a missing slot and 400 for a slot that has started", async () => {
    expect((await createBooking("missing", "missing-slot@example.com")).statusCode).toBe(404);
    expect((await createBooking("past-slot", "past-slot@example.com")).statusCode).toBe(400);
  });

  it("prevents double booking and marks the slot unavailable", async () => {
    expect((await createBooking("s1", "one@example.com")).statusCode).toBe(201);
    const conflict = await createBooking("s1", "two@example.com");
    expect(conflict.statusCode).toBe(409);

    const slots = await app.inject({ method: "GET", url: "/slots", headers: { "x-api-key": apiKey } });
    expect(slots.json().slots.find((slot: { id: string }) => slot.id === "s1").available).toBe(false);
  });

  it("supports cancellation, rejects a second cancellation, and allows rebooking", async () => {
    const created = await createBooking("s1", "cancel@example.com");
    const id = created.json().id;
    const cancelled = await app.inject({
      method: "DELETE",
      url: `/bookings/${id}`,
      headers: { "x-api-key": apiKey },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe("cancelled");

    const secondCancel = await app.inject({
      method: "DELETE",
      url: `/bookings/${id}`,
      headers: { "x-api-key": apiKey },
    });
    expect(secondCancel.statusCode).toBe(409);
    expect((await createBooking("s1", "rebook@example.com")).statusCode).toBe(201);
  });

  it("returns 404 for an unknown booking id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/bookings/not-a-booking",
      headers: { "x-api-key": apiKey },
    });
    expect(response.statusCode).toBe(404);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/bookings/not-a-booking",
      headers: { "x-api-key": apiKey },
    });
    expect(deleteResponse.statusCode).toBe(404);
  });

  it("replays idempotent results and rejects a different body for the same key", async () => {
    const headers = { "Idempotency-Key": "idem-one" };
    const first = await createBooking("s1", "idem@example.com", headers);
    const replay = await createBooking("s1", "idem@example.com", headers);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const reused = await createBooking("s2", "idem@example.com", headers);
    expect(reused.statusCode).toBe(422);
  });

  it("replays one result for concurrent requests using the same idempotency key", async () => {
    const headers = { "Idempotency-Key": "idem-concurrent" };
    const results = await Promise.all([
      createBooking("s1", "same-key@example.com", headers),
      createBooking("s1", "same-key@example.com", headers),
    ]);
    expect(results.map((result) => result.statusCode)).toEqual([201, 201]);
    expect(results[0]?.json()).toEqual(results[1]?.json());
  });

  it("paginates bookings oldest-first with an inclusive 1-50 limit", async () => {
    await createBooking("s1", "pages@example.com", {}, "First");
    await createBooking("s2", "pages@example.com", {}, "Second");
    await createBooking("s3", "pages@example.com", {}, "Third");
    await pool.query(
      `UPDATE bookings
       SET created_at = CASE name
         WHEN 'First' THEN '2026-01-01T00:00:00Z'::timestamptz
         WHEN 'Second' THEN '2026-01-02T00:00:00Z'::timestamptz
         WHEN 'Third' THEN '2026-01-03T00:00:00Z'::timestamptz
       END
       WHERE email = $1`,
      ["pages@example.com"],
    );

    const firstPage = await app.inject({
      method: "GET",
      url: "/bookings?email=pages%40example.com&limit=2",
      headers: { "x-api-key": apiKey },
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().bookings.map((booking: { name: string }) => booking.name)).toEqual(["First", "Second"]);
    expect(firstPage.json().next_cursor).toBeTypeOf("string");

    const nextPage = await app.inject({
      method: "GET",
      url: `/bookings?email=pages%40example.com&limit=2&cursor=${encodeURIComponent(firstPage.json().next_cursor)}`,
      headers: { "x-api-key": apiKey },
    });
    expect(nextPage.json().bookings.map((booking: { name: string }) => booking.name)).toEqual(["Third"]);
    expect(nextPage.json().next_cursor).toBeNull();

    const invalidLimit = await app.inject({
      method: "GET",
      url: "/bookings?email=pages%40example.com&limit=0",
      headers: { "x-api-key": apiKey },
    });
    expect(invalidLimit.statusCode).toBe(400);

    const uppercaseEmail = await app.inject({
      method: "GET",
      url: "/bookings?email=PAGES%40EXAMPLE.COM",
      headers: { "x-api-key": apiKey },
    });
    expect(uppercaseEmail.json().bookings).toHaveLength(3);

    const invalidCursor = await app.inject({
      method: "GET",
      url: "/bookings?email=pages%40example.com&cursor=not-a-cursor",
      headers: { "x-api-key": apiKey },
    });
    expect(invalidCursor.statusCode).toBe(400);
  });

  it("rate-limits the sixth attempt, includes Retry-After, and resets after the window", async () => {
    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      results.push(await createBooking("missing", "limited@example.com"));
    }
    expect(results.every((result) => result.statusCode === 404)).toBe(true);

    const limited = await createBooking("missing", "limited@example.com");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
    expect(limited.json()).toEqual({ error: "Too many booking attempts" });

    await pool.query(
      "UPDATE booking_rate_limits SET window_start = $2 WHERE email = $1",
      ["limited@example.com", new Date(Date.now() - 3 * 60_000)],
    );
    expect((await createBooking("missing", "limited@example.com")).statusCode).toBe(404);
  });

  it("serializes concurrent attempts so exactly one booking wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createBooking("s1", `racer-${index}@example.com`),
      ),
    );
    expect(results.filter((result) => result.statusCode === 201)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode !== 201 && result.statusCode !== 409)
      .map((result) => ({ status: result.statusCode, body: result.body }))).toEqual([]);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(19);
    const confirmed = await pool.query(
      "SELECT count(*)::integer AS count FROM bookings WHERE slot_id = $1 AND status = 'confirmed'",
      ["s1"],
    );
    expect(confirmed.rows[0].count).toBe(1);
  });
});
