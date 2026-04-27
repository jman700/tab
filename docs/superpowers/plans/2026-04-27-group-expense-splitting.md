# Group Expense Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Add Expense sheet with participant selection, two new split methods (Shares, Adjustment), an improved exact-amount error message, and a required expense date field with OCR auto-fill.

**Architecture:** All UI changes are in `group.html`. `js/groups.js` gains `expense_date` in its insert comment. `api/parse-receipt.js` extracts a date field. A single `ALTER TABLE` migration adds `expense_date DATE` to `tab.expenses`. No new tables or JS modules — new split methods compute dollar amounts before inserting into the existing `expense_splits` schema.

**Tech Stack:** Vanilla JS, Supabase JS v2 (`db` global, `tab` schema), existing CSS design system. No automated test runner — verification steps are manual browser checks.

---

## Codebase orientation

Before implementing, read these sections of `group.html`:

- **HTML sheet template:** lines 81–134 (Add Expense sheet structure)
- **`renderSplitInputs()`:** lines 509–559 (the function you'll modify most)
- **`updateExactNote()`:** lines 571–582
- **Sheet open handler (`add-expense-btn`):** lines 595–609
- **Save handler (`save-expense-btn`):** lines 614–688
- **`renderExpenseCard()`:** lines 464–494
- **Receipt OCR handler:** lines 937–1005

Key globals: `members` (array of `{phone, display_name}`), `activeSplitMethod` (string), `user` (object with `.phone`).

Helper functions used throughout: `escHtml(s)`, `fmtCurrency(amount, code)`, `getPersonColor(index)`, `getInitials(name)`, `showToast(msg, type)`, `setHTML(id, html)`, `$(id)`, `$$(selector)`.

---

## Task 1: DB migration + schema documentation

**Files:**
- Modify: `supabase-schema.sql`
- DB action (run once in Supabase SQL editor)

- [ ] **Step 1: Run the migration in Supabase**

Open the Supabase SQL editor for the TAB project and run:

```sql
ALTER TABLE tab.expenses ADD COLUMN IF NOT EXISTS expense_date DATE;
```

Expected: query completes with no error. The `expenses` table now has an `expense_date` column that defaults to NULL for existing rows.

- [ ] **Step 2: Document the migration in `supabase-schema.sql`**

In `supabase-schema.sql`, find the `-- ── Migrations ───` section (line 112). Add after the existing `ALTER TABLE tab.bills` lines:

```sql
-- Groups schema (run once if adding groups to an existing install):
-- ALTER TABLE tab.groups ADD COLUMN IF NOT EXISTS ...  (see HANDOFF.md)
ALTER TABLE tab.expenses ADD COLUMN IF NOT EXISTS expense_date DATE;
```

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add expense_date column migration to expenses table"
```

---

## Task 2: OCR date extraction in parse-receipt.js

**Files:**
- Modify: `api/parse-receipt.js`

- [ ] **Step 1: Update the system prompt**

In `api/parse-receipt.js`, find the `SYSTEM_PROMPT` const (line 23). The JSON schema example currently ends with `"tax_included": false`. Add `"date"` to the example object and add a rule for it.

Replace the closing portion of the system prompt from:

```js
  "tax":          3.50,
  "tax_included": false
}
```

with:

```js
  "tax":          3.50,
  "tax_included": false,
  "date":         "2024-03-15"
}
```

Then in the `Rules:` section, after the `"tax_included"` rule, add:

```
- "date" is the date printed on the receipt in YYYY-MM-DD format, or null if not visible or not a date you're confident about
```

- [ ] **Step 2: Add date to the sanitized response**

In the `sanitized` object (around line 124), after `tax_included`, add:

```js
date: (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date)))
  ? String(parsed.date)
  : null,
