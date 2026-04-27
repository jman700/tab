// ============================================================
// TAB — Auth
// Manages user identity via localStorage + device fingerprint.
// No server-side auth — identity is phone number based.
// ============================================================

const Auth = (() => {

  const USER_KEY = 'tab_user';
  const FP_KEY   = 'tab_fingerprint';

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setUser(name, phone) {
    const user = {
      name:        name.trim(),
      phone:       normalizePhone(phone),
      fingerprint: getFingerprint(),
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  function getFingerprint() {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      fp = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  }

  function logout() {
    localStorage.removeItem(USER_KEY);
  }

  function requireAuth() {
    const user = getUser();
    if (!user) {
      window.location.href = '/';
      return null;
    }
    return user;
  }

  function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    // Strip US country code (+1) inserted by iOS autocomplete.
    if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
    return digits;
  }

  function formatPhone(phone) {
    const d = normalizePhone(phone);
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return phone;
  }

  function updateLocalUser(fields) {
    const user = getUser();
    if (!user) return null;
    const updated = { ...user, ...fields };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    return updated;
  }

  return { getUser, setUser, updateLocalUser, getFingerprint, logout, requireAuth, normalizePhone, formatPhone };

})();
