# Dashboard Tabs & User Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bills/Groups tab bar to the dashboard and live user-search autocomplete to every "add person" sheet.

**Architecture:** The dashboard HTML is restructured into two tab panes (`#tab-bills`, `#tab-groups`) toggled by a tab bar; all element IDs are preserved so existing JS continues to work. A new shared `js/user-search.js` module exposes `attachUserSearch(nameInput, phoneInput)` which queries `tab.users` as the user types and populates both fields on selection.

**Tech Stack:** Vanilla JS, HTML, CSS custom properties, Supabase JS v2 (`db` global, `tab` schema).

---

## File Map

| File | Change |
|------|--------|
| `css/style.css` | Append tab-bar + user-search CSS rules |
| `dashboard.html` | Restructure HTML into two tab panes; add tab-switching JS |
| `js/user-search.js` | **New** — `attachUserSearch()` shared module |
| `bill.html` | Add `<script src="/js/user-search.js">` tag; call `attachUserSearch` |
| `group.html` | Add `<script src="/js/user-search.js">` tag; call `attachUserSearch` |

---

## Task 1: CSS — tab bar and user-search dropdown styles

**Files:**
- Modify: `css/style.css` (append at end of Dashboard section, around line 756)

- [ ] **Step 1: Add the CSS rules**

Open `css/style.css`. Find the comment `/* ── Dashboard */` block (around line 745). Append the following after the existing dashboard rules (after line 755 `.dash-head p { … }`):

```css
/* ── Dashboard tab bar ───────────────────────────────────── */
.dash-tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}

.dash-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.dash-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ── User search dropdown ────────────────────────────────── */
.user-search-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  z-index: 200;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  overflow: hidden;
}

.user-search-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.user-search-item:last-child  { border-bottom: none; }
.user-search-item:hover       { background: var(--surface-2); }

.user-search-name  { font-size: 14px; font-weight: 500; color: var(--text); }
.user-search-phone { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
```

- [ ] **Step 2: Verify styles load without errors**

Open `dashboard.html` in a browser. Open DevTools → Console. Confirm no CSS errors. The page should look unchanged (no tab bar yet — HTML comes in Task 2).

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: add dash-tab-bar and user-search-dropdown CSS"
```

---

## Task 2: Dashboard HTML — restructure into two tab panes

**Files:**
- Modify: `dashboard.html` lines 34–104 (the `<main>` content block)

**Context:** The current `<main>` has a single `dash-head` block followed by four sections (active bills, closed bills, groups, closed groups). We wrap the bills sections in `#tab-bills` and the groups sections in `#tab-groups`, and add a tab bar above both. All existing element IDs (`active-bills`, `closed-bills`, `groups-list`, `closed-groups-list`, etc.) are kept identical so no JS changes are needed yet.

- [ ] **Step 1: Replace the `<main>` content block**

In `dashboard.html`, replace everything from line 34 (`<main class="container dash-page page" id="main">`) through line 104 (`</main>`) with:

