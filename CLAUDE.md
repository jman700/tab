# Tab — Bill Splitter

## What This Is
Real-time bill splitter. Upload a receipt → Claude Vision parses items → share link → everyone claims their items. Includes Venmo pay integration.

## Stack
- Frontend: Vanilla HTML/CSS/JS, no framework
- Database + Realtime: Supabase (schema: `tab`, project: `fcscdimjhycxgstnzucd.supabase.co`)
- Hosting: Vercel (auto-deploy from main)
- OCR: Claude Vision API via Vercel serverless (`api/parse-receipt.js`)
- Storage: Supabase `receipts` bucket (public)

## Pages
| File | Route | Purpose |
|------|-------|---------|
| `index.html` | `/` | Login (name + phone, no password) |
| `dashboard.html` | `/dashboard.html` | Active + closed bills, admin link |
| `setup.html` | `/setup` | Create/edit bill, multi-photo receipt upload |
| `bill.html` | `/bill/:id` | Claim items, summary, Venmo pay button |
| `admin.html` | `/admin` | Accounts + bill guests management |
| `profile.html` | `/profile` | Display name + Venmo handle |

## Key Files
- `js/config.js` — Supabase credentials (edit this for local dev)
- `js/auth.js` — session management, `updateLocalUser()`
- `js/utils.js` — `fmt`, `fmtCurrency`, `getPersonShare`, etc.
- `css/style.css` — full design system
- `supabase-schema.sql` — full schema + all migration comments
- `api/parse-receipt.js` — Claude Vision OCR with JSON fallback

## Auth Model
localStorage fingerprint for device recognition. Phone number re-entry on new devices. No SMS/OTP (by design for MVP).

## Venmo Integration
- Payer sets Venmo handle in profile
- Owner designates bill payer via `bills.paid_by_phone`
- Pay button: `venmo://paycharge?txn=pay&recipients=HANDLE&amount=X&note=BILLNAME`

## Migrations Run (all in `supabase-schema.sql`)
```sql
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS receipt_urls TEXT[] DEFAULT '{}';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;
-- tab.users table with RLS
```


## SESSION START
At the start of every session: read `HANDOFF.md` and `.claude/memory/*.md` before doing anything else. These files contain the current project state and exact next step. Do not rely on git log or assumptions — read the files.
