import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

const css = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.7)',
    backdropFilter: 'blur(4px)', zIndex: 300,
  },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 380,
    background: '#1c1f26', borderLeft: '1px solid #2e3340',
    zIndex: 301, display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  header: {
    padding: '20px 20px 16px', borderBottom: '1px solid #2e3340',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: 600, color: '#e2e6f0' },
  closeBtn: {
    width: 32, height: 32, background: '#242830', border: '1px solid #2e3340',
    borderRadius: 8, color: '#9aa0b0', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 16,
  },
  section: { padding: '16px 20px', borderBottom: '1px solid #2e3340' },
  sectionTitle: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#5c6475', marginBottom: 12,
  },
  avatar: {
    width: 56, height: 56, borderRadius: '50%', background: '#6366f1',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  codeBox: {
    background: '#111318', border: '1px solid #2e3340', borderRadius: 12,
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  input: {
    width: '100%', background: '#111318', border: '1px solid #2e3340',
    borderRadius: 10, padding: '10px 13px', color: '#e2e6f0',
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  btn: (variant = 'primary') => ({
    padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    background: variant === 'primary' ? '#6366f1' : '#242830',
    border: variant === 'primary' ? 'none' : '1px solid #2e3340',
    color: variant === 'primary' ? '#fff' : '#9aa0b0',
  }),
  friendItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
    borderBottom: '1px solid #2e3340',
  },
  miniAvatar: {
    width: 36, height: 36, borderRadius: '50%', background: '#6366f1',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
}

export default function ProfilePanel({ user, onClose, onOpenSharedGoal, onSignOut }) {
  const [profile, setProfile] = useState(null)
  const [friends, setFriends] = useState([])
  const [pending, setPending] = useState([])  // gelen istekler
  const [sent, setSent]       = useState([])   // gönderilen istekler
  const [searchCode, setSearchCode] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('friends') // friends | requests
  const supabase = createClient()

  useEffect(() => { loadAll() }, [user])

  async function loadAll() {
    // Profile
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!p) {
      // insert profile if not exists
      await supabase.from('profiles').insert({
        id: user.id,
        display_name: user.user_metadata?.full_name || user.email,
        avatar_url: user.user_metadata?.avatar_url || null,
      })
      const { data: p2 } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p2)
    } else {
      setProfile(p)
    }

    // Friendships
    const { data: fs } = await supabase.from('friendships').select(`
      id, status, requester_id, receiver_id,
      requester:profiles!friendships_requester_id_fkey(id, display_name, avatar_url, user_code),
      receiver:profiles!friendships_receiver_id_fkey(id, display_name, avatar_url, user_code)
    `).or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)

    if (fs) {
      const accepted = fs.filter(f => f.status === 'accepted').map(f =>
        f.requester_id === user.id ? f.receiver : f.requester
      )
      const incomingPending = fs.filter(f => f.status === 'pending' && f.receiver_id === user.id)
      const outgoingPending = fs.filter(f => f.status === 'pending' && f.requester_id === user.id)
      setFriends(accepted)
      setPending(incomingPending)
      setSent(outgoingPending)
    }
  }

  async function searchByCode() {
    if (!searchCode.trim()) return
    setSearching(true); setSearchResult(null)
    const code = searchCode.trim().toUpperCase()
    const { data } = await supabase.from('profiles').select('*').eq('user_code', code).single()
    if (!data || data.id === user.id) setSearchResult('not_found')
    else {
      // already friends?
      const already = friends.find(f => f.id === data.id)
      const alreadySent = sent.find(s => s.receiver_id === data.id)
      setSearchResult({ ...data, already: !!already, alreadySent: !!alreadySent })
    }
    setSearching(false)
  }

  async function sendRequest(receiverId) {
    await supabase.from('friendships').insert({ requester_id: user.id, receiver_id: receiverId })
    setSearchResult(null); setSearchCode(''); await loadAll()
  }

  async function respondRequest(friendshipId, accept) {
    await supabase.from('friendships').update({ status: accept ? 'accepted' : 'rejected' }).eq('id', friendshipId)
    await loadAll()
  }

  async function removeFriend(friendId) {
    if (!confirm('Arkadaşlıktan çıkarılsın mı?')) return
    await supabase.from('friendships').delete()
      .or(`and(requester_id.eq.${user.id},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${user.id})`)
    await loadAll()
  }

  function copyCode() {
    if (!profile?.user_code) return
    navigator.clipboard.writeText(profile.user_code).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const initials = (name) => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div style={css.overlay} onClick={onClose} />
      <div style={css.panel}>
        {/* Header */}
        <div style={css.header}>
          <div style={css.title}>Profil</div>
          <button style={css.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* User info */}
        <div style={{ ...css.section, display: 'flex', gap: 14, alignItems: 'center' }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ ...css.avatar, objectFit: 'cover' }} />
            : <div style={css.avatar}>{initials(profile?.display_name)}</div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e6f0', marginBottom: 3 }}>{profile?.display_name || 'Kullanıcı'}</div>
            <div style={{ fontSize: 12, color: '#5c6475', marginBottom: 8 }}>{user.email}</div>
            <button
              onClick={() => { onClose(); onSignOut() }}
              style={{ padding:'5px 12px', background:'transparent', border:'1px solid #3a4050', borderRadius:8, color:'#f87171', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}
            >
              ↩ Hesaptan Çık
            </button>
          </div>
        </div>

        {/* Kimlik kodu */}
        <div style={css.section}>
          <div style={css.sectionTitle}>Kimlik Kodun</div>
          <div style={css.codeBox}>
            <div>
              <div style={{ fontSize: 11, color: '#5c6475', marginBottom: 4 }}>Bu kodu arkadaşlarınla paylaş</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1', letterSpacing: 3 }}>
                {profile?.user_code || '------'}
              </div>
            </div>
            <button onClick={copyCode} style={{ ...css.btn('secondary'), padding: '8px 14px' }}>
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>

        {/* Arkadaş ara */}
        <div style={css.section}>
          <div style={css.sectionTitle}>Arkadaş Ekle</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={css.input}
              placeholder="Kimlik kodu (örn: AB12CD)"
              value={searchCode}
              onChange={e => { setSearchCode(e.target.value.toUpperCase()); setSearchResult(null) }}
              onKeyDown={e => e.key === 'Enter' && searchByCode()}
              maxLength={6}
            />
            <button onClick={searchByCode} style={{ ...css.btn('primary'), whiteSpace: 'nowrap' }}>
              {searching ? '...' : 'Ara'}
            </button>
          </div>

          {searchResult === 'not_found' && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#f87171' }}>Kullanıcı bulunamadı</div>
          )}
          {searchResult && searchResult !== 'not_found' && (
            <div style={{ marginTop: 10, background: '#111318', border: '1px solid #2e3340', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={css.miniAvatar}>{initials(searchResult.display_name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e6f0' }}>{searchResult.display_name}</div>
                <div style={{ fontSize: 11, color: '#5c6475' }}>{searchResult.user_code}</div>
              </div>
              {searchResult.already
                ? <span style={{ fontSize: 12, color: '#34d399' }}>✓ Arkadaş</span>
                : searchResult.alreadySent
                  ? <span style={{ fontSize: 12, color: '#5c6475' }}>İstek gönderildi</span>
                  : <button onClick={() => sendRequest(searchResult.id)} style={css.btn('primary')}>İstek Gönder</button>
              }
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', margin: '0 20px 0', background: '#111318', borderRadius: 10, padding: 3 }}>
          {[['friends', `Arkadaşlar (${friends.length})`], ['requests', `İstekler ${pending.length > 0 ? `(${pending.length})` : ''}`]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px', background: tab === t ? '#1c1f26' : 'transparent',
              border: 'none', borderRadius: 8, color: tab === t ? '#e2e6f0' : '#5c6475',
              fontSize: 12, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
            }}>{l}</button>
          ))}
        </div>

        {/* Friends list */}
        {tab === 'friends' && (
          <div style={{ padding: '12px 20px' }}>
            {friends.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#5c6475', fontSize: 13 }}>Henüz arkadaş yok</div>
              : friends.map(f => (
                <div key={f.id} style={css.friendItem}>
                  <div style={css.miniAvatar}>{initials(f.display_name)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e6f0' }}>{f.display_name}</div>
                    <div style={{ fontSize: 11, color: '#5c6475' }}>{f.user_code}</div>
                  </div>
                  <button
                    onClick={() => { onOpenSharedGoal(f); onClose() }}
                    style={{ ...css.btn('primary'), padding: '7px 12px', fontSize: 12 }}
                  >Ortak Hedef</button>
                  <button onClick={() => removeFriend(f.id)} style={{ ...css.btn('secondary'), padding: '7px 10px', fontSize: 12, color: '#f87171' }}>✕</button>
                </div>
              ))
            }
          </div>
        )}

        {/* Requests */}
        {tab === 'requests' && (
          <div style={{ padding: '12px 20px' }}>
            {pending.length === 0 && sent.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#5c6475', fontSize: 13 }}>Bekleyen istek yok</div>
              : null
            }
            {pending.length > 0 && (
              <>
                <div style={{ ...css.sectionTitle, marginBottom: 8 }}>Gelen İstekler</div>
                {pending.map(f => (
                  <div key={f.id} style={css.friendItem}>
                    <div style={css.miniAvatar}>{initials(f.requester?.display_name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e6f0' }}>{f.requester?.display_name}</div>
                      <div style={{ fontSize: 11, color: '#5c6475' }}>{f.requester?.user_code}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => respondRequest(f.id, true)} style={{ ...css.btn('primary'), padding: '7px 12px', fontSize: 12 }}>Kabul</button>
                      <button onClick={() => respondRequest(f.id, false)} style={{ ...css.btn('secondary'), padding: '7px 10px', fontSize: 12, color: '#f87171' }}>Reddet</button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {sent.length > 0 && (
              <>
                <div style={{ ...css.sectionTitle, marginTop: 16, marginBottom: 8 }}>Gönderilen İstekler</div>
                {sent.map(f => (
                  <div key={f.id} style={css.friendItem}>
                    <div style={css.miniAvatar}>{initials(f.receiver?.display_name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e6f0' }}>{f.receiver?.display_name}</div>
                      <div style={{ fontSize: 11, color: '#5c6475' }}>{f.receiver?.user_code}</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#5c6475' }}>Bekliyor...</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
