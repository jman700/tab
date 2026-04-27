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