```

Full updated `sanitized` block:

```js
const sanitized = {
  restaurant:   parsed.restaurant || null,
  currency:     validCurrencies.includes(detectedCurrency) ? detectedCurrency : 'USD',
  tax:          parseFloat(parsed.tax)     || 0,
  tax_included: Boolean(parsed.tax_included),
  date: (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date)))
    ? String(parsed.date)
    : null,
  items: (parsed.items || [])
    .map(item => ({
      name:     String(item.name     || 'Unknown Item').trim(),
      quantity: Math.max(1, parseInt(item.quantity) || 1),
      price:    Math.max(0, parseFloat(item.price)  || 0),
      note:     item.note ? String(item.note).trim() : null,
    }))
    .filter(item => item.price > 0),
};
```

- [ ] **Step 3: Verify locally**

The API file header comment (line 5) says `Returns: { restaurant, items, tax, tax_included }`. Update it:

```js
// Returns: { restaurant, items: [{name, price, quantity, note}], tax, tax_included, date }
```

- [ ] **Step 4: Commit**

```bash
git add api/parse-receipt.js
git commit -m "feat: extract receipt date from OCR and include in parse-receipt response"
```

---

## Task 3: CSS additions

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add participant list CSS**

Find the `/* ── Dashboard tab bar */` comment block in `css/style.css` (added in a previous session, around line 756). Add the participant CSS after the user-search block:

```css
/* ── Participant selection */
.participant-list  { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.participant-row   { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.participant-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent); flex-shrink: 0; cursor: pointer; }
.participant-row .participant-name  { font-size: 14px; font-weight: 500; color: var(--text); flex: 1; }
.participant-row .participant-phone { font-size: 12px; color: var(--text-muted); }
.participant-row input:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 2: Make the split toggle scrollable**

Find `.toggle-group` in `css/style.css` (line 416):

```css
.toggle-group {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-2);
}
```

Add `overflow-x: auto;` and `-webkit-overflow-scrolling: touch;` and `width: 100%;`:

```css
.toggle-group {
  display: flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--surface-2);
  width: 100%;
}
```

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: add participant list CSS and make split toggle scrollable"
```

---

## Task 4: Date field — HTML, sheet wiring, expense card, OCR auto-fill, groups.js

**Files:**
- Modify: `group.html` (lines 96–134 HTML; lines 595–609 sheet open; lines 614–688 save; lines 464–494 card renderer; lines 967–978 OCR handler)
- Modify: `js/groups.js` (comment on line 104)

- [ ] **Step 1: Add the date input HTML to the Add Expense sheet**

In `group.html`, the amount/currency row ends at line 110 (`</div>`). Insert the date field immediately after (between the amount row and the "Paid by" field):

```html
  <div class="field">
    <label for="exp-date">Date <span style="font-size:11px;font-weight:400;color:var(--text-muted);">(required)</span></label>
    <input class="input" id="exp-date" type="date" />
  </div>
