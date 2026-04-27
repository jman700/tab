# TAB Groups — Phase 1: Groups + Basic Expenses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent groups and general expense tracking to TAB — users can create groups, invite members via share link, and record shared expenses split equally, by percentage, or by exact amount.

**Architecture:** Additive — new `group.html` page + `js/groups.js` data module, plus a Groups section on the existing dashboard. No changes to the existing bill flow. Data access follows the existing IIFE module pattern (see `js/auth.js`). All Supabase queries use the existing `db` client (schema: `tab`).

**Tech Stack:** Vanilla JS + HTML, Supabase JS v2, existing `js/utils.js` helpers (`fmtCurrency`, `escHtml`, `getInitials`, `getPersonColor`, `showToast`, `openSheet`, `closeSheet`, `navigateTo`, `$`, `$$`, `show`, `hide`, `setHTML`, `setText`, `formatDateShort`)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `js/groups.js` | Data access: groups, members, expenses, splits |
| Create | `group.html` | Group detail page: expenses list, members list, add expense |
| Modify | `dashboard.html` | Add Groups section + New Group sheet |

---

### Task 1: Supabase Schema

**Files:**
- No local files — run SQL in Supabase dashboard (SQL Editor)

- [ ] **Step 1: Open Supabase SQL Editor and run the following SQL**

```sql
-- Groups
create table if not exists tab.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_by   text not null,
  invite_token text not null default encode(gen_random_bytes(8), 'hex'),
  created_at   timestamptz not null default now()
);

-- Group members
create table if not exists tab.group_members (
  group_id     uuid not null references tab.groups(id) on delete cascade,
  phone        text not null,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (group_id, phone)
);

-- Expenses
create table if not exists tab.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references tab.groups(id) on delete cascade,
  description  text not null,
  amount       numeric(12,2) not null,
  currency     text not null default 'USD',
  paid_by      text not null,
  split_method text not null check (split_method in ('equal','percentage','exact')),
  note         text,
  created_at   timestamptz not null default now()
);

-- Expense splits (one row per person per expense)
create table if not exists tab.expense_splits (
  expense_id uuid not null references tab.expenses(id) on delete cascade,
  phone      text not null,
  amount     numeric(12,2) not null,
  primary key (expense_id, phone)
);
```

- [ ] **Step 2: Enable RLS and add permissive policies (same pattern as existing tables)**

```sql
alter table tab.groups        enable row level security;
alter table tab.group_members enable row level security;
alter table tab.expenses      enable row level security;
alter table tab.expense_splits enable row level security;

create policy "allow all" on tab.groups        for all using (true) with check (true);
create policy "allow all" on tab.group_members for all using (true) with check (true);
create policy "allow all" on tab.expenses      for all using (true) with check (true);
create policy "allow all" on tab.expense_splits for all using (true) with check (true);
```

- [ ] **Step 3: Verify in Supabase Table Editor**

Open the Table Editor and confirm four new tables appear under the `tab` schema: `groups`, `group_members`, `expenses`, `expense_splits`. Click each to confirm columns match the schema above.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: document Supabase schema creation for groups phase 1"
```

(No local files changed — commit any docs/notes if you added them; otherwise this step is a no-op.)

---

### Task 2: `js/groups.js` — Data Access Module

**Files:**
- Create: `js/groups.js`

- [ ] **Step 1: Create `js/groups.js` with the Groups IIFE module**

```js
// ============================================================
// TAB — Groups
// Data access for groups, members, expenses, and splits.
// Depends on: global `db` (Supabase client, schema: tab)
// ============================================================

