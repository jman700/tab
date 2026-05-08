// ============================================================
// TAB — Utilities
// ============================================================

// ── Payment methods ──────────────────────────────────────────
const PAYMENT_METHODS_CONFIG = {
  venmo:    { label: 'Venmo',      prefix: '@', placeholder: 'username',        color: '#3D95CE' },
  cashapp:  { label: 'Cash App',   prefix: '$', placeholder: 'cashtag',         color: '#00A844' },
  paypal:   { label: 'PayPal',     prefix: '',  placeholder: 'username',         color: '#0070BA' },
  zelle:    { label: 'Zelle',      prefix: '',  placeholder: 'email or phone',   color: '#6D1ED4' },
  applepay: { label: 'Apple Cash', prefix: '',  placeholder: 'Apple ID or name', color: '#1c1c1e' },
};

// Returns a deep-link URL string, or null if the method has no deep link.
function paymentDeepLink(type, handle, usdAmt, note) {
  const h = (handle || '').trim();
  if (!h) return null;
  switch (type) {
    case 'venmo':
      return usdAmt
        ? `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(h)}&amount=${usdAmt}&note=${encodeURIComponent(note || '')}`
        : null;
    case 'cashapp': {
      const tag = h.startsWith('$') ? h : '$' + h;
      return `https://cash.app/${encodeURIComponent(tag)}${usdAmt ? '/' + usdAmt : ''}`;
    }
    case 'paypal':
      return `https://paypal.me/${encodeURIComponent(h)}${usdAmt ? '/' + usdAmt : ''}`;
    default:
      return null;
  }
}

// Returns handle formatted for display (@user, $tag, etc.).
function paymentDisplayHandle(type, handle) {
  const h = (handle || '').trim();
  if (!h) return '';
  if (type === 'venmo')   return '@' + h.replace(/^@/, '');
  if (type === 'cashapp') return h.startsWith('$') ? h : '$' + h;
  return h;
}

// Normalizes a handle for storage (strips prefix).
function paymentNormalizeHandle(type, handle) {
  const h = (handle || '').trim();
  if (type === 'venmo')   return h.replace(/^@/, '');
  if (type === 'cashapp') return h.replace(/^\$/, '');
  return h;
}

// ── Currency list ────────────────────────────────────────────
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar'          },
  { code: 'EUR', name: 'Euro'               },
  { code: 'GBP', name: 'British Pound'      },
  { code: 'MXN', name: 'Mexican Peso'       },
  { code: 'CAD', name: 'Canadian Dollar'    },
  { code: 'AUD', name: 'Australian Dollar'  },
  { code: 'JPY', name: 'Japanese Yen'       },
  { code: 'CNY', name: 'Chinese Yuan'       },
  { code: 'BRL', name: 'Brazilian Real'     },
  { code: 'INR', name: 'Indian Rupee'       },
  { code: 'KRW', name: 'Korean Won'         },
  { code: 'SGD', name: 'Singapore Dollar'   },
  { code: 'HKD', name: 'Hong Kong Dollar'   },
  { code: 'CHF', name: 'Swiss Franc'        },
  { code: 'NOK', name: 'Norwegian Krone'    },
  { code: 'SEK', name: 'Swedish Krona'      },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'AED', name: 'UAE Dirham'         },
  { code: 'THB', name: 'Thai Baht'          },
  { code: 'MYR', name: 'Malaysian Ringgit'  },
  { code: 'PHP', name: 'Philippine Peso'    },
  { code: 'IDR', name: 'Indonesian Rupiah'  },
  { code: 'COP', name: 'Colombian Peso'     },
  { code: 'CLP', name: 'Chilean Peso'       },
  { code: 'PEN', name: 'Peruvian Sol'       },
  { code: 'ARS', name: 'Argentine Peso'     },
];

function fmtCurrency(amount, code) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code || 'USD' }).format(amount || 0);
  } catch {
    return `${code} ${(amount || 0).toFixed(2)}`;
  }
}

