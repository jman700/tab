# Group Expense Splitting — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Overhaul the Add Expense sheet in the Groups tool with participant selection, two new split methods, an improved exact-amount error message, a required expense date field, and OCR date extraction.

**Architecture:** All UI changes are confined to `group.html`. `js/groups.js` gets a one-line change to pass `expense_date`. `api/parse-receipt.js` gains date extraction. A single `ALTER TABLE` migration adds the `expense_date` column. No new tables or JS modules are needed — new split methods compute dollar amounts before inserting into the existing `expense_splits` table.

**Tech Stack:** Vanilla JS, Supabase JS v2 (`db` global, `tab` schema), existing CSS design system.

---

## Database Migration

Run once against the Supabase project:

```sql
ALTER TABLE tab.expenses ADD COLUMN expense_date DATE;
```

`expense_date` is the user-specified date of the expense. `created_at` remains the server-side audit timestamp and is not changed.

Update `supabase-schema.sql` to document the new column.

---

## Feature 1 — Participant Selection

### Placement

A "Who's splitting this?" block is inserted in the Add Expense sheet HTML between the "Paid by" row and the split method toggle buttons.

### Behaviour

- Renders one checkbox row per group member (name + formatted phone).
- All members are checked by default when the sheet opens.
- The member selected in the "Paid by" dropdown is always included; their checkbox is `disabled` and cannot be unchecked.
- The last checked member cannot be unchecked (minimum 1 participant).
- When a member is unchecked, they are removed from all split inputs immediately (the split input area re-renders).
- The checked member list is the sole source of truth used by every split method.

### HTML

```html
<div class="form-group" id="participant-group">
  <label class="form-label">Who's splitting this?</label>
  <div id="participant-list" class="participant-list"></div>
</div>
```

Each row rendered by JS:

```html
<label class="participant-row">
  <input type="checkbox" class="participant-cb" data-phone="{phone}" checked>
  <span class="participant-name">{name}</span>
  <span class="participant-phone">{formattedPhone}</span>
</label>
```

### CSS (add to `css/style.css`)

```css
.participant-list   { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.participant-row    { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.participant-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent); flex-shrink: 0; }
.participant-name   { font-size: 14px; font-weight: 500; color: var(--text); flex: 1; }
.participant-phone  { font-size: 12px; color: var(--text-muted); }
```

### JS

```js
function getIncludedMembers() {
  return [...$$('#participant-list .participant-cb')]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.phone);
}

function renderParticipants() {
  const list = $('participant-list');
  list.innerHTML = '';
  const paidBy = $('exp-paid-by').value;
  groupMembers.forEach(m => {
    const isPayer = m.phone === paidBy;
    const row = document.createElement('label');
    row.className = 'participant-row';
    row.innerHTML = `
      <input type="checkbox" class="participant-cb" data-phone="${escHtml(m.phone)}" ${isPayer ? 'checked disabled' : 'checked'}>
      <span class="participant-name">${escHtml(m.name)}</span>
      <span class="participant-phone">${escHtml(Auth.formatPhone(m.phone))}</span>
    `;
    list.appendChild(row);
  });
}
```

Participant checkboxes fire `renderSplitInputs()` on `change`. The "Paid by" dropdown also calls `renderParticipants()` on `change` (to update the disabled state).

Enforce minimum-1 rule:

```js
$('participant-list').addEventListener('change', e => {
  if (e.target.classList.contains('participant-cb')) {
    const checked = $$('#participant-list .participant-cb:checked');
    if (checked.length === 0) { e.target.checked = true; return; }
    renderSplitInputs();
  }
});
```

---

## Feature 2 — Split Methods (5 total)

### Toggle HTML

Replace the existing 3-button toggle with:

```html
<div class="split-toggle" id="split-toggle">
  <button type="button" class="split-btn active" data-method="equal">Equal</button>
  <button type="button" class="split-btn"        data-method="exact">Exact</button>
  <button type="button" class="split-btn"        data-method="percentage">%</button>
  <button type="button" class="split-btn"        data-method="shares">Shares</button>
  <button type="button" class="split-btn"        data-method="adjustment">Adjust</button>
</div>
```

### CSS update

The existing `.split-toggle` / `.split-btn` styles need horizontal scroll for 5 buttons:

```css
.split-toggle { overflow-x: auto; -webkit-overflow-scrolling: touch; }
```

---

### Method: Equal

No inputs. Included members split the total equally. Each member's share displayed as read-only text:

```html
<div class="split-row">
  <span class="split-name">{name}</span>
  <span class="split-amount">{fmtCurrency(amount/n, currency)}</span>
</div>
```

---

### Method: Exact

Existing UI — one number input per included member. The live validation line changes to:

- Over: `Total: $55.00 (must equal $50.00 — $5.00 over)`
- Under: `Total: $45.00 (must equal $50.00 — $5.00 under)`
- Valid: `✓ Adds up to $50.00`

