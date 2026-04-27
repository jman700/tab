// ============================================================
// TAB — Supabase Config
// Replace the placeholder values with your project credentials.
// Found in: Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL      = 'https://fcscdimjhycxgstnzucd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JpT70OJx7BA2oiJaJf-6iQ_aCuyqG4w';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'tab' },
});
