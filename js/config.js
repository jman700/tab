// ============================================================
// TAB — Supabase Config
// Replace the placeholder values with your project credentials.
// Found in: Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'tab' },
});
