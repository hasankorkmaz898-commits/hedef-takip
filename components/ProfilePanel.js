import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import ChatPanel from './ChatPanel'

const css = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(5,6,10,0.88)',
    backdropFilter: 'blur(6px)', zIndex: 300,
  },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 380,
    background: 'var(--surface)', borderLeft: '1.5px solid var(--border)',
    zIndex: 301, display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  header: {
    padding: '20px 20px 16px', borderBottom: '1.5px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: 800, color: 'var(--text)' },
  closeBtn: {
    width: 34, height: 34, background: 'var(--surface2)', border: '1.5px solid var(--border)',
    borderRadius: 12, color: 'var(--text2)', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 15,
  },
  section: { padding: '16px 20px', borderBottom: '1.5px solid var(--border)' },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: 12,
  },
  avatar: {
    width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  codeBox: {
    background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 16,
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  input: {
    width: '100%', background: 'var(--bg)', border: '1.5px solid var(--border)',
    borderRadius: 14, padding: '11px 14px', color: 'var(--text)',
    fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit',
  },
  btn: (variant = 'primary') => ({
    padding: '11px 16px', borderRadius: 14, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    background: variant === 'primary' ? 'var(--accent)' : 'var(--surface2)',
    border: variant === 'primary' ? 'none' : '1.5px solid var(--border)',
    color: variant === 'primary' ? '#fff' : 'var(--text2)',
  }),
  friendItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
    borderBottom: '1.5px solid var(--border)',
  },
  miniAvatar: {
    width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
}

// Arşiv hedef detay ekranı
function ArchiveDetail({ goal, tasks, logs, onBack, onUnarchive }) {
  const totalLogs = logs.length
  const goodLogs  = logs.filter(l => l.quality === 'good').length
  const midLogs   = logs.filter(l => l.quality === 'mid').length
  const badLogs   = logs.filter(l => l.quality === 'bad').length
  const qs = totalLogs ? Math.round((goodLogs*100 + midLogs*60 + badLogs*30) / totalLogs) : 0
  const elapsed = Math.max(0, Math.floor((new Date() - new Date(goal.start_date)) / 86400000))

  // Seri
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0,10)
    if (ds < goal.start_date) break
    const dayLogs = logs.filter(l => l.log_date === ds)
    const act = tasks.filter(t => !t.active_days?.length || t.active_days.includes(d.getDay()))
    if (!act.length) continue
    const sc = act.length ? dayLogs.length / act.length : 0
    const todayDs = new Date().toISOString().slice(0,10)
    if (ds === todayDs && sc === 0 && !dayLogs.length) continue
    if (sc >= 0.5) streak++; else break
  }

  // Son 30 gün
  const last30 = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0,10)
    if (ds < goal.start_date) continue
    const dayLogs = logs.filter(l => l.log_date === ds)
    const act = tasks.filter(t => !t.active_days?.length || t.active_days.includes(d.getDay()))
    if (!act.length) continue
    last30.push({ ds, sc: act.length ? dayLogs.length / act.length : 0 })
  }

  const completionPct = tasks.length && elapsed
    ? Math.min(100, Math.round(totalLogs / (tasks.length * elapsed) * 100))
    : 0

  return (
    <div>
      <button onClick={onBack} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', padding:'0 0 12px', display:'flex', alignItems:'center', gap:5 }}>
        ← Arşiv Listesi
      </button>

      <div style={{ background:'var(--surface2)', borderRadius:16, padding:14, marginBottom:12 }}>
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:4 }}>{goal.name}</div>
        <div style={{ fontSize:11, color:'var(--text3)' }}>{goal.total_days} günlük hedef · {elapsed} gün takip edildi</div>
      </div>

      {/* İstatistikler */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
        {[
          { label:'Tamamlama', val:`${completionPct}%`, color:'var(--accent)' },
          { label:'Kalite',    val:`${qs}%`, color:qs>=70?'var(--good)':qs>=40?'var(--mid)':'var(--bad)' },
          { label:'Seri',      val:`${streak}🔥`, color:'var(--fire)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--surface2)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Kalite dağılımı */}
      <div style={{ background:'var(--surface2)', borderRadius:14, padding:12, marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Kalite Dağılımı</div>
        <div style={{ display:'flex', gap:10, fontSize:12, marginBottom:8 }}>
          <span style={{ color:'var(--good)' }}>✓ İyi: {goodLogs}</span>
          <span style={{ color:'var(--mid)' }}>− Orta: {midLogs}</span>
          <span style={{ color:'var(--bad)' }}>✕ Kötü: {badLogs}</span>
        </div>
        {totalLogs > 0 && (
          <div style={{ display:'flex', height:8, borderRadius:99, overflow:'hidden', gap:2 }}>
            {goodLogs > 0 && <div style={{ flex:goodLogs, background:'var(--good)', opacity:.8 }}/>}
            {midLogs  > 0 && <div style={{ flex:midLogs,  background:'var(--mid)',  opacity:.8 }}/>}
            {badLogs  > 0 && <div style={{ flex:badLogs,  background:'var(--bad)',  opacity:.8 }}/>}
          </div>
        )}
      </div>

      {/* Son 30 gün */}
      {last30.length > 0 && (
        <div style={{ background:'var(--surface2)', borderRadius:14, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Son 30 Gün Performansı</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:48 }}>
            {last30.map((d,i) => (
              <div key={i} style={{ flex:1, height:`${Math.max(d.sc*100,5)}%`, background:d.sc>=0.7?'var(--good)':d.sc>=0.4?'var(--mid)':'var(--bad)', borderRadius:3, opacity:.8 }} title={d.ds}/>
            ))}
          </div>
        </div>
      )}

      {/* Görevler */}
      <div style={{ background:'var(--surface2)', borderRadius:14, padding:12, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Görevler ({tasks.length})</div>
        {tasks.map(t => {
          const tLogs = logs.filter(l => l.task_id === t.id)
          const tQs = tLogs.length ? Math.round(tLogs.reduce((s,l) => s + (l.quality==='good'?100:l.quality==='mid'?60:30), 0) / tLogs.length) : 0
          return (
            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ flex:1, fontSize:13, color:'var(--text2)' }}>{t.name}</div>
              <span style={{ fontSize:11, color:tQs>=70?'var(--good)':tQs>=40?'var(--mid)':'var(--text3)', fontWeight:600 }}>{tLogs.length} log · {tQs}%</span>
            </div>
          )
        })}
      </div>

      {/* Arşivden çıkar */}
      <button
        onClick={() => { onUnarchive && onUnarchive(goal.id); onBack() }}
        style={{ width:'100%', padding:'12px', background:'rgba(74,222,128,0.1)', border:'1.5px solid rgba(74,222,128,0.3)', borderRadius:14, color:'var(--good)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
      >
        ✅ Arşivden Çıkar — Ana Listeye Taşı
      </button>
    </div>
  )
}

export default function ProfilePanel({ user, onClose, onOpenSharedGoal, onSignOut, archivedGoals=[], archivedTasks={}, archivedLogs={}, onUnarchive }) {
  const [profile,      setProfile]      = useState(null)
  const [chatFriend,   setChatFriend]   = useState(null)
  const [friends,      setFriends]      = useState([])
  const [pending,      setPending]      = useState([])
  const [sent,         setSent]         = useState([])
  const [searchCode,   setSearchCode]   = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching,    setSearching]    = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [tab,          setTab]          = useState('friends')
  const [archiveTab,   setArchiveTab]   = useState(null)
  const supabase = createClient()

  useEffect(() => { loadAll() }, [user])

  async function loadAll() {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!p) {
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

    const { data: fs } = await supabase.from('friendships').select(`
      id, status, requester_id, receiver_id,
      requester:profiles!friendships_requester_id_fkey(id, display_name, avatar_url, user_code),
      receiver:profiles!friendships_receiver_id_fkey(id, display_name, avatar_url, user_code)
    `).or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)

    if (fs) {
      const accepted = fs.filter(f => f.status === 'accepted').map(f =>
        f.requester_id === user.id ? f.receiver : f.requester
      )
      setFriends(accepted)
      setPending(fs.filter(f => f.status === 'pending' && f.receiver_id === user.id))
      setSent(fs.filter(f => f.status === 'pending' && f.requester_id === user.id))
    }
  }

  async function searchByCode() {
    if (!searchCode.trim()) return
    setSearching(true); setSearchResult(null)
    const code = searchCode.trim().toUpperCase()
    const { data } = await supabase.from('profiles').select('*').eq('user_code', code).single()
    if (!data || data.id === user.id) setSearchResult('not_found')
    else {
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e6f0', marginBottom: 3 }}>{profile?.display_name || 'Kullanıcı'}</div>
            <div style={{ fontSize: 12, color: '#5c6475', marginBottom: 8 }}>{user.email}</div>
            <button
              onClick={() => { onClose(); onSignOut() }}
              style={{ padding:'5px 12px', background:'transparent', border:'1.5px solid #3a4050', borderRadius:8, color:'#f87171', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}
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
              <div style={{ fontSize: 22, fontWeight: 700, color: '#7c6ff7', letterSpacing: 3 }}>
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
            <div style={{ marginTop: 10, background: '#111318', border: '1.5px solid #2e3340', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={css.miniAvatar}>{initials(searchResult.display_name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e6f0' }}>{searchResult.display_name}</div>
                <div style={{ fontSize: 11, color: '#5c6475' }}>{searchResult.user_code}</div>
              </div>
              {searchResult.already
                ? <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Arkadaş</span>
                : searchResult.alreadySent
                  ? <span style={{ fontSize: 12, color: '#5c6475' }}>İstek gönderildi</span>
                  : <button onClick={() => sendRequest(searchResult.id)} style={css.btn('primary')}>İstek Gönder</button>
              }
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', margin: '0 20px 0', background: '#111318', borderRadius: 10, padding: 3 }}>
          {[
            ['friends',  `Arkadaşlar (${friends.length})`],
            ['requests', `İstekler${pending.length > 0 ? ` (${pending.length})` : ''}`],
            ['archive',  `📦 Arşiv${archivedGoals.length > 0 ? ` (${archivedGoals.length})` : ''}`],
          ].map(([t, l]) => (
            <button key={t} onClick={() => { setTab(t); setArchiveTab(null) }} style={{
              flex: 1, padding: '8px 4px', background: tab === t ? '#1c1f26' : 'transparent',
              border: 'none', borderRadius: 8, color: tab === t ? '#e2e6f0' : '#5c6475',
              fontSize: 11, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
            }}>{l}</button>
          ))}
        </div>

        {/* Friends */}
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
                  <button onClick={() => setChatFriend(f)} style={{ ...css.btn('secondary'), padding: '7px 10px', fontSize: 14 }} title="Mesaj gönder">💬</button>
                  <button onClick={() => { onOpenSharedGoal(f); onClose() }} style={{ ...css.btn('primary'), padding: '7px 12px', fontSize: 12 }}>Ortak Hedef</button>
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

        {/* Archive */}
        {tab === 'archive' && (
          <div style={{ padding: '12px 20px' }}>
            {archivedGoals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#5c6475', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Arşivlenen hedef yok</div>
                <div style={{ fontSize: 11 }}>Hedef kartındaki 📦 simgesine basarak hedefleri buraya taşıyabilirsin</div>
              </div>
            ) : archiveTab ? (
              <ArchiveDetail
                goal={archivedGoals.find(g => g.id === archiveTab)}
                tasks={archivedTasks[archiveTab] || []}
                logs={archivedLogs[archiveTab] || []}
                onBack={() => setArchiveTab(null)}
                onUnarchive={onUnarchive}
              />
            ) : (
              archivedGoals.map(goal => {
                const goalLogs = archivedLogs[goal.id] || []
                const elapsed  = Math.max(0, Math.floor((new Date() - new Date(goal.start_date)) / 86400000))
                const qs = goalLogs.length ? Math.round(goalLogs.reduce((s,l) => s + (l.quality==='good'?100:l.quality==='mid'?60:30), 0) / goalLogs.length) : 0
                return (
                  <div key={goal.id} onClick={() => setArchiveTab(goal.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0', borderBottom:'1.5px solid var(--border)', cursor:'pointer' }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📦</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{goal.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{elapsed} gün · {goalLogs.length} log · Kalite {qs}%</div>
                    </div>
                    <span style={{ color:'var(--text3)', fontSize:16, flexShrink:0 }}>›</span>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {chatFriend && <ChatPanel user={user} friend={chatFriend} onClose={() => setChatFriend(null)} />}
    </>
  )
}
