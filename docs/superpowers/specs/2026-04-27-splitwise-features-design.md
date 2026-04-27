# TAB — Splitwise-Style Features Design
**Date:** 2026-04-27

## Scope

Add persistent groups, general expenses, running balances, debt simplification, and settlement recording to TAB. Existing standalone bill functionality is unchanged. Bills may optionally be linked to a group.

---

## Architecture

**Approach:** Additive/phased hybrid. New pages and tables are added without restructuring the existing bill flow. The data model is designed for the full vision from the start; features ship in three phases.

**Phases:**
1. Groups + basic expenses
2. Balances + bill linking
3. Debt simplification + settlements

---

## Data Model

Five new Supabase tables in the `tab` schema, plus one nullable column added to `bills`.

### `tab.groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | |
| `created_by` | text | phone (normalized 10-digit) |
| `invite_token` | text | random token for join links |
| `created_at` | timestamptz | |

### `tab.group_members`
| Column | Type | Notes |
|--------|------|-------|
| `group_id` | uuid FK → groups | |
| `phone` | text | normalized 10-digit |
| `display_name` | text | |
| `joined_at` | timestamptz | |

PK: `(group_id, phone)`

### `tab.expenses`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `group_id` | uuid FK → groups | |
| `description` | text | |
| `amount` | numeric | in native currency |
| `currency` | text | ISO 4217 code |
| `paid_by` | text | phone |
| `split_method` | text | `'equal'` / `'percentage'` / `'exact'` |
| `note` | text | optional |
| `created_at` | timestamptz | |

### `tab.expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| `expense_id` | uuid FK → expenses | |
| `phone` | text | |
| `amount` | numeric | resolved share in native currency |

PK: `(expense_id, phone)`

Amounts are always resolved at write time regardless of split method, so balance queries are simple sums with no method-specific logic at read time.

### `tab.settlements`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `group_id` | uuid FK → groups | |
| `paid_by` | text | phone |
| `paid_to` | text | phone |
| `amount` | numeric | |
| `currency` | text | ISO 4217 |
| `method` | text | `'venmo'` / `'cash'` / `'other'` |
| `note` | text | optional |
| `settled_at` | timestamptz | |

### `tab.bills` — new column
`group_id uuid NULL REFERENCES tab.groups(id)` — nullable FK; NULL means standalone bill.

---

## New Files

| File | Purpose |
|------|---------|
| `group.html` | Group detail page — expenses timeline, members, balances, settle-up |
| `js/groups.js` | Supabase data access for groups, expenses, splits, settlements |
| `js/balance.js` | Balance computation, currency conversion aggregation, debt simplification algorithm |

### Changes to Existing Files

| File | Change |
|------|--------|
| `dashboard.html` | Add "Groups" section below bills list; group card shows name, member count, net balance |
| `bill.html` | Add optional "Link to group" selector in bill creation/edit *(Phase 2)* |
| `index.html` | Handle group invite token in URL after login (same sessionStorage pattern as bill return URL) |

---

## `group.html` Structure

Three tabs:

1. **Expenses** — chronological list of expenses and attached bills; "Add expense" FAB
2. **Balances** — who owes whom in USD; per-currency breakdown on tap; "Simplify" button
3. **Members** — member list with display names; "Invite" button

Expense add/edit lives as a bottom sheet on `group.html` (not a separate page), consistent with `bill.html`'s sheet pattern.

---

## Key Flows

### Creating a Group & Inviting Members

1. "New Group" on dashboard → name input → row inserted into `tab.groups` with a random `invite_token`
2. "Invite" on group page → Web Share API (primary) or `sms:` URI (fallback) with pre-filled text: `Join [Group Name] on TAB: https://[host]/group.html?id=xxx&token=yyy`
3. Recipient taps link → if unauthenticated, `Auth.requireAuth()` saves URL to `sessionStorage` (existing mechanism) → after login, lands on group page → auto-joins via `invite_token`

### Adding a General Expense

Bottom sheet fields: description, amount, currency, who paid, split method, optional note.

Split resolution at save time:
- **Equal:** `amount / memberCount` per person
- **Percentage:** user enters % per person (must sum to 100); resolved amounts = `amount × pct`
- **Exact:** user enters amount per person (must sum to total); stored as entered

All resolved amounts written to `expense_splits` in a single Supabase transaction with the parent `expenses` row.

### Viewing Balances

For each group member, net balance in each currency:
```
net = Σ(expenses paid by member) − Σ(expense_splits owed by member)
    − Σ(settlements sent) + Σ(settlements received)
```

All non-USD amounts converted to USD via `getExchangeRate` (same Frankfurter/ECB API used by `bill.html`). Conversion is computed at read time using current rates.

Display: "You are owed $42.50" or "You owe $18.00" (USD primary). Tapping a balance row reveals per-currency breakdown.

### Debt Simplification

Greedy minimize-cash-flow algorithm:
1. Compute net USD balance per member
2. Partition into creditors (net > 0) and debtors (net < 0)
3. Repeatedly match largest debtor to largest creditor, record a transfer for `min(|debtor|, creditor)`, reduce both balances, repeat until all reach zero

Result: a minimum set of "A pays B $X" transfers shown as an actionable list. This is a view-only computation — no DB records are written until the user taps a transfer and completes a settlement.

### Settling Up

From the balances or simplified-debt view, tapping a debt row shows two options:
- **Pay on Venmo** — deep link with USD amount pre-filled; user marks as settled after paying
- **Mark as settled** — records a `tab.settlements` row immediately; balances update on next load

---

## Sharing / Invite Link

No backend SMS service. Invite flow uses:
1. **Web Share API** — `navigator.share({ text: '...', url: '...' })` → opens native share sheet; user selects Messages from contact list
2. **Fallback** — `sms:?body=...` URI if Web Share API is unavailable

`invite_token` is a random string (16 hex chars). Anyone with the link can join. There is no expiry for now.

---

## Currency Handling in Balances

- All expense amounts stored in their native currency in `expense_splits`
- Balances tab always displays USD as primary (via `getExchangeRate` conversions)
- Tapping a balance shows per-currency breakdown (e.g., "MX$340 MXN · $32.00 USD · €15.00 EUR")
- If an exchange rate is unavailable for a currency, that currency's amounts are shown separately with a "rate unavailable" note rather than silently dropped

---

## Out of Scope

- No recurring expenses
- No expense categories/tags
- No photo attachments to expenses (receipt scanning remains bill-only)
- No expiry on invite tokens
- No group archiving/deletion UI (data stays in DB)
- No push/SMS notifications (sharing is manual via native share sheet)