const Groups = (() => {

  async function createGroup(name, phone, displayName) {
    const { data: group, error: e1 } = await db
      .from('groups')
      .insert({ name: name.trim(), created_by: phone })
      .select()
      .single();
    if (e1) return { error: e1 };

    const { error: e2 } = await db
      .from('group_members')
      .insert({ group_id: group.id, phone, display_name: displayName });
    if (e2) return { error: e2 };

    return { data: group };
  }

  async function getMyGroups(phone) {
    const { data, error } = await db
      .from('group_members')
      .select('group_id, groups(*)')
      .eq('phone', phone)
      .order('joined_at', { ascending: false });
    if (error) return { error };
    return { data: (data || []).map(r => r.groups).filter(Boolean) };
  }

  async function getGroup(id) {
    const { data, error } = await db
      .from('groups')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return { error };
    return { data };
  }

  async function getMembers(groupId) {
    const { data, error } = await db
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at');
    if (error) return { error };
    return { data: data || [] };
  }

  async function joinGroup(groupId, inviteToken, phone, displayName) {
    const { data: group, error: e1 } = await db
      .from('groups')
      .select('id, invite_token')
      .eq('id', groupId)
      .eq('invite_token', inviteToken)
      .single();
    if (e1 || !group) return { error: e1 || new Error('Invalid invite link') };

    const { data: existing } = await db
      .from('group_members')
      .select('phone')
      .eq('group_id', groupId)
      .eq('phone', phone)
      .maybeSingle();
    if (existing) return { data: group, alreadyMember: true };

    const { error: e2 } = await db
      .from('group_members')
      .insert({ group_id: groupId, phone, display_name: displayName });
    if (e2) return { error: e2 };

    return { data: group };
  }

  async function addExpense(groupId, expense, splits) {
    // expense: { description, amount, currency, paid_by, split_method, note }
    // splits: [{ phone, amount }]
    const { data: exp, error: e1 } = await db
      .from('expenses')
      .insert({ group_id: groupId, ...expense })
      .select()
      .single();
    if (e1) return { error: e1 };

    const splitRows = splits.map(s => ({
      expense_id: exp.id,
      phone: s.phone,
      amount: s.amount,
    }));
    const { error: e2 } = await db.from('expense_splits').insert(splitRows);
    if (e2) {
      await db.from('expenses').delete().eq('id', exp.id);
      return { error: e2 };
    }
    return { data: exp };
  }

  async function getExpenses(groupId) {
    const { data: expenses, error: e1 } = await db
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    if (e1) return { error: e1 };
    if (!expenses || expenses.length === 0) return { data: [] };

    const expenseIds = expenses.map(e => e.id);
    const { data: splits, error: e2 } = await db
      .from('expense_splits')
      .select('*')
      .in('expense_id', expenseIds);
    if (e2) return { error: e2 };

    const byExpense = {};
    (splits || []).forEach(s => {
      if (!byExpense[s.expense_id]) byExpense[s.expense_id] = [];
      byExpense[s.expense_id].push(s);
    });

    return {
      data: expenses.map(e => ({ ...e, splits: byExpense[e.id] || [] })),
    };
  }

  async function deleteExpense(expenseId) {
    const { error } = await db.from('expenses').delete().eq('id', expenseId);
    if (error) return { error };
    return { data: true };
  }

  return {
    createGroup,
    getMyGroups,
    getGroup,
    getMembers,
    joinGroup,
    addExpense,
    getExpenses,
    deleteExpense,
  };
})();
```

- [ ] **Step 2: Verify the module loads without errors**

Open the browser console on any TAB page that loads `js/utils.js` and `js/config.js`. Temporarily add a `<script src="/js/groups.js"></script>` tag and open the browser console — confirm no syntax errors appear. Remove the temporary script tag after verifying.

- [ ] **Step 3: Commit**

```bash
git add js/groups.js
git commit -m "feat: add js/groups.js data access module for groups/expenses"
```

---

### Task 3: Dashboard Groups Section

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Add the Groups section HTML to `dashboard.html`**

In `dashboard.html`, after the closing `</div>` of `#closed-section` (line ~79) and before `</main>`, insert:

