# TAB Groups — Phase 2: Balances + Bill Linking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each group member's running net balance (who owes whom, in USD), and allow existing receipt bills to be optionally linked to a group so their amounts feed into the group balance.

**Architecture:** Extends Phase 1. A new `js/balance.js` module handles balance computation (pure functions, no Supabase). A Balances tab is added to `group.html`. A nullable `group_id` column is added to `tab.bills`, and `bill.html` gets an optional "Link to group" field.

**Prerequisites:** Phase 1 plan (`2026-04-27-groups-phase1.md`) must be complete.

**Tech Stack:** Vanilla JS + HTML, Supabase JS v2, existing `js/utils.js` helpers, `getExchangeRate` (Frankfurter/ECB API already in `js/utils.js`)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `js/balance.js` | Net balance computation per member, multi-currency USD conversion |
| Modify | `group.html` | Add Balances tab |
| Modify | `bill.html` | Add optional "Link to group" selector |
| SQL    | Supabase | Add `group_id` column to `tab.bills` |

---

### Task 1: Add `group_id` Column to `tab.bills`

**Files:**
- No local files — run SQL in Supabase dashboard

- [ ] **Step 1: Run the following SQL in Supabase SQL Editor**

```sql
alter table tab.bills
  add column if not exists group_id uuid null references tab.groups(id) on delete set null;
```

- [ ] **Step 2: Verify**

In Supabase Table Editor → `tab.bills` → confirm `group_id` column exists with type `uuid`, nullable.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: document Supabase bills.group_id column addition"
```

---

### Task 2: `js/balance.js` — Balance Computation

**Files:**
- Create: `js/balance.js`

The balance formula per member per currency:
```
net[phone][currency] = Σ(expenses paid by phone in currency)
                     − Σ(expense_splits owed by phone in currency)
                     + Σ(bill grand_total where bill.paid_by_phone === phone in bill.currency)
                     − Σ(bill person_share for phone in bill.currency)
```

For USD display: fetch exchange rates for all non-USD currencies, convert, sum.

- [ ] **Step 1: Create `js/balance.js`**

```js
// ============================================================
// TAB — Balance
// Computes per-member net balances from expenses + bills.
// Pure functions — no Supabase calls. Caller passes data.
// ============================================================

