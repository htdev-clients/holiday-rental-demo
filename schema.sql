-- D1 schema for the holiday-rentals-db shared database.
-- Apply with: wrangler d1 execute holiday-rentals-db --file=schema.sql
-- For local dev: wrangler d1 execute holiday-rentals-db --local --file=schema.sql

CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT    PRIMARY KEY,
  property_id TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending', -- pending | approved | paid | cancelled
  checkin     TEXT    NOT NULL,
  checkout    TEXT    NOT NULL,
  guests      INTEGER NOT NULL,
  firstname   TEXT    NOT NULL,
  lastname    TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  phone       TEXT,
  message     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings (property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (status);