```html
  <!-- Groups -->
  <div id="groups-section" class="mt-24">
    <div class="dash-head" style="margin-bottom:12px;">
      <div class="section-divider" style="margin:0;flex:1;"><h2>Groups</h2></div>
      <button class="btn btn-secondary btn-sm" id="new-group-btn" style="flex-shrink:0;">+ New Group</button>
    </div>
    <div id="groups-list">
      <div class="bill-card-skeleton">
        <div class="skeleton" style="height:18px;width:45%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:13px;width:28%;"></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Add the New Group bottom sheet HTML to `dashboard.html`**

Just before `</body>` in `dashboard.html`, insert:

```html
<!-- New Group Sheet -->
<div class="sheet-backdrop" id="new-group-backdrop" style="display:none;"></div>
<div class="sheet" id="new-group-sheet" style="display:none;">
  <div class="sheet-handle"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <h2 style="margin:0;">New Group</h2>
    <button class="btn btn-ghost btn-sm" id="close-new-group-btn">✕</button>
  </div>
  <div class="field">
    <label for="group-name-input">Group Name</label>
    <input class="input" id="group-name-input" type="text" placeholder="Trip to Mexico, Apartment…" autocomplete="off" />
  </div>
  <button class="btn btn-primary btn-full mt-16" id="create-group-btn">Create Group</button>
</div>
```

- [ ] **Step 3: Add `js/groups.js` script tag to `dashboard.html`**

In `dashboard.html`, after `<script src="/js/utils.js"></script>`, add:

```html
<script src="/js/groups.js"></script>
```

- [ ] **Step 4: Add Groups JS to `dashboard.html`'s inline `<script>` block**

After the `loadBills()` call near the bottom of the script, add:

```js
  // ── Groups ───────────────────────────────────────────────
  async function loadGroups() {
    const { data, error } = await Groups.getMyGroups(user.phone);
    if (error) {
      setHTML('groups-list', '<p style="font-size:14px;color:var(--text-muted);">Could not load groups.</p>');
      return;
    }
    if (!data || data.length === 0) {
      setHTML('groups-list', `
        <div class="empty">
          <div class="empty-icon">👥</div>
          <h3>No groups yet</h3>
          <p>Create a group to track shared expenses over time.</p>
        </div>
      `);
      return;
    }
    setHTML('groups-list', data.map(renderGroupCard).join(''));
    $$('.group-card').forEach(card => {
      card.addEventListener('click', () => navigateTo(`/group.html?id=${card.dataset.id}`));
    });
  }

  function renderGroupCard(group) {
    return `
      <div class="bill-card fade-up group-card" data-id="${group.id}" style="cursor:pointer;">
        <div class="bill-card-top">
          <div class="bill-card-name">${escHtml(group.name)}</div>
          <span class="badge badge-active">Group</span>
        </div>
        <div class="bill-card-meta">
          <span>Created ${formatDateShort(group.created_at)}</span>
        </div>
      </div>
    `;
  }

  // New Group sheet
  $('new-group-btn').addEventListener('click', () => {
    $('group-name-input').value = '';
    openSheet('new-group-backdrop', 'new-group-sheet');
    setTimeout(() => $('group-name-input').focus(), 320);
  });
  $('close-new-group-btn').addEventListener('click', () => closeSheet('new-group-backdrop', 'new-group-sheet'));
  $('new-group-backdrop').addEventListener('click', () => closeSheet('new-group-backdrop', 'new-group-sheet'));

  $('create-group-btn').addEventListener('click', async () => {
    const name = $('group-name-input').value.trim();
    if (!name) { showToast('Enter a group name', 'error'); return; }

    const btn = $('create-group-btn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    const { data, error } = await Groups.createGroup(name, user.phone, user.name);

    btn.disabled = false;
    btn.textContent = 'Create Group';

    if (error) { showToast('Could not create group', 'error'); return; }

    closeSheet('new-group-backdrop', 'new-group-sheet');
    navigateTo(`/group.html?id=${data.id}`);
  });

  $('group-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('create-group-btn').click();
  });

  loadGroups();