const Balance = (() => {

  // Build a map: { phone → { currency → netAmount } }
  // Positive = others owe this person. Negative = this person owes others.
  function computeRaw(expenses, bills, members) {
    // expenses: array of expense objects with .splits[] (from Groups.getExpenses)
    // bills: array of bill objects with .grand_total, .paid_by_phone, .currency,
    //        and .memberShares: [{ phone, amount }] (caller must compute these)
    // members: array of { phone, display_name }

    const net = {};
    members.forEach(m => { net[m.phone] = {}; });

    function addNet(phone, currency, amount) {
      if (!net[phone]) net[phone] = {};
      net[phone][currency] = (net[phone][currency] || 0) + amount;
    }

    // Expenses: payer is owed back (positive), split members owe (negative)
    for (const exp of expenses) {
      addNet(exp.paid_by, exp.currency, exp.amount);
      for (const split of (exp.splits || [])) {
        addNet(split.phone, exp.currency, -split.amount);
      }
    }

    // Bills: bill payer is owed back, each member's share is their debt
    for (const bill of bills) {
      if (!bill.paid_by_phone) continue;
      addNet(bill.paid_by_phone, bill.currency, bill.grand_total);
      for (const share of (bill.memberShares || [])) {
        addNet(share.phone, bill.currency, -share.amount);
      }
    }

    return net;
  }

  // Convert raw per-currency balances to a single USD net per member.
  // rates: { 'MXN': 0.055, 'EUR': 1.08, ... } — USD rate for each currency
  // Returns: [{ phone, display_name, usdNet, breakdown }]
  // breakdown: [{ currency, amount, usdAmount }]
  function toUSD(rawNet, members, rates) {
    return members.map(m => {
      const byPhone   = rawNet[m.phone] || {};
      let usdNet      = 0;
      const breakdown = [];

      for (const [currency, amount] of Object.entries(byPhone)) {
        if (Math.abs(amount) < 0.001) continue;
        const rate     = currency === 'USD' ? 1 : (rates[currency] || null);
        const usdAmount = rate !== null ? amount * rate : null;
        if (usdAmount !== null) usdNet += usdAmount;
        breakdown.push({ currency, amount, usdAmount, rateAvailable: rate !== null });
      }

      return { phone: m.phone, display_name: m.display_name, usdNet, breakdown };
    });
  }

  // Fetch all exchange rates needed for a set of currencies.
  // Returns: { 'MXN': 0.055, 'EUR': 1.08, ... }
  async function fetchRates(currencies) {
    const nonUSD = [...new Set(currencies.filter(c => c && c !== 'USD'))];
    const entries = await Promise.all(
      nonUSD.map(async c => {
        const rate = await getExchangeRate(c, 'USD');
        return [c, rate];
      })
    );
    return Object.fromEntries(entries.filter(([, r]) => r !== null));
  }

  return { computeRaw, toUSD, fetchRates };
})();
```

- [ ] **Step 2: Verify the module parses without errors**

Open any TAB page in the browser, temporarily add `<script src="/js/balance.js"></script>`, open the console — no syntax errors. Remove the tag.

- [ ] **Step 3: Commit**

```bash
git add js/balance.js
git commit -m "feat: add js/balance.js for per-member net balance computation"
```

---

### Task 3: Groups.getBillsForGroup + Bill Share Helpers

**Files:**
- Modify: `js/groups.js`

We need to fetch group-linked bills and compute each member's share from `claims` + `items`. The share calculation already exists in `getPersonShare` (in `utils.js`), but that function needs all claims and items. We'll fetch them here.

- [ ] **Step 1: Add `getBillsForGroup` to `js/groups.js`**

Inside the Groups IIFE, before the `return` statement, add:

```js
  async function getBillsForGroup(groupId) {
    const { data: bills, error: e1 } = await db
      .from('bills')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    if (e1) return { error: e1 };
    if (!bills || bills.length === 0) return { data: [] };

    const billIds = bills.map(b => b.id);

    const [{ data: allClaims, error: e2 }, { data: allItems, error: e3 }, { data: allGuests, error: e4 }] =
      await Promise.all([
        db.from('claims').select('*').in('bill_id', billIds),
        db.from('items').select('*').in('bill_id', billIds),
        db.from('guests').select('*').in('bill_id', billIds),
      ]);
    if (e2 || e3 || e4) return { error: e2 || e3 || e4 };

    const claimsByBill = {};
    const itemsByBill  = {};
    const guestsByBill = {};
    (allClaims || []).forEach(c => { if (!claimsByBill[c.bill_id]) claimsByBill[c.bill_id] = []; claimsByBill[c.bill_id].push(c); });
    (allItems  || []).forEach(i => { if (!itemsByBill[i.bill_id])  itemsByBill[i.bill_id]  = []; itemsByBill[i.bill_id].push(i); });
    (allGuests || []).forEach(g => { if (!guestsByBill[g.bill_id]) guestsByBill[g.bill_id] = []; guestsByBill[g.bill_id].push(g); });

    return {
      data: bills.map(bill => {
        const claims = claimsByBill[bill.id] || [];
        const items  = itemsByBill[bill.id]  || [];
        const guests = guestsByBill[bill.id] || [];
        // Compute each guest's share
        const memberShares = guests.map(g => ({
          phone:  g.phone,
          amount: getPersonShare(g.phone, claims, items, guests, bill),
        }));
        return { ...bill, memberShares };
      }),
    };
  }
```

Also add `getBillsForGroup` to the `return` object:

```js
  return {
    createGroup, getMyGroups, getGroup, getMembers,
    joinGroup, addExpense, getExpenses, deleteExpense,
    getBillsForGroup,   // ← add this
  };
```

- [ ] **Step 2: Commit**

```bash
git add js/groups.js
git commit -m "feat: add getBillsForGroup to groups.js for balance computation"
```

---

### Task 4: Balances Tab in `group.html`

**Files:**
- Modify: `group.html`

- [ ] **Step 1: Add the Balances tab button to the tab bar in `group.html`**

In `group.html`, find the tab bar `<div class="toggle-group" id="tab-bar">` and add a third button:

```html
    <button class="toggle-btn active" id="tab-expenses">Expenses</button>
    <button class="toggle-btn" id="tab-balances">Balances</button>
    <button class="toggle-btn" id="tab-members">Members</button>
