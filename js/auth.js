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
    return phone.replace(/\D/g, '');
  }

  function formatPhone(phone) {
    const d = normalizePhone(phone);
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return phone;
  }

  return { getUser, setUser, getFingerprint, logout, requireAuth, normalizePhone, formatPhone };

})();
