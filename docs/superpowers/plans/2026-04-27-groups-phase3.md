# TAB Groups — Phase 3: Debt Simplification + Settlements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Simplify" view that computes the minimum number of transfers to settle all group debts, and a settle-up flow where users can record a settlement (manually or via Venmo deep link).

**Architecture:** Extends Phase 2. The simplification algorithm lives in `js/balance.js`. Settlements are stored in `tab.settlements`. The Balances tab in `group.html` gains a "Simplify" toggle and a settle-up bottom sheet.

**Prerequisites:** Phase 2 plan (`2026-04-27-groups-phase2.md`) must be complete.

**Tech Stack:** Vanilla JS + HTML, Supabase JS v2, existing `js/utils.js` helpers

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| SQL    | Supabase | Create `tab.settlements` table |
| Modify | `js/balance.js` | Add `simplify(balances)` algorithm |
| Modify | `js/groups.js` | Add `addSettlement`, `getSettlements` |
| Modify | `group.html` | Simplify toggle, settle-up sheet, settlements in balance computation |

---

### Task 1: `tab.settlements` Table

**Files:**
- No local files — run SQL in Supabase dashboard

- [ ] **Step 1: Run the following SQL in Supabase SQL Editor**

```sql
create table if not exists tab.settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references tab.groups(id) on delete cascade,
  paid_by    text not null,
  paid_to    text not null,
  amount     numeric(12,2) not null,
  currency   text not null default 'USD',
  method     text not null check (method in ('venmo','cash','other')),
  note       text,
  settled_at timestamptz not null default now()
);

alter table tab.settlements enable row level security;
create policy "allow all" on tab.settlements for all using (true) with check (true);
```

- [ ] **Step 2: Verify**

Supabase Table Editor → `tab.settlements` → confirm columns: `id`, `group_id`, `paid_by`, `paid_to`, `amount`, `currency`, `method`, `note`, `settled_at`.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: document tab.settlements schema creation"
```

---

### Task 2: Simplification Algorithm in `js/balance.js`

**Files:**
- Modify: `js/balance.js`

The greedy minimize-cash-flow algorithm: repeatedly match the largest debtor with the largest creditor until all balances reach zero.

- [ ] **Step 1: Add `simplify` function to `js/balance.js`**

Inside the Balance IIFE, before the `return` statement, add:

```js
  // Compute minimum transfers to settle all debts.
  // Input: output of toUSD() — [{ phone, display_name, usdNet, ... }]
  // Output: [{ from: phone, fromName, to: phone, toName, amount }]
  function simplify(members) {
    // Work with cents to avoid floating-point drift
    const balances = members.map(m => ({
      phone: m.phone,
      name:  m.display_name,
      cents: Math.round(m.usdNet * 100),
    }));

    const transfers = [];

    // Keep iterating until all balances are zero (within 1 cent)
    let maxIter = balances.length * balances.length + 10; // safety cap
    while (maxIter-- > 0) {
      balances.sort((a, b) => a.cents - b.cents);
      const debtor   = balances[0];                    // most negative
      const creditor = balances[balances.length - 1];  // most positive

      if (Math.abs(debtor.cents) < 1 || Math.abs(creditor.cents) < 1) break;

      const amount = Math.min(-debtor.cents, creditor.cents);
      transfers.push({
        from:     debtor.phone,
        fromName: debtor.name,
        to:       creditor.phone,
        toName:   creditor.name,
        amount:   amount / 100,
      });

      debtor.cents   += amount;
      creditor.cents -= amount;
    }

    return transfers;
  }
```

Add `simplify` to the `return` object:

```js
  return { computeRaw, toUSD, fetchRates, simplify };