```

- [ ] **Step 5: Verify in browser**

1. Open `/dashboard.html` — confirm a "Groups" section appears below Closed Bills with a skeleton loader, then "No groups yet" state.
2. Tap "+ New Group" → sheet slides up; enter "Test Group" → tap "Create Group" → redirected to `/group.html?id=<uuid>` (404 expected since group.html doesn't exist yet).
3. Tap back to dashboard — "Test Group" card now appears in the Groups section.

- [ ] **Step 6: Commit**

```bash
git add dashboard.html
git commit -m "feat: add Groups section and New Group sheet to dashboard"
```

---

### Task 4: `group.html` — Shell + Members Tab + Invite Flow

**Files:**
- Create: `group.html`

- [ ] **Step 1: Create `group.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tab — Group</title>
  <meta name="theme-color" content="#B8872A" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👥</text></svg>" />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>

<header class="header">
  <div class="header-inner">
    <button class="btn btn-ghost btn-sm" id="back-btn">← Dashboard</button>
    <a href="/dashboard.html" class="brand">
      <svg width="16" height="19" viewBox="0 0 30 36" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="27" height="30" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.5"/>
        <path d="M7 12h16M7 18h16M7 24h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      tab
    </a>
    <button class="btn btn-secondary btn-sm" id="invite-btn">Invite</button>
  </div>
</header>

<div class="bill-hero" id="group-hero">
  <h1 id="group-name">Loading…</h1>
  <p id="group-meta" style="font-size:14px;color:var(--text-muted);margin-top:4px;"></p>
</div>

<main class="container page" id="main" style="padding-top:0;">

  <!-- Tab bar -->
  <div class="toggle-group" id="tab-bar" style="margin-bottom:20px;">
    <button class="toggle-btn active" id="tab-expenses">Expenses</button>
    <button class="toggle-btn" id="tab-members">Members</button>
  </div>

  <!-- Expenses tab -->
  <div id="expenses-tab">
    <div id="expenses-list">
      <div class="bill-card-skeleton">
        <div class="skeleton" style="height:18px;width:55%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:13px;width:35%;"></div>
      </div>
    </div>
    <button class="btn btn-primary btn-full mt-16" id="add-expense-btn">+ Add Expense</button>
  </div>

  <!-- Members tab -->
  <div id="members-tab" style="display:none;">
    <div id="members-list"></div>
    <button class="btn btn-secondary btn-full mt-16" id="invite-members-btn">Invite Someone</button>
  </div>

</main>

<!-- Add Expense Sheet -->
<div class="sheet-backdrop" id="expense-backdrop" style="display:none;"></div>
<div class="sheet" id="expense-sheet" style="display:none;">
  <div class="sheet-handle"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <h2 style="margin:0;">Add Expense</h2>
    <button class="btn btn-ghost btn-sm" id="close-expense-btn">✕</button>
  </div>

  <div class="field">
    <label for="exp-description">Description</label>
    <input class="input" id="exp-description" type="text" placeholder="Groceries, dinner, gas…" autocomplete="off" />
  </div>

  <div style="display:flex;gap:8px;">
    <div class="field" style="flex:1;">
      <label for="exp-amount">Amount</label>
      <input class="input" id="exp-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
    </div>
    <div class="field" style="width:100px;flex-shrink:0;">
      <label for="exp-currency">Currency</label>
      <select class="input" id="exp-currency" style="padding:9px 8px;font-size:14px;cursor:pointer;"></select>
    </div>
  </div>

  <div class="field">
    <label for="exp-paid-by">Paid by</label>
    <select class="input" id="exp-paid-by" style="padding:9px 12px;font-size:14px;cursor:pointer;"></select>
  </div>

  <div class="field">
    <label>Split</label>
    <div class="toggle-group" style="margin-top:6px;">
      <button class="toggle-btn active" data-method="equal">Equal</button>
      <button class="toggle-btn" data-method="percentage">%</button>
      <button class="toggle-btn" data-method="exact">Exact</button>
    </div>
  </div>

  <div id="split-inputs" style="margin-top:8px;margin-bottom:4px;"></div>

  <div class="field">
    <label for="exp-note">Note <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;">(optional)</span></label>
    <input class="input" id="exp-note" type="text" placeholder="Optional note…" autocomplete="off" />
  </div>

  <button class="btn btn-primary btn-full mt-16" id="save-expense-btn">Add Expense</button>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/groups.js"></script>
