# Tab — Project Context

## What it is
Bill splitter with Claude Vision OCR. Users upload a receipt photo, items are scanned, guests claim items, shares are calculated. Also supports group expense tracking with balances and settle-up.

## Stack
- Single-file HTML pages + vanilla JS + CSS
- Supabase (project: `fcscdimjhycxgstnzucd`, schema: `tab`)
- Vercel serverless (`api/parse-receipt.js` — Claude Vision OCR)
- No build step, no frameworks

## Key files
| File | Purpose |
|------|---------|
| `setup.html` | Bill creation: name, multi-photo upload, OCR scan, items, tax/discount, tip, currency, group assignment |
| `bill.html` | Bill view: item claiming, kiosk mode, guest list, summary sheet, Venmo pay, move-to-group |
| `dashboard.html` | Bills tab (excludes group-linked bills) + Groups tab; hash-based tab restore |
| `group.html` | Group view: expenses tab, balances tab, members tab, finalize/settle-up flow |
| `profile.html` | Display name + Venmo handle |
| `admin.html` | Admin panel: accounts + bill guests (promote guest → account) |
| `index.html` | Phone auth (OTP via Supabase) |
| `js/config.js` | Supabase credentials |
| `js/auth.js` | Auth helpers, `normalizePhone()`, `formatPhone()` |
| `js/utils.js` | `getPersonShare()`, `getBillTaxLines()`, `getBillTotalTax()`, `fmtCurrency()`, `getExchangeRate()` |
| `js/groups.js` | All group data access: expenses, bills, settlements, members, `assignBillToGroup()` |
| `js/balance.js` | `Balance.computeRaw()`, `Balance.simplify()`, `Balance.toUSD()` |
| `js/user-search.js` | Bidirectional autocomplete: name→user and phone→user (live Supabase lookup) |
| `css/style.css` | All styles |
| `supabase-schema.sql` | Full schema + migration history |
| `api/parse-receipt.js` | Vercel serverless: Claude Vision OCR, returns items/tax/currency/date |

## Supabase schema (tab)
Core tables: `bills`, `items`, `guests`, `claims`, `users`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`

### Pending SQL migrations (NOT YET RUN — must run in Supabase SQL editor)
```sql
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS tax_items JSONB DEFAULT '[]';
ALTER TABLE tab.items ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS group_participants TEXT[] DEFAULT '{}';
ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS tip_usd_amount NUMERIC DEFAULT 0;
```

## Feature state

### Bills
- Multi-photo upload + OCR (Claude Vision)
- Per-item claiming with kiosk mode (pass phone)
- Split methods on expenses: Equal, Exact, %, Shares, Adjustment, Claim
- Multi-tax rows (tax_items JSONB) with fallback to scalar tax_amount
- Bill-level discount + per-item discount
- Tip: % or fixed $ amount; on non-USD bills can specify tip in USD with live exchange rate
- Currency support: 30+ currencies, exchange rates via Open Exchange Rates
- Bill payer designation (paid_by_phone)
- Venmo pay button: shows for all non-payers with a share; falls back gracefully if payer has no @handle
- has_paid toggle on guests (payment tracking)
- Move to Group: two-step (pick group → select which members were on this bill)
- Group-linked bills hidden from Bills tab; shown in group's Expenses tab

### Groups
- Create, join via invite link, add members manually
- Expenses: Equal/Exact/%/Shares/Adjustment/Claim splits, receipt scan
- Bills linked to group appear in Expenses tab alongside expenses
- Balances: per-currency net with USD conversion, Simplify view
- **Finalize Group**: locks expenses, auto-switches to Balances/simplified settle-up view
  - Payer gets inline Venmo + Mark Settled buttons
  - Payee sees "Awaiting payment from [name]"
  - Reopen warns if settlements already recorded
- Settlements recorded and factored into balance recalculation
- Delete group (cascades child records)

### Guests / profiles
- Guests added by name+phone; `saveGuests()` normalizes phones via `Auth.normalizePhone()`
- On save, batch-resolves registered display names from `users` table by phone
- Ensures bills appear in guest's dashboard and guest can interact with the bill
- User search autocomplete works in both directions (name→user, phone→user)
- Group member import checklist in Add Guest sheet when bill is in a group

### Dashboard
- Bills tab: excludes group-linked bills
- Groups tab: shows active + closed groups
- Back navigation from group.html restores Groups tab via `#groups` hash

## Workflow notes
- All changes must be committed and pushed to main for Vercel to deploy
- Worktrees land on `claude/...` branches — always merge/push to `main`
- Phone numbers: always store as E.164 (`+15551234567`), display via `Auth.formatPhone()`
