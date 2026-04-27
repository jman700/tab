# Currency & UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five UX issues: phone +1 autocomplete, bill-link redirect for new users, foreign-currency bill defaulting to USD, Venmo always showing USD, and bill summary showing dual-currency amounts.

**Architecture:** Pure HTML/CSS/JS frontend with Supabase. No build step, no test runner — verification is done manually in the browser or via DevTools console snippets. Changes touch three files: `js/auth.js`, `index.html`, and `bill.html`.

**Tech Stack:** Vanilla JS, Supabase JS v2, HTML/CSS

---

## File Map

| File | What changes |
|------|-------------|
| `js/auth.js` | `normalizePhone` strips leading `1` from 11-digit numbers; `requireAuth` saves current URL to `sessionStorage` before redirecting |
| `index.html` | Phone `input` handler drops leading `1` before formatting; `handleLogin` redirects to saved URL if present |
| `bill.html` | `showConverted` initialises to `true`; `setupCurrencyToggle` flips button order/active state and re-renders after rate loads; `renderSummary` shows dual-currency amounts and always uses USD for Venmo |

---

## Task 1 — Fix phone +1 strip (`js/auth.js`)

**Files:**
- Modify: `js/auth.js` — `normalizePhone` function

- [ ] **Step 1: Open `js/auth.js` and locate `normalizePhone`**

Current code (line 53–55):
```js
function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}
```

- [ ] **Step 2: Replace `normalizePhone` with the +1-aware version**

```js
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  return digits;
}
```

- [ ] **Step 3: Verify in browser DevTools console**

Open any page in the app. Paste this into the console:
```js
// Should all return '5555555555'
console.assert(Auth.normalizePhone('+15555555555') === '5555555555', 'fails +1 prefix');
console.assert(Auth.normalizePhone('15555555555')  === '5555555555', 'fails leading 1');
console.assert(Auth.normalizePhone('5555555555')   === '5555555555', 'fails plain 10');
console.assert(Auth.normalizePhone('(555) 555-5555') === '5555555555', 'fails formatted');
console.log('All normalizePhone assertions passed');
```
Expected: `All normalizePhone assertions passed`

- [ ] **Step 4: Commit**

```bash
cd /c/Users/anton/Documents/Claude-Code/tab
git add js/auth.js
git commit -m "fix: normalizePhone strips leading country code 1 from 11-digit numbers"
```

---

## Task 2 — Fix phone input formatter (`index.html`)

**Files:**
- Modify: `index.html` — `phoneInput` `input` event handler

- [ ] **Step 1: Locate the phone input handler in `index.html`**

Find this block (around line 81):
```js
phoneInput.addEventListener('input', () => {
  const digits = phoneInput.value.replace(/\D/g, '');
  if (digits.length <= 3)       phoneInput.value = digits;
  else if (digits.length <= 6)  phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  else if (digits.length <= 10) phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  else                          phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
});
```

- [ ] **Step 2: Replace with the +1-aware version**

```js
phoneInput.addEventListener('input', () => {
  let digits = phoneInput.value.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length <= 3)       phoneInput.value = digits;
  else if (digits.length <= 6)  phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  else if (digits.length <= 10) phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  else                          phoneInput.value = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
});
```

- [ ] **Step 3: Manual verify**

Open the app's login page (`/`). Paste `+15555555555` into the phone field — it should immediately reformat to `(555) 555-5555`. Also verify that typing `5555555555` (10 digits, no country code) still formats correctly to `(555) 555-5555`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: phone input formatter ignores +1 country code prefix from iOS autocomplete"
```

---

## Task 3 — Redirect new user back to bill after login (`js/auth.js` + `index.html`)

**Files:**
- Modify: `js/auth.js` — `requireAuth` function
- Modify: `index.html` — `handleLogin` function

- [ ] **Step 1: Update `requireAuth` in `js/auth.js`**

Find the current `requireAuth` (around line 44):
```js
function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  return user;
}
```

Replace with:
```js
function requireAuth() {
  const user = getUser();
  if (!user) {
    sessionStorage.setItem('tab_return_url', window.location.href);
    window.location.href = '/';
    return null;
  }
  return user;
}
```

- [ ] **Step 2: Update `handleLogin` in `index.html`**

Find the end of `handleLogin` where the redirect happens (around line 113):
```js
    window.location.replace('/dashboard.html');