```

- [ ] **Step 2: Verify the algorithm manually in the browser console**

Open any TAB page that loads `balance.js`. Run this in the console:

```js
const test = [
  { phone: 'A', display_name: 'Alice', usdNet: -30 },
  { phone: 'B', display_name: 'Bob',   usdNet:  10 },
  { phone: 'C', display_name: 'Carol', usdNet:  20 },
];
console.log(Balance.simplify(test));
// Expected: [{ from: 'A', to: 'C', amount: 20 }, { from: 'A', to: 'B', amount: 10 }]
```

Confirm output matches expected (2 transfers, amounts correct).

- [ ] **Step 3: Commit**

```bash
git add js/balance.js
git commit -m "feat: add simplify() algorithm to balance.js (minimize cash flow)"
```

---

### Task 3: Settlement Data Access in `js/groups.js`

**Files:**
- Modify: `js/groups.js`

- [ ] **Step 1: Add `addSettlement` and `getSettlements` to `js/groups.js`**

Inside the Groups IIFE, before the `return` statement, add:

```js
  async function addSettlement(groupId, settlement) {
    // settlement: { paid_by, paid_to, amount, currency, method, note }
    const { data, error } = await db
      .from('settlements')
      .insert({ group_id: groupId, ...settlement })
      .select()
      .single();
    if (error) return { error };
    return { data };
  }

  async function getSettlements(groupId) {
    const { data, error } = await db
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('settled_at', { ascending: false });
    if (error) return { error };
    return { data: data || [] };
  }
```

Add both to the `return` object:

```js
  return {
    createGroup, getMyGroups, getGroup, getMembers,
    joinGroup, addExpense, getExpenses, deleteExpense,
    getBillsForGroup,
    addSettlement, getSettlements,  // ← add these
  };
```

- [ ] **Step 2: Update `Balance.computeRaw` in `js/balance.js` to include settlements**

The `computeRaw` function needs a `settlements` parameter to factor in past payments.

Replace the `computeRaw` function signature and body:

```js
  function computeRaw(expenses, bills, members, settlements) {
    // settlements: [{ paid_by, paid_to, amount, currency }]
    const net = {};
    members.forEach(m => { net[m.phone] = {}; });

    function addNet(phone, currency, amount) {
      if (!net[phone]) net[phone] = {};
      net[phone][currency] = (net[phone][currency] || 0) + amount;
    }

    for (const exp of expenses) {
      addNet(exp.paid_by, exp.currency, exp.amount);
      for (const split of (exp.splits || [])) {
        addNet(split.phone, exp.currency, -split.amount);
      }
    }

    for (const bill of bills) {
      if (!bill.paid_by_phone) continue;
      addNet(bill.paid_by_phone, bill.currency, bill.grand_total);
      for (const share of (bill.memberShares || [])) {
        addNet(share.phone, bill.currency, -share.amount);
      }
    }

    for (const s of (settlements || [])) {
      // paid_by sent money → reduces their debt (positive for them)
      addNet(s.paid_by, s.currency,  s.amount);
      // paid_to received money → reduces what they're owed
      addNet(s.paid_to, s.currency, -s.amount);
    }

    return net;
  }
```

- [ ] **Step 3: Update `loadBalances` in `group.html` to fetch and pass settlements**

In `group.html`'s `loadBalances` function, update the data fetching and `computeRaw` call:

```js
  async function loadBalances() {
    setHTML('balances-list', '<p style="font-size:14px;color:var(--text-muted);">Computing balances…</p>');

    const [
      { data: expenses, error: e1 },
      { data: bills,    error: e2 },
      { data: settlements, error: e3 },
    ] = await Promise.all([
      Groups.getExpenses(groupId),
      Groups.getBillsForGroup(groupId),
      Groups.getSettlements(groupId),
    ]);

    if (e1 || e2 || e3) {
      setHTML('balances-list', '<p style="font-size:14px;color:var(--text-muted);">Could not load balances.</p>');
      return;
    }

    const allExpenses    = expenses    || [];
    const allBills       = bills       || [];
    const allSettlements = settlements || [];

    const currencies = [
      ...allExpenses.map(e => e.currency),
      ...allBills.map(b => b.currency),
      ...allSettlements.map(s => s.currency),
    ];

    const rates    = await Balance.fetchRates(currencies);
    const rawNet   = Balance.computeRaw(allExpenses, allBills, members, allSettlements);
    const byMember = Balance.toUSD(rawNet, members, rates);

    // Store for simplify view
    window._lastBalances = byMember;

    renderBalances(byMember);
  }
