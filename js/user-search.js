// ============================================================
// TAB — User Search
// Live name-search and phone-reverse-lookup autocomplete.
// Depends on: global `db` (Supabase, tab schema), Auth
// Usage: attachUserSearch(nameInputEl, phoneInputEl)
// ============================================================

function attachUserSearch(nameInput, phoneInput) {
  let dropdown      = null;
  let debounceTimer = null;
  let searchGen     = 0;

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function showDropdown(results, anchorEl) {
    removeDropdown();
    if (!results.length) return;

    const anchor = anchorEl.parentElement;
    anchor.style.position = 'relative';

    dropdown = document.createElement('div');
    dropdown.className = 'user-search-dropdown';

    results.forEach(u => {
      const item = document.createElement('div');
      item.className = 'user-search-item';
      item.innerHTML =
        `<div class="user-search-name">${escHtml(u.name)}</div>` +
        `<div class="user-search-phone">${escHtml(Auth.formatPhone(u.phone))}</div>`;

      item.addEventListener('mousedown', e => {
        e.preventDefault();
        nameInput.value  = u.name;
        phoneInput.value = Auth.formatPhone(u.phone);
        removeDropdown();
        phoneInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });

      dropdown.appendChild(item);
    });

    anchor.appendChild(dropdown);
  }

  async function searchByName(query) {
    const gen = ++searchGen;
    const { data, error } = await db
      .from('users')
      .select('name, phone')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(5);
    if (gen !== searchGen || error || !data) return;
    showDropdown(data, nameInput);
  }

  async function searchByPhone(raw) {
    const phone = Auth.normalizePhone(raw);
    if (!phone) return;
    const gen = ++searchGen;
    const { data, error } = await db
      .from('users')
      .select('name, phone')
      .eq('phone', phone)
      .limit(1);
    if (gen !== searchGen || error || !data?.length) return;
    // Don't show dropdown if name is already filled with the matched name
    if (nameInput.value.trim() === data[0].name) return;
    showDropdown(data, phoneInput);
  }

  // Name field: search by name
  nameInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = nameInput.value.trim();
    if (q.length < 2) { removeDropdown(); return; }
    debounceTimer = setTimeout(() => searchByName(q), 300);
  });

  // Phone field: reverse lookup by phone number
  phoneInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const digits = phoneInput.value.replace(/\D/g, '');
    if (digits.length < 10) { removeDropdown(); return; }
    debounceTimer = setTimeout(() => searchByPhone(phoneInput.value), 400);
  });

  nameInput.addEventListener('blur',  () => setTimeout(removeDropdown, 160));
  phoneInput.addEventListener('blur', () => setTimeout(removeDropdown, 160));
  nameInput.addEventListener('keydown',  e => { if (e.key === 'Escape') removeDropdown(); });
  phoneInput.addEventListener('keydown', e => { if (e.key === 'Escape') removeDropdown(); });
}