```

Replace that single line with:
```js
    const returnUrl = sessionStorage.getItem('tab_return_url');
    if (returnUrl) {
      sessionStorage.removeItem('tab_return_url');
      window.location.replace(returnUrl);
    } else {
      window.location.replace('/dashboard.html');
    }
```

- [ ] **Step 3: Manual verify**

1. Sign out (or open a private/incognito window).
2. Open a bill URL directly (e.g. `http://localhost:3000/bill.html?id=<some-id>` or whatever your dev URL is).
3. You should be redirected to the login page.
4. Enter a name and phone number and click "Get Started".
5. You should land back on the bill page, not on `/dashboard.html`.
6. Open the bill's Guests list — your name should appear (proving `ensureJoined` ran).

- [ ] **Step 4: Commit**

```bash
git add js/auth.js index.html
git commit -m "fix: redirect new users back to bill URL after login instead of dashboard"
```

---

## Task 4 — Default currency toggle to USD (`bill.html`)

**Files:**
- Modify: `bill.html` — `showConverted` declaration and `setupCurrencyToggle` function

- [ ] **Step 1: Flip the `showConverted` default**

Find this line near the top of the `<script>` block (around line 214):
```js
let showConverted  = false;
```

Change it to:
```js
let showConverted  = true;
```

- [ ] **Step 2: Rewrite `setupCurrencyToggle`**

Find the entire `setupCurrencyToggle` function and replace it:

```js
function setupCurrencyToggle() {
  billCurrency = bill.currency || 'USD';
  if (billCurrency === 'USD') return;

  const toggleEl = $('currency-toggle');
  toggleEl.innerHTML = `
    <button class="toggle-btn active" id="btn-usd">USD</button>
    <button class="toggle-btn" id="btn-orig">${billCurrency}</button>
  `;
  show(toggleEl);

  $('btn-usd').addEventListener('click', () => {
    if (!exchangeRate) return showToast('Exchange rate unavailable — try again shortly', 'error');
    showConverted = true;
    $('btn-usd').classList.add('active');
    $('btn-orig').classList.remove('active');
    show($('rate-note'));
    renderItems(); renderMyTotal(); renderGuests();
  });

  $('btn-orig').addEventListener('click', () => {
    showConverted = false;
    $('btn-orig').classList.add('active');
    $('btn-usd').classList.remove('active');
    hide($('rate-note'));
    renderItems(); renderMyTotal(); renderGuests();
  });

  getExchangeRate(billCurrency, 'USD').then(rate => {
    exchangeRate = rate;
    if (rate) {
      setText('rate-note', `1 ${billCurrency} = ${fmtCurrency(rate, 'USD')} · Frankfurter / ECB`);
      if (showConverted) {
        renderItems(); renderMyTotal(); renderGuests();
      }
    }
  });
}
```

- [ ] **Step 3: Manual verify**

Open a bill that has a non-USD currency (e.g. MXN). Confirm:
- The toggle shows `USD | MXN` with USD highlighted by default.
- Item prices display in USD.
- Clicking `MXN` switches all prices to pesos; clicking `USD` switches back.

- [ ] **Step 4: Commit**

```bash
git add bill.html
git commit -m "fix: foreign-currency bills default to USD view, toggle to local currency"
```

---

## Task 5 — Venmo button always uses USD (`bill.html`)

**Files:**
- Modify: `bill.html` — Venmo section inside `renderSummary`

- [ ] **Step 1: Locate the Venmo block inside `renderSummary`**

