import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let _client = null

export function createClient() {
  if (_client) return _client

  _client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession:     true,
        storageKey:         'hedef-takip-auth',
        autoRefreshToken:   true,
        detectSessionInUrl: true,
        flowType:           'pkce',
      },
    }
  )

  return _client
}
