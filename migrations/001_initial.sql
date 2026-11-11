CREATE TABLE slots (
  id text PRIMARY KEY,
  provider text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slots_valid_interval CHECK (starts_at < ends_at)
);

CREATE INDEX slots_starts_at_idx ON slots (starts_at, id);

CREATE TABLE bookings (
  id text PRIMARY KEY,
  slot_id text NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bookings_one_confirmed_per_slot_idx
  ON bookings (slot_id)
  WHERE status = 'confirmed';

CREATE INDEX bookings_email_created_idx
  ON bookings (email, created_at, id);

CREATE TABLE idempotency_keys (
  key text NOT NULL,
  caller_hash text NOT NULL,
  request_fingerprint text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, caller_hash),
  CONSTRAINT idempotency_response_complete CHECK (
    (response_status IS NULL AND response_body IS NULL)
    OR (response_status IS NOT NULL AND response_body IS NOT NULL)
  )
);

CREATE TABLE booking_rate_limits (
  email text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