Find this section (around line 953):
```js
const myShare   = getPersonShare(user.phone, claims, items, guests, bill);
if (payerVenmo && user.phone !== paidByPhone && myShare > 0) {
  const payerName = guests.find(g => g.phone === paidByPhone)?.name || 'the bill payer';
  const rawAmt    = showConverted && exchangeRate ? myShare * exchangeRate : myShare;
  const venmoAmt  = rawAmt.toFixed(2);
  const venmoNote = encodeURIComponent(bill.name);
  const venmoUrl  = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(payerVenmo)}&amount=${venmoAmt}&note=${venmoNote}`;
  setHTML('venmo-pay-wrap', `
    <div style="margin-top:20px;padding:16px;background:var(--surface-2);border-radius:var(--radius);text-align:center;">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
        Pay <strong style="color:var(--text);">@${escHtml(payerVenmo)}</strong> (${escHtml(payerName)})
      </p>
      <a href="${venmoUrl}" class="btn btn-primary btn-full" style="text-decoration:none;display:block;">
        Pay ${display(myShare)} on Venmo
      </a>
      <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Opens the Venmo app with your amount pre-filled.</p>
    </div>
  `);
} else {
  setHTML('venmo-pay-wrap', '');
}
```

- [ ] **Step 2: Replace the Venmo block with the USD-always version**

```js
const myShare   = getPersonShare(user.phone, claims, items, guests, bill);
if (payerVenmo && user.phone !== paidByPhone && myShare > 0) {
  const payerName  = guests.find(g => g.phone === paidByPhone)?.name || 'the bill payer';
  const isNonUSD   = billCurrency !== 'USD';
  const venmoNote  = encodeURIComponent(bill.name);

  if (isNonUSD && !exchangeRate) {
    setHTML('venmo-pay-wrap', `
      <div style="margin-top:20px;padding:16px;background:var(--surface-2);border-radius:var(--radius);text-align:center;">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">
          Pay <strong style="color:var(--text);">@${escHtml(payerVenmo)}</strong> (${escHtml(payerName)})
        </p>
        <p style="font-size:12px;color:var(--text-muted);">Exchange rate unavailable — open Venmo manually.</p>
      </div>
    `);
  } else {
    const venmoUsdAmt = isNonUSD ? (myShare * exchangeRate).toFixed(2) : myShare.toFixed(2);
    const venmoUrl    = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(payerVenmo)}&amount=${venmoUsdAmt}&note=${venmoNote}`;
    setHTML('venmo-pay-wrap', `
      <div style="margin-top:20px;padding:16px;background:var(--surface-2);border-radius:var(--radius);text-align:center;">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
          Pay <strong style="color:var(--text);">@${escHtml(payerVenmo)}</strong> (${escHtml(payerName)})
        </p>
        <a href="${venmoUrl}" class="btn btn-primary btn-full" style="text-decoration:none;display:block;">
          Pay $${venmoUsdAmt} on Venmo
        </a>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Opens the Venmo app with your amount pre-filled.</p>
      </div>
    `);
  }
} else {
  setHTML('venmo-pay-wrap', '');
}
```

- [ ] **Step 3: Manual verify**

Open a bill with MXN currency. Toggle to the `MXN` view (so `showConverted = false`). Open the Summary sheet. The Venmo button should show a USD dollar amount, not pesos. Toggle back to USD — the button amount should be the same number.

- [ ] **Step 4: Commit**

```bash
git add bill.html
git commit -m "fix: Venmo payment amount always in USD regardless of currency toggle state"
```

---

## Task 6 — Summary dual-currency display (`bill.html`)

**Files:**
- Modify: `bill.html` — `renderSummary` function (per-person rows and totals section)

- [ ] **Step 1: Locate the `summaryList` map inside `renderSummary`**

Find this block (around line 917):
```js
const summaryList = guests.map((g, i) => {
  const share = getPersonShare(g.phone, claims, items, guests, bill);
  const color = getPersonColor(i);
  const pct   = bill.grand_total > 0 ? (share / bill.grand_total * 100) : 0;
  const isMe  = g.phone === user.phone;
  return `
    <div class="summary-row">
      ...
      <div class="summary-amount" style="color:${color};">${display(share)}</div>
    </div>
  `;
}).join('');
```

- [ ] **Step 2: Replace the `summaryList` map with dual-currency version**

```js
const showDual = billCurrency !== 'USD' && !!exchangeRate;

const summaryList = guests.map((g, i) => {
  const share     = getPersonShare(g.phone, claims, items, guests, bill);
  const color     = getPersonColor(i);
  const pct       = bill.grand_total > 0 ? (share / bill.grand_total * 100) : 0;
  const isMe      = g.phone === user.phone;
  const usdAmt    = showDual ? fmtCurrency(share * exchangeRate, 'USD') : display(share);
  const localLine = showDual
    ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">${fmtCurrency(share, billCurrency)}</div>`
    : '';
  return `
    <div class="summary-row">
      <div class="summary-avatar" style="background:${color}22;color:${color};border:2px solid ${color}44;">
        ${getInitials(g.name)}
      </div>
      <div class="summary-info">
        <div class="summary-name">${escHtml(g.name)}${isMe ? ' <span style="color:var(--text-muted);font-weight:400;font-size:12px;">(you)</span>' : ''}</div>
        <div class="summary-pct">${pct.toFixed(1)}% of total</div>
        <div class="summary-bar">
          <div class="summary-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>
      <div class="summary-amount" style="color:${color};">
        ${usdAmt}
        ${localLine}
      </div>
    </div>
  `;
}).join('');
```

- [ ] **Step 3: Replace the `summary-totals` block with dual-currency version**

Find:
```js
const tip = subtotal * (bill.tip_percentage / 100);
setHTML('summary-totals', `
  <div class="summary-total-row"><span class="key">Subtotal</span><span>${display(subtotal)}</span></div>
  <div class="summary-total-row"><span class="key">Tax</span><span>${display(bill.tax_amount)}</span></div>
  <div class="summary-total-row"><span class="key">Tip (${bill.tip_percentage}%)</span><span>${display(tip)}</span></div>
  <div class="summary-final">
    <span class="key">Total</span>
    <span class="val">${display(bill.grand_total)}</span>
  </div>
`);
```

Replace with:
```js
const tip = subtotal * (bill.tip_percentage / 100);

