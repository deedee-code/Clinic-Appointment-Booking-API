# Morrowfield Medical | Clinic Appointment Booking API

Appointment booking API and patient-facing web page, built with Fastify, TypeScript, and Neon Postgres.

## Run locally

Requirements: Node.js 20+ and a PostgreSQL database.

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL` and a long random `API_KEY`. Keep both secret.
3. Install, build, initialize the database, and add sample appointment times:

   ```sh
   npm ci
   npm run build
   npm run migrate
   npm run seed
   ```

4. Start the app with `npm run dev`, then open <http://localhost:3000>.

Appointments load automatically. Run `npm test` and `npm run typecheck` to validate changes. Tests use an embedded database and do not modify your configured database.

Open the API reference at <http://localhost:3000/docs>. Use Swagger UI’s **Authorize** control to provide `X-API-Key` when trying the direct API endpoints. The OpenAPI document is available at `/docs/json`.

## How it works

- The API provides slot listing, booking, lookup, cancellation, booking history, and pagination.
- Direct API requests require `X-API-Key`. The browser does not receive this key; it calls the same-origin `/web` routes, which inject the key on the server.
- `/web` exposes only patient booking operations. It does not expose `/reset`.
- Swagger documents the authenticated contract routes; the patient `/web` proxy is intentionally excluded.
- The database prevents double-booking, stores idempotency results, and enforces the per-email booking-attempt limit.
- The page is plain HTML, CSS, and JavaScript modules in `public/`.

## Configuration

| Variable                    | Required | Default       | Purpose                                                             |
| --------------------------- | -------- | ------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`              | Yes      | —             | PostgreSQL connection string; use Neon’s pooled URL for app traffic |
| `API_KEY`                   | Yes      | —             | Secret for direct API requests and the server-side web proxy        |
| `PORT`                      | No       | `3000`        | HTTP port                                                           |
| `NODE_ENV`                  | No       | `development` | Runtime environment                                                 |
| `RATE_LIMIT_MAX`            | No       | `5`           | Booking attempts per email per window                               |
| `RATE_LIMIT_WINDOW_SECONDS` | No       | `60`          | Rate-limit window                                                   |
| `TRUST_PROXY`               | No       | `false`       | Enable only behind a trusted reverse proxy                          |

Never commit `.env.local`, `.env`, or `.neon`, or share database URLs and API keys.

## API examples

Direct API requests use the API key:

```sh
curl -H "X-API-Key: $API_KEY" http://localhost:3000/slots

curl -X POST http://localhost:3000/bookings \
  -H "X-API-Key: $API_KEY" \
  -H "Idempotency-Key: booking-demo-1" \
  -H "Content-Type: application/json" \
  -d '{"slot_id":"s1","name":"Ada Obi","email":"ada@example.com"}'

curl -H "X-API-Key: $API_KEY" http://localhost:3000/bookings/BOOKING_ID
curl -X DELETE -H "X-API-Key: $API_KEY" http://localhost:3000/bookings/BOOKING_ID
curl -H "X-API-Key: $API_KEY" "http://localhost:3000/bookings?email=ada%40example.com&limit=10"
```

Pass the response’s `next_cursor` as `cursor` to fetch the next page. `POST /reset` replaces all slots and deletes all bookings; use it only when you intend to reset the database.

## Deploy on Render

`render.yaml` defines the Render service. Connect the repository as a Render Blueprint, set `DATABASE_URL` and `API_KEY` as secret environment variables, and deploy. The configured pre-deploy command runs migrations and seeds future sample slots. After deployment, Swagger UI is available at `/docs` and its OpenAPI document at `/docs/json`. Deployment must be completed from a connected Render account.
