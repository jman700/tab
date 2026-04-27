-- ============================================================
-- TAB — Supabase Schema
-- Run this in your Supabase SQL editor.
--
-- Uses a dedicated "tab" schema so this app can share a
-- Supabase project with other tools without table name conflicts.
-- ============================================================

-- ── Schema ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS tab;

-- Grant API access to the schema
GRANT USAGE ON SCHEMA tab TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tab
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ── Bills ───────────────────────────────────────────────────
CREATE TABLE tab.bills (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  restaurant       TEXT,
  created_by_phone TEXT NOT NULL,
  created_by_name  TEXT NOT NULL,
  status           TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'closed')),
  tip_percentage   NUMERIC DEFAULT 0,
  tip_split_type   TEXT DEFAULT 'proportional' CHECK (tip_split_type IN ('proportional', 'equal')),
  subtotal         NUMERIC DEFAULT 0,
  tax_amount       NUMERIC DEFAULT 0,
  tax_included     BOOLEAN DEFAULT false,
  grand_total      NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  closed_at        TIMESTAMPTZ
);

-- ── Items ───────────────────────────────────────────────────
CREATE TABLE tab.items (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id  UUID REFERENCES tab.bills(id) ON DELETE CASCADE NOT NULL,
  name     TEXT NOT NULL,
  price    NUMERIC NOT NULL,
  quantity INTEGER DEFAULT 1,
  note     TEXT,
  position INTEGER DEFAULT 0
);

-- ── Guests ──────────────────────────────────────────────────
CREATE TABLE tab.guests (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id            UUID REFERENCES tab.bills(id) ON DELETE CASCADE NOT NULL,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL,
  device_fingerprint TEXT,
  has_confirmed      BOOLEAN DEFAULT FALSE,
  has_paid           BOOLEAN DEFAULT FALSE,
  joined_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bill_id, phone)
);

-- ── Claims ──────────────────────────────────────────────────
-- One row per person per unit slot. Multiple rows per unit_index = a split.
-- UNIQUE(item_id, unit_index, guest_phone) prevents a person from claiming
-- the same unit twice while allowing multiple people to share a unit.
CREATE TABLE tab.claims (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id     UUID REFERENCES tab.bills(id) ON DELETE CASCADE NOT NULL,
  item_id     UUID REFERENCES tab.items(id) ON DELETE CASCADE NOT NULL,
  unit_index  INTEGER NOT NULL,
  guest_phone TEXT NOT NULL,
  UNIQUE(item_id, unit_index, guest_phone)
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX ON tab.bills(created_by_phone);
CREATE INDEX ON tab.bills(status);
CREATE INDEX ON tab.items(bill_id);
CREATE INDEX ON tab.guests(bill_id);
CREATE INDEX ON tab.guests(phone);
CREATE INDEX ON tab.claims(bill_id);
CREATE INDEX ON tab.claims(item_id);
CREATE INDEX ON tab.claims(guest_phone);
CREATE INDEX ON tab.claims(item_id, unit_index);

-- ── Row Level Security ───────────────────────────────────────
-- Permissive for MVP — security enforced at app layer via phone identity.
-- Swap for Supabase Auth + phone OTP in a future iteration.
ALTER TABLE tab.bills  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON tab.bills  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.items  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.guests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.claims FOR ALL USING (true) WITH CHECK (true);

-- ── Realtime ─────────────────────────────────────────────────
-- Run these three lines in a separate query after the tables are created.
-- They add the tables to Supabase's realtime publication so live updates work.
ALTER PUBLICATION supabase_realtime ADD TABLE tab.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE tab.guests;
ALTER PUBLICATION supabase_realtime ADD TABLE tab.bills;
