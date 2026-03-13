import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../lib/supabase'

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const Q    = { good:1.0, mid:0.6, bad:0.3 }
const QSym = { good:'✓', mid:'−', bad:'✕' }
const QL   = { good:'İyi', mid:'Orta', bad:'Kötü' }
const toDate   = d => d.toISOString().slice(0,10)
const todayStr = () => toDate(new Date())
const addDays  = (ds,n) => { const d=new Date(ds); d.setDate(d.getDate()+n); return toDate(d) }
const elapsed  = s => Math.max(0, Math.floor((new Date()-new Date(s))/86400000))
const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

function memberDayScore(tasks, logs, ds, uid) {
  if (!tasks.length) return 0
  const dl = logs.filter(l=>l.log_date===ds && l.user_id===uid)
  return tasks.reduce((s,t)=>{ const l=dl.find(x=>x.task_id===t.id); return s+(l?Q[l.quality]:0) },0)/tasks.length
}
function memberOverallScore(tasks, logs, startDate, totalDays, uid) {
  const e=elapsed(startDate); if (!e) return 0
  let sum=0
  for (let i=0;i<e;i++) sum+=memberDayScore(tasks,logs,addDays(startDate,i),uid)
  return sum/totalDays
}
function combinedDayScore(mTaskMap, logs, ds, memberIds) {
  if (!memberIds.length) return 0
  return memberIds.reduce((s,uid)=>s+memberDayScore(mTaskMap[uid]||[],logs,ds,uid),0)/memberIds.length
}
function combinedStreak(mTaskMap, logs, startDate, memberIds) {
  let streak=0
  for (let i=elapsed(startDate)-1;i>=0;i--) {
    if (combinedDayScore(mTaskMap,logs,addDays(startDate,i),memberIds)>=0.5) streak++; else break
  }
  return streak
}

