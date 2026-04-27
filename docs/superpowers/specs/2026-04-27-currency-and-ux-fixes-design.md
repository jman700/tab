# TAB — Currency & UX Fixes Design
**Date:** 2026-04-27

## Scope

Five fixes across `index.html`, `js/auth.js`, and `bill.html`:

1. Phone autocomplete strips `+1` country code on iOS
2. New user who follows a bill link ends up on dashboard instead of the bill
3. Bill summary shows only one currency — should show USD primary + local secondary
4. Venmo payment amount uses the local currency instead of USD
5. Foreign-currency bill items default to local currency — should default to USD

---

## Fix 1 — Phone +1 strip on iOS autocomplete

**File:** `index.html` (phone input handler) · `js/auth.js` (`normalizePhone`)

**Problem:** iOS autofills `+1 (555) 555-5555`. After stripping non-digits the result is `15555555555` (11 digits). The input formatter treats the leading `1` as part of the area code, producing `(155) 555-5555`.

**Fix:**
- In the `input` event handler in `index.html`: after `digits = value.replace(/\D/g, '')`, if `digits.length === 11 && digits[0] === '1'` strip the leading digit before formatting.
- In `Auth.normalizePhone()`: apply the same rule so the stored phone is always a clean 10-digit string. This prevents a mismatch between the displayed value and the stored value.

---

## Fix 2 — Bill link loses new user back to dashboard

**Files:** `js/auth.js` (`requireAuth`) · `index.html` (`handleLogin`)

**Problem:** `bill.html` calls `Auth.requireAuth()` which redirects unauthenticated users to `/`. After registering, `handleLogin()` always sends the user to `/dashboard.html`. The bill URL is lost, so `ensureJoined()` never runs and the bill never appears in the dashboard.

**Fix:**
- In `Auth.requireAuth()`: before redirecting to `/`, save `window.location.href` to `sessionStorage` under the key `tab_return_url`.
- In `index.html` `handleLogin()`: after the login succeeds, read `sessionStorage.getItem('tab_return_url')`. If it exists, clear it and navigate there. Otherwise navigate to `/dashboard.html` as before.

---

## Fix 3 — Summary dual-currency display (Option A)

**File:** `bill.html` (`renderSummary`)

**Condition:** Only applies when `bill.currency !== 'USD'` and `exchangeRate` is available.

**Change:** The summary sheet always displays amounts in USD as the primary value. The local currency equivalent appears as smaller muted text directly below (per-person rows) or inline after (totals rows).

- **Per-person share rows:** large coloured USD amount + small muted `MX$xxx` on a second line.
- **Totals section (Subtotal / Tax / Tip / Total):** USD value + small muted `(MX$xxx)` inline.
- **Summary meta line:** `El Charro · $22.48 total` — no change (already in USD after fix 5).
- **No toggle** inside the summary sheet — it always shows both currencies when applicable.
- If `exchangeRate` is null (API unavailable), show only USD with no secondary line (fail silently).

---

## Fix 4 — Venmo button always uses USD

**File:** `bill.html` (`renderSummary`)

**Problem:** `rawAmt` was `showConverted && exchangeRate ? myShare * exchangeRate : myShare`. When the toggle was in local-currency mode, `rawAmt` was in the local currency (e.g. MXN), producing a wrong Venmo amount.

**Fix:** Always compute the Venmo amount as USD:
```js
const venmoAmt = (exchangeRate ? myShare * exchangeRate : myShare).toFixed(2);
```
If `exchangeRate` is unavailable, fall back to `myShare` (already a reasonable USD value for USD bills). For non-USD bills without a rate, disable/hide the button with a note "Exchange rate unavailable."

---

## Fix 5 — Default currency view is USD, toggle to local

**File:** `bill.html` (`setupCurrencyToggle`)

**Problem:** `showConverted` starts `false` (local currency), making the toggle default to MXN on a Mexican bill. User wants USD as the default view.

**Fix:**
- Initialize `showConverted = true` at declaration.
- In `setupCurrencyToggle()`: swap the active button — `btn-usd` starts active, `btn-orig` starts inactive.
- Swap the toggle button order in the HTML template to `USD | MXN` (USD first).
- The click handlers remain the same logic — they just start in the opposite state.
- `setupCurrencyToggle()` triggers an initial `renderItems() / renderMyTotal() / renderGuests()` after the rate loads so the display reflects USD from the start.

---

## Files Changed

| File | Changes |
|------|---------|
| `js/auth.js` | `normalizePhone` strips leading `1` from 11-digit numbers; `requireAuth` saves return URL to sessionStorage |
| `index.html` | Phone input formatter strips leading `1`; `handleLogin` checks sessionStorage for return URL |
| `bill.html` | `showConverted` default flipped; `setupCurrencyToggle` button order/active state swapped; `renderSummary` dual-currency display; Venmo always USD |

---

## Out of Scope

- No schema changes required.
- No changes to the receipt canvas (`buildReceiptCanvas`) — it already handles USD conversion correctly.
- No changes to `dashboard.html` — bills appear there once `ensureJoined` runs on the bill page.