<script>
  const user = Auth.requireAuth();
  if (!user) throw new Error('Not authenticated');

  let groupId = null;
  let group   = null;
  let members = [];
  let activeSplitMethod = 'equal';

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    const params = new URLSearchParams(window.location.search);
    groupId = params.get('id');
    const inviteToken = params.get('token');

    if (!groupId) { navigateTo('/dashboard.html'); return; }

    if (inviteToken) {
      const { error, alreadyMember } = await Groups.joinGroup(groupId, inviteToken, user.phone, user.name);
      if (error) showToast('Invalid invite link', 'error');
      // Clean token from URL without reload
      window.history.replaceState({}, '', `/group.html?id=${groupId}`);
    }

    await loadGroup();
  }

  async function loadGroup() {
    const [{ data: g, error: e1 }, { data: m, error: e2 }] = await Promise.all([
      Groups.getGroup(groupId),
      Groups.getMembers(groupId),
    ]);

    if (e1 || !g) {
      showToast('Group not found', 'error');
      navigateTo('/dashboard.html');
      return;
    }

    group   = g;
    members = m || [];

    document.title = `Tab — ${g.name}`;
    setText('group-name', g.name);
    setText('group-meta', `${members.length} member${members.length !== 1 ? 's' : ''}`);

    renderMembers();
    await loadExpenses();
  }

  // ── Tab navigation ────────────────────────────────────────
  $('tab-expenses').addEventListener('click', () => switchTab('expenses'));
  $('tab-members').addEventListener('click',  () => switchTab('members'));

  function switchTab(tab) {
    const isExpenses = tab === 'expenses';
    $('expenses-tab').style.display = isExpenses ? '' : 'none';
    $('members-tab').style.display  = isExpenses ? 'none' : '';
    $('tab-expenses').classList.toggle('active', isExpenses);
    $('tab-members').classList.toggle('active', !isExpenses);
  }

  // ── Members tab ───────────────────────────────────────────
  function renderMembers() {
    if (members.length === 0) {
      setHTML('members-list', '<p style="font-size:14px;color:var(--text-muted);">No members yet.</p>');
      return;
    }
    setHTML('members-list', members.map((m, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="
          width:36px;height:36px;border-radius:50%;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:600;
          background:${getPersonColor(i)}22;color:${getPersonColor(i)};
          border:1.5px solid ${getPersonColor(i)}44;">
          ${escHtml(getInitials(m.display_name))}
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:500;">${escHtml(m.display_name)}${m.phone === user.phone ? ' <span style="font-size:11px;color:var(--text-muted);">(you)</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text-muted);">Joined ${formatDateShort(m.joined_at)}</div>
        </div>
      </div>
    `).join(''));
  }

  // ── Invite ────────────────────────────────────────────────
  async function shareInvite() {
    if (!group) return;
    const url  = `${window.location.origin}/group.html?id=${groupId}&token=${group.invite_token}`;
    const text = `Join "${group.name}" on TAB: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${group.name}`, text, url }); }
      catch (e) { if (e.name !== 'AbortError') copyToClipboard(url); }
    } else {
      copyToClipboard(url);
    }
  }

  $('invite-btn').addEventListener('click', shareInvite);
  $('invite-members-btn').addEventListener('click', shareInvite);
  $('back-btn').addEventListener('click', () => navigateTo('/dashboard.html'));

  init();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

1. Navigate to `/dashboard.html` → tap the "Test Group" card → lands on `/group.html?id=<uuid>`.
2. Page shows group name, "1 member" in the hero.
3. Members tab shows your name with avatar and join date.
4. Tap "Invite" → Web Share sheet opens (or link is copied on desktop).
5. Open a second incognito tab, navigate to the invite URL → after login/signup, lands on group page and joins (member count becomes 2).

- [ ] **Step 3: Commit**

```bash
git add group.html
git commit -m "feat: add group.html with members tab and invite flow"
```

---

### Task 5: `group.html` — Expenses Tab + Add Expense Sheet

**Files:**
- Modify: `group.html`

- [ ] **Step 1: Add `loadExpenses` and `renderExpenses` to the inline script in `group.html`**

Inside the `<script>` block, after `renderMembers()`, add:

```js
  // ── Expenses tab ──────────────────────────────────────────
  async function loadExpenses() {
    const { data, error } = await Groups.getExpenses(groupId);
    if (error) {
      setHTML('expenses-list', '<p style="font-size:14px;color:var(--text-muted);">Could not load expenses.</p>');
      return;
    }
    renderExpenses(data || []);
  }

  function renderExpenses(expenses) {
    if (expenses.length === 0) {
      setHTML('expenses-list', `
        <div class="empty">
          <div class="empty-icon">💸</div>
          <h3>No expenses yet</h3>
          <p>Add an expense to start tracking who owes what.</p>
        </div>
      `);
      return;
    }
    setHTML('expenses-list', expenses.map(renderExpenseCard).join(''));
  }

  function renderExpenseCard(exp) {
    const payer   = members.find(m => m.phone === exp.paid_by);
    const payerName = payer ? payer.display_name : exp.paid_by;
    const mySplit = (exp.splits || []).find(s => s.phone === user.phone);
    const myAmt   = mySplit ? fmtCurrency(mySplit.amount, exp.currency) : null;
    const iAmPayer = exp.paid_by === user.phone;

    return `
      <div class="bill-card fade-up" style="cursor:default;">
        <div class="bill-card-top">
          <div class="bill-card-name">${escHtml(exp.description)}</div>
          <span style="font-size:14px;font-weight:600;color:var(--accent);">${fmtCurrency(exp.amount, exp.currency)}</span>
        </div>
        <div class="bill-card-meta">
          <span>${escHtml(payerName)} paid</span>
          <span>${exp.split_method === 'equal' ? 'Equal split' : exp.split_method === 'percentage' ? 'By percentage' : 'Exact amounts'}</span>
          <span>${formatDateShort(exp.created_at)}</span>
        </div>
        ${myAmt ? `
        <div class="bill-card-footer">
          <span class="bill-card-yours">
            ${iAmPayer ? 'You paid · you\'re owed back' : `Your share: ${myAmt}`}
          </span>
        </div>` : ''}
      </div>
    `;
  }
```

- [ ] **Step 2: Add the expense sheet JS to the inline script in `group.html`**

After the `loadExpenses` / `renderExpenses` functions, add:

```js
  // ── Add Expense Sheet ─────────────────────────────────────
  function populateCurrencySelect() {
    $('exp-currency').innerHTML = CURRENCIES.map(c =>
      `<option value="${c.code}"${c.code === 'USD' ? ' selected' : ''}>${c.code}</option>`
    ).join('');
  }

  function populatePaidBySelect() {
    $('exp-paid-by').innerHTML = members.map(m =>
      `<option value="${m.phone}"${m.phone === user.phone ? ' selected' : ''}>${escHtml(m.display_name)}</option>`
    ).join('');
  }

  function renderSplitInputs() {
    const method = activeSplitMethod;
    const amount = parseFloat($('exp-amount').value) || 0;
    const currency = $('exp-currency').value || 'USD';

    if (method === 'equal') {
      const each = members.length > 0 ? (amount / members.length) : 0;
      setHTML('split-inputs', `
        <p style="font-size:13px;color:var(--text-muted);padding:4px 0;">
          ${fmtCurrency(each.toFixed(2), currency)} per person · ${members.length} member${members.length !== 1 ? 's' : ''}
        </p>
      `);
      return;
    }

    if (method === 'percentage') {
      const even = members.length > 0 ? Math.floor(100 / members.length) : 0;
      const remainder = 100 - (even * members.length);
      setHTML('split-inputs', members.map((m, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(i)}22;color:${getPersonColor(i)};border:1.5px solid ${getPersonColor(i)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <input class="input split-pct-input" data-phone="${escHtml(m.phone)}" type="number" min="0" max="100" step="1"
            value="${even + (i === 0 ? remainder : 0)}"
            style="width:68px;padding:6px 8px;text-align:right;font-size:14px;" />
          <span style="font-size:13px;color:var(--text-muted);">%</span>
        </div>
      `).join('') + `<p id="pct-sum-note" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></p>`);

      $$('.split-pct-input').forEach(el => el.addEventListener('input', updatePctNote));
      updatePctNote();
      return;
    }

    if (method === 'exact') {
      const each = members.length > 0 ? (amount / members.length).toFixed(2) : '0.00';
      setHTML('split-inputs', members.map((m, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:${getPersonColor(i)}22;color:${getPersonColor(i)};border:1.5px solid ${getPersonColor(i)}44;">
            ${escHtml(getInitials(m.display_name))}
          </div>
          <span style="flex:1;font-size:14px;">${escHtml(m.display_name)}</span>
          <input class="input split-exact-input" data-phone="${escHtml(m.phone)}" type="number" inputmode="decimal" min="0" step="0.01"
            value="${each}"
            style="width:90px;padding:6px 8px;text-align:right;font-size:14px;" />
        </div>
      `).join('') + `<p id="exact-sum-note" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></p>`);

      $$('.split-exact-input').forEach(el => el.addEventListener('input', updateExactNote));
      updateExactNote();
    }
  }

  function updatePctNote() {
    const total = $$('.split-pct-input').reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
    const note  = $('pct-sum-note');
    if (!note) return;
    const diff  = Math.abs(total - 100);
    note.textContent = diff < 0.01 ? '✓ Adds up to 100%' : `Total: ${total.toFixed(0)}% (must equal 100%)`;
    note.style.color = diff < 0.01 ? 'var(--green)' : 'var(--red)';
  }

  function updateExactNote() {
    const amount = parseFloat($('exp-amount').value) || 0;
    const currency = $('exp-currency').value || 'USD';
    const total = $$('.split-exact-input').reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
    const note  = $('exact-sum-note');
    if (!note) return;
    const diff  = Math.abs(total - amount);
    note.textContent = diff < 0.01
      ? `✓ Adds up to ${fmtCurrency(amount, currency)}`
      : `Total: ${fmtCurrency(total, currency)} (must equal ${fmtCurrency(amount, currency)})`;
    note.style.color = diff < 0.01 ? 'var(--green)' : 'var(--red)';
  }

  // Split method toggle buttons
  $$('[data-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSplitMethod = btn.dataset.method;
      $$('[data-method]').forEach(b => b.classList.toggle('active', b === btn));
      renderSplitInputs();
    });
  });

  // Re-render split inputs when amount or currency changes
  $('exp-amount').addEventListener('input', renderSplitInputs);
  $('exp-currency').addEventListener('change', renderSplitInputs);

  $('add-expense-btn').addEventListener('click', () => {
    populateCurrencySelect();
    populatePaidBySelect();
    activeSplitMethod = 'equal';
    $$('[data-method]').forEach(b => b.classList.toggle('active', b.dataset.method === 'equal'));
    $('exp-description').value = '';
    $('exp-amount').value = '';
    $('exp-note').value = '';
    renderSplitInputs();
    openSheet('expense-backdrop', 'expense-sheet');
    setTimeout(() => $('exp-description').focus(), 320);
  });

  $('close-expense-btn').addEventListener('click', () => closeSheet('expense-backdrop', 'expense-sheet'));
  $('expense-backdrop').addEventListener('click', () => closeSheet('expense-backdrop', 'expense-sheet'));

  $('save-expense-btn').addEventListener('click', async () => {
    const description = $('exp-description').value.trim();
    const amount      = parseFloat($('exp-amount').value);
    const currency    = $('exp-currency').value;
    const paid_by     = $('exp-paid-by').value;
    const note        = $('exp-note').value.trim() || null;

    if (!description) { showToast('Enter a description', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!paid_by) { showToast('Select who paid', 'error'); return; }

    let splits = [];

    if (activeSplitMethod === 'equal') {
      const baseShare = Math.floor((amount / members.length) * 100) / 100;
      splits = members.map(m => ({ phone: m.phone, amount: baseShare }));
      // Distribute rounding remainder to payer
      const sum  = splits.reduce((s, x) => s + x.amount, 0);
      const diff = parseFloat((amount - sum).toFixed(2));
      if (Math.abs(diff) > 0) {
        const payerSplit = splits.find(s => s.phone === paid_by) || splits[0];
        payerSplit.amount = parseFloat((payerSplit.amount + diff).toFixed(2));
      }

    } else if (activeSplitMethod === 'percentage') {
      const inputs  = $$('.split-pct-input');
      const totalPct = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      if (Math.abs(totalPct - 100) > 0.01) { showToast('Percentages must sum to 100%', 'error'); return; }
      splits = inputs.map(el => ({
        phone: el.dataset.phone,
        amount: parseFloat((amount * (parseFloat(el.value) || 0) / 100).toFixed(2)),
      }));

    } else if (activeSplitMethod === 'exact') {
      const inputs    = $$('.split-exact-input');
      const totalExact = inputs.reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      if (Math.abs(totalExact - amount) > 0.01) {
        showToast(`Amounts must sum to ${fmtCurrency(amount, currency)}`, 'error');
        return;
      }
      splits = inputs.map(el => ({
        phone: el.dataset.phone,
        amount: parseFloat(parseFloat(el.value || 0).toFixed(2)),
      }));
    }

    const btn = $('save-expense-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const { error } = await Groups.addExpense(
      groupId,
      { description, amount, currency, paid_by, split_method: activeSplitMethod, note },
      splits
    );

    btn.disabled    = false;
    btn.textContent = 'Add Expense';

    if (error) { showToast('Could not save expense', 'error'); return; }

    closeSheet('expense-backdrop', 'expense-sheet');
    showToast('Expense added', 'success');
    await loadExpenses();
  });
```

- [ ] **Step 3: Verify in browser — Equal split**

1. Open a group with 2+ members.
2. Tap "+ Add Expense" → sheet opens.
3. Enter "Dinner", amount `$60`, USD, yourself as payer, split = Equal.
4. Confirm split preview shows `$30.00 per person · 2 members`.
5. Tap "Add Expense" → success toast, expense card appears: "Dinner · $60.00 · You paid · Equal split".

- [ ] **Step 4: Verify in browser — Percentage split**

1. Tap "+ Add Expense" → switch to "%" split.
2. Enter "Hotel", `$200`, USD.
3. Change person 1 to 70%, person 2 to 30% → note shows "✓ Adds up to 100%".
4. Try saving with totals not adding to 100% → toast error.
5. Fix to 100% → saves successfully, card shows "By percentage".

- [ ] **Step 5: Verify in browser — Exact split**

1. Tap "+ Add Expense" → switch to "Exact" split.
2. Enter "Groceries", `$45.50`, USD.
3. Set person 1 = $20, person 2 = $25.50 → note shows "✓ Adds up to $45.50".
4. Try saving with wrong total → toast error.
5. Fix → saves successfully, card shows "Exact amounts" and "Your share: $20.00" (or $25.50).

- [ ] **Step 6: Commit**

```bash
git add group.html
git commit -m "feat: add expenses tab and add-expense sheet with equal/percentage/exact splits"
```

---

## Phase 1 Complete

After all 5 tasks are done:

- Groups section visible on dashboard
- New Group creates a group and navigates to its page
- Group page shows expenses (chronological list) and members
- Invite button opens native share sheet with join link
- Joining via invite link auto-adds user to group
- Expenses can be added with equal, percentage, or exact splits
- Expense cards show payer, split method, your share

**Phase 2** (Balances + Bill Linking) is a separate plan: `docs/superpowers/plans/2026-04-27-groups-phase2.md`
