# Joint Entry (Couple Claiming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any guest to designate themselves as a "party of 2" on a bill, giving their guest entry a joint display name and counting double in equal tip splitting.

**Architecture:** Add a `headcount` column to `tab.guests` (default 1). Any guest can set their own row to headcount=2 with a custom name via an inline form on the bill page. The equal-tip-split formula in `getPersonShare` is updated to weight by headcount instead of raw guest count.

**Tech Stack:** Vanilla JS, Supabase (direct REST via JS client), single-file HTML pages

---

## File Map

| File | Change |
|------|--------|
| `supabase-schema.sql` | Add migration comment for headcount column |
| `js/utils.js` | Update equal-tip-split in `getPersonShare` to weight by headcount |
| `bill.html` | Add "+1 Partner" button + inline form to guest row; add save/reset handlers |

---

## Task 1: DB Migration

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Run the migration in Supabase**

Open the Supabase SQL editor for project `fcscdimjhycxgstnzucd` and run:

```sql
ALTER TABLE tab.guests ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Verify the column exists**

In the Supabase SQL editor, run:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'tab' AND table_name = 'guests' AND column_name = 'headcount';
```

Expected: one row with `column_name=headcount`, `data_type=integer`, `column_default=1`.

- [ ] **Step 3: Update supabase-schema.sql**

In `supabase-schema.sql`, find the guests table block and add the migration comment after the `UNIQUE` constraint line:

```sql
-- ── Guests ──────────────────────────────────────────────────
CREATE TABLE tab.guests (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id            UUID REFERENCES tab.bills(id) ON DELETE CASCADE NOT NULL,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL,
  device_fingerprint TEXT,
  has_confirmed      BOOLEAN DEFAULT FALSE,
  has_paid           BOOLEAN DEFAULT FALSE,
  joined_at          TIMESTAMPTZ DEFAULT NOW(),
  headcount          INTEGER NOT NULL DEFAULT 1,
  UNIQUE(bill_id, phone)
);
-- Migration: ALTER TABLE tab.guests ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add headcount column to tab.guests"
```

---

## Task 2: Update Equal-Tip Split in utils.js

**Files:**
- Modify: `js/utils.js` (lines 188–194)

The current equal-split logic (lines 190–193) counts active guests as a raw set size. It needs to sum headcounts instead so a party-of-2 guest pays double.

- [ ] **Step 1: Replace the equal-split block**

In `js/utils.js`, find this block:

```js
    } else {
      // Equal split: only among guests who actually claimed something
      const activeGuests = new Set(claims.map(c => c.guest_phone)).size;
      total += tipTotal / Math.max(1, activeGuests);
    }
```

Replace it with:

```js
    } else {
      // Equal split: weight by headcount; only among guests who actually claimed something
      const activePhones  = new Set(claims.map(c => c.guest_phone));
      const totalHeads    = guests
        .filter(g => activePhones.has(g.phone))
        .reduce((sum, g) => sum + (g.headcount || 1), 0);
      const myHeadcount   = (guests.find(g => g.phone === phone)?.headcount) || 1;
      total += (tipTotal / Math.max(1, totalHeads)) * myHeadcount;
    }
```

- [ ] **Step 2: Manually verify the math**

Given: 3 guests — Alice (headcount 1), Bob (headcount 1), Couple (headcount 2). All claimed something. Tip = $20.
- totalHeads = 4
- Per head = $5
- Alice pays $5, Bob pays $5, Couple pays $10. Total = $20. ✓

Given: 2 guests — Alice (headcount 1), Couple (headcount 2). Tip = $30.
- totalHeads = 3
- Per head = $10
- Alice pays $10, Couple pays $20. Total = $30. ✓

- [ ] **Step 3: Commit**

```bash
git add js/utils.js
git commit -m "feat: weight equal tip split by guest headcount"
```

---

## Task 3: Add "+1 Partner" UI to bill.html

**Files:**
- Modify: `bill.html`

### 3a — State variable

- [ ] **Step 1: Add jointFormOpen state variable**

In `bill.html`, find the block of `let` declarations near the top of the IIFE (around line 244–252, where `let kioskGuest = null;` is):

```js
  let kioskGuest     = null;
```

Add immediately after it:

```js
  let jointFormOpen  = null;   // guest id whose +1 form is open
```

### 3b — Guest row rendering

- [ ] **Step 2: Add the partner button/form to renderGuests**

In `bill.html`, find the `renderGuests` function. Inside the `.map((g, i) => {` callback, after the existing button/tag declarations (after the `claimForBtn` and `isSynthetic` lines), add:

```js
      const isJointActive = (g.headcount || 1) >= 2;
      const partnerControl = isMe && bill.status !== 'closed'
        ? isJointActive
          ? `<button class="btn btn-ghost btn-sm" style="font-size:12px;color:var(--text-muted);" onclick="resetJointEntry('${g.id}')">Party of 2 ✕</button>`
          : jointFormOpen === g.id
            ? `<div class="joint-form" style="display:flex;gap:6px;margin-top:4px;align-items:center;">
                 <input id="joint-name-input" class="input" style="font-size:13px;padding:6px 10px;flex:1;" placeholder="e.g. Antonio &amp; Maria" value="${escHtml(g.name)} &amp; " />
                 <button class="btn btn-primary btn-sm" onclick="saveJointEntry('${g.id}')">Save</button>
                 <button class="btn btn-ghost btn-sm" onclick="cancelJointForm()">Cancel</button>
               </div>`
            : `<button class="btn btn-ghost btn-sm" style="font-size:12px;" onclick="openJointForm('${g.id}')">+1 Partner</button>`
        : '';
```

- [ ] **Step 3: Render partnerControl in the guest row HTML**

Inside the same `.map` callback, find where `claimForBtn` is injected into the returned HTML string. It currently looks like:

```js
          <div class="guest-actions" style="flex-direction:column;align-items:flex-end;gap:4px;">
            <div style="display:flex;align-items:center;gap:6px;">
              ${display(myShare)}
              ${paidBtn}
              ${removeBtn}
            </div>
            ${claimForBtn}
          </div>
```

Add `${partnerControl}` on a new line after `${claimForBtn}`:

```js
          <div class="guest-actions" style="flex-direction:column;align-items:flex-end;gap:4px;">
            <div style="display:flex;align-items:center;gap:6px;">
              ${display(myShare)}
              ${paidBtn}
              ${removeBtn}
            </div>
            ${claimForBtn}
            ${partnerControl}
          </div>
```

### 3c — Handler functions

- [ ] **Step 4: Add openJointForm, cancelJointForm, saveJointEntry, resetJointEntry**

Find the `function toggleClaim(` declaration in `bill.html`. Add these four functions immediately before it:

```js
  function openJointForm(guestId) {
    jointFormOpen = guestId;
    renderGuests();
    // focus the input after render
    setTimeout(() => {
      const input = document.getElementById('joint-name-input');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }, 50);
  }

  function cancelJointForm() {
    jointFormOpen = null;
    renderGuests();
  }

  async function saveJointEntry(guestId) {
    const input = document.getElementById('joint-name-input');
    const name  = input ? input.value.trim() : '';
    if (!name) { showToast('Enter a name for your party', 'error'); return; }

    const { error } = await db
      .from('guests')
      .update({ name, headcount: 2 })
      .eq('id', guestId);

    if (error) { showToast('Could not save — try again', 'error'); return; }

    const idx = guests.findIndex(g => g.id === guestId);
    if (idx >= 0) { guests[idx].name = name; guests[idx].headcount = 2; }
    jointFormOpen = null;
    renderGuests();
    renderSummary();
  }

  async function resetJointEntry(guestId) {
    const originalName = user.name;

    const { error } = await db
      .from('guests')
      .update({ name: originalName, headcount: 1 })
      .eq('id', guestId);

    if (error) { showToast('Could not reset — try again', 'error'); return; }

    const idx = guests.findIndex(g => g.id === guestId);
    if (idx >= 0) { guests[idx].name = originalName; guests[idx].headcount = 1; }
    renderGuests();
    renderSummary();
  }
```

- [ ] **Step 5: Commit**

```bash
git add bill.html
git commit -m "feat: add +1 Partner joint entry UI to bill page"
```

---

## Task 4: Smoke Test

- [ ] **Step 1: Open a test bill with at least 3 guests and equal tip set**

Create a bill in setup.html with 3+ items, set tip to e.g. 20%, tip split = Equal. Invite 2+ other guests (or use two browser profiles).

- [ ] **Step 2: Create a joint entry**

As a non-owner guest, click "+1 Partner" on your own guest row. Enter a joint name (e.g. "Test & Partner"). Click Save. Verify:
- Guest row updates to show the joint name
- "Party of 2 ✕" button appears
- No page reload needed

- [ ] **Step 3: Verify tip math**

Close the bill and open the summary. Confirm the joint entry's total is twice the per-head tip share compared to a solo guest claiming the same item value.

- [ ] **Step 4: Reset the joint entry**

Reopen the bill (if owner), click "Party of 2 ✕". Verify the guest row reverts to the original name and the solo tip share.

- [ ] **Step 5: Verify bill owner cannot see the button on other guests' rows**

Log in as owner. Confirm "+1 Partner" does not appear on any guest row other than your own.

---

## Task 5: Push

- [ ] **Step 1: Push branch**

```bash
git push
```
