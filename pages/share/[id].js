import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

const DOW_TR = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']

export default function SharePage() {
  const [template, setTemplate] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [user,     setUser]     = useState(null)
  const [error,    setError]    = useState(null)
  const supabase = createClient()

  useEffect(() => {
    const id = window.location.pathname.split('/share/')[1]
    if (id) loadTemplate(id)
    checkUser()
  }, [])

  async function checkUser() {
    const { data:{ user } } = await supabase.auth.getUser()
    setUser(user)
  }

  async function loadTemplate(id) {
    const { data, error } = await supabase
      .from('shared_templates')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) { setError('Şablon bulunamadı veya silinmiş.'); setLoading(false); return }
    // görüntülenme sayısını artır
    await supabase.from('shared_templates').update({ view_count: (data.view_count||0)+1 }).eq('id', id)
    setTemplate(data)
    setLoading(false)
  }

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    })
  }

  async function saveToMyAccount() {
    if (!user) { signIn(); return }
    setSaving(true)
    try {
      // Hedefi oluştur
      const { data:g } = await supabase.from('goals').insert({
        name: template.goal_name,
        total_days: template.total_days,
        start_date: new Date().toISOString().slice(0,10),
        user_id: user.id
      }).select().single()

      if (!g) throw new Error('Hedef oluşturulamadı')

      // Görevleri ekle
      const tasks = template.tasks || []
      if (tasks.length) {
        await supabase.from('tasks').insert(
          tasks.map((t,i) => ({
            goal_id: g.id,
            name: t.name,
            order_index: i,
            active_days: t.active_days || []
          }))
        )
      }

      // Kullanım sayısını artır
      await supabase.from('shared_templates').update({
        save_count: (template.save_count||0)+1
      }).eq('id', template.id)

      setSaved(true)
    } catch(e) {
      alert('Bir hata oluştu: ' + e.message)
    }
    setSaving(false)
  }

  const css = {
    bg:      { minHeight:'100vh', background:'#0e0f13', color:'#f0f1f5', fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif', display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
    card:    { background:'#16181f', border:'1.5px solid #2a2d38', borderRadius:24, padding:28, width:'100%', maxWidth:440 },
    label:   { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#6b6f80', marginBottom:8, display:'block' },
    task:    { background:'#1e2029', border:'1.5px solid #2a2d38', borderRadius:14, padding:'11px 14px', marginBottom:8, display:'flex', alignItems:'flex-start', gap:10 },
    btn:     { width:'100%', padding:'14px', background:'#7c6ff7', border:'none', borderRadius:14, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginTop:4 },
    btnGhost:{ width:'100%', padding:'13px', background:'transparent', border:'1.5px solid #2a2d38', borderRadius:14, color:'#b0b3c1', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginTop:8 },
  }

  if (loading) return (
    <div style={css.bg}>
      <div style={{ color:'#6b6f80', fontSize:14 }}>Yükleniyor...</div>
    </div>
  )

  if (error) return (
    <div style={css.bg}>
      <div style={{ ...css.card, textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>😕</div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Bulunamadı</div>
        <div style={{ fontSize:13, color:'#6b6f80' }}>{error}</div>
      </div>
    </div>
  )

  if (saved) return (
    <div style={css.bg}>
      <div style={{ ...css.card, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🎯</div>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Hedef eklendi!</div>
        <div style={{ fontSize:14, color:'#b0b3c1', marginBottom:24 }}>
          <b style={{ color:'#f0f1f5' }}>{template.goal_name}</b> hesabına eklendi. Hemen başlayabilirsin.
        </div>
        <button onClick={()=>window.location.href='/'} style={css.btn}>
          Uygulamaya Git →
        </button>
      </div>
    </div>
  )

  const tasks = template?.tasks || []

  return (
    <div style={css.bg}>
      <div style={css.card}>

        {/* Üst bilgi */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:13, color:'#7c6ff7', fontWeight:700, marginBottom:8 }}>
            Hedef<span style={{ color:'#a89cf7' }}>.</span>Takip
          </div>
          <div style={{ fontSize:11, color:'#6b6f80', marginBottom:16 }}>
            {template.creator_name || 'Bir kullanıcı'} bu hedefi seninle paylaştı
          </div>
        </div>

        {/* Hedef başlığı */}
        <div style={{ background:'rgba(124,111,247,0.08)', border:'1.5px solid rgba(124,111,247,0.2)', borderRadius:16, padding:'16px 18px', marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#f0f1f5', marginBottom:6 }}>{template.goal_name}</div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'#6b6f80' }}>
            <span>📅 {template.total_days} gün</span>
            <span>✓ {tasks.length} görev</span>
            {template.save_count > 0 && <span>👥 {template.save_count} kişi kullanıyor</span>}
          </div>
        </div>

        {/* Görevler */}
        <span style={css.label}>Görevler</span>
        <div style={{ marginBottom:20 }}>
          {tasks.map((t,i) => (
            <div key={i} style={css.task}>
              <div style={{ width:20, height:20, borderRadius:6, border:'2px solid #353848', flexShrink:0, marginTop:1 }} />
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:'#f0f1f5' }}>{t.name}</div>
                {t.active_days?.length > 0 && (
                  <div style={{ fontSize:11, color:'#7c6ff7', marginTop:3 }}>
                    📅 {t.active_days.map(d=>DOW_TR[d]).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Kaydet butonu */}
        {user ? (
          <button onClick={saveToMyAccount} disabled={saving} style={{ ...css.btn, opacity:saving?0.7:1 }}>
            {saving ? 'Ekleniyor...' : '🎯 Benim Hedeflerime Ekle'}
          </button>
        ) : (
          <>
            <div style={{ fontSize:12, color:'#6b6f80', textAlign:'center', marginBottom:12 }}>
              Kaydetmek için giriş yapman gerekiyor
            </div>
            <button onClick={signIn} style={css.btn}>
              Google ile Giriş Yap & Ekle
            </button>
          </>
        )}

        <button onClick={()=>window.location.href='/'} style={css.btnGhost}>
          Ana Sayfaya Dön
        </button>

      </div>
    </div>
  )
}