```

- [ ] **Step 4: Commit**

```bash
git add js/groups.js js/balance.js
git commit -m "feat: add settlement data access and include settlements in balance computation"
```

---

### Task 4: Simplify Toggle + Settle-Up Sheet in `group.html`

**Files:**
- Modify: `group.html`

- [ ] **Step 1: Add "Simplify" button and simplified-view container to the Balances tab in `group.html`**

In `group.html`, find `<div id="balances-tab"` and replace its contents with:

```html
  <!-- Balances tab -->
  <div id="balances-tab" style="display:none;">
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-secondary btn-sm" id="simplify-btn">Simplify</button>
    </div>
    <div id="balances-list">
      <div class="bill-card-skeleton">
        <div class="skeleton" style="height:18px;width:50%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:13px;width:30%;"></div>
      </div>
    </div>
    <div id="simplified-list" style="display:none;"></div>
  </div>
```

- [ ] **Step 2: Add Settle-Up Sheet HTML to `group.html` (before `</body>`)**

```html
<!-- Settle-Up Sheet -->
<div class="sheet-backdrop" id="settle-backdrop" style="display:none;"></div>
<div class="sheet" id="settle-sheet" style="display:none;">
  <div class="sheet-handle"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <h2 style="margin:0;">Settle Up</h2>
    <button class="btn btn-ghost btn-sm" id="close-settle-btn">✕</button>
  </div>
  <p id="settle-description" style="font-size:15px;margin-bottom:16px;"></p>
  <div class="field">
    <label>How did you pay?</label>
    <div class="toggle-group" style="margin-top:6px;">
      <button class="toggle-btn active" data-settle-method="venmo">Venmo</button>
      <button class="toggle-btn" data-settle-method="cash">Cash</button>
      <button class="toggle-btn" data-settle-method="other">Other</button>
    </div>
  </div>
  <div id="venmo-settle-wrap" style="margin-top:12px;"></div>
  <div class="field" style="margin-top:12px;">
    <label for="settle-note">Note <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;">(optional)</span></label>
    <input class="input" id="settle-note" type="text" placeholder="Optional note…" autocomplete="off" />
  </div>
  <button class="btn btn-primary btn-full mt-16" id="record-settle-btn">Mark as Settled</button>