The save-blocking toast uses the same wording: `Amounts must sum to $50.00 — currently $5.00 over`.

---

### Method: Percentage

Existing UI — one percentage input per included member, total must equal 100%. No logic changes beyond using `getIncludedMembers()` to determine which members to render.

---

### Method: Shares

Each included member gets a decimal number input (min `0.5`, step `0.5`, default `1`).

**Computation:** `person_amount = (person_shares / total_shares) * expense_total`

Live display below each input shows the computed dollar amount (read-only).

**Validation:** All share values must be > 0. No minimum total constraint (shares always sum to 100% of the expense by definition).

**HTML per member:**

```html
<div class="split-row">
  <span class="split-name">{name}</span>
  <input type="number" class="split-input shares-input" data-phone="{phone}"
         min="0.5" step="0.5" value="1">
  <span class="split-shares-label">shares</span>
  <span class="split-computed" id="shares-computed-{phone}">{computed amount}</span>
</div>
```

Re-compute on every `input` event:

```js
function computeShares() {
  const total  = parseFloat($('exp-amount').value) || 0;
  const inputs = [...$$('.shares-input')];
  const sum    = inputs.reduce((a, i) => a + (parseFloat(i.value) || 0), 0);
  inputs.forEach(i => {
    const share = sum > 0 ? ((parseFloat(i.value) || 0) / sum) * total : 0;
    $(`shares-computed-${i.dataset.phone}`).textContent = fmtCurrency(share, currentCurrency());
  });
}
```

**Save logic:** For each included member, `amount = (person_shares / total_shares) * expense_total`. Round to 2 dp; add rounding remainder to the payer's split.

---

### Method: Adjustment

Each included member has an optional signed dollar adjustment input (blank = $0). The remainder after summing adjustments is split equally.

**Computation:**
```
base_equal  = expense_total / n
person_total = base_equal + adjustment_i
```

Live display shows each person's computed total.

**Validation:** Sum of all adjustments must not exceed `expense_total` (error shown inline; save blocked).

**HTML per member:**

```html
<div class="split-row">
  <span class="split-name">{name}</span>
  <input type="number" class="split-input adj-input" data-phone="{phone}"
         step="0.01" placeholder="±0.00">
  <span class="split-computed" id="adj-computed-{phone}">{computed amount}</span>
</div>
```

Live validation line (below all rows):

- Valid: `Base split: $X each`
- Over: `Adjustments exceed total by $Y — reduce adjustments`

**Save logic:** For each included member, `amount = (expense_total / n) + adjustment_i`. Round to 2 dp; add rounding remainder to the payer's split.

---

### Save logic — excluded members

Members not in `getIncludedMembers()` receive no entry in `expense_splits`. Their balance is unaffected.

---

## Feature 3 — Expense Date Field

### HTML

Insert after the Amount/Currency row in the Add Expense sheet:

```html
<div class="form-group">
  <label class="form-label" for="exp-date">Date <span class="required">*</span></label>
  <input type="date" id="exp-date" class="form-input" required>
</div>
```

### Behaviour

- Defaults to today (`new Date().toISOString().slice(0, 10)`) when the sheet opens.
- Required — save is blocked with toast `"Date is required"` if empty.
- Value passed to `Groups.addExpense()` as `expense_date`.

### groups.js change

```js
// Before (expense object built in group.html):
{ description, amount, currency, paid_by, split_method, note }

// After:
{ description, amount, currency, paid_by, split_method, note, expense_date }
```

### Expense card display

Replace the `formatDateShort(exp.created_at)` call in the card renderer with `formatDateShort(exp.expense_date || exp.created_at)` so existing expenses (null `expense_date`) fall back gracefully.

---

## Feature 4 — OCR Date Extraction

### `api/parse-receipt.js` changes

**System prompt** — add to the Rules section:

```
- "date" is the date printed on the receipt in YYYY-MM-DD format, or null if not visible
```

**JSON schema example** in the prompt — add `"date": "2026-04-15"` to the example object.

**Sanitized response** — add:

```js
date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
```

### group.html OCR handler

After existing auto-fill logic, add:

```js
if (result.date) $('exp-date').value = result.date;
```

---

## Files Changed

| File | Change |
|------|--------|
| `group.html` | Participant checkboxes; 5-method split toggle; date input; Shares + Adjustment renderers; improved exact error messages; OCR date auto-fill |
| `js/groups.js` | Pass `expense_date` in `addExpense` insert |
| `api/parse-receipt.js` | Extract `date` from receipt; include in response |
| `supabase-schema.sql` | Document `expense_date DATE` column |
| DB (migration) | `ALTER TABLE tab.expenses ADD COLUMN expense_date DATE;` |

## Out of Scope

- Editing existing expenses
- Deleting individual splits
- Negative expense amounts
- Multi-currency splits (all splits stored in the expense's currency, consistent with current behaviour)
