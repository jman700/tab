# Dashboard Tabs & User Search — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Split the dashboard into Bills / Groups tabs and add live user search autocomplete to every "add person" flow.

**Architecture:** Tab bar replaces the current single-scroll layout in `dashboard.html`. A new shared `js/user-search.js` module attaches autocomplete to any name+phone input pair; it is loaded on every page that has an "add person" sheet.

**Tech Stack:** Vanilla JS, Supabase JS v2 (`db` global, `tab` schema), existing CSS design system.

---

## Feature 1 — Dashboard Tab Bar

### Scope

`dashboard.html` only. No new pages.

### Behaviour

- A two-tab bar sits between the page header and main content: **Bills** | **Groups**.
- Default tab on first load: **Bills**.
- Active tab is persisted in the URL hash: `#bills` and `#groups`. On page load, read the hash and activate the matching tab (fall back to `#bills` if hash is absent or unrecognised).
- Switching tabs is instant (CSS show/hide); no data re-fetch required.
- The "+ New Bill" button lives inside the Bills tab pane. The "+ New Group" button lives inside the Groups tab pane (moves from its current position to the pane header row, matching the Bills layout with heading + button side by side).
- Closed Bills accordion stays inside the Bills pane. Closed Groups accordion stays inside the Groups pane.

### HTML Structure

```
<div id="dash-tabs" class="dash-tab-bar">
  <button class="dash-tab active" data-tab="bills">Bills</button>
  <button class="dash-tab"        data-tab="groups">Groups</button>
</div>

<div id="tab-bills">
  <!-- heading row: "Your Bills" + "+ New Bill" button -->
  <!-- active-section, closed-section (unchanged internals) -->
</div>

<div id="tab-groups" style="display:none;">
  <!-- heading row: "Groups" + "+ New Group" button -->
  <!-- groups-list, closed-groups-section (unchanged internals) -->
</div>
```

### CSS

Add to `css/style.css`:

```css
.dash-tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 20px;
}

.dash-tab {
  background: none;
  border: none;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.dash-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
```

### JS

```js
function switchDashTab(tab) {
  $('tab-bills').style.display   = tab === 'bills'  ? '' : 'none';
  $('tab-groups').style.display  = tab === 'groups' ? '' : 'none';
  $$('.dash-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  window.location.hash = tab;
}

$$('.dash-tab').forEach(btn =>
  btn.addEventListener('click', () => switchDashTab(btn.dataset.tab))
);

// Restore from hash on load
const initialTab = ['bills','groups'].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : 'bills';
switchDashTab(initialTab);
```

---

## Feature 2 — User Search Autocomplete

### Scope

New file `js/user-search.js`. Applied to:
- `bill.html` — Add Guest sheet (inputs: `#new-guest-name`, `#new-guest-phone`)
- `group.html` — Add Member sheet (inputs: `#member-name-input`, `#member-phone-input`)

`setup.html` has no manual add-guest flow (the bill creator is added automatically); it is excluded.

### Behaviour

- After the user types **2 or more characters** in the **name** field, query `tab.users` with a case-insensitive name match (debounced 300 ms).
- Show a dropdown of up to **5 results** directly below the name input. Each row shows the user's name and formatted phone number.
- Tapping a result fills both the name field and the phone field, then closes the dropdown.
- The dropdown dismisses on: result tap, Escape key, or click/tap outside.
- If fewer than 2 characters are typed, or no results are found, the dropdown is hidden (no error state shown — manual entry always works).
- The phone field is not disabled; the user can always override after autofill.

### `js/user-search.js`

```js
// ============================================================
// TAB — User Search
// Attaches live name-search autocomplete to a name+phone input pair.
// Depends on: global `db` (Supabase), Auth.formatPhone
// ============================================================

function attachUserSearch(nameInput, phoneInput) {
  let dropdown = null;
  let debounceTimer = null;

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function showDropdown(results) {
    removeDropdown();
    if (!results.length) return;

    dropdown = document.createElement('div');
    dropdown.className = 'user-search-dropdown';

    results.forEach(u => {
      const item = document.createElement('div');
      item.className = 'user-search-item';
      item.innerHTML = `
        <div class="user-search-name">${escHtml(u.name)}</div>
        <div class="user-search-phone">${escHtml(Auth.formatPhone(u.phone))}</div>
      `;
      item.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur before click
        nameInput.value  = u.name;
        phoneInput.value = Auth.formatPhone(u.phone);
        removeDropdown();
        phoneInput.dispatchEvent(new Event('input')); // trigger formatter
      });
      dropdown.appendChild(item);
    });

    // Position below name input
    nameInput.parentElement.style.position = 'relative';
    nameInput.parentElement.appendChild(dropdown);
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

  nameInput.addEventListener('blur', () => {
    // Delay so mousedown on a result fires first
    setTimeout(removeDropdown, 150);
  });

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') removeDropdown();
  });
}
```

### CSS (add to `css/style.css`)

```css
.user-search-dropdown {
  position: absolute;
  left: 0; right: 0;
  top: calc(100% + 2px);
  z-index: 200;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  overflow: hidden;
}

.user-search-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.user-search-item:last-child { border-bottom: none; }

.user-search-item:hover,
.user-search-item:active { background: var(--surface-3, var(--surface-2)); filter: brightness(1.12); }

.user-search-name  { font-size: 14px; font-weight: 500; color: var(--text-1); }
.user-search-phone { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
```

### Script tag load order (each page)

```html
<script src="/js/config.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/user-search.js"></script>  <!-- new -->
```

### Wiring per page

**bill.html** — after the script block initialises the Add Guest sheet:
```js
attachUserSearch($('new-guest-name'), $('new-guest-phone'));
```

**group.html** — Add Member sheet:
```js
attachUserSearch($('member-name-input'), $('member-phone-input'));
```

---

## Files Changed

| File | Change |
|------|--------|
| `dashboard.html` | Add tab bar HTML + JS; wrap bill sections in `#tab-bills`, groups sections in `#tab-groups`; move "+ New Group" button into pane header |
| `css/style.css` | Add `.dash-tab-bar`, `.dash-tab`, `.dash-tab.active`, `.user-search-dropdown`, `.user-search-item`, `.user-search-name`, `.user-search-phone` |
| `js/user-search.js` | New file — `attachUserSearch()` |
| `bill.html` | Add `user-search.js` script tag; call `attachUserSearch($('new-guest-name'), $('new-guest-phone'))` |
| `group.html` | Add `user-search.js` script tag; call `attachUserSearch` |

## Out of Scope

- No fuzzy/phonetic matching — simple ILIKE `%query%` is sufficient
- No search by phone number (name-only search)
- No adding a user to `tab.users` during the add-person flow (they appear in search only after they've logged in at least once)