```html
<main class="container dash-page page" id="main">

  <!-- Tab bar -->
  <div class="dash-tab-bar" id="dash-tabs">
    <button class="dash-tab active" data-tab="bills">Bills</button>
    <button class="dash-tab"        data-tab="groups">Groups</button>
  </div>

  <!-- ── Bills pane ─────────────────────────────────────── -->
  <div id="tab-bills">
    <div class="dash-head">
      <div>
        <h1>Your Bills</h1>
        <p id="dash-subtitle" class="mt-4">&nbsp;</p>
      </div>
      <button class="btn btn-primary" id="new-bill-btn" style="flex-shrink:0;">
        + New Bill
      </button>
    </div>

    <!-- Active Bills -->
    <div id="active-section">
      <div class="section-divider"><h2>Active</h2></div>
      <div id="active-bills" aria-live="polite">
        <!-- skeleton shown while loading -->
        <div class="bill-card-skeleton">
          <div class="skeleton" style="height:18px;width:55%;margin-bottom:10px;"></div>
          <div class="skeleton" style="height:13px;width:38%;margin-bottom:14px;"></div>
          <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;">
            <div class="skeleton" style="height:13px;width:30%;"></div>
            <div class="skeleton" style="height:18px;width:18%;"></div>
          </div>
        </div>
        <div class="bill-card-skeleton mt-8">
          <div class="skeleton" style="height:18px;width:45%;margin-bottom:10px;"></div>
          <div class="skeleton" style="height:13px;width:30%;margin-bottom:14px;"></div>
          <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;">
            <div class="skeleton" style="height:13px;width:25%;"></div>
            <div class="skeleton" style="height:18px;width:20%;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Closed Bills (accordion) -->
    <div id="closed-section" class="mt-24">
      <div class="section-divider">
        <h2 class="accordion-head" id="closed-accordion-head">
          Closed<span class="accordion-count" id="closed-count"></span>
          <span class="accordion-chevron" id="closed-chevron">›</span>
        </h2>
      </div>
      <div class="accordion-body" id="closed-bills"></div>
    </div>
  </div><!-- /tab-bills -->

  <!-- ── Groups pane ────────────────────────────────────── -->
  <div id="tab-groups" style="display:none;">
    <div class="dash-head">
      <h1>Groups</h1>
      <button class="btn btn-primary" id="new-group-btn" style="flex-shrink:0;">
        + New Group
      </button>
    </div>

    <div id="groups-list">
      <div class="bill-card-skeleton">
        <div class="skeleton" style="height:18px;width:45%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:13px;width:28%;"></div>
      </div>
    </div>

    <!-- Closed Groups (accordion) -->
    <div id="closed-groups-section" class="mt-24" style="display:none;">
      <div class="section-divider">
        <h2 class="accordion-head" id="closed-groups-head">
          Closed Groups<span class="accordion-count" id="closed-groups-count"></span>
          <span class="accordion-chevron" id="closed-groups-chevron">›</span>
        </h2>
      </div>
      <div class="accordion-body" id="closed-groups-list"></div>
    </div>
  </div><!-- /tab-groups -->

</main>
```

- [ ] **Step 2: Verify the page still loads**

