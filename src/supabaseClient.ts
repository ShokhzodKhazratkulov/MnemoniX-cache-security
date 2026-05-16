import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'undefined') {
  throw new Error('CRITICAL: VITE_SUPABASE_URL environment variable is not set.');
}
if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  throw new Error('CRITICAL: VITE_SUPABASE_ANON_KEY environment variable is not set.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-app-version': '1.0.0',
    },
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        // 30 second timeout on all Supabase calls
        signal: AbortSignal.timeout(30000),
      });
    },
  },
});