```

- [ ] **Step 2: Add the Balances tab content div to `group.html`**

After `</div>` closing `#expenses-tab` and before `<div id="members-tab"`, insert:

```html
  <!-- Balances tab -->
  <div id="balances-tab" style="display:none;">
    <div id="balances-list">
      <div class="bill-card-skeleton">
        <div class="skeleton" style="height:18px;width:50%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:13px;width:30%;"></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add `js/balance.js` script tag to `group.html`**

In `group.html`, after `<script src="/js/groups.js"></script>`, add:

```html
<script src="/js/balance.js"></script>
```

- [ ] **Step 4: Update the `switchTab` function in `group.html`'s inline script**

Replace the existing `switchTab` function:

```js
  function switchTab(tab) {
    $('expenses-tab').style.display  = tab === 'expenses' ? '' : 'none';
    $('balances-tab').style.display  = tab === 'balances' ? '' : 'none';
    $('members-tab').style.display   = tab === 'members'  ? '' : 'none';
    $('tab-expenses').classList.toggle('active', tab === 'expenses');
    $('tab-balances').classList.toggle('active', tab === 'balances');
    $('tab-members').classList.toggle('active', tab === 'members');
    if (tab === 'balances') loadBalances();
  }
```

- [ ] **Step 5: Add tab-balances click listener in `group.html`'s inline script**

After the existing tab listeners, add:

```js
  $('tab-balances').addEventListener('click', () => switchTab('balances'));