function dualAmt(amount) {
  if (!showDual) return display(amount);
  const local = fmtCurrency(amount, billCurrency);
  const usd   = fmtCurrency(amount * exchangeRate, 'USD');
  return `${usd} <span style="font-size:10px;color:var(--text-muted);">(${local})</span>`;
}

setHTML('summary-totals', `
  <div class="summary-total-row"><span class="key">Subtotal</span><span>${dualAmt(subtotal)}</span></div>
  <div class="summary-total-row"><span class="key">Tax</span><span>${dualAmt(bill.tax_amount)}</span></div>
  <div class="summary-total-row"><span class="key">Tip (${bill.tip_percentage}%)</span><span>${dualAmt(tip)}</span></div>
  <div class="summary-final">
    <span class="key">Total</span>
    <span class="val">${dualAmt(bill.grand_total)}</span>
  </div>
`);
```

- [ ] **Step 4: Update the summary meta line to show USD total**

Find (around line 913):
```js
setText('summary-meta', `${bill.name} · ${display(bill.grand_total)} total`);
```

Replace with:
```js
const metaTotal = (billCurrency !== 'USD' && exchangeRate)
  ? fmtCurrency(bill.grand_total * exchangeRate, 'USD')
  : display(bill.grand_total);
setText('summary-meta', `${bill.name} · ${metaTotal} total`);
```

- [ ] **Step 5: Manual verify**

Open a MXN bill. Open the Summary sheet. Confirm:
- Each guest's share shows a USD dollar amount in their colour, with a small muted `MX$xxx` line beneath it.
- The Subtotal / Tax / Tip / Total rows each show `$X.XX (MX$Y)`.
- The header meta line shows a USD total (e.g. `El Charro · $22.48 total`).
- For a USD bill, nothing changes — amounts appear exactly as before.

- [ ] **Step 6: Commit**

```bash
git add bill.html
git commit -m "feat: summary sheet shows USD primary with local currency secondary for foreign bills"
```

---

## Final Smoke Test

- [ ] Open the app on a mobile browser (or use DevTools device emulation).
- [ ] Confirm the phone autocomplete (paste `+15555555555`) formats as `(555) 555-5555`.
- [ ] Follow a bill link while logged out — login and confirm you land on the bill, not the dashboard.
- [ ] Open a MXN bill:
  - Items default to USD with `USD | MXN` toggle visible.
  - Toggle to MXN — prices switch to pesos.
  - Toggle back — prices switch to USD.
  - Open Summary — dual amounts visible, Venmo button shows USD.
- [ ] Open a USD bill — confirm nothing looks different from before.
