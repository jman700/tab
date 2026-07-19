// ============================================================
// TAB — Supabase Config
// Replace the placeholder values with your project credentials.
// Found in: Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL      = 'https://xittuxwilxmzzawjdivd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AxzdizEiC3FOPYdzS3lPWA_H1aH9hSV';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'tab' },
});
