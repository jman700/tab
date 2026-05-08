# Joint Entry (Couple Claiming) — Design Spec
Date: 2026-05-07

## Problem
Couples and small groups often want to claim items together under one name without requiring both people to join the bill separately and each claim their own items.

## Solution
Allow any guest to designate themselves as a "party of 2" by setting a headcount field and renaming their guest entry (e.g., "Antonio & Maria"). Claims still go to one phone; the headcount is used only for equal tip/tax fee splitting.

## Scope
- Any guest can create a joint entry for themselves on any active bill
- Joint entry = headcount 2, custom display name
- Counts as 2 seats for equal tip/tax splitting
- Proportional splitting unchanged (already scales by item value)

---

## Data Model

### Migration
```sql
ALTER TABLE tab.guests ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;
```

No new tables. All existing claim queries are unaffected — claims still use `guest_phone` as before.

---

## UX

### Triggering a joint entry
On the bill page (`bill.html`), each guest's row shows their own row in the guests list. A guest can see their own row and tap **"+1 Partner"** — a button visible only on the current user's own guest row (not on other guests' rows) and only when the bill is active (hidden once closed).

### Inline form
Tapping "+1 Partner" reveals a small inline form below the guest row (no overlay). Contains:
- A single text input: **"Party name"** — pre-filled with `{name} & ___`
- A **Save** button

On save:
- `guests.headcount` → 2
- `guests.name` → entered party name
- Button label changes to **"Party of 2 ✕"**

### Reverting
Tapping "Party of 2 ✕" resets:
- `guests.headcount` → 1
- `guests.name` → original name (stored in `tab.users.display_name` or the name used at join time — use current `tab.users` record as source of truth)

---

## Tip/Tax Splitting

### Equal split (current logic)
```js
// Before
const perPerson = totalFees / guests.length;

// After
const totalHeads = guests.reduce((sum, g) => sum + (g.headcount || 1), 0);
const perHead = totalFees / totalHeads;
const myFees = myGuest.headcount * perHead;
```

### Proportional split
No change — already scales by claimed item value.

---

## Affected Files

| File | Change |
|------|--------|
| `supabase-schema.sql` | Add headcount migration comment |
| `js/utils.js` | Update `getPersonShare` equal-split logic |
| `bill.html` | Add "+1 Partner" button + inline form to guest row |

---

## Out of Scope
- Parties of 3+ (headcount always 2 for now)
- Joint entries created by the bill owner on behalf of guests
- Any change to Venmo pay, confirmation flow, or closed-bill summary beyond what naturally follows from the changed share amount
