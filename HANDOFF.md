# Tab — Session Handoff

## What was done this session

### Venmo pay button
- Summary sheet shows "Pay [Payer] on Venmo" for any guest who isn't the designated payer
- Deep link: `venmo://paycharge?txn=pay&recipients=HANDLE&amount=X&note=BILLNAME`
- Requires payer to have a Venmo handle set in their profile

### Bill payer designation
- Owner can designate any guest as the "Bill Payer" (who actually fronted the money)
- Dropdown selector in owner controls on active bills
- Persisted as `bills.paid_by_phone`; defaults to creator if not set
- Venmo pay button routes to the designated payer's Venmo handle
- SQL migration confirmed run: `ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;`

### Venmo handle input fix
- Fixed `@` prefix span height mismatch in `profile.html` and `admin.html`
- Changed container to `align-items:stretch`, span to `display:flex;align-items:center`

### Admin link in dashboard
- "Admin" link in dashboard header, hidden until DB confirms `is_admin = true`

### Admin panel overhaul
- **Accounts section**: people in `tab.users` — full edit (name, Venmo, admin toggle, delete)
- **Bill Guests section**: people in `tab.guests` but NOT in `tab.users`
  - Catches friends who logged in before `tab.users` upsert was added to `index.html`
  - Edit: name only (propagates to all their guest rows)
  - "Create Account" promotes guest → full `tab.users` entry
  - "Remove from All Bills" clears guest rows + claims
- Search filters both sections simultaneously

## Key file locations
- `setup.html` — bill creation, multi-photo upload, tip % / $ toggle
- `bill.html` — bill view, kiosk mode, payer designation, Venmo pay button
- `dashboard.html` — bill list, admin link (admin-gated)
- `profile.html` — display name + Venmo handle
- `admin.html` — admin panel: accounts + bill guests
- `api/parse-receipt.js` — Claude Vision OCR with JSON fallback fix
- `js/config.js` — Supabase credentials
- `js/auth.js` — auth helpers including `updateLocalUser()`
- `js/utils.js` — shared helpers: fmt, fmtCurrency, getPersonShare, etc.
- `css/style.css` — all styles
- `supabase-schema.sql` — full schema + all migration comments

## Supabase project
- URL: `https://fcscdimjhycxgstnzucd.supabase.co`
- Schema: `tab` (all tables prefixed)
- Storage bucket: `receipts` (public)

## All SQL migrations run
```sql
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS receipt_urls TEXT[] DEFAULT '{}';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;
CREATE TABLE tab.users (
  phone TEXT PRIMARY KEY, name TEXT NOT NULL,
  venmo_handle TEXT, is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tab.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON tab.users FOR ALL USING (true) WITH CHECK (true);
```

## Known state / no open bugs
- Friends who logged in before `tab.users` was introduced show under Bill Guests; use "Create Account" to promote them
- Venmo pay button only appears if the payer has a Venmo handle in their profile
- Contact Picker API not available on iOS (Apple limitation, no workaround)