```

The sheet HTML block (lines 96–131) should now read in order:
1. Description field
2. Amount + Currency row
3. **Date field** ← new
4. Paid by field
5. Split toggle + split-inputs
6. Note field

- [ ] **Step 2: Default date to today on sheet open**

In the `add-expense-btn` click handler (lines 595–609), after the line that resets `exp-note`, add:

```js
$('exp-date').value = new Date().toISOString().slice(0, 10);
```

Full updated open handler block (replace lines 595–609):

```js
$('add-expense-btn').addEventListener('click', () => {
  populateCurrencySelect();
  populatePaidBySelect();
  activeSplitMethod = 'equal';
  $$('[data-method]').forEach(b => b.classList.toggle('active', b.dataset.method === 'equal'));
  $('exp-description').value = '';
  $('exp-amount').value      = '';
  $('exp-note').value        = '';
  $('exp-date').value        = new Date().toISOString().slice(0, 10);
  $('exp-scan-input').value  = '';
  $('exp-scanning-state').style.display = 'none';
  $('exp-items-preview').style.display  = 'none';
  renderParticipants();
  renderSplitInputs();
  openSheet('expense-backdrop', 'expense-sheet');
  setTimeout(() => $('exp-description').focus(), 320);
});
```

(The `renderParticipants()` call will be defined in Task 5 — it's safe to add now; it will be a no-op until that task is done if you're implementing sequentially. Alternatively, add it during Task 5.)

- [ ] **Step 3: Validate date in save handler and pass to Groups.addExpense**

In the save handler (`save-expense-btn` click, line 614), after the existing field extractions, add `expense_date`:

```js
const expense_date = $('exp-date').value;
```

After the `if (!paid_by)` validation line, add:

```js
if (!expense_date) { showToast('Date is required', 'error'); return; }
```

Then update the `Groups.addExpense` call (line 672) to include `expense_date`:

```js
const { error } = await Groups.addExpense(
  groupId,
  { description, amount, currency, paid_by, split_method: activeSplitMethod, note, expense_date },
  splits
);
```

- [ ] **Step 4: Update groups.js comment**

In `js/groups.js`, line 104, update the comment:

```js
// expense: { description, amount, currency, paid_by, split_method, note, expense_date }
```

- [ ] **Step 5: Update expense card to display expense_date**

In `renderExpenseCard` (line 484), replace:

```js
<span>${formatDateShort(exp.created_at)}</span>
```

with:

```js
<span>${formatDateShort(exp.expense_date || exp.created_at)}</span>
```

This gracefully falls back to `created_at` for existing expenses that have a null `expense_date`.

- [ ] **Step 6: Update getExpenses sort order in groups.js**

In `js/groups.js`, find the `getExpenses` function (line 127). Change the `order` call so expenses sort by `expense_date` (most recent first), falling back to `created_at` for nulls:

```js
.order('expense_date', { ascending: false, nullsFirst: false })
.order('created_at',   { ascending: false });
```

Replace the single `.order('created_at', { ascending: false })` line with the two lines above.

- [ ] **Step 7: Wire OCR date auto-fill**

In the receipt scan handler (around line 970), after `if (data.currency) $('exp-currency').value = data.currency;`, add:

```js
if (data.date) $('exp-date').value = data.date;
```

- [ ] **Step 8: Manual verification**

Open group.html in the browser, open the Add Expense sheet:
- Date field appears below Amount/Currency, defaults to today
- Clear the date and click "Add Expense" → toast "Date is required"
- Fill in all fields including date → expense saves and card shows the entered date
- Existing expense cards (null expense_date) still show a date (falls back to created_at)

- [ ] **Step 9: Commit**

```bash
git add group.html js/groups.js
git commit -m "feat: add required expense_date field to Add Expense sheet with OCR auto-fill"
```

---

## Task 5: Participant selection

**Files:**
- Modify: `group.html` (HTML ~line 112; JS ~line 496)

- [ ] **Step 1: Add participant HTML between "Paid by" and "Split" fields**

In the Add Expense sheet HTML (after the `#exp-paid-by` field, before the split toggle `<div class="field">`), insert:

```html
  <div class="field" id="participant-group">
    <label>Who's splitting this?</label>
    <div id="participant-list" class="participant-list"></div>
  </div>
```

- [ ] **Step 2: Add `getIncludedMembers()` helper**

In the JS section, at the top of the Add Expense Sheet section (around line 496, after `// ── Add Expense Sheet`), add:

```js
function getIncludedMembers() {
  const checked = [...$$('#participant-list .participant-cb')]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.phone);
  // Return full member objects in original members order
  return members.filter(m => checked.includes(m.phone));
}
```

- [ ] **Step 3: Add `renderParticipants()` function**

Directly after `getIncludedMembers()`, add:

```js
function renderParticipants() {
  const list   = $('participant-list');
  const paidBy = $('exp-paid-by').value;
  list.innerHTML = members.map(m => {
    const isPayer = m.phone === paidBy;
    return `
      <label class="participant-row">
        <input type="checkbox" class="participant-cb" data-phone="${escHtml(m.phone)}"
          ${isPayer ? 'checked disabled' : 'checked'}>
        <span class="participant-name">${escHtml(m.display_name)}</span>
        <span class="participant-phone">${escHtml(Auth.formatPhone(m.phone))}</span>
      </label>`;
  }).join('');
}
```