</div>
```

- [ ] **Step 3: Add simplify and settle-up JS to `group.html`'s inline script**

```js
  // ── Simplify view ─────────────────────────────────────────
  let showingSimplified = false;

  $('simplify-btn').addEventListener('click', () => {
    showingSimplified = !showingSimplified;
    $('simplify-btn').textContent = showingSimplified ? 'Show All' : 'Simplify';
    $('balances-list').style.display   = showingSimplified ? 'none' : '';
    $('simplified-list').style.display = showingSimplified ? '' : 'none';

    if (showingSimplified) {
      const byMember = window._lastBalances || [];
      const transfers = Balance.simplify(byMember);
      renderSimplified(transfers);
    }
  });

  function renderSimplified(transfers) {
    if (transfers.length === 0) {
      setHTML('simplified-list', `
        <div class="empty">
          <div class="empty-icon">✓</div>
          <h3>All settled up</h3>
          <p>No transfers needed.</p>
        </div>
      `);
      return;
    }
    setHTML('simplified-list', transfers.map(t => {
      const isYouPaying = t.from === user.phone;
      return `
        <div class="bill-card fade-up" style="cursor:pointer;" data-from="${t.from}" data-from-name="${escHtml(t.fromName)}" data-to="${t.to}" data-to-name="${escHtml(t.toName)}" data-amount="${t.amount}" onclick="openSettleSheet(this)">
          <div class="bill-card-top">
            <div class="bill-card-name">${escHtml(t.fromName)} pays ${escHtml(t.toName)}</div>
            <span style="font-size:15px;font-weight:600;color:var(--accent);">${fmtCurrency(t.amount, 'USD')}</span>
          </div>
          ${isYouPaying ? `<div class="bill-card-meta"><span style="color:var(--accent);">Tap to settle →</span></div>` : ''}
        </div>
      `;
    }).join(''));
  }

  // ── Settle-Up Sheet ───────────────────────────────────────
  let pendingSettle = null;
  let activeSettleMethod = 'venmo';

  function openSettleSheet(card) {
    pendingSettle = {
      from:     card.dataset.from,
      fromName: card.dataset.fromName,
      to:       card.dataset.to,
      toName:   card.dataset.toName,
      amount:   parseFloat(card.dataset.amount),
    };

    const isYouPaying = pendingSettle.from === user.phone;
    setText('settle-description',
      isYouPaying
        ? `You pay ${pendingSettle.toName} ${fmtCurrency(pendingSettle.amount, 'USD')}`
        : `${pendingSettle.fromName} pays ${pendingSettle.toName} ${fmtCurrency(pendingSettle.amount, 'USD')}`
    );

    activeSettleMethod = 'venmo';
    $$('[data-settle-method]').forEach(b => b.classList.toggle('active', b.dataset.settleMethod === 'venmo'));
    renderVenmoButton();
    $('settle-note').value = '';
    openSheet('settle-backdrop', 'settle-sheet');
  }

  function renderVenmoButton() {
    if (!pendingSettle || activeSettleMethod !== 'venmo') {
      setHTML('venmo-settle-wrap', '');
      return;
    }
    setHTML('venmo-settle-wrap', `
      <a href="venmo://paycharge?txn=pay&amount=${pendingSettle.amount.toFixed(2)}&note=${encodeURIComponent('TAB: ' + pendingSettle.toName)}"
         class="btn btn-secondary btn-full" style="display:block;text-align:center;text-decoration:none;">
        Open Venmo — Pay ${fmtCurrency(pendingSettle.amount, 'USD')}
      </a>
      <p style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:6px;">Search for ${escHtml(pendingSettle.toName)} in Venmo, then tap "Mark as Settled" below.</p>
    `);
  }

  $$('[data-settle-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSettleMethod = btn.dataset.settleMethod;
      $$('[data-settle-method]').forEach(b => b.classList.toggle('active', b === btn));
      renderVenmoButton();
    });
  });

  $('close-settle-btn').addEventListener('click', () => closeSheet('settle-backdrop', 'settle-sheet'));
  $('settle-backdrop').addEventListener('click', () => closeSheet('settle-backdrop', 'settle-sheet'));

  $('record-settle-btn').addEventListener('click', async () => {
    if (!pendingSettle) return;

    const btn = $('record-settle-btn');
    btn.disabled    = true;
    btn.textContent = 'Recording…';

    const { error } = await Groups.addSettlement(groupId, {
      paid_by:  pendingSettle.from,
      paid_to:  pendingSettle.to,
      amount:   pendingSettle.amount,
      currency: 'USD',
      method:   activeSettleMethod,
      note:     $('settle-note').value.trim() || null,
    });

    btn.disabled    = false;
    btn.textContent = 'Mark as Settled';

    if (error) { showToast('Could not record settlement', 'error'); return; }

    closeSheet('settle-backdrop', 'settle-sheet');
    showToast('Settlement recorded', 'success');
    pendingSettle = null;
    showingSimplified = false;
    $('simplify-btn').textContent = 'Simplify';
    $('balances-list').style.display   = '';
    $('simplified-list').style.display = 'none';
    await loadBalances();
  });
```

- [ ] **Step 4: Verify in browser — simplify view**

1. Open a group with 3+ members and multiple expenses creating a complex debt graph.
2. Go to Balances tab → tap "Simplify" → list of minimum transfers appears.
3. Tap "Show All" → reverts to per-member balance view.
4. Transfers show "Tap to settle →" only for rows where you are the payer.

- [ ] **Step 5: Verify in browser — settle-up flow (manual)**

1. In Simplify view, tap a transfer row where you are the payer.
2. Settle-up sheet opens with description: "You pay [Name] $X.XX".
3. Switch method to "Cash" → Venmo button disappears.
4. Switch to "Venmo" → Venmo deep link button appears.
5. Tap "Mark as Settled" → settlement recorded, toast shown, balances reload, amount decreases.

- [ ] **Step 6: Verify in browser — settle-up flow (Venmo)**

1. Open a group where you owe someone.
2. Simplify → tap the row → sheet shows Venmo button.
3. Tap "Open Venmo" — Venmo app opens (or App Store on desktop).
4. After paying (or simulating), tap "Mark as Settled" → settlement recorded.

- [ ] **Step 7: Commit**

```bash
git add group.html
git commit -m "feat: add Simplify view and settle-up sheet with Venmo and manual options"
```

---

## Phase 3 Complete

After all 4 tasks are done:

- Balances tab has a "Simplify" toggle showing the minimum set of transfers
- Tapping a transfer row opens a settle-up sheet
- Settle-up supports Venmo deep link (pre-filled amount) + manual cash/other recording
- Recorded settlements update the running balance immediately
- "All settled up" state shown when all balances reach zero

**All 3 phases of the Splitwise-style feature set are now complete.**