const _rateCache = {};
async function getExchangeRate(from, to) {
  if (!from || from === to) return 1;
  const key = `${from}_${to}`;
  if (_rateCache[key]) return _rateCache[key];
  try {
    const res  = await fetch(`/api/exchange-rate?from=${from}&to=${to}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data.rate;
    if (rate) _rateCache[key] = rate;
    return rate || null;
  } catch {
    return null;
  }
}

// ── Amount formatting ────────────────────────────────────────
function fmt(n, currency = '') {
  const abs = Math.abs(n || 0);
  const hasCents = abs % 1 !== 0;
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
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
  // DATE strings (YYYY-MM-DD) must be parsed as local, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// ── Tax helpers ───────────────────────────────────────────────
// Returns array of {label, amount} tax lines from a bill.
// Uses tax_items JSONB if present, falls back to single tax_amount.
// Returns [] when tax is included in item prices.
function getBillTaxLines(bill) {
  if (bill.tax_included) return [];
  if (Array.isArray(bill.tax_items) && bill.tax_items.length > 0) {
    return bill.tax_items.filter(t => t.amount > 0);
  }
  if (bill.tax_amount > 0) {
    return [{ label: 'Tax', amount: bill.tax_amount }];
  }
  return [];
}

function getBillTotalTax(bill) {
  return getBillTaxLines(bill).reduce((s, t) => s + t.amount, 0);
}

// ── Per-person share calculation ─────────────────────────────
// Internal: raw share for `phone` ignoring any coverage relationships.
function _rawShare(phone, claims, items, guests, bill) {
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
    const effectivePrice  = item.price - (item.discount || 0);
    const unitClaims      = claims.filter(x => x.item_id === c.item_id && x.unit_index === c.unit_index);
    const totalUnitHeads  = unitClaims.reduce((sum, x) => {
      const g = guests.find(gg => gg.phone === x.guest_phone);
      return sum + (g?.headcount || 1);
    }, 0);
    const myHeadcount     = guests.find(g => g.phone === phone)?.headcount || 1;
    mySubtotal += effectivePrice * myHeadcount / Math.max(1, totalUnitHeads);
  }

  if (mySubtotal === 0) return 0;

  const billSubtotal = items.reduce((s, i) => s + (i.price - (i.discount || 0)) * i.quantity, 0);
  const shareRatio   = billSubtotal > 0 ? mySubtotal / billSubtotal : 0;
  let total = mySubtotal;

  if (bill.discount_amount > 0) total -= bill.discount_amount * shareRatio;

  const totalTax = getBillTotalTax(bill);
  if (totalTax > 0) total += totalTax * shareRatio;

  if (bill.tip_percentage > 0) {
    const preTipBase = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const tipTotal   = preTipBase * (bill.tip_percentage / 100);
    if (bill.tip_split_type === 'proportional') {
      total += tipTotal * shareRatio;
    } else {
      const activePhones  = new Set(claims.map(c => c.guest_phone));
      const totalHeads    = guests
        .filter(g => activePhones.has(g.phone))
        .reduce((sum, g) => sum + (g.headcount || 1), 0);
      const myHeadcount   = (guests.find(g => g.phone === phone)?.headcount) || 1;
      total += (tipTotal / Math.max(1, totalHeads)) * myHeadcount;
    }
  }

  return total;
}

// Public: returns total owed by `phone`.
// Covered guests owe 0; covering guests absorb the covered guest's raw share.
function getPersonShare(phone, claims, items, guests, bill) {
  const me = guests.find(g => g.phone === phone);
  if (me?.covered_by_phone) return 0;

  let total = _rawShare(phone, claims, items, guests, bill);

  // Add shares for any guests this person is covering
  for (const g of guests) {
    if (g.covered_by_phone === phone) {
      total += _rawShare(g.phone, claims, items, guests, bill);
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

// ── Image helpers (OCR) ──────────────────────────────────────
function compressImage(file, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale   = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas  = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