/* ─── Styles ──────────────────────────────────────────────────────────── */
const S = {
  overlay:{ position:'fixed',inset:0,background:'rgba(10,12,18,0.75)',backdropFilter:'blur(4px)',zIndex:300 },
  panel:  { position:'fixed',inset:0,background:'#111318',zIndex:301,overflowY:'auto',maxWidth:480,margin:'0 auto' },
  hdr:    { padding:'14px 16px',borderBottom:'1px solid #2e3340',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,background:'#111318',zIndex:2 },
  input:  { width:'100%',background:'#0d0f14',border:'1px solid #2e3340',borderRadius:10,padding:'10px 13px',color:'#e2e6f0',fontSize:14,outline:'none',fontFamily:'inherit' },
  lbl:    { fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475',marginBottom:7,display:'block' },
  btn: v=>({ padding:'10px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
    background:v==='primary'?'#6366f1':v==='danger'?'rgba(248,113,113,0.1)':v==='ghost'?'transparent':'#1c1f26',
    border:v==='primary'?'none':v==='danger'?'1px solid rgba(248,113,113,0.3)':v==='ghost'?'none':'1px solid #2e3340',
    color:v==='primary'?'#fff':v==='danger'?'#f87171':v==='ghost'?'#6366f1':'#9aa0b0' }),
  qBg:  { good:'rgba(52,211,153,0.1)',  mid:'rgba(251,191,36,0.1)',  bad:'rgba(248,113,113,0.1)' },
  qBord:{ good:'rgba(52,211,153,0.3)',  mid:'rgba(251,191,36,0.3)',  bad:'rgba(248,113,113,0.3)' },
  qCol: { good:'#34d399', mid:'#fbbf24', bad:'#f87171' },
}

export default function SharedGoalsPanel({ user, initialFriend, onClose }) {
  const [goals,          setGoals]        = useState([])
  const [memberTasks,    setMemberTasks]  = useState({})   // goalId → { uid → [task] }
  const [logs,           setLogs]         = useState({})   // goalId → [log]
  const [members,        setMembers]      = useState({})   // goalId → [{user_id,profiles}]
  const [profiles,       setProfiles]     = useState({})
  const [invitations,    setInvitations]  = useState([])
  const [friends,        setFriends]      = useState([])
  const [expandedGoal,   setExpandedGoal] = useState(null)
  const [activeTab,      setActiveTab]    = useState({})
  const [editingTasks,   setEditingTasks] = useState(null)
  const [editTaskList,   setEditTaskList] = useState([])
  const [showCreate,     setShowCreate]   = useState(!!initialFriend)
  const [selectedFriend, setSelectedFriend]= useState(initialFriend)
  const [newName,        setNewName]      = useState('')
  const [newDays,        setNewDays]      = useState('')
  const [deleteConfirm,  setDeleteConfirm]= useState(null)
  const [leaveConfirm,   setLeaveConfirm] = useState(null)
  const [liveIndicator,  setLiveIndicator]= useState({}) // goalId → bool (flash)
  const channelsRef = useRef([])
  const supabase = createClient()

  useEffect(() => { loadAll() }, [])

  // Gerçek zamanlı dinleme — goals yüklenince
  useEffect(() => {
    if (!goals.length) return
    // Önceki kanalları temizle
    channelsRef.current.forEach(c=>supabase.removeChannel(c))
    channelsRef.current = []

    goals.forEach(goal => {
      // shared_logs değişimlerini dinle
      const ch = supabase.channel(`shared_logs_${goal.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'shared_logs'
        }, async (payload) => {
          // Hangi goal'a ait olduğunu bul (task_id'den)
          await reloadLogsForGoal(goal.id)
          // Canlı gösterge flash
          setLiveIndicator(p=>({...p,[goal.id]:true}))
          setTimeout(()=>setLiveIndicator(p=>({...p,[goal.id]:false})),1500)
        })
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'shared_member_tasks'
        }, async () => {
          await reloadMemberTasksForGoal(goal.id)
        })
        .subscribe()
      channelsRef.current.push(ch)
    })

    return () => {
      channelsRef.current.forEach(c=>supabase.removeChannel(c))
    }
  }, [goals.map(g=>g.id).join(',')])

  async function loadAll() {
    // Arkadaşlar
    const { data:fs } = await supabase.from('friendships').select(`
      id,requester_id,receiver_id,status,
      requester:profiles!friendships_requester_id_fkey(id,display_name,user_code),
      receiver:profiles!friendships_receiver_id_fkey(id,display_name,user_code)
    `).eq('status','accepted').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
    if (fs) setFriends(fs.map(f=>f.requester_id===user.id?f.receiver:f.requester))

    // Davetler
    const { data:invs } = await supabase.from('shared_goal_invitations').select(`
      id,goal_id,status,
      inviter:profiles!shared_goal_invitations_inviter_id_fkey(id,display_name),
      goal:shared_goals(id,name,total_days,start_date)
    `).eq('invitee_id',user.id).eq('status','pending')
    setInvitations(invs||[])

    // Hedefler
    const { data:mr } = await supabase.from('shared_goal_members').select('goal_id').eq('user_id',user.id)
    const { data:cg } = await supabase.from('shared_goals').select('*').eq('created_by',user.id)
    const allIds = [...new Set([...(mr||[]).map(r=>r.goal_id),...(cg||[]).map(g=>g.id)])]
    if (!allIds.length) { setGoals([]); return }

    const { data:allGoals } = await supabase.from('shared_goals').select('*').in('id',allIds).order('created_at')
    setGoals(allGoals||[])

    const mtMap={}, lMap={}, mMap={}
    for (const g of (allGoals||[])) {
      const { data:m } = await supabase.from('shared_goal_members')
        .select(`user_id, profiles(id,display_name,avatar_url,user_code)`).eq('goal_id',g.id)
      mMap[g.id] = m||[]

      const memberIds = (m||[]).map(x=>x.user_id)
      const tasksByUser = {}
      for (const uid of memberIds) {
        const { data:t } = await supabase.from('shared_member_tasks')
          .select('*').eq('goal_id',g.id).eq('user_id',uid).order('order_index')
        tasksByUser[uid] = t||[]
      }
      mtMap[g.id] = tasksByUser

      const allTIds = Object.values(tasksByUser).flat().map(t=>t.id)
      if (allTIds.length) {
        const { data:l } = await supabase.from('shared_logs').select('*').in('task_id',allTIds)
        lMap[g.id] = l||[]
      } else { lMap[g.id] = [] }
    }
    setMemberTasks(mtMap); setLogs(lMap); setMembers(mMap)

    const pIds=new Set()
    Object.values(mMap).flat().forEach(m=>pIds.add(m.user_id))
    allGoals?.forEach(g=>pIds.add(g.created_by))
    if (pIds.size) {
      const { data:profs } = await supabase.from('profiles').select('*').in('id',[...pIds])
      const pm={}; (profs||[]).forEach(p=>pm[p.id]=p)
      setProfiles(pm)
    }
  }

  // Sadece logları yenile (realtime tetikler)
  async function reloadLogsForGoal(goalId) {
    // memberTasks state'inden güncel task id'leri al
    setMemberTasks(prevMT => {
      const allTIds = Object.values(prevMT[goalId]||{}).flat().map(t=>t.id)
      if (!allTIds.length) return prevMT
      supabase.from('shared_logs').select('*').in('task_id',allTIds).then(({data:l}) => {
        setLogs(prev=>({...prev,[goalId]:l||[]}))
      })
      return prevMT
    })
  }

  // Görevleri yenile (realtime tetikler)
  async function reloadMemberTasksForGoal(goalId) {
    setMembers(prevM => {
      const memberIds = (prevM[goalId]||[]).map(m=>m.user_id)
      ;(async () => {
        const tasksByUser={}
        for (const uid of memberIds) {
          const { data:t } = await supabase.from('shared_member_tasks')
            .select('*').eq('goal_id',goalId).eq('user_id',uid).order('order_index')
          tasksByUser[uid] = t||[]
        }
        setMemberTasks(prev=>({...prev,[goalId]:tasksByUser}))
        // Logları da yenile
        const allTIds = Object.values(tasksByUser).flat().map(t=>t.id)
        if (allTIds.length) {
          const { data:l } = await supabase.from('shared_logs').select('*').in('task_id',allTIds)
          setLogs(prev=>({...prev,[goalId]:l||[]}))
        }
      })()
      return prevM
    })
  }

  /* Görev toggle — task_owner_id olmadan da çalışsın */
  async function toggleTask(goalId, taskId) {
    const ds=todayStr()
    const gl = logs[goalId]||[]
    const ex = gl.find(l=>l.task_id===taskId && l.log_date===ds && l.user_id===user.id)
    if (ex) {
      await supabase.from('shared_logs').delete().eq('id',ex.id)
    } else {
      const { error } = await supabase.from('shared_logs').insert({
        task_id:taskId, log_date:ds, quality:'good', user_id:user.id
      })
      if (error) { console.error('Toggle error:', error); alert('Hata: '+error.message); return }
    }
    await reloadLogsForGoal(goalId)
  }

  async function setQuality(goalId, taskId, quality) {
    const ds=todayStr()
    const ex=(logs[goalId]||[]).find(l=>l.task_id===taskId && l.log_date===ds && l.user_id===user.id)
    if (ex) {
      await supabase.from('shared_logs').update({quality}).eq('id',ex.id)
    } else {
      await supabase.from('shared_logs').insert({ task_id:taskId, log_date:ds, quality, user_id:user.id })
    }
    await reloadLogsForGoal(goalId)
  }

  /* Görev düzenleme */
  function startEditTasks(goalId) {
    const myT=(memberTasks[goalId]||{})[user.id]||[]
    setEditTaskList(myT.length ? myT.map(t=>({...t})) : [{name:''}])
    setEditingTasks(goalId)
  }

  async function saveMyTasks(goalId) {
    const filtered=editTaskList.filter(t=>t.name?.trim())
    const myT=(memberTasks[goalId]||{})[user.id]||[]
    // Mevcut görevleri sil
    for (const t of myT) await supabase.from('shared_member_tasks').delete().eq('id',t.id)
    // Yenilerini ekle
    if (filtered.length) {
      const { error } = await supabase.from('shared_member_tasks').insert(
        filtered.map((t,i)=>({ goal_id:goalId, user_id:user.id, name:t.name.trim(), order_index:i }))
      )
      if (error) { alert('Görev kaydedilemedi: '+error.message); return }
    }
    setEditingTasks(null)
    await reloadMemberTasksForGoal(goalId)
  }

  /* Davetler */
  async function acceptInvitation(inv) {
    const { error } = await supabase.from('shared_goal_members').insert({ goal_id:inv.goal_id, user_id:user.id })
    if (error) { alert('Kabul edilemedi: '+error.message); return }
    await supabase.from('shared_goal_invitations').update({status:'accepted'}).eq('id',inv.id)
    await loadAll()
  }
  async function rejectInvitation(inv) {
    await supabase.from('shared_goal_invitations').update({status:'rejected'}).eq('id',inv.id)
    setInvitations(p=>p.filter(i=>i.id!==inv.id))
  }

  /* Oluştur */
  async function createSharedGoal() {
    if (!newName.trim()||!newDays||!selectedFriend) { alert('Lütfen tüm alanları doldur'); return }
    const { data:g, error:gErr } = await supabase.from('shared_goals').insert({
      name:newName.trim(), total_days:parseInt(newDays), start_date:todayStr(), created_by:user.id
    }).select().single()
    if (gErr||!g) { alert('Hedef oluşturulamadı: '+(gErr?.message||'hata')); return }
    await supabase.from('shared_goal_members').insert({ goal_id:g.id, user_id:user.id })
    const { error:invErr } = await supabase.from('shared_goal_invitations').insert({
      goal_id:g.id, inviter_id:user.id, invitee_id:selectedFriend.id
    })
    if (invErr) { alert('Davet gönderilemedi: '+invErr.message); return }
    setShowCreate(false); setNewName(''); setNewDays(''); setSelectedFriend(null)
    await loadAll()
  }

  async function deleteGoal(goalId) {
    await supabase.from('shared_goals').delete().eq('id',goalId)
    setDeleteConfirm(null); await loadAll()
  }
  async function leaveGoal(goalId) {
    await supabase.from('shared_goal_members').delete().eq('goal_id',goalId).eq('user_id',user.id)
    setLeaveConfirm(null); await loadAll()
  }

  const tab=(gid)=>activeTab[gid]||'mine'
  const setTab=(gid,t)=>setActiveTab(p=>({...p,[gid]:t}))

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      <div style={S.overlay} onClick={onClose}/>
      <div style={S.panel}>

        {/* Header */}
        <div style={S.hdr}>
          <button onClick={onClose} style={{ width:32,height:32,background:'#1c1f26',border:'1px solid #2e3340',borderRadius:8,color:'#9aa0b0',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16,fontWeight:600,color:'#e2e6f0' }}>Ortak Hedefler</div>
            <div style={{ fontSize:11,color:'#5c6475' }}>{goals.length} hedef</div>
          </div>
          <button onClick={()=>setShowCreate(true)} style={{ ...S.btn('primary'),padding:'8px 14px',fontSize:12 }}>+ Yeni</button>
        </div>

        <div style={{ padding:'14px 16px' }}>

          {/* Davetler */}
          {invitations.length>0&&(
            <div style={{ background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:14,padding:14,marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#6366f1',marginBottom:10 }}>📨 Ortak Hedef Daveti</div>
              {invitations.map(inv=>(
                <div key={inv.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 0' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'#e2e6f0' }}>{inv.goal?.name}</div>
                    <div style={{ fontSize:11,color:'#5c6475' }}>{inv.inviter?.display_name} · {inv.goal?.total_days} gün</div>
                  </div>
                  <button onClick={()=>acceptInvitation(inv)} style={{ ...S.btn('primary'),padding:'7px 12px',fontSize:12 }}>Katıl</button>
                  <button onClick={()=>rejectInvitation(inv)} style={{ ...S.btn('secondary'),padding:'7px 10px',fontSize:12,color:'#f87171' }}>Reddet</button>
                </div>
              ))}
            </div>
          )}

          {/* Create form */}
          {showCreate&&(
            <div style={{ background:'#1c1f26',border:'1px solid rgba(99,102,241,0.35)',borderRadius:16,padding:18,marginBottom:16 }}>
              <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0',marginBottom:14 }}>Yeni Ortak Hedef</div>
              <div style={{ marginBottom:12 }}>
                <span style={S.lbl}>Arkadaş Seç</span>
                {friends.length===0
                  ? <div style={{ fontSize:13,color:'#f87171',background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:8,padding:'10px 12px' }}>Önce profil panelinden arkadaş ekle</div>
                  : <div style={{ display:'flex',flexWrap:'wrap',gap:7 }}>
                      {friends.map(f=>(
                        <div key={f.id} onClick={()=>setSelectedFriend(f)} style={{ padding:'7px 13px',borderRadius:99,border:`1.5px solid ${selectedFriend?.id===f.id?'#6366f1':'#2e3340'}`,background:selectedFriend?.id===f.id?'rgba(99,102,241,0.15)':'transparent',color:selectedFriend?.id===f.id?'#a5b4fc':'#9aa0b0',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}>
                          <div style={{ width:20,height:20,borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff' }}>{initials(f.display_name)}</div>
                          {f.display_name}{selectedFriend?.id===f.id&&' ✓'}
                        </div>
                      ))}
                    </div>
                }
              </div>
              <div style={{ marginBottom:12 }}>
                <span style={S.lbl}>Hedef Adı</span>
                <input style={S.input} placeholder="örn: Birlikte 5km koş" value={newName} onChange={e=>setNewName(e.target.value)}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <span style={S.lbl}>Süre (gün)</span>
                <input type="number" style={S.input} placeholder="örn: 30" value={newDays} onChange={e=>setNewDays(e.target.value)}/>
              </div>
              <div style={{ background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'9px 12px',marginBottom:12,fontSize:12,color:'#a5b4fc' }}>
                💡 Katıldıktan sonra herkes kendi görevlerini ekler. Hedef ortak, görevler kişisel!
              </div>
              <div style={{ display:'flex',gap:9 }}>
                <button onClick={()=>setShowCreate(false)} style={S.btn('secondary')}>İptal</button>
                <button onClick={createSharedGoal} style={{ ...S.btn('primary'),flex:1 }}>Davet Gönder</button>
              </div>
            </div>
          )}

          {/* Empty */}
          {goals.length===0&&!showCreate&&invitations.length===0&&(
            <div style={{ textAlign:'center',padding:'50px 20px',color:'#5c6475' }}>
              <div style={{ fontSize:36,marginBottom:10 }}>🤝</div>
              <div style={{ fontSize:15,fontWeight:600,color:'#9aa0b0',marginBottom:6 }}>Henüz ortak hedef yok</div>
              <div style={{ fontSize:13 }}>+ Yeni butonuyla arkadaşını davet et</div>
            </div>
          )}

          {/* ─── Goal Cards ─── */}
          {goals.map(goal=>{
            const glogs    = logs[goal.id]||[]
            const gmembers = members[goal.id]||[]
            const mTaskMap = memberTasks[goal.id]||{}
            const memberIds= gmembers.map(m=>m.user_id)
            const today    = todayStr()
            const el       = elapsed(goal.start_date)
            const rem      = Math.max(0,goal.total_days-el)
            const isCreator= goal.created_by===user.id
            const isOpen   = expandedGoal===goal.id
            const myTasks  = mTaskMap[user.id]||[]
            const partnerIds = memberIds.filter(id=>id!==user.id)
            const isLive   = liveIndicator[goal.id]

            const combinedToday = Math.round(combinedDayScore(mTaskMap,glogs,today,memberIds)*100)
            const streak        = combinedStreak(mTaskMap,glogs,goal.start_date,memberIds)
            const progPct       = el===0?0:Math.round(
              memberIds.reduce((s,uid)=>s+memberOverallScore(mTaskMap[uid]||[],glogs,goal.start_date,goal.total_days,uid),0)
              /Math.max(1,memberIds.length)*100
            )
            const allLogs      = glogs.filter(l=>memberIds.includes(l.user_id))
            const qualityScore = allLogs.length
              ? Math.round(allLogs.reduce((s,l)=>s+Q[l.quality],0)/allLogs.length*100) : 0

            const myLogs     = glogs.filter(l=>l.log_date===today&&l.user_id===user.id)
            const myDoneCount= myTasks.filter(t=>myLogs.find(l=>l.task_id===t.id)).length

            return (
              <div key={goal.id} style={{ background:'#1c1f26',border:`1px solid ${isOpen?'rgba(99,102,241,0.4)':'#2e3340'}`,borderRadius:16,marginBottom:10,overflow:'hidden' }}>

                {/* ── Collapsed header ── */}
                <div onClick={()=>setExpandedGoal(isOpen?null:goal.id)} style={{ padding:'14px 16px',cursor:'pointer',userSelect:'none' }}>
                  <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:5 }}>
                        <span style={{ fontSize:14,fontWeight:600,color:'#e2e6f0' }}>🤝 {goal.name}</span>
                        {streak>=3&&<span style={{ fontSize:11,background:'rgba(251,146,60,0.15)',border:'1px solid rgba(251,146,60,0.3)',color:'#fb923c',borderRadius:99,padding:'1px 8px' }}>🔥{streak}</span>}
                        {isLive&&<span style={{ fontSize:10,color:'#34d399',animation:'none' }}>● canlı</span>}
                      </div>
                      <div style={{ height:4,background:'#242830',borderRadius:99,overflow:'hidden',marginBottom:5 }}>
                        <div style={{ height:'100%',width:`${progPct}%`,background:progPct>=70?'#34d399':progPct>=35?'#6366f1':'#f87171',borderRadius:99 }}/>
                      </div>
                      <div style={{ display:'flex',gap:10,fontSize:11,color:'#5c6475' }}>
                        <span>İlerleme <b style={{ color:progPct>=70?'#34d399':progPct>=35?'#6366f1':'#f87171' }}>{progPct}%</b></span>
                        <span>Bugün <b style={{ color:'#e2e6f0' }}>{combinedToday}%</b></span>
                        <span>Kalite <b style={{ color:qualityScore>=70?'#34d399':'#fbbf24' }}>{qualityScore}%</b></span>
                        <span style={{ marginLeft:'auto' }}>{el}/{goal.total_days}g</span>
                      </div>
                    </div>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <div style={{ display:'flex' }}>
                        {gmembers.map((m,i)=>(
                          <div key={m.user_id} style={{ width:26,height:26,borderRadius:'50%',background:m.user_id===user.id?'#6366f1':'#fb923c',border:'2px solid #1c1f26',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',marginLeft:i?-8:0 }}>
                            {initials(profiles[m.user_id]?.display_name||m.profiles?.display_name)}
                          </div>
                        ))}
                      </div>
                      <span style={{ fontSize:16,color:'#5c6475',transform:isOpen?'rotate(180deg)':'none',display:'inline-block',transition:'transform 0.2s' }}>⌄</span>
                    </div>
                  </div>
                </div>

                {/* ── Expanded ── */}
                {isOpen&&(
                  <div style={{ borderTop:'1px solid #2e3340' }}>

                    {/* Stats */}
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'#2e3340' }}>
                      {[['İlerleme',`${progPct}%`,progPct>=70?'#34d399':progPct>=35?'#6366f1':'#f87171'],
                        ['Bugün',`${combinedToday}%`,'#e2e6f0'],
                        ['Kalite',`${qualityScore}%`,qualityScore>=70?'#34d399':'#fbbf24'],
                        ['Seri',streak>=3?`${streak}🔥`:`${streak}`,'#fb923c']
                      ].map(([l,v,c])=>(
                        <div key={l} style={{ background:'#111318',padding:'10px 0',textAlign:'center' }}>
                          <div style={{ fontSize:9,color:'#5c6475',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3 }}>{l}</div>
                          <div style={{ fontSize:16,fontWeight:700,color:c }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ display:'flex',background:'#0d0f14',padding:'6px 14px',gap:4 }}>
                      {[['mine','Benim'],['partner','Arkadaşım'],['combined','Birlikte']].map(([t,l])=>(
                        <button key={t} onClick={()=>setTab(goal.id,t)} style={{ flex:1,padding:'7px',background:tab(goal.id)===t?'#1c1f26':'transparent',border:tab(goal.id)===t?'1px solid #2e3340':'1px solid transparent',borderRadius:8,color:tab(goal.id)===t?'#e2e6f0':'#5c6475',fontSize:11,fontWeight:tab(goal.id)===t?600:400,cursor:'pointer',fontFamily:'inherit' }}>{l}</button>
                      ))}
                    </div>

                    <div style={{ padding:'12px 14px' }}>

                      {/* ── Benim sekmem ── */}
                      {tab(goal.id)==='mine'&&(
                        <div>
                          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                            <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475' }}>
                              Bugün {myDoneCount}/{myTasks.length} · Kendi Görevlerim
                            </div>
                            <button onClick={()=>startEditTasks(goal.id)} style={{ ...S.btn('ghost'),padding:'5px 10px',fontSize:11 }}>✎ Düzenle</button>
                          </div>
                          {myTasks.length===0?(
                            <div style={{ textAlign:'center',padding:'24px 16px',color:'#5c6475',fontSize:13,background:'#0d0f14',borderRadius:12 }}>
                              Henüz görev eklemedin
                              <button onClick={()=>startEditTasks(goal.id)} style={{ ...S.btn('ghost'),display:'block',margin:'8px auto 0',fontSize:12 }}>+ Görev Ekle</button>
                            </div>
                          ):myTasks.map(t=>{
                            const log=myLogs.find(l=>l.task_id===t.id); const q=log?.quality
                            return (
                              <div key={t.id} style={{ background:q?S.qBg[q]:'#242830',border:`1px solid ${q?S.qBord[q]:'#2e3340'}`,borderRadius:10,overflow:'hidden',marginBottom:7 }}>
                                <div style={{ display:'flex',alignItems:'center',gap:10,padding:'11px 12px',cursor:'pointer' }} onClick={()=>toggleTask(goal.id,t.id)}>
                                  <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${q?S.qCol[q]:'#3a4050'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,background:q?S.qBg[q]:'transparent',color:q?S.qCol[q]:'transparent' }}>{q?QSym[q]:''}</div>
                                  <div style={{ flex:1,fontSize:13,textDecoration:q?'line-through':'none',color:q?'#5c6475':'#e2e6f0' }}>{t.name}</div>
                                  {q&&<span style={{ fontSize:10,fontWeight:600,color:S.qCol[q],background:S.qBg[q],padding:'2px 7px',borderRadius:99 }}>{QL[q]}</span>}
                                </div>
                                {q&&(
                                  <div style={{ display:'flex',gap:5,padding:'0 12px 9px' }}>
                                    {['good','mid','bad'].map(qv=>(
                                      <button key={qv} onClick={()=>setQuality(goal.id,t.id,qv)} style={{ flex:1,padding:'5px',borderRadius:7,border:`1.5px solid ${q===qv?S.qCol[qv]:'#2e3340'}`,background:q===qv?S.qBg[qv]:'transparent',color:q===qv?S.qCol[qv]:'#5c6475',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>{QL[qv]}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* ── Arkadaşım sekmesi ── */}
                      {tab(goal.id)==='partner'&&(
                        <div>
                          {partnerIds.length===0?(
                            <div style={{ textAlign:'center',padding:'24px',color:'#5c6475',fontSize:13 }}>Arkadaş henüz katılmadı</div>
                          ):partnerIds.map(uid=>{
                            const pTasks= mTaskMap[uid]||[]
                            const pProf = profiles[uid]||{ display_name:'Arkadaşın' }
                            const pLogs = glogs.filter(l=>l.log_date===today&&l.user_id===uid)
                            const pDone = pTasks.filter(t=>pLogs.find(l=>l.task_id===t.id)).length
                            const pScore= Math.round(memberOverallScore(pTasks,glogs,goal.start_date,goal.total_days,uid)*100)
                            return (
                              <div key={uid}>
                                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,background:'#0d0f14',borderRadius:10,padding:'10px 12px' }}>
                                  <div style={{ width:32,height:32,borderRadius:'50%',background:'#fb923c',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff' }}>{initials(pProf.display_name)}</div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:13,fontWeight:600,color:'#e2e6f0' }}>{pProf.display_name}</div>
                                    <div style={{ fontSize:11,color:'#5c6475' }}>Bugün: {pDone}/{pTasks.length} tamamladı · Genel: {pScore}%</div>
                                  </div>
                                  {isLive&&<span style={{ fontSize:10,color:'#34d399' }}>● canlı</span>}
                                </div>
                                {pTasks.length===0?(
                                  <div style={{ textAlign:'center',padding:'20px',color:'#5c6475',fontSize:13,background:'#0d0f14',borderRadius:10 }}>Henüz görev eklemedi</div>
                                ):pTasks.map(t=>{
                                  const log=pLogs.find(l=>l.task_id===t.id); const q=log?.quality
                                  return (
                                    <div key={t.id} style={{ background:q?S.qBg[q]:'#0d0f14',border:`1px solid ${q?S.qBord[q]:'#2e3340'}`,borderRadius:9,padding:'10px 12px',marginBottom:6,display:'flex',alignItems:'center',gap:9 }}>
                                      <div style={{ width:20,height:20,borderRadius:5,border:`2px solid ${q?S.qCol[q]:'#3a4050'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,background:q?S.qBg[q]:'transparent',color:q?S.qCol[q]:'transparent' }}>{q?QSym[q]:''}</div>
                                      <div style={{ flex:1,fontSize:13,color:q?'#5c6475':'#e2e6f0',textDecoration:q?'line-through':'none' }}>{t.name}</div>
                                      {q&&<span style={{ fontSize:10,fontWeight:600,color:S.qCol[q] }}>{QL[q]}</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* ── Birlikte sekmesi ── */}
                      {tab(goal.id)==='combined'&&(
                        <div>
                          <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'#5c6475',marginBottom:10 }}>Kombine İlerleme</div>
                          {gmembers.map(m=>{
                            const uid=m.user_id
                            const pT =mTaskMap[uid]||[]
                            const pP =profiles[uid]||m.profiles||{}
                            const isMe=uid===user.id
                            const op =Math.round(memberOverallScore(pT,glogs,goal.start_date,goal.total_days,uid)*100)
                            const tp =Math.round(memberDayScore(pT,glogs,today,uid)*100)
                            const oc =op>=70?'#34d399':op>=35?'#6366f1':'#f87171'
                            return (
                              <div key={uid} style={{ marginBottom:14 }}>
                                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}>
                                  <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                                    <div style={{ width:24,height:24,borderRadius:'50%',background:isMe?'#6366f1':'#fb923c',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff' }}>{initials(pP.display_name)}</div>
                                    <span style={{ fontSize:13,color:isMe?'#a5b4fc':'#9aa0b0',fontWeight:500 }}>{isMe?'Sen':pP.display_name}</span>
                                  </div>
                                  <div style={{ display:'flex',gap:10,fontSize:11 }}>
                                    <span style={{ color:'#5c6475' }}>Bugün <b style={{ color:'#e2e6f0' }}>{tp}%</b></span>
                                    <span style={{ color:'#5c6475' }}>Genel <b style={{ color:oc }}>{op}%</b></span>
                                  </div>
                                </div>
                                <div style={{ height:6,background:'#242830',borderRadius:99,overflow:'hidden' }}>
                                  <div style={{ height:'100%',width:`${op}%`,background:oc,borderRadius:99,transition:'width 0.5s' }}/>
                                </div>
                              </div>
                            )
                          })}
                          {/* Rozetler */}
                          <div style={{ marginTop:14,display:'flex',gap:7,flexWrap:'wrap' }}>
                            {streak>=7&&<span style={{ padding:'5px 11px',background:'rgba(251,146,60,0.1)',border:'1px solid rgba(251,146,60,0.3)',borderRadius:99,fontSize:11,color:'#fb923c' }}>🔥 {streak} günlük seri!</span>}
                            {progPct>=50&&<span style={{ padding:'5px 11px',background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:99,fontSize:11,color:'#34d399' }}>⭐ Yarı yolda!</span>}
                            {qualityScore>=80&&<span style={{ padding:'5px 11px',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:99,fontSize:11,color:'#a5b4fc' }}>💎 Yüksek kalite!</span>}
                            {combinedToday===100&&<span style={{ padding:'5px 11px',background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:99,fontSize:11,color:'#34d399' }}>✅ Bugün tam puan!</span>}
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div style={{ marginTop:14,paddingTop:12,borderTop:'1px solid #2e3340',display:'flex',justifyContent:'flex-end',gap:8 }}>
                        <span style={{ fontSize:11,color:'#5c6475',alignSelf:'center',flex:1 }}>{rem} gün kaldı</span>
                        {isCreator
                          ?<button onClick={()=>setDeleteConfirm(goal.id)} style={{ ...S.btn('danger'),padding:'7px 12px',fontSize:12 }}>🗑 Sil</button>
                          :<button onClick={()=>setLeaveConfirm(goal.id)} style={{ ...S.btn('secondary'),padding:'7px 12px',fontSize:12,color:'#f87171' }}>↩ Ayrıl</button>
                        }
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Görev düzenleme modalı */}
      {editingTasks&&(
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:400 }} onClick={()=>setEditingTasks(null)}/>
          <div style={{ position:'fixed',top:'10%',left:'50%',transform:'translateX(-50%)',background:'#1c1f26',border:'1px solid #2e3340',borderRadius:16,padding:20,zIndex:401,width:'min(400px,90vw)',maxHeight:'80vh',overflowY:'auto' }}>
            <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0',marginBottom:6 }}>Kendi Görevlerimi Düzenle</div>
            <div style={{ fontSize:12,color:'#5c6475',marginBottom:14 }}>Arkadaşın farklı görevler ekleyebilir — hedef ortak, sorumluluklar kişisel.</div>
            <div style={{ display:'flex',flexDirection:'column',gap:7,marginBottom:10 }}>
              {editTaskList.map((t,i)=>(
                <div key={i} style={{ display:'flex',gap:7 }}>
                  <input style={S.input} placeholder={`Görev ${i+1}`} value={t.name||''} onChange={e=>setEditTaskList(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))} autoFocus={i===editTaskList.length-1&&!t.name}/>
                  <button onClick={()=>setEditTaskList(p=>p.filter((_,j)=>j!==i))} style={{ width:36,height:42,background:'#242830',border:'1px solid #2e3340',borderRadius:9,color:'#9aa0b0',cursor:'pointer',flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={()=>setEditTaskList(p=>[...p,{name:''}])} style={{ ...S.btn('ghost'),marginBottom:16,fontSize:12 }}>+ Görev Ekle</button>
            <div style={{ display:'flex',gap:9 }}>
              <button onClick={()=>setEditingTasks(null)} style={S.btn('secondary')}>İptal</button>
              <button onClick={()=>saveMyTasks(editingTasks)} style={{ ...S.btn('primary'),flex:1 }}>Kaydet</button>
            </div>
          </div>
        </>
      )}

      {/* Silme onayı */}
      {deleteConfirm&&(
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:400 }} onClick={()=>setDeleteConfirm(null)}/>
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'#1c1f26',border:'1px solid #2e3340',borderRadius:16,padding:24,zIndex:401,width:300,textAlign:'center' }}>
            <div style={{ fontSize:32,marginBottom:10 }}>🗑️</div>
            <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0',marginBottom:6 }}>Hedefi Sil</div>
            <div style={{ fontSize:13,color:'#5c6475',marginBottom:20 }}>Tüm üyeler için silinecek. Geri alınamaz.</div>
            <div style={{ display:'flex',gap:9 }}>
              <button onClick={()=>setDeleteConfirm(null)} style={{ ...S.btn('secondary'),flex:1 }}>İptal</button>
              <button onClick={()=>deleteGoal(deleteConfirm)} style={{ ...S.btn('danger'),flex:1 }}>Sil</button>
            </div>
          </div>
        </>
      )}

      {/* Ayrılma onayı */}
      {leaveConfirm&&(
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:400 }} onClick={()=>setLeaveConfirm(null)}/>
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'#1c1f26',border:'1px solid #2e3340',borderRadius:16,padding:24,zIndex:401,width:300,textAlign:'center' }}>
            <div style={{ fontSize:32,marginBottom:10 }}>↩</div>
            <div style={{ fontSize:15,fontWeight:600,color:'#e2e6f0',marginBottom:6 }}>Hedeften Ayrıl</div>
            <div style={{ fontSize:13,color:'#5c6475',marginBottom:20 }}>Sadece sen ayrılırsın.</div>
            <div style={{ display:'flex',gap:9 }}>
              <button onClick={()=>setLeaveConfirm(null)} style={{ ...S.btn('secondary'),flex:1 }}>İptal</button>
              <button onClick={()=>leaveGoal(leaveConfirm)} style={{ ...S.btn('danger'),flex:1 }}>Ayrıl</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
