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

-- ── Users ───────────────────────────────────────────────────
-- Persistent profile table keyed by phone number.
CREATE TABLE tab.users (
  phone        TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  venmo_handle TEXT,
  is_admin     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tab.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON tab.users FOR ALL USING (true) WITH CHECK (true);

-- To make yourself admin, run this after your first login:
--   UPDATE tab.users SET is_admin = TRUE WHERE phone = 'YOUR_PHONE_DIGITS_ONLY';

-- ── Migrations ───────────────────────────────────────────────
-- Run these if you already created the tables above (new columns added later):
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS currency      TEXT    DEFAULT 'USD';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS receipt_urls  TEXT[]  DEFAULT '{}';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;

-- ── Groups ───────────────────────────────────────────────────
-- Run this block once to add group support.
CREATE TABLE IF NOT EXISTS tab.groups (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT        NOT NULL,
  created_by   TEXT        NOT NULL,
  invite_token UUID        DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tab.group_members (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id     UUID        REFERENCES tab.groups(id) ON DELETE CASCADE NOT NULL,
  phone        TEXT        NOT NULL,
  display_name TEXT        NOT NULL,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, phone)
);

CREATE TABLE IF NOT EXISTS tab.expenses (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id     UUID        REFERENCES tab.groups(id) ON DELETE CASCADE NOT NULL,
  description  TEXT        NOT NULL,
  amount       NUMERIC     NOT NULL,
  currency     TEXT        DEFAULT 'USD',
  paid_by      TEXT        NOT NULL,
  split_method TEXT        DEFAULT 'equal',
  note         TEXT,
  expense_date DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tab.expense_splits (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID    REFERENCES tab.expenses(id) ON DELETE CASCADE NOT NULL,
  phone      TEXT    NOT NULL,
  amount     NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS tab.settlements (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID        REFERENCES tab.groups(id) ON DELETE CASCADE NOT NULL,
  paid_by    TEXT        NOT NULL,
  paid_to    TEXT        NOT NULL,
  amount     NUMERIC     NOT NULL,
  currency   TEXT        DEFAULT 'USD',
  method     TEXT,
  note       TEXT,
  settled_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link bills to groups
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES tab.groups(id) ON DELETE SET NULL;

-- RLS for groups tables
ALTER TABLE tab.groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab.settlements    ENABLE ROW LEVEL SECURITY;

-- Drop first in case they already exist with wrong definition
DROP POLICY IF EXISTS "public_all" ON tab.groups;
DROP POLICY IF EXISTS "public_all" ON tab.group_members;
DROP POLICY IF EXISTS "public_all" ON tab.expenses;
DROP POLICY IF EXISTS "public_all" ON tab.expense_splits;
DROP POLICY IF EXISTS "public_all" ON tab.settlements;

CREATE POLICY "public_all" ON tab.groups         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.group_members  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.expenses       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.expense_splits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON tab.settlements    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_created_by        ON tab.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id   ON tab.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_phone      ON tab.group_members(phone);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id        ON tab.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense   ON tab.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id     ON tab.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_bills_group_id           ON tab.bills(group_id);

-- expense_date column (if expenses table existed before this migration)
ALTER TABLE tab.expenses ADD COLUMN IF NOT EXISTS expense_date DATE;

-- Storage bucket setup:
-- 1. Create a bucket named "receipts" and set it to Public (allows public reads).
-- 2. Run these policies so the anon key can upload from the browser:
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "receipts_anon_insert" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "receipts_anon_select" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'receipts');

-- ── Realtime ─────────────────────────────────────────────────
-- Run these three lines in a separate query after the tables are created.
-- They add the tables to Supabase's realtime publication so live updates work.
ALTER PUBLICATION supabase_realtime ADD TABLE tab.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE tab.guests;
ALTER PUBLICATION supabase_realtime ADD TABLE tab.bills;
