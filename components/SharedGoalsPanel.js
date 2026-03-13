import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

const Q = { good: 1.0, mid: 0.6, bad: 0.3 }
const QSym = { good: '✓', mid: '−', bad: '✕' }
const QL = { good: 'İyi', mid: 'Orta', bad: 'Kötü' }

const toDate = d => d.toISOString().slice(0,10)
const todayStr = () => toDate(new Date())
const addDays = (ds, n) => { const d = new Date(ds); d.setDate(d.getDate()+n); return toDate(d) }
const elapsed = s => Math.max(0, Math.floor((new Date()-new Date(s))/86400000))
const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']
const DAYS2 = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']

function dayScore(tasks, logs, ds, userId) {
  if (!tasks.length) return 0
  const dl = logs.filter(l => l.log_date === ds && l.user_id === userId)
  return tasks.reduce((s,t) => { const l = dl.find(x=>x.task_id===t.id); return s+(l?Q[l.quality]:0) }, 0) / tasks.length
}
function overallScore(tasks, logs, startDate, totalDays, userId) {
  const e = elapsed(startDate); if (!e) return 0
  let sum = 0
  for (let i=0;i<e;i++) sum += dayScore(tasks, logs, addDays(startDate,i), userId)
  return sum / totalDays
}

const css = {
  overlay: { position:'fixed', inset:0, background:'rgba(10,12,18,0.7)', backdropFilter:'blur(4px)', zIndex:300 },
  panel: { position:'fixed', inset:0, background:'#111318', zIndex:301, overflowY:'auto', maxWidth:480, margin:'0 auto' },
  header: { padding:'16px 20px', borderBottom:'1px solid #2e3340', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, background:'#111318', zIndex:1 },
  card: { background:'#1c1f26', border:'1px solid #2e3340', borderRadius:16, padding:18, marginBottom:14 },
  sectionTitle: { fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'#5c6475', marginBottom:10 },
  input: { width:'100%', background:'#111318', border:'1px solid #2e3340', borderRadius:10, padding:'10px 13px', color:'#e2e6f0', fontSize:14, outline:'none', fontFamily:'inherit' },
  btn: (v='primary') => ({ padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', background:v==='primary'?'#6366f1':'#242830', border:v==='primary'?'none':'1px solid #2e3340', color:v==='primary'?'#fff':'#9aa0b0' }),
}

export default function SharedGoalsPanel({ user, initialFriend, onClose }) {
  const [goals,          setGoals]         = useState([])
  const [tasks,          setTasks]         = useState({})
  const [logs,           setLogs]          = useState({})
  const [members,        setMembers]       = useState({})
  const [profiles,       setProfiles]      = useState({})
  const [showCreate,     setShowCreate]    = useState(!!initialFriend)
  const [friends,        setFriends]       = useState([])
  const [selectedFriend, setSelectedFriend]= useState(initialFriend)
  const [newName,        setNewName]       = useState('')
  const [newDays,        setNewDays]       = useState('')
  const [newTasks,       setNewTasks]      = useState([''])
  const [goalTabs,       setGoalTabs]      = useState({})
  const supabase = createClient()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    // 1. Arkadaşları her zaman yükle
    const { data: fs } = await supabase.from('friendships').select(`
      id, requester_id, receiver_id, status,
      requester:profiles!friendships_requester_id_fkey(id,display_name,user_code),
      receiver:profiles!friendships_receiver_id_fkey(id,display_name,user_code)
    `).eq('status','accepted').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
    if (fs) setFriends(fs.map(f => f.requester_id === user.id ? f.receiver : f.requester))

    // 2. Ortak hedefleri yükle
    const { data: memberRows }  = await supabase.from('shared_goal_members').select('goal_id').eq('user_id', user.id)
    const { data: createdGoals }= await supabase.from('shared_goals').select('*').eq('created_by', user.id)
    const allIds = [...new Set([...(memberRows||[]).map(r=>r.goal_id), ...(createdGoals||[]).map(g=>g.id)])]
    if (!allIds.length) { setGoals([]); return }

    const { data: allGoals } = await supabase.from('shared_goals').select('*').in('id', allIds).order('created_at')
    setGoals(allGoals || [])

    const tMap={}, lMap={}, mMap={}
    for (const g of (allGoals||[])) {
      const { data:t } = await supabase.from('shared_tasks').select('*').eq('goal_id',g.id).order('order_index')
      tMap[g.id] = t||[]
      const { data:l } = await supabase.from('shared_logs').select('*').in('task_id',(t||[]).map(x=>x.id))
      lMap[g.id] = l||[]
      const { data:m } = await supabase.from('shared_goal_members').select(`user_id, profiles(id,display_name,avatar_url,user_code)`).eq('goal_id',g.id)
      mMap[g.id] = m||[]
    }
    setTasks(tMap); setLogs(lMap); setMembers(mMap)

    const allUserIds = new Set()
    Object.values(mMap).forEach(ms=>ms.forEach(m=>allUserIds.add(m.user_id)))
    allGoals?.forEach(g=>allUserIds.add(g.created_by))
    if (allUserIds.size) {
      const { data:profs } = await supabase.from('profiles').select('*').in('id',[...allUserIds])
      const pm={}; (profs||[]).forEach(p=>pm[p.id]=p)
      setProfiles(pm)
    }
  }

  async function createSharedGoal() {
    const filtered = newTasks.filter(t=>t.trim())
    if (!newName.trim()||!newDays||!filtered.length||!selectedFriend) { alert('Lütfen tüm alanları doldur'); return }
    const { data:g } = await supabase.from('shared_goals').insert({ name:newName.trim(), total_days:parseInt(newDays), start_date:todayStr(), created_by:user.id }).select().single()
    if (!g) return
    await supabase.from('shared_tasks').insert(filtered.map((n,i)=>({ goal_id:g.id, name:n, order_index:i })))
    await supabase.from('shared_goal_members').insert([{ goal_id:g.id, user_id:user.id },{ goal_id:g.id, user_id:selectedFriend.id }])
    setShowCreate(false); setNewName(''); setNewDays(''); setNewTasks(['']); setSelectedFriend(null)
    await loadAll()
  }

  async function toggleSharedTask(goalId, taskId) {
    const ds=todayStr()
    const ex=(logs[goalId]||[]).find(l=>l.task_id===taskId&&l.log_date===ds&&l.user_id===user.id)
    if (ex) await supabase.from('shared_logs').delete().eq('id',ex.id)
    else    await supabase.from('shared_logs').insert({ task_id:taskId, log_date:ds, quality:'good', user_id:user.id })
    await reloadLogs(goalId)
  }

  async function setSharedQuality(goalId, taskId, quality) {
    const ds=todayStr()
    const ex=(logs[goalId]||[]).find(l=>l.task_id===taskId&&l.log_date===ds&&l.user_id===user.id)
    if (ex) await supabase.from('shared_logs').update({ quality }).eq('id',ex.id)
    else    await supabase.from('shared_logs').insert({ task_id:taskId, log_date:ds, quality, user_id:user.id })
    await reloadLogs(goalId)
  }

  async function reloadLogs(goalId) {
    const { data:l } = await supabase.from('shared_logs').select('*').in('task_id',(tasks[goalId]||[]).map(x=>x.id))
    setLogs(p=>({...p,[goalId]:l||[]}))
  }

  const initials = name => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  return (
    <>
      <div style={css.overlay} onClick={onClose} />
      <div style={css.panel}>
        <div style={css.header}>
          <button onClick={onClose} style={{ width:32,height:32,background:'#242830',border:'1px solid #2e3340',borderRadius:8,color:'#9aa0b0',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16,fontWeight:600,color:'#e2e6f0' }}>Ortak Hedefler</div>
            <div style={{ fontSize:11,color:'#5c6475' }}>{goals.length} aktif hedef · {friends.length} arkadaş</div>
          </div>
          <button onClick={()=>setShowCreate(true)} style={{ ...css.btn('primary'), padding:'8px 14px', fontSize:12 }}>+ Yeni</button>
        </div>

        <div style={{ padding:'16px 20px' }}>
          {/* Create form */}
          {showCreate && (
            <div style={{ ...css.card, border:'1px solid rgba(99,102,241,0.4)', marginBottom:20 }}>
              <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0',marginBottom:14 }}>Yeni Ortak Hedef</div>
              <div style={{ marginBottom:12 }}>
                <div style={css.sectionTitle}>Arkadaş Seç</div>
                {friends.length === 0
                  ? <div style={{ fontSize:13,color:'#f87171',background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:8,padding:'10px 12px' }}>
                      Önce Profil panelinden arkadaş eklemelisin
                    </div>
                  : <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {friends.map(f => (
                        <div key={f.id} onClick={()=>setSelectedFriend(f)} style={{ padding:'7px 14px', borderRadius:99, border:`1.5px solid ${selectedFriend?.id===f.id?'#6366f1':'#2e3340'}`, background:selectedFriend?.id===f.id?'rgba(99,102,241,0.15)':'transparent', color:selectedFriend?.id===f.id?'#a5b4fc':'#9aa0b0', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:20,height:20,borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff' }}>{initials(f.display_name)}</div>
                          {f.display_name}
                        </div>
                      ))}
                    </div>
                }
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={css.sectionTitle}>Hedef Adı</div>
                <input style={css.input} placeholder="örn: Birlikte 5km koş" value={newName} onChange={e=>setNewName(e.target.value)} />
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={css.sectionTitle}>Süre (gün)</div>
                <input type="number" style={css.input} placeholder="örn: 30" value={newDays} onChange={e=>setNewDays(e.target.value)} />
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={css.sectionTitle}>Günlük Görevler</div>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {newTasks.map((t,i)=>(
                    <div key={i} style={{ display:'flex', gap:7 }}>
                      <input style={css.input} placeholder={`Görev ${i+1}`} value={t} onChange={e=>setNewTasks(p=>p.map((x,j)=>j===i?e.target.value:x))} />
                      <button onClick={()=>{ if(newTasks.length>1) setNewTasks(p=>p.filter((_,j)=>j!==i)) }} style={{ width:36,height:42,background:'#242830',border:'1px solid #2e3340',borderRadius:9,color:'#9aa0b0',cursor:'pointer',flexShrink:0 }}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>setNewTasks(p=>[...p,''])} style={{ marginTop:8,background:'none',border:'none',color:'#6366f1',fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>+ Görev Ekle</button>
              </div>
              <div style={{ display:'flex', gap:9 }}>
                <button onClick={()=>setShowCreate(false)} style={css.btn('secondary')}>İptal</button>
                <button onClick={createSharedGoal} style={{ ...css.btn('primary'), flex:1 }}>Oluştur</button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {goals.length===0 && !showCreate && (
            <div style={{ textAlign:'center', padding:'50px 20px', color:'#5c6475' }}>
              <div style={{ fontSize:36,marginBottom:10 }}>🤝</div>
              <div style={{ fontSize:15,fontWeight:600,color:'#9aa0b0',marginBottom:6 }}>Henüz ortak hedef yok</div>
              <div style={{ fontSize:13 }}>+ Yeni butonuna basarak başla</div>
            </div>
          )}

          {/* Goals */}
          {goals.map(goal => {
            const gtasks  = tasks[goal.id]||[]
            const glogs   = logs[goal.id]||[]
            const gmembers= members[goal.id]||[]
            const today   = todayStr()
            const tab     = goalTabs[goal.id]||'mine'
            const el      = elapsed(goal.start_date)
            const rem     = Math.max(0, goal.total_days-el)
            const myLogs  = glogs.filter(l=>l.log_date===today&&l.user_id===user.id)

            const memberScores = gmembers.map(m=>({
              ...m,
              profile: profiles[m.user_id]||{ display_name:'...', user_code:'' },
              isMe: m.user_id===user.id,
              op: Math.round(overallScore(gtasks,glogs,goal.start_date,goal.total_days,m.user_id)*100),
              tp: Math.round(dayScore(gtasks,glogs,today,m.user_id)*100),
            }))

            const qBg = { good:'rgba(52,211,153,0.1)', mid:'rgba(251,191,36,0.1)', bad:'rgba(248,113,113,0.1)' }
            const qBorder = { good:'rgba(52,211,153,0.3)', mid:'rgba(251,191,36,0.3)', bad:'rgba(248,113,113,0.3)' }
            const qColor = { good:'#34d399', mid:'#fbbf24', bad:'#f87171' }

            return (
              <div key={goal.id} style={css.card}>
                <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:4 }}>
                  <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0' }}>🤝 {goal.name}</div>
                  <div style={{ fontSize:10,color:'#5c6475',textAlign:'right',flexShrink:0,marginLeft:8 }}>{el}/{goal.total_days} gün<br/>{rem} kaldı</div>
                </div>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap',margin:'8px 0 12px' }}>
                  {memberScores.map(m=>(
                    <div key={m.user_id} style={{ display:'flex',alignItems:'center',gap:5,background:'#111318',border:'1px solid #2e3340',borderRadius:99,padding:'4px 10px' }}>
                      <div style={{ width:18,height:18,borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff' }}>{initials(m.profile?.display_name)}</div>
                      <span style={{ fontSize:11,color:m.isMe?'#a5b4fc':'#9aa0b0' }}>{m.isMe?'Sen':m.profile?.display_name}</span>
                      <span style={{ fontSize:11,fontWeight:700,color:m.op>=70?'#34d399':m.op>=35?'#6366f1':'#f87171' }}>{m.op}%</span>
                    </div>
                  ))}
                </div>

                <div style={{ display:'flex',background:'#111318',borderRadius:10,padding:3,marginBottom:12 }}>
                  {[['mine','Benim Görevlerim'],['all','Karşılaştırma']].map(([t,l])=>(
                    <button key={t} onClick={()=>setGoalTabs(p=>({...p,[goal.id]:t}))} style={{ flex:1,padding:'8px',background:tab===t?'#1c1f26':'transparent',border:'none',borderRadius:8,color:tab===t?'#e2e6f0':'#5c6475',fontSize:12,fontWeight:tab===t?600:400,cursor:'pointer',fontFamily:'inherit' }}>{l}</button>
                  ))}
                </div>

                {tab==='mine' && (
                  <div>
                    <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475',marginBottom:8 }}>Bugünün Görevleri · {myLogs.length}/{gtasks.length}</div>
                    {gtasks.map(t=>{
                      const log=myLogs.find(l=>l.task_id===t.id)
                      const q=log?.quality
                      return (
                        <div key={t.id} style={{ background:q?qBg[q]:'#242830', border:`1px solid ${q?qBorder[q]:'#2e3340'}`, borderRadius:10, overflow:'hidden', marginBottom:7 }}>
                          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'11px 12px',cursor:'pointer' }} onClick={()=>toggleSharedTask(goal.id,t.id)}>
                            <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${q?qColor[q]:'#3a4050'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,background:q?qBg[q]:'transparent',color:q?qColor[q]:'transparent' }}>{q?QSym[q]:''}</div>
                            <div style={{ flex:1,fontSize:13,textDecoration:q?'line-through':'none',color:q?'#5c6475':'#e2e6f0' }}>{t.name}</div>
                            {q&&<span style={{ fontSize:10,fontWeight:600,color:qColor[q],background:qBg[q],padding:'2px 7px',borderRadius:99 }}>{QL[q]}</span>}
                          </div>
                          {q&&(
                            <div style={{ display:'flex',gap:5,padding:'0 12px 10px' }}>
                              {['good','mid','bad'].map(qv=>(
                                <button key={qv} onClick={()=>setSharedQuality(goal.id,t.id,qv)} style={{ flex:1,padding:'6px',borderRadius:7,border:`1.5px solid ${q===qv?qColor[qv]:'#2e3340'}`,background:q===qv?qBg[qv]:'transparent',color:q===qv?qColor[qv]:'#5c6475',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>{QL[qv]}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {tab==='all' && (
                  <div>
                    <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475',marginBottom:10 }}>Üye Karşılaştırması</div>
                    {memberScores.map(m=>{
                      const opColor=m.op>=70?'#34d399':m.op>=35?'#6366f1':'#f87171'
                      return (
                        <div key={m.user_id} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}>
                            <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                              <div style={{ width:24,height:24,borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff' }}>{initials(m.profile?.display_name)}</div>
                              <span style={{ fontSize:13,color:m.isMe?'#a5b4fc':'#9aa0b0' }}>{m.isMe?'Sen':m.profile?.display_name}</span>
                            </div>
                            <div style={{ display:'flex',gap:12,fontSize:12 }}>
                              <span style={{ color:'#5c6475' }}>Bugün: <span style={{ color:'#e2e6f0',fontWeight:600 }}>{m.tp}%</span></span>
                              <span style={{ color:'#5c6475' }}>Genel: <span style={{ color:opColor,fontWeight:700 }}>{m.op}%</span></span>
                            </div>
                          </div>
                          <div style={{ height:6,background:'#242830',borderRadius:99,overflow:'hidden' }}>
                            <div style={{ height:'100%',width:`${m.op}%`,background:opColor,borderRadius:99,opacity:0.8,transition:'width 0.5s' }} />
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475',margin:'16px 0 8px' }}>Bugün Görev Durumu</div>
                    {gtasks.map(t=>(
                      <div key={t.id} style={{ background:'#111318',border:'1px solid #2e3340',borderRadius:10,padding:'10px 12px',marginBottom:7 }}>
                        <div style={{ fontSize:13,color:'#e2e6f0',marginBottom:7 }}>{t.name}</div>
                        <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                          {memberScores.map(m=>{
                            const l=glogs.find(x=>x.task_id===t.id&&x.log_date===todayStr()&&x.user_id===m.user_id)
                            const q=l?.quality
                            return (
                              <div key={m.user_id} style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:99,background:q?qBg[q]:'#242830',border:`1px solid ${q?(qColor[q]+'55'):'#2e3340'}` }}>
                                <span style={{ fontSize:11,color:q?qColor[q]:'#5c6475' }}>{m.isMe?'Sen':m.profile?.display_name}</span>
                                {q?<span style={{ fontSize:11,fontWeight:700,color:qColor[q] }}>{QSym[q]} {QL[q]}</span>:<span style={{ fontSize:11,color:'#5c6475' }}>—</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