- [ ] **Step 4: Wire checkbox changes and minimum-1 enforcement**

After `renderParticipants()`, add the event delegation listener:

```js
$('participant-list').addEventListener('change', e => {
  if (!e.target.classList.contains('participant-cb')) return;
  const checked = $$('#participant-list .participant-cb:checked');
  if (checked.length === 0) {
    e.target.checked = true; // prevent unchecking the last person
    return;
  }
  renderSplitInputs();
});
```

- [ ] **Step 5: Re-render participants when "Paid by" changes**

Find the line `$('exp-amount').addEventListener('input', renderSplitInputs);` (around line 592). Add two lines after it:

```js
$('exp-paid-by').addEventListener('change', () => {
  renderParticipants();
  renderSplitInputs();
});
```

- [ ] **Step 6: Update `renderSplitInputs` to use included members**

Replace the `renderSplitInputs` function body (lines 509–560). The key change is replacing every use of `members` with `const included = getIncludedMembers()` and using `included` throughout. Also use `members.indexOf(m)` for color index so colors stay consistent even when members are excluded.

Full replacement for `renderSplitInputs`:

```js
function renderSplitInputs() {
  const method   = activeSplitMethod;
  const amount   = parseFloat($('exp-amount').value) || 0;
  const currency = $('exp-currency').value || 'USD';
  const included = getIncludedMembers();
  const n        = included.length;

  if (method === 'equal') {
    const each = n > 0 ? (amount / n) : 0;
    setHTML('split-inputs', `
      <p style="font-size:13px;color:var(--text-muted);padding:4px 0;">
        ${fmtCurrency(each.toFixed(2), currency)} per person · ${n} member${n !== 1 ? 's' : ''}
      </p>
    `);
    return;
  }

  if (method === 'percentage') {
    const even      = n > 0 ? Math.floor(100 / n) : 0;
    const remainder = 100 - (even * n);
    setHTML('split-inputs', included.map((m, localIdx) => {
      const colorIdx = members.indexOf(m);
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(colorIdx)}22;color:${getPersonColor(colorIdx)};border:1.5px solid ${getPersonColor(colorIdx)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <input class="input split-pct-input" data-phone="${escHtml(m.phone)}" type="number" min="0" max="100" step="1"
            value="${even + (localIdx === 0 ? remainder : 0)}"
            style="width:68px;padding:6px 8px;text-align:right;font-size:14px;" />
          <span style="font-size:13px;color:var(--text-muted);">%</span>
        </div>`;
    }).join('') + `<p id="pct-sum-note" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></p>`);
    $$('.split-pct-input').forEach(el => el.addEventListener('input', updatePctNote));
    updatePctNote();
    return;
  }

  if (method === 'exact') {
    const each = n > 0 ? (amount / n).toFixed(2) : '0.00';
    setHTML('split-inputs', included.map(m => {
      const colorIdx = members.indexOf(m);
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(colorIdx)}22;color:${getPersonColor(colorIdx)};border:1.5px solid ${getPersonColor(colorIdx)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <input class="input split-exact-input" data-phone="${escHtml(m.phone)}" type="number" inputmode="decimal" min="0" step="0.01"
            value="${each}"
            style="width:90px;padding:6px 8px;text-align:right;font-size:14px;" />
        </div>`;
    }).join('') + `<p id="exact-sum-note" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></p>`);
    $$('.split-exact-input').forEach(el => el.addEventListener('input', updateExactNote));
    updateExactNote();
    return;
  }

  // 'shares' and 'adjustment' cases added in Tasks 6 & 7
}
```

- [ ] **Step 7: Update the equal-split save logic to use included members**

In the save handler (around line 628), replace:

```js
if (activeSplitMethod === 'equal') {
  const baseShare = Math.floor((amount / members.length) * 100) / 100;
  splits = members.map(m => ({ phone: m.phone, amount: baseShare }));
  const sum  = splits.reduce((s, x) => s + x.amount, 0);
  const diff = parseFloat((amount - sum).toFixed(2));
  if (Math.abs(diff) > 0) {
    const payerSplit = splits.find(s => s.phone === paid_by) || splits[0];
    if (payerSplit) payerSplit.amount = parseFloat((payerSplit.amount + diff).toFixed(2));
  }
```

with:

```js
if (activeSplitMethod === 'equal') {
  const included  = getIncludedMembers();
  const n         = included.length;
  const baseShare = Math.floor((amount / n) * 100) / 100;
  splits = included.map(m => ({ phone: m.phone, amount: baseShare }));
  const sum  = splits.reduce((s, x) => s + x.amount, 0);
  const diff = parseFloat((amount - sum).toFixed(2));
  if (Math.abs(diff) > 0) {
    const payerSplit = splits.find(s => s.phone === paid_by) || splits[0];
    if (payerSplit) payerSplit.amount = parseFloat((payerSplit.amount + diff).toFixed(2));
  }
```

- [ ] **Step 8: Manual verification**

Open Add Expense sheet:
- "Who's splitting this?" list shows all members, all checked
- Uncheck one member → equal split amount recalculates for remaining members
- Payer's checkbox is disabled (cannot uncheck)
- Unchecking all-but-one is allowed; last remaining non-payer cannot be unchecked
- Switch to % or Exact — unchecked members don't appear in split inputs
- Save an expense with 2 of 3 members included — `expense_splits` has 2 rows (verify in Supabase dashboard)

- [ ] **Step 9: Commit**

```bash
git add group.html
git commit -m "feat: add participant selection to Add Expense sheet — all split methods now include/exclude members"
```

---

## Task 6: Shares split method

**Files:**
- Modify: `group.html`

- [ ] **Step 1: Add "Shares" button to the split toggle HTML**

Find the split toggle in the HTML (lines 117–124):

```html
  <div class="field">
    <label>Split</label>
    <div class="toggle-group" style="display:flex;width:100%;margin-top:6px;">
      <button class="toggle-btn active" data-method="equal" style="flex:1;">Equal</button>
      <button class="toggle-btn" data-method="percentage" style="flex:1;">%</button>
      <button class="toggle-btn" data-method="exact" style="flex:1;">Exact</button>
    </div>
  </div>
```

Replace with (5 buttons, no `flex:1` to allow natural width + scrolling, Exact before %):

```html
  <div class="field">
    <label>Split</label>
    <div class="toggle-group" style="margin-top:6px;">
      <button type="button" class="toggle-btn active" data-method="equal">Equal</button>
      <button type="button" class="toggle-btn"        data-method="exact">Exact</button>
      <button type="button" class="toggle-btn"        data-method="percentage">%</button>
      <button type="button" class="toggle-btn"        data-method="shares">Shares</button>
      <button type="button" class="toggle-btn"        data-method="adjustment">Adjust</button>
    </div>
  </div>
```

- [ ] **Step 2: Add the Shares case to `renderSplitInputs`**

At the end of `renderSplitInputs` (after the `// 'shares' and 'adjustment' cases` comment added in Task 5), add:

```js
  if (method === 'shares') {
    setHTML('split-inputs', included.map(m => {
      const colorIdx = members.indexOf(m);
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(colorIdx)}22;color:${getPersonColor(colorIdx)};border:1.5px solid ${getPersonColor(colorIdx)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <input class="input split-shares-input" data-phone="${escHtml(m.phone)}"
            type="number" inputmode="decimal" min="0.5" step="0.5" value="1"
            style="width:68px;padding:6px 8px;text-align:right;font-size:14px;" />
          <span style="font-size:13px;color:var(--text-muted);">shares</span>
          <span class="split-computed" id="shares-amt-${escHtml(m.phone)}"
            style="width:72px;text-align:right;font-size:13px;color:var(--text-muted);"></span>
        </div>`;
    }).join('') + `<p id="shares-sum-note" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></p>`);
    $$('.split-shares-input').forEach(el => el.addEventListener('input', updateSharesAmounts));
    updateSharesAmounts();
    return;
  }
