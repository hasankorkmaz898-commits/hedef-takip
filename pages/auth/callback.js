import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    async function handleCallback() {
      // PKCE flow — URL'deki code'u session'a çevir
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      )
      if (error) {
        console.error('Auth callback error:', error)
        router.push('/')
        return
      }
      router.push('/')
    }

    // URL'de code varsa exchange et, yoksa session dinle
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
      handleCallback()
    } else {
      supabase.auth.onAuthStateChange((event, session) => {
        if (session) router.push('/')
      })
    }
  }, [router])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0e0f13', color:'#6b6f80', fontFamily:'-apple-system,sans-serif', fontSize:14 }}>
      Giriş yapılıyor...
    </div>
  )
}