Open `dashboard.html` in a browser. You should see the Bills tab active with your bills loaded. The Groups tab should be clickable but the tab-switching JS isn't wired yet — clicking it won't switch panes (that's fine, JS comes in Task 3).

- [ ] **Step 3: Commit**

```bash
git add dashboard.html
git commit -m "refactor: restructure dashboard into bills/groups tab panes"
```

---

## Task 3: Dashboard JS — tab switching

**Files:**
- Modify: `dashboard.html` (the `<script>` block, near the end)

**Context:** The script block ends around line 392 (`</script>`). The last lines before `</script>` are:

```js
  loadGroups();

  (async () => {
    const { data } = await db.from('users').select('is_admin').eq('phone', user.phone).single();
    if (data?.is_admin) show($('admin-link'));
  })();
```

- [ ] **Step 1: Add the tab-switching function and init**

In `dashboard.html`, find the `loadGroups();` line and insert the tab-switching code immediately after it (before the admin check):

```js
  // ── Tab switching ─────────────────────────────────────────
  function switchDashTab(tab) {
    $('tab-bills').style.display  = tab === 'bills'  ? '' : 'none';
    $('tab-groups').style.display = tab === 'groups' ? '' : 'none';
    $$('.dash-tab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tab === tab)
    );
    history.replaceState(null, '', '#' + tab);
  }

  $$('.dash-tab').forEach(btn =>
    btn.addEventListener('click', () => switchDashTab(btn.dataset.tab))
  );

  // Restore tab from URL hash on load
  const initialTab = ['bills', 'groups'].includes(location.hash.slice(1))
    ? location.hash.slice(1) : 'bills';
  switchDashTab(initialTab);
```

- [ ] **Step 2: Verify tab switching works**

Open `dashboard.html`. Confirm:
- Bills tab is active by default, bills are visible
- Clicking Groups tab shows groups list, hides bills
- Clicking Bills tab restores bills
- Navigate to `dashboard.html#groups` directly — Groups tab should be pre-selected
- "+ New Bill" button opens the new-bill flow (navigates to `/setup.html`)
- "+ New Group" button opens the New Group sheet

- [ ] **Step 3: Commit**

```bash
git add dashboard.html
git commit -m "feat: add bills/groups tab bar to dashboard with hash-based routing"
```

---

## Task 4: Create `js/user-search.js`

**Files:**
- Create: `js/user-search.js`

- [ ] **Step 1: Create the file**

Create `js/user-search.js` with this exact content:

```js
// ============================================================
// TAB — User Search
// Live name-search autocomplete for any name+phone input pair.
// Depends on: global `db` (Supabase, tab schema), Auth.formatPhone
// Usage: attachUserSearch(nameInputEl, phoneInputEl)
// ============================================================

function attachUserSearch(nameInput, phoneInput) {
  let dropdown     = null;
  let debounceTimer = null;

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function showDropdown(results) {
    removeDropdown();
    if (!results.length) return;

    // Anchor dropdown to the name input's parent (needs position:relative)
    const anchor = nameInput.parentElement;
    anchor.style.position = 'relative';

    dropdown = document.createElement('div');
    dropdown.className = 'user-search-dropdown';

    results.forEach(u => {
      const item = document.createElement('div');
      item.className = 'user-search-item';
      item.innerHTML =
        `<div class="user-search-name">${escHtml(u.name)}</div>` +
        `<div class="user-search-phone">${escHtml(Auth.formatPhone(u.phone))}</div>`;

      // mousedown fires before blur, so the click registers before the
      // name input loses focus and the dropdown would otherwise close.
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        nameInput.value  = u.name;
        phoneInput.value = Auth.formatPhone(u.phone);
        removeDropdown();
        // Trigger the phone formatter if one is attached
        phoneInput.dispatchEvent(new Event('input'));
      });

      dropdown.appendChild(item);
    });

    anchor.appendChild(dropdown);
  }

  async function search(query) {
    const { data, error } = await db
      .from('users')
      .select('name, phone')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(5);
    if (error || !data) return;
    showDropdown(data);
  }

  nameInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = nameInput.value.trim();
    if (q.length < 2) { removeDropdown(); return; }
    debounceTimer = setTimeout(() => search(q), 300);
  });

  // Delay on blur so mousedown on a result fires first
  nameInput.addEventListener('blur', () => setTimeout(removeDropdown, 160));

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { removeDropdown(); }
  });
}
```

- [ ] **Step 2: Verify the file is syntactically valid**

Open DevTools console and paste this to check for parse errors:

```js
fetch('/js/user-search.js').then(r => r.text()).then(code => {
  new Function(code);
  console.log('user-search.js: syntax OK');
}).catch(e => console.error('user-search.js error:', e));
```

Expected output: `user-search.js: syntax OK`

- [ ] **Step 3: Commit**

```bash
git add js/user-search.js
git commit -m "feat: add user-search.js autocomplete module"
```

---

## Task 5: Wire user search into `bill.html`

**Files:**
- Modify: `bill.html`

**Context:** The Add Guests sheet has `id="new-guest-name"` (text input) and `id="new-guest-phone"` (tel input) at lines 183–184. The script tags are at lines 197–200. The phone formatter is wired at line 706:
```js
$('new-guest-phone').addEventListener('keydown', e => { if (e.key === 'Enter') addOnePending(); });
```
There is no `input` event formatter on the phone field in bill.html (unlike group.html). The `attachUserSearch` call fires `phoneInput.dispatchEvent(new Event('input'))` after autofill, which is safe to dispatch even with no listeners.

- [ ] **Step 1: Add the script tag**

In `bill.html`, find the four script tags (lines 197–200):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
```

Add `user-search.js` after `utils.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/user-search.js"></script>
```

- [ ] **Step 2: Call `attachUserSearch`**

In `bill.html`, find the add-guest event listeners block. It starts around line 698:

```js
  $('add-guest-btn').addEventListener('click',   openAddGuestSheet);
  $('close-add-guest-btn').addEventListener('click',  () => closeSheet('add-guest-backdrop', 'add-guest-sheet'));
```

Add the `attachUserSearch` call immediately after the existing guest-field keyboard listeners (after the line `$('new-guest-phone').addEventListener('keydown', ...)`):

```js
  // User search autocomplete for Add Guests sheet
  attachUserSearch($('new-guest-name'), $('new-guest-phone'));
```

- [ ] **Step 3: Verify search works in bill.html**

Open any active bill page. Click "Add Guests". In the Name field, type at least 2 characters of a known user's name (a user who has logged into TAB before).

Expected: a dropdown appears below the name field with matching users. Click a result — both name and phone fill in. The dropdown closes.

Also verify: typing fewer than 2 characters shows no dropdown. Pressing Escape closes the dropdown. Clicking away closes it.

- [ ] **Step 4: Commit**

```bash
git add bill.html
git commit -m "feat: wire user search autocomplete into bill.html add-guest sheet"
```

---

## Task 6: Wire user search into `group.html`

**Files:**
- Modify: `group.html`

**Context:** The Add Member sheet has `id="member-name-input"` and `id="member-phone-input"`. The script tags are near line 192–196. The phone formatter is already wired via `$('member-phone-input').addEventListener('input', e => { e.target.value = Auth.formatPhone(e.target.value); })` (the `input` event on that field will reformat on autofill since `attachUserSearch` dispatches an `input` event after filling the phone).

- [ ] **Step 1: Add the script tag**

In `group.html`, find the script tags (lines 192–196):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/groups.js"></script>
<script src="/js/balance.js"></script>
```

Add `user-search.js` after `utils.js` and before `groups.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/user-search.js"></script>
<script src="/js/groups.js"></script>
<script src="/js/balance.js"></script>
```

- [ ] **Step 2: Call `attachUserSearch`**

In `group.html`, find the Add Member sheet event wiring block (around line 830):

```js
  $('add-member-btn').addEventListener('click', () => {
    $('member-name-input').value  = '';
    $('member-phone-input').value = '';
    openSheet('add-member-backdrop', 'add-member-sheet');
    setTimeout(() => $('member-name-input').focus(), 320);
  });
```

Add the `attachUserSearch` call immediately after the `$('member-phone-input').addEventListener('input', ...)` line:

```js
  // User search autocomplete for Add Member sheet
  attachUserSearch($('member-name-input'), $('member-phone-input'));
```

- [ ] **Step 3: Verify search works in group.html**

Open any group page. Switch to the Members tab. Click "+ Add Member". In the Name field, type 2+ characters of a known user's name.

Expected: dropdown appears, click a result fills both name (formatted) and phone (formatted as `(555) 555-5555`). The `input` event fires on the phone field so `Auth.formatPhone` reformats it correctly.

Also verify: the Add to Group button still works normally for manual entries (no search result selected).

- [ ] **Step 4: Commit**

```bash
git add group.html
git commit -m "feat: wire user search autocomplete into group.html add-member sheet"
```

---

## Final verification checklist

- [ ] `dashboard.html` — Bills tab shows bills, Groups tab shows groups, URL hash updates on switch, direct link to `#groups` opens on that tab
- [ ] `dashboard.html` — "+ New Bill" and "+ New Group" buttons both work from their respective tabs
- [ ] `dashboard.html` — Closed Bills accordion appears inside the Bills tab; Closed Groups accordion appears inside the Groups tab
- [ ] `bill.html` — Add Guests name field shows autocomplete dropdown after 2 chars; selecting fills name + phone
- [ ] `group.html` — Add Member name field shows autocomplete dropdown after 2 chars; selecting fills name + phone, phone formats correctly
- [ ] No console errors on any page