```

- [ ] **Step 6: Add `loadBalances` and `renderBalances` to `group.html`'s inline script**

```js
  // ── Balances tab ──────────────────────────────────────────
  async function loadBalances() {
    setHTML('balances-list', '<p style="font-size:14px;color:var(--text-muted);">Computing balances…</p>');

    const [{ data: expenses, error: e1 }, { data: bills, error: e2 }] = await Promise.all([
      Groups.getExpenses(groupId),
      Groups.getBillsForGroup(groupId),
    ]);

    if (e1 || e2) {
      setHTML('balances-list', '<p style="font-size:14px;color:var(--text-muted);">Could not load balances.</p>');
      return;
    }

    const allExpenses = expenses || [];
    const allBills    = bills    || [];

    // Gather all currencies used
    const currencies = [
      ...allExpenses.map(e => e.currency),
      ...allBills.map(b => b.currency),
    ];

    const rates  = await Balance.fetchRates(currencies);
    const rawNet = Balance.computeRaw(allExpenses, allBills, members);
    const byMember = Balance.toUSD(rawNet, members, rates);

    renderBalances(byMember);
  }

  function renderBalances(byMember) {
    if (byMember.every(m => Math.abs(m.usdNet) < 0.01)) {
      setHTML('balances-list', `
        <div class="empty">
          <div class="empty-icon">✓</div>
          <h3>All settled up</h3>
          <p>No one owes anyone in this group.</p>
        </div>
      `);
      return;
    }

    setHTML('balances-list', byMember.map((m, i) => {
      const isYou   = m.phone === user.phone;
      const net     = m.usdNet;
      const absNet  = Math.abs(net);
      const color   = net > 0.01 ? 'var(--green)' : net < -0.01 ? 'var(--red)' : 'var(--text-muted)';
      const label   = net > 0.01
        ? (isYou ? 'You are owed' : 'Is owed')
        : net < -0.01
        ? (isYou ? 'You owe' : 'Owes')
        : 'Settled up';

      const breakdown = m.breakdown.length > 1
        ? `<details style="margin-top:6px;">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;">Per currency</summary>
            <div style="padding:6px 0 0 0;">
              ${m.breakdown.map(b => `
                <div style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;padding:2px 0;">
                  <span>${b.currency}</span>
                  <span>${b.amount >= 0 ? '+' : ''}${fmtCurrency(b.amount, b.currency)}
                    ${b.rateAvailable ? `<span style="color:var(--text-muted);"> ≈ ${fmtCurrency(b.usdAmount, 'USD')}</span>` : '<span style="color:var(--red);"> (rate unavailable)</span>'}
                  </span>
                </div>
              `).join('')}
            </div>
          </details>`
        : '';

      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;background:${getPersonColor(i)}22;color:${getPersonColor(i)};border:1.5px solid ${getPersonColor(i)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:500;">${escHtml(m.display_name)}${isYou ? ' <span style="font-size:11px;color:var(--text-muted);">(you)</span>' : ''}</div>
            <div style="font-size:12px;color:${color};margin-top:2px;">${label}</div>
            ${breakdown}
          </div>
          <div style="font-size:16px;font-weight:600;color:${color};">${absNet < 0.01 ? '—' : fmtCurrency(absNet, 'USD')}</div>
        </div>
      `;
    }).join(''));
  }
```

- [ ] **Step 7: Verify in browser**

1. Open a group with at least 2 members and 1+ expenses.
2. Tap "Balances" tab → balances load, showing each person's USD net.
3. If expenses are in a foreign currency (add a MXN expense to test), the USD conversion appears.
4. Tap "Per currency" disclosure triangle → per-currency breakdown shown.
5. With no expenses → "All settled up" empty state shown.

- [ ] **Step 8: Commit**

```bash
git add group.html
git commit -m "feat: add Balances tab to group.html with multi-currency USD conversion"
```

---

### Task 5: "Link to Group" in `bill.html`

**Files:**
- Modify: `bill.html`

Bills can optionally be linked to a group at creation time. Since bill creation happens in `setup.html` (or wherever the bill creation form is), we need to check which file handles the initial bill insert. Based on the existing codebase, bill creation is in `setup.html`.

- [ ] **Step 1: Read `setup.html` to find where `bills` are inserted**

Open `setup.html` and find the Supabase insert call for `tab.bills`. It will look like:

```js
db.from('bills').insert({ name, currency, ... })
```

Note the exact location (file:line).

- [ ] **Step 2: Add `js/groups.js` script tag to `setup.html`**

In `setup.html`, after `<script src="/js/utils.js"></script>`, add:

```html
<script src="/js/groups.js"></script>
```

- [ ] **Step 3: Add a "Link to group" field to the bill creation form in `setup.html`**

Before the submit/create button in `setup.html`, add:

```html
<div class="field" id="group-link-field">
  <label for="bill-group-select">Link to Group <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;">(optional)</span></label>
  <select class="input" id="bill-group-select" style="padding:9px 12px;font-size:14px;cursor:pointer;">
    <option value="">No group</option>
  </select>
</div>
```

- [ ] **Step 4: Populate the group selector in `setup.html`'s init function**

In `setup.html`'s initialization code (after `Auth.requireAuth()`), add:

```js
async function loadGroupOptions() {
  const { data } = await Groups.getMyGroups(user.phone);
  if (!data || data.length === 0) {
    hide($('group-link-field'));
    return;
  }
  const sel = $('bill-group-select');
  data.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = escHtml(g.name);
    sel.appendChild(opt);
  });
}
loadGroupOptions();
```

- [ ] **Step 5: Pass `group_id` when inserting the bill in `setup.html`**

Find the `db.from('bills').insert(...)` call. Add `group_id` to the insert object:

```js
const groupId = $('bill-group-select').value || null;
// Add group_id to the insert:
db.from('bills').insert({
  name,
  currency,
  // ... other existing fields ...
  group_id: groupId,
})
```

- [ ] **Step 6: Verify in browser**

1. Open `/setup.html` (or however bill creation is accessed) — a "Link to Group" dropdown appears if you have groups.
2. Create a bill linked to a group → navigate to the group's Balances tab → the bill's totals now feed into the balance.
3. Create a bill with no group selected → no change to group balances.

- [ ] **Step 7: Commit**

```bash
git add setup.html bill.html
git commit -m "feat: add optional Link to Group field in bill creation"
```

---

## Phase 2 Complete

After all 5 tasks are done:

- Balances tab shows each member's USD net balance
- Multi-currency balances show a per-currency breakdown on tap
- Receipt bills can be optionally linked to a group at creation time
- Linked bills feed into the group balance automatically

**Phase 3** (Debt Simplification + Settlements) is a separate plan: `docs/superpowers/plans/2026-04-27-groups-phase3.md`
