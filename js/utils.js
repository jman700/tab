// ============================================================
// TAB — Utilities
// ============================================================

// ── Currency ────────────────────────────────────────────────
function fmt(n, currency = '') {
  const abs = Math.abs(n || 0);
  const s = abs % 1 === 0
    ? Math.round(abs).toLocaleString()
    : abs.toFixed(2).replace(/\.?0+$/, '');
  return currency ? `${currency}${s}` : `$${s}`;
}

function fmtFull(n) {
  return `$${(n || 0).toFixed(2)}`;
}

// ── Date ────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── HTML escaping ────────────────────────────────────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Initials ────────────────────────────────────────────────
function getInitials(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map(p => p[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Colors ─ consistent color per person ────────────────────
const PERSON_COLORS = [
  '#C4813A', '#5B9BD5', '#6DB87A', '#C47A5B',
  '#9B6BC4', '#5BB8C4', '#C45B8A', '#8AC45B',
];

function getPersonColor(index) {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

function getPersonColorByPhone(phone, guestList) {
  const idx = guestList.findIndex(g => g.phone === phone);
  return idx >= 0 ? getPersonColor(idx) : PERSON_COLORS[0];
}

// ── Per-person share calculation ─────────────────────────────
// Returns the total amount owed by `phone`, including tax + tip.
function getPersonShare(phone, claims, items, guests, bill) {
  const itemMap  = Object.fromEntries(items.map(i => [i.id, i]));
  const myClaims = claims.filter(c => c.guest_phone === phone);
  const seen     = new Set();
  let mySubtotal = 0;

  for (const c of myClaims) {
    const key = `${c.item_id}-${c.unit_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = itemMap[c.item_id];
    if (!item) continue;
    const unitClaims = claims.filter(x => x.item_id === c.item_id && x.unit_index === c.unit_index);
    mySubtotal += item.price / unitClaims.length;
  }

  if (mySubtotal === 0) return 0;

  const billSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shareRatio   = billSubtotal > 0 ? mySubtotal / billSubtotal : 0;
  let total = mySubtotal;

  if (!bill.tax_included && bill.tax_amount > 0) {
    total += bill.tax_amount * shareRatio;
  }

  if (bill.tip_percentage > 0) {
    const tipTotal = billSubtotal * (bill.tip_percentage / 100);
    if (bill.tip_split_type === 'proportional') {
      total += tipTotal * shareRatio;
    } else {
      // Equal split: only among guests who actually claimed something
      const activeGuests = new Set(claims.map(c => c.guest_phone)).size;
      total += tipTotal / Math.max(1, activeGuests);
    }
  }

  return total;
}

// ── Toast ───────────────────────────────────────────────────
let toastContainer;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(msg, type = '', duration = 2800) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast${type ? ` ${type}` : ''}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Clipboard ───────────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Link copied!', 'success');
    return true;
  } catch {
    showToast('Copy failed — paste manually', 'error');
    return false;
  }
}

// ── URL helpers ─────────────────────────────────────────────
function getBillIdFromUrl() {
  return window.location.pathname.split('/').filter(Boolean).pop() || null;
}

function navigateTo(path) {
  window.location.href = path;
}

// ── DOM helpers ─────────────────────────────────────────────
function $(id)    { return document.getElementById(id); }
function $$(sel)  { return [...document.querySelectorAll(sel)]; }
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// ── Sheet / overlay helpers ──────────────────────────────────
function openSheet(backdropId, sheetId) {
  const backdrop = $(backdropId);
  const sheet    = $(sheetId);
  if (!backdrop || !sheet) return;
  backdrop.style.display = 'block';
  sheet.style.display    = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      sheet.classList.add('visible');
    });
  });
}

function closeSheet(backdropId, sheetId) {
  const backdrop = $(backdropId);
  const sheet    = $(sheetId);
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('visible');
  sheet.classList.remove('visible');
  setTimeout(() => {
    backdrop.style.display = 'none';
    sheet.style.display    = 'none';
  }, 300);
}

// ── Debounce ─────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Number input guard ───────────────────────────────────────
function toNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}