```

- [ ] **Step 3: Add `updateSharesAmounts()` helper**

After `updateExactNote()` (around line 582), add:

```js
function updateSharesAmounts() {
  const amount   = parseFloat($('exp-amount').value) || 0;
  const currency = $('exp-currency').value || 'USD';
  const inputs   = [...$$('.split-shares-input')];
  const totalShares = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  inputs.forEach(el => {
    const share     = totalShares > 0 ? ((parseFloat(el.value) || 0) / totalShares) * amount : 0;
    const amtEl     = $(`shares-amt-${el.dataset.phone}`);
    if (amtEl) amtEl.textContent = fmtCurrency(share.toFixed(2), currency);
  });
  const note = $('shares-sum-note');
  if (note) {
    note.textContent = totalShares > 0
      ? `${totalShares} total share${totalShares !== 1 ? 's' : ''}`
      : 'Enter shares above';
    note.style.color = 'var(--text-muted)';
  }
}
```

Also add `$('exp-amount').addEventListener('input', ...)` already fires `renderSplitInputs`, which re-renders and re-attaches listeners — no extra wiring needed.

- [ ] **Step 4: Add shares save logic**

In the save handler, after the `} else if (activeSplitMethod === 'exact') {` block (around line 664), add before the closing of the if/else chain:

```js
} else if (activeSplitMethod === 'shares') {
  const inputs      = [...$$('.split-shares-input')];
  const totalShares = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  if (totalShares <= 0) { showToast('Enter shares for each person', 'error'); return; }
  splits = inputs.map(el => ({
    phone:  el.dataset.phone,
    amount: parseFloat(((parseFloat(el.value) || 0) / totalShares * amount).toFixed(2)),
  }));
  // Reconcile rounding to payer
  const sharesSum  = splits.reduce((s, x) => s + x.amount, 0);
  const sharesDiff = parseFloat((amount - sharesSum).toFixed(2));
  if (Math.abs(sharesDiff) > 0) {
    const payerSplit = splits.find(s => s.phone === paid_by) || splits[0];
    if (payerSplit) payerSplit.amount = parseFloat((payerSplit.amount + sharesDiff).toFixed(2));
  }
```

- [ ] **Step 5: Update `splitLabel` in `renderExpenseCard`**

Find `renderExpenseCard` (line 471):

```js
const splitLabel = exp.split_method === 'equal' ? 'Equal split'
                 : exp.split_method === 'percentage' ? 'By percentage'
                 : 'Exact amounts';
```

Replace with:

```js
const splitLabel = exp.split_method === 'equal'      ? 'Equal split'
                 : exp.split_method === 'percentage'  ? 'By percentage'
                 : exp.split_method === 'exact'       ? 'Exact amounts'
                 : exp.split_method === 'shares'      ? 'By shares'
                 : exp.split_method === 'adjustment'  ? 'By adjustment'
                 : exp.split_method;
```

- [ ] **Step 6: Manual verification**

Open Add Expense with a 3-person group, choose Shares:
- Each person shows a "1 shares" input and a computed amount (equal thirds)
- Change one person to 2 shares → their computed amount doubles, others adjust proportionally
- Save → expense card shows "By shares"
- Verify `expense_splits` in Supabase has correct dollar amounts

- [ ] **Step 7: Commit**

```bash
git add group.html
git commit -m "feat: add Shares split method — proportional split by decimal share count"
```

---

## Task 7: Adjustment split method

**Files:**
- Modify: `group.html`

- [ ] **Step 1: Add the Adjustment case to `renderSplitInputs`**

In `renderSplitInputs`, after the `shares` block, add:

```js
  if (method === 'adjustment') {
    const n     = included.length;
    const base  = n > 0 ? amount / n : 0;
    const currency = $('exp-currency').value || 'USD';
    setHTML('split-inputs', included.map(m => {
      const colorIdx = members.indexOf(m);
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(colorIdx)}22;color:${getPersonColor(colorIdx)};border:1.5px solid ${getPersonColor(colorIdx)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <span style="font-size:13px;color:var(--text-muted);margin-right:2px;">±</span>
          <input class="input split-adj-input" data-phone="${escHtml(m.phone)}"
            type="number" inputmode="decimal" step="0.01" placeholder="0.00"
            style="width:80px;padding:6px 8px;text-align:right;font-size:14px;" />
          <span class="split-computed" id="adj-amt-${escHtml(m.phone)}"
            style="width:72px;text-align:right;font-size:13px;color:var(--text-muted);"></span>
        </div>`;
    }).join('') + `<p id="adj-note" style="font-size:12px;margin-top:2px;"></p>`);
    $$('.split-adj-input').forEach(el => el.addEventListener('input', updateAdjAmounts));
    updateAdjAmounts();
    return;
  }
```

- [ ] **Step 2: Add `updateAdjAmounts()` helper**

After `updateSharesAmounts()`, add:

```js
function updateAdjAmounts() {
  const amount   = parseFloat($('exp-amount').value) || 0;
  const currency = $('exp-currency').value || 'USD';
  const inputs   = [...$$('.split-adj-input')];
  const n        = inputs.length;
  const totalAdj = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const remainder = amount - totalAdj;
  const baseEach  = n > 0 ? remainder / n : 0;
  const note      = $('adj-note');

  if (totalAdj > amount + 0.005) {
    if (note) {
      note.textContent = `Adjustments exceed total by ${fmtCurrency((totalAdj - amount).toFixed(2), currency)} — reduce adjustments`;
      note.style.color = 'var(--red, #e74c3c)';
    }
    inputs.forEach(el => {
      const amtEl = $(`adj-amt-${el.dataset.phone}`);
      if (amtEl) amtEl.textContent = '—';
    });
    return;
  }

  inputs.forEach(el => {
    const adj    = parseFloat(el.value) || 0;
    const total  = parseFloat((baseEach + adj).toFixed(2));
    const amtEl  = $(`adj-amt-${el.dataset.phone}`);
    if (amtEl) amtEl.textContent = fmtCurrency(total, currency);
  });

  if (note) {
    note.textContent = `Base: ${fmtCurrency(baseEach.toFixed(2), currency)} each`;
    note.style.color = 'var(--text-muted)';
  }
}
```

- [ ] **Step 3: Add adjustment save logic**

In the save handler, after the `shares` block, add:

```js
} else if (activeSplitMethod === 'adjustment') {
  const inputs   = [...$$('.split-adj-input')];
  const n        = inputs.length;
  const totalAdj = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  if (totalAdj > amount + 0.005) {
    showToast(`Adjustments exceed total by ${fmtCurrency((totalAdj - amount).toFixed(2), currency)}`, 'error');
    return;
  }
  const remainder = amount - totalAdj;
  const baseEach  = remainder / n;
  splits = inputs.map(el => ({
    phone:  el.dataset.phone,
    amount: parseFloat((baseEach + (parseFloat(el.value) || 0)).toFixed(2)),
  }));
  // Reconcile rounding to payer
  const adjSum  = splits.reduce((s, x) => s + x.amount, 0);
  const adjDiff = parseFloat((amount - adjSum).toFixed(2));
  if (Math.abs(adjDiff) > 0) {
    const payerSplit = splits.find(s => s.phone === paid_by) || splits[0];
    if (payerSplit) payerSplit.amount = parseFloat((payerSplit.amount + adjDiff).toFixed(2));
  }
```

- [ ] **Step 4: Manual verification**

Open Add Expense with 3 members, choose Adjust:
- All adjustment inputs are blank; base note shows equal third of amount
- Enter a positive adjustment for one person → their computed total increases, base note updates
- Enter adjustments that sum to more than total → error note appears, amounts show "—"
- Save a valid adjustment split → card shows "By adjustment", splits correct in Supabase

- [ ] **Step 5: Commit**

```bash
git add group.html
git commit -m "feat: add Adjustment split method — adjustments per person with equal remainder"
```

---

## Task 8: Exact amount error message improvement

**Files:**
- Modify: `group.html` (lines 571–582 `updateExactNote`; line 658 save toast)

- [ ] **Step 1: Update `updateExactNote` to show the difference**

Replace `updateExactNote` (lines 571–582):

```js
function updateExactNote() {
  const amount   = parseFloat($('exp-amount').value) || 0;
  const currency = $('exp-currency').value || 'USD';
  const total    = $$('.split-exact-input').reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const note     = $('exact-sum-note');
  if (!note) return;
  const diff = total - amount;
  if (Math.abs(diff) < 0.01) {
    note.textContent = `✓ Adds up to ${fmtCurrency(amount, currency)}`;
    note.style.color = 'var(--green)';
  } else {
    const direction = diff > 0 ? 'over' : 'under';
    const absDiff   = fmtCurrency(Math.abs(diff).toFixed(2), currency);
    note.textContent = `Total: ${fmtCurrency(total, currency)} (must equal ${fmtCurrency(amount, currency)} — ${absDiff} ${direction})`;
    note.style.color = 'var(--red, #e74c3c)';
  }
}
```

- [ ] **Step 2: Update the exact save toast**

Find the save handler's exact validation (around line 657):

```js
if (Math.abs(totalExact - amount) > 0.01) {
  showToast(`Amounts must sum to ${fmtCurrency(amount, currency)}`, 'error');
  return;
}
```

Replace with:

```js
if (Math.abs(totalExact - amount) > 0.01) {
  const diff      = totalExact - amount;
  const direction = diff > 0 ? 'over' : 'under';
  const absDiff   = fmtCurrency(Math.abs(diff).toFixed(2), currency);
  showToast(`Amounts must equal ${fmtCurrency(amount, currency)} — ${absDiff} ${direction}`, 'error');
  return;
}
```

- [ ] **Step 3: Manual verification**

Open Add Expense, choose Exact, set amount to $50:
- Change one input so total is $55 → note shows "Total: $55.00 (must equal $50.00 — $5.00 over)"
- Set total to $45 → note shows "— $5.00 under"
- Try to save with mismatch → toast shows "Amounts must equal $50.00 — $5.00 over"

- [ ] **Step 4: Commit**

```bash
git add group.html
git commit -m "fix: exact split error message shows over/under amount"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Participant selection between Paid-by and split method | Task 5 |
| All members checked by default | Task 5 step 3 |
| Payer always included, checkbox disabled | Task 5 step 3 |
| Minimum 1 participant | Task 5 step 4 |
| Participant list drives all split methods | Tasks 5–7 |
| Split Equal — participant-aware | Task 5 step 6 |
| Split Exact — participant-aware + improved error | Tasks 5 + 8 |
| Split % — participant-aware | Task 5 step 6 |
| Split Shares — decimal, proportional | Task 6 |
| Split Adjust — ± adjustments, equal remainder | Task 7 |
| expense_date column + migration | Task 1 |
| Date field in sheet, required, default today | Task 4 |
| Date displayed on expense card | Task 4 step 5 |
| Existing expenses fall back to created_at | Task 4 step 5 |
| OCR date extraction in parse-receipt | Task 2 |
| OCR date auto-fill in group.html | Task 4 step 7 |
| CSS for participant list + scrollable toggle | Task 3 |
| groups.js expense_date comment | Task 4 step 4 |
| getExpenses sort by expense_date | Task 4 step 6 |

All spec requirements covered. ✓
