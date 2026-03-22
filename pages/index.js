import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '../lib/supabase'
import ProfilePanel from '../components/ProfilePanel'
import SharedGoalsPanel from '../components/SharedGoalsPanel'
import ProfessionalPlanModal from '../components/ProfessionalPlanModal'
import WeeklyCheckin from '../components/WeeklyCheckin'
import MilestoneCelebration from '../components/MilestoneCelebration'

/* ─── Constants ──────────────────────────────────────────────────────────── */
const Q      = { good: 1.0, mid: 0.6, bad: 0.3 }
const QSym   = { good: '✓', mid: '−', bad: '✕' }
const QLabel = { good: 'İyi', mid: 'Orta', bad: 'Kötü' }
const DAYS   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const BADGES = [
  { id:'first_day',   icon:'🌱', label:'İlk Adım'     },
  { id:'streak3',     icon:'🔥', label:'3 Günlük Seri' },
  { id:'streak7',     icon:'⚡', label:'Haftalık Seri' },
  { id:'streak14',    icon:'💎', label:'2 Haftalık'    },
  { id:'perfect_day', icon:'⭐', label:'Mükemmel Gün'  },
  { id:'half_done',   icon:'🎯', label:'Yarı Yolda'    },
  { id:'quality_pro', icon:'🏆', label:'Kalite Pro'    },
  { id:'completed',   icon:'🎉', label:'Tamamlandı!'   },
]

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const toDate     = d => d.toISOString().slice(0,10)
const todayStr   = ()  => toDate(new Date())
const addDays    = (ds, n) => { const d = new Date(ds); d.setDate(d.getDate()+n); return toDate(d) }
const daysElapsed= s   => Math.max(0, Math.floor((new Date()-new Date(s))/86400000))
const daysLeft   = (s,t) => Math.max(0, t-daysElapsed(s))

function taskActiveOnDay(task, ds) {
  // extra_dates: bu tarihte özel olarak aktif (ertesi güne/telafi gününe aktarıldı)
  if (task.extra_dates?.includes(ds)) return true
  // Görev oluşturulmadan önceki günlerde aktif değil
  if (task.created_at) {
    const taskDate = task.created_at.slice(0,10)
    if (ds < taskDate) return false
  }
  // Sonlandırılmış görev — ended_at tarihinden sonra aktif değil
  if (task.ended_at && ds > task.ended_at) return false
  // Bugün için atlanmış — skipped_dates dizisinde varsa aktif değil
  if (task.skipped_dates?.includes(ds)) return false
  // Haftalık gün filtresi
  if (!task.active_days || task.active_days.length === 0) return true
  const dow = new Date(ds + 'T00:00:00').getDay()
  return task.active_days.includes(dow)
}

function activeTasks(tasks, ds) {
  return tasks.filter(t => taskActiveOnDay(t, ds))
}

function taskStatus(task, ds) {
  if (task.ended_at && ds >= task.ended_at) return 'ended'
  if (task.skipped_dates?.includes(ds)) return 'skipped'
  if (!taskActiveOnDay(task, ds)) return 'inactive'
  return 'active'
}

function dayScore(tasks, logs, ds) {
  const active = activeTasks(tasks, ds)
  if (!active.length) return -1
  const dl = logs.filter(l => l.log_date === ds)
  return active.reduce((s,t) => s + (dl.find(l=>l.task_id===t.id) ? Q[dl.find(l=>l.task_id===t.id).quality] : 0), 0) / active.length
}

function overallScore(tasks, logs, startDate, totalDays) {
  const e = daysElapsed(startDate); if (!e) return 0
  let sum = 0
  for (let i=0;i<e;i++) {
    const ds = addDays(startDate,i)
    const sc = dayScore(tasks, logs, ds)
    if (sc >= 0) sum += sc
  }
  return sum / totalDays
}

function getStreak(tasks, logs, startDate) {
  let s = 0
  for (let i=0;i<365;i++) {
    const d = new Date(); d.setDate(d.getDate()-i)
    const ds = toDate(d)
    if (ds < startDate) break
    const sc = dayScore(tasks, logs, ds)
    if (sc < 0) continue
    if (i===0 && sc===0 && !logs.some(l=>l.log_date===ds)) continue
    if (sc >= 0.5) s++; else break
  }
  return s
}

function getEarnedBadges(tasks, logs, startDate, totalDays) {
  const earned = new Set()
  const e   = daysElapsed(startDate)
  const op  = overallScore(tasks, logs, startDate, totalDays)
  const str = getStreak(tasks, logs, startDate)
  for (let i=0;i<e;i++) if (dayScore(tasks,logs,addDays(startDate,i))>0) { earned.add('first_day'); break }
  if (str>=3)  earned.add('streak3')
  if (str>=7)  earned.add('streak7')
  if (str>=14) earned.add('streak14')
  if (op>=0.5) earned.add('half_done')
  if (op>=1)   earned.add('completed')
  for (let i=0;i<e;i++) {
    const ds  = addDays(startDate,i)
    const dl  = logs.filter(l=>l.log_date===ds)
    if (tasks.length>0 && tasks.every(t=>dl.find(l=>l.task_id===t.id)?.quality==='good')) { earned.add('perfect_day'); break }
  }
  if (logs.length>=10) {
    const qs = Math.round(logs.reduce((s,l)=>s+(l.quality==='good'?100:l.quality==='mid'?60:30),0)/logs.length)
    if (qs>=80) earned.add('quality_pro')
  }
  return earned
}

function getETA(tasks, logs, startDate, totalDays) {
  const op = overallScore(tasks, logs, startDate, totalDays)
  if (op>=1) return { text:'Hedef tamamlandı! 🎉', color:'var(--good)' }
  const e = daysElapsed(startDate)
  if (!e)   return { text:'Bugün başladın, devam et!', color:'var(--text2)' }
  const rate = op/e
  if (!rate) return { text:'Henüz veri yok', color:'var(--text2)' }
  const need = Math.ceil((1-op)/rate)
  const left = daysLeft(startDate, totalDays)
  if (need<=left) return { text:`Mevcut tempo ile ~${need} günde tamamlanır`, color:'var(--good)' }
  return { text:`Mevcut tempo ile ${need} gün gerekiyor (${need-left} gün gecikme)`, color:'var(--mid)' }
}

/* ─── Shared styles ──────────────────────────────────────────────────────────────────────────────────── */
const css = {
  card: {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    borderRadius:'var(--r-xl)', padding:0, marginBottom:12, overflow:'hidden',
  },
  label: {
    fontSize:11, fontWeight:700, textTransform:'uppercase',
    letterSpacing:'0.08em', color:'var(--text3)',
  },
  input: {
    width:'100%', background:'var(--surface2)', border:'1.5px solid var(--border)',
    borderRadius:'var(--r-md)', padding:'12px 15px', color:'var(--text)',
    fontSize:15, fontWeight:500, outline:'none', WebkitAppearance:'none',
  },
  btn: (variant='primary') => ({
    padding: variant==='primary' ? '13px 22px' : '11px 16px',
    background: variant==='primary' ? 'var(--accent)' : 'var(--surface2)',
    border: variant==='primary' ? 'none' : '1.5px solid var(--border)',
    borderRadius:'var(--r-lg)', color: variant==='primary' ? '#fff' : 'var(--text2)',
    fontSize:14, fontWeight:700, cursor:'pointer',
  }),
  iconBtn: {
    width:34, height:34, background:'var(--surface2)', border:'1.5px solid var(--border)',
    borderRadius:'var(--r-md)', color:'var(--text3)', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
  },
  tab: (active) => ({
    flex:1, padding:'9px 8px', background: active?'var(--surface)':'transparent',
    border: active?'1.5px solid var(--border)':'1.5px solid transparent',
    borderRadius:'var(--r-md)', color: active?'var(--text)':'var(--text3)',
    fontSize:13, fontWeight: active?700:500, cursor:'pointer', transition:'all 0.15s',
  }),
}

/* ─── Main App ───────────────────────────────────────────────────────────── */
const supabase = createClient() // singleton — component dışında

export default function Home() {
  const [user,       setUser]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [goals,      setGoals]      = useState([])
  const [tasks,      setTasks]      = useState({})
  const [logs,       setLogs]       = useState({})
  const [notes,      setNotes]      = useState({})
  const [toast,         setToast]         = useState('')
  const [showModal,     setShowModal]     = useState(false)
  const [editGoal,      setEditGoal]      = useState(null)
  const [showProfile,   setShowProfile]   = useState(false)
  const [showShared,    setShowShared]    = useState(false)
  const [sharedFriend,  setSharedFriend]  = useState(null)
  const [tabs,       setTabs]       = useState({})
  const [openHist,   setOpenHist]   = useState({})
  const [noteInputs, setNoteInputs] = useState({})
  const [mainTab,    setMainTab]    = useState('personal')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [expandedGoal,   setExpandedGoal]   = useState(null)
  const [showProPlan,    setShowProPlan]    = useState(false)
  const [checkinGoal,    setCheckinGoal]    = useState(null)  // {goal, weekNum, weekName, stats}
  const [milestoneData,  setMilestoneData]  = useState(null)  // {weekNum, weekName, stats}

  /* Auth */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (user) loadAll() }, [user])

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' }
      }
    })
  }
  async function signOut() {
    await supabase.auth.signOut()
    setGoals([]); setTasks({}); setLogs({})
  }

  /* Data */
  async function loadAll() {
    const { data: gd } = await supabase.from('goals').select('*').order('created_at')
    if (!gd) return
    setGoals(gd)
    const tm={}, lm={}, nm={}
    for (const g of gd) {
      const { data:t } = await supabase.from('tasks').select('*').eq('goal_id',g.id).order('order_index')
      tm[g.id] = t||[]
      const { data:l } = await supabase.from('daily_logs').select('*').in('task_id',(t||[]).map(x=>x.id))
      lm[g.id] = l||[]
      const { data:n } = await supabase.from('daily_notes').select('*').eq('goal_id',g.id)
      ;(n||[]).forEach(x => { nm[`${g.id}:${x.note_date}`] = x.note })
    }
    setTasks(tm); setLogs(lm); setNotes(nm)
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }

  /* Goal CRUD */
  async function reorderTasks(goalId, fromIdx, toIdx) {
    const current = [...(tasks[goalId]||[])]
    const [moved] = current.splice(fromIdx, 1)
    current.splice(toIdx, 0, moved)
    // Optimistic update — UI anında güncellenir
    setTasks(p => ({...p, [goalId]: current}))
    // Supabase'e yaz
    await Promise.all(current.map((t, i) =>
      supabase.from('tasks').update({ order_index: i }).eq('id', t.id)
    ))
  }

  async function handleSaveGoal(name, totalDays, taskList) {
    // taskList: [{id?, name, active_days}]
    // id varsa mevcut task → güncelle (log geçmişi korunur)
    // id yoksa yeni task → ekle
    // editGoal'daki task listesinde olup taskList'te olmayanlar → sil
    if (editGoal) {
      await supabase.from('goals').update({ name, total_days:totalDays }).eq('id',editGoal.id)

      const existingIds = (tasks[editGoal.id]||[]).map(t=>t.id)
      const keptIds     = taskList.filter(t=>t.id).map(t=>t.id)
      const removedIds  = existingIds.filter(id=>!keptIds.includes(id))

      // Kaldırılan task'ları sil
      if (removedIds.length) await supabase.from('tasks').delete().in('id', removedIds)

      // Mevcut task'ları güncelle (log geçmişi bozulmaz)
      for (const [i, t] of taskList.entries()) {
        if (t.id) {
          await supabase.from('tasks').update({ name:t.name, order_index:i, active_days:t.active_days }).eq('id', t.id)
        } else {
          await supabase.from('tasks').insert({ goal_id:editGoal.id, name:t.name, order_index:i, active_days:t.active_days })
        }
      }
    } else {
      const { data:g } = await supabase.from('goals').insert({ name, total_days:totalDays, start_date:todayStr(), user_id:user.id }).select().single()
      if (g) await supabase.from('tasks').insert(taskList.map((t,i)=>({ goal_id:g.id, name:t.name, order_index:i, active_days:t.active_days })))
    }
    setShowModal(false); setEditGoal(null); await loadAll()
  }

  async function shareGoal(goalId) {
    const goal  = goals.find(g=>g.id===goalId)
    const gtasks = tasks[goalId]||[]
    if (!goal) return

    // Mevcut şablon var mı kontrol et
    const { data:existing } = await supabase
      .from('shared_templates')
      .select('id')
      .eq('goal_id', goalId)
      .single()

    let templateId
    if (existing) {
      templateId = existing.id
    } else {
      const { data:t } = await supabase.from('shared_templates').insert({
        goal_id:      goalId,
        goal_name:    goal.name,
        total_days:   goal.total_days,
        tasks:        gtasks.map(t=>({ name:t.name, active_days:t.active_days||[] })),
        creator_id:   user.id,
        creator_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kullanıcı',
      }).select().single()
      templateId = t?.id
    }

    if (!templateId) { alert('Paylaşım linki oluşturulamadı'); return }
    const link = `${window.location.origin}/share/${templateId}`
    await navigator.clipboard.writeText(link)
    showToast('🔗 Link kopyalandı!')
  }

  async function handleDeleteGoal(goalId) {
    if (!confirm('Bu hedef silinsin mi?')) return
    await supabase.from('goals').delete().eq('id',goalId); await loadAll()
  }

  /* Logs */
  async function toggleTask(goalId, taskId) {
    const ds = todayStr()
    const ex = (logs[goalId]||[]).find(l=>l.task_id===taskId&&l.log_date===ds)
    if (ex) await supabase.from('daily_logs').delete().eq('id',ex.id)
    else    await supabase.from('daily_logs').insert({ task_id:taskId, log_date:ds, quality:'good', user_id:user.id })
    await reloadLogs(goalId)
  }

  async function setQuality(goalId, taskId, quality, ds=todayStr()) {
    const ex = (logs[goalId]||[]).find(l=>l.task_id===taskId&&l.log_date===ds)
    if (ex) await supabase.from('daily_logs').update({ quality }).eq('id',ex.id)
    else    await supabase.from('daily_logs').insert({ task_id:taskId, log_date:ds, quality, user_id:user.id })
    await reloadLogs(goalId)
  }

  async function removeLog(goalId, taskId, ds) {
    const ex = (logs[goalId]||[]).find(l=>l.task_id===taskId&&l.log_date===ds)
    if (ex) await supabase.from('daily_logs').delete().eq('id',ex.id)
    await reloadLogs(goalId)
  }

  async function skipTaskToday(goalId, taskId) {
    const today = todayStr()
    const t = (tasks[goalId]||[]).find(x=>x.id===taskId)
    if (!t) return
    const skipped = [...(t.skipped_dates||[]), today]
    await supabase.from('tasks').update({ skipped_dates: skipped }).eq('id', taskId)
    setTasks(p=>({...p,[goalId]:p[goalId].map(x=>x.id===taskId?{...x,skipped_dates:skipped}:x)}))
  }

  async function unskipTask(goalId, taskId) {
    const today = todayStr()
    const t = (tasks[goalId]||[]).find(x=>x.id===taskId)
    if (!t) return
    const skipped = (t.skipped_dates||[]).filter(d=>d!==today)
    await supabase.from('tasks').update({ skipped_dates: skipped }).eq('id', taskId)
    setTasks(p=>({...p,[goalId]:p[goalId].map(x=>x.id===taskId?{...x,skipped_dates:skipped}:x)}))
  }

  async function transferTaskTo(goalId, taskId, targetDate) {
    // 1. Bugünü skipped_dates'e ekle
    // 2. targetDate'i extra_dates'e ekle
    const today = todayStr()
    const t = (tasks[goalId]||[]).find(x=>x.id===taskId)
    if (!t) return
    const skipped    = [...new Set([...(t.skipped_dates||[]), today])]
    const extraDates = [...new Set([...(t.extra_dates||[]), targetDate])]
    await supabase.from('tasks').update({ skipped_dates:skipped, extra_dates:extraDates }).eq('id', taskId)
    setTasks(p=>({...p,[goalId]:p[goalId].map(x=>x.id===taskId?{...x,skipped_dates:skipped,extra_dates:extraDates}:x)}))
    showToast(`📅 Görev ${targetDate} tarihine taşındı`)
  }

  async function endTask(goalId, taskId) {
    const today = todayStr()
    await supabase.from('tasks').update({ ended_at: today }).eq('id', taskId)
    setTasks(p=>({...p,[goalId]:p[goalId].map(x=>x.id===taskId?{...x,ended_at:today}:x)}))
  }

  async function restoreTask(goalId, taskId) {
    await supabase.from('tasks').update({ ended_at: null }).eq('id', taskId)
    setTasks(p=>({...p,[goalId]:p[goalId].map(x=>x.id===taskId?{...x,ended_at:null}:x)}))
  }

  async function reloadLogs(goalId) {
    const { data:l } = await supabase.from('daily_logs').select('*').in('task_id',(tasks[goalId]||[]).map(x=>x.id))
    setLogs(p=>({...p,[goalId]:l||[]}))
  }

  async function saveNote(goalId, ds) {
    const key = `${goalId}:${ds}`
    const note = noteInputs[key] ?? notes[key] ?? ''
    const { data:ex } = await supabase.from('daily_notes').select('id').eq('goal_id',goalId).eq('note_date',ds).single()
    if (ex) await supabase.from('daily_notes').update({ note }).eq('id',ex.id)
    else    await supabase.from('daily_notes').insert({ goal_id:goalId, note_date:ds, note, user_id:user.id })
    setNotes(p=>({...p,[key]:note})); showToast('Not kaydedildi')
  }

  /* Date */
  const now = new Date()
  const dateLabel = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text3)',fontSize:14 }}>
      Yükleniyor...
    </div>
  )

  if (!user) return <LoginPage onLogin={signIn} dateLabel={dateLabel} />

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'0 0 100px' }}>

      {/* Header */}
      <div style={{ padding:'14px 16px 0', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:0 }}>
        <div>
          <div style={{ fontSize:21, fontWeight:800, letterSpacing:'-0.03em' }}>
            Hedef<span style={{ color:'var(--accent)' }}>.</span>Takip
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{dateLabel}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setShowOnboarding(true)} style={{ width:34, height:34, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:'50%', color:'var(--text3)', fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} title="Nasıl kullanılır?">?</button>
          <div onClick={() => setShowProfile(true)} style={{ cursor:'pointer' }} title="Profilim">
            {user.user_metadata?.avatar_url
              ? <img src={user.user_metadata.avatar_url} alt="" style={{ width:36, height:36, borderRadius:'50%', border:'2px solid var(--border)', display:'block' }} />
              : <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>
                  {(user.user_metadata?.full_name||user.email||'?')[0].toUpperCase()}
                </div>
            }
          </div>
        </div>
      </div>

      {/* Ana Sekmeler */}
      <div style={{ padding:'12px 16px 0' }}>
        <div style={{ display:'flex', background:'var(--surface2)', borderRadius:16, padding:4, gap:3 }}>
          {[['personal','🎯','Hedeflerim'],['shared','🤝','Ortak'],['analytics','📊','Analiz']].map(([t,icon,label])=>(
            <button key={t} onClick={()=>setMainTab(t)} style={{ flex:1, padding:'10px 8px', background:mainTab===t?'var(--surface)':`transparent`, border:mainTab===t?'1.5px solid var(--border)':`1.5px solid transparent`, borderRadius:13, color:mainTab===t?'var(--text)':`var(--text3)`, fontSize:13, fontWeight:mainTab===t?700:500, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Kişisel Hedefler */}
      {mainTab==='personal' && (
        <div key="personal" className="anim-main-tab" style={{ padding:'12px 16px' }}>
          {goals.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 24px', color:'var(--text3)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🎯</div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text2)', marginBottom:6 }}>Henüz hedef yok</div>
              <div style={{ fontSize:14, marginBottom:20 }}>Aşağıdaki butona basarak başla</div>
              <button onClick={()=>setShowOnboarding(true)} style={{ padding:'9px 18px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:99, color:'var(--text3)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>? Nasıl çalışır</button>
            </div>
          ) : goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              tasks={tasks[goal.id]||[]}
              logs={logs[goal.id]||[]}
              notes={notes}
              tab={tabs[goal.id]||'tasks'}
              openHist={openHist}
              noteInputs={noteInputs}
              isOpen={expandedGoal===goal.id}
              onToggleOpen={()=>setExpandedGoal(p=>p===goal.id?null:goal.id)}
              onTabChange={t => setTabs(p=>({...p,[goal.id]:t}))}
              onToggleHist={k => setOpenHist(p=>({...p,[k]:!p[k]}))}
              onToggleTask={tid => toggleTask(goal.id, tid)}
              onSetQuality={(tid,q,ds) => setQuality(goal.id,tid,q,ds)}
              onRemoveLog={(tid,ds) => removeLog(goal.id,tid,ds)}
              onSaveNote={ds => saveNote(goal.id,ds)}
              onNoteChange={(k,v) => setNoteInputs(p=>({...p,[k]:v}))}
              onEdit={() => { setEditGoal(goal); setShowModal(true) }}
              onDelete={() => handleDeleteGoal(goal.id)}
              onReorderTasks={(from,to) => reorderTasks(goal.id, from, to)}
              onShare={() => shareGoal(goal.id)}
              onWeekClose={goal.is_professional ? (weekNum, weekName, stats) => {
                setCheckinGoal({ goal, weekNum, weekName, stats })
              } : null}
              onSkipTask={tid => skipTaskToday(goal.id, tid)}
              onUnskipTask={tid => unskipTask(goal.id, tid)}
              onEndTask={tid => endTask(goal.id, tid)}
              onRestoreTask={tid => restoreTask(goal.id, tid)}
              onTransferTask={(tid, targetDate) => transferTaskTo(goal.id, tid, targetDate)}
            />
          ))}
        </div>
      )}

      {/* Ortak Hedefler — inline */}
      {mainTab==='shared' && (
        <div style={{ padding:'12px 0 0' }}>
          <SharedGoalsPanel
            user={user}
            initialFriend={sharedFriend}
            inline={true}
            onClose={() => { setSharedFriend(null) }}
          />
        </div>
      )}

      {/* Analiz Sekmesi */}
      {mainTab==='analytics' && (
        <div key="analytics" className="anim-main-tab" style={{ padding:'12px 16px' }}>
          <AnalyticsPanel goals={goals} tasks={tasks} logs={logs} />
        </div>
      )}

      {/* FAB — sadece kişisel sekmede */}
      {mainTab==='personal' && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:50, display:'flex', gap:10 }}>
          <button
            onClick={() => { setEditGoal(null); setShowModal(true) }}
            style={{ padding:'13px 22px', background:'var(--accent)', border:'none', borderRadius:99, color:'#fff', fontSize:14, fontWeight:700, boxShadow:'0 4px 24px rgba(124,111,247,0.4)', display:'flex', alignItems:'center', gap:7, whiteSpace:'nowrap' }}
          >
            + Hedef
          </button>
          <button
            onClick={() => setShowProPlan(true)}
            style={{ padding:'13px 22px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:99, color:'var(--text)', fontSize:14, fontWeight:700, boxShadow:'0 4px 24px rgba(0,0,0,0.3)', display:'flex', alignItems:'center', gap:7, whiteSpace:'nowrap' }}
          >
            📋 Pro Plan
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <GoalModal
          goal={editGoal}
          tasks={editGoal ? (tasks[editGoal.id]||[]) : []}
          onSave={handleSaveGoal}
          onClose={() => { setShowModal(false); setEditGoal(null) }}
        />
      )}

      {/* Profesyonel Plan Modal */}
      {showProPlan && (
        <ProfessionalPlanModal
          user={user}
          onClose={() => setShowProPlan(false)}
          onSaved={() => { setShowProPlan(false); loadAll() }}
        />
      )}

      {/* Haftalık Değerlendirme */}
      {checkinGoal && (
        <WeeklyCheckin
          goal={checkinGoal.goal}
          weekNum={checkinGoal.weekNum}
          weekName={checkinGoal.weekName}
          stats={checkinGoal.stats}
          onComplete={(weekNum) => {
            const isMilestone = weekNum % 4 === 0
            setCheckinGoal(null)
            if (isMilestone) {
              setMilestoneData({ weekNum, weekName:checkinGoal.weekName, stats:checkinGoal.stats })
            }
          }}
          onClose={() => setCheckinGoal(null)}
        />
      )}

      {/* Kilometre Taşı Kutlaması */}
      {milestoneData && (
        <MilestoneCelebration
          weekNum={milestoneData.weekNum}
          weekName={milestoneData.weekName}
          stats={milestoneData.stats}
          onContinue={() => setMilestoneData(null)}
        />
      )}

      {/* Profile Panel */}
      {showProfile && (
        <ProfilePanel
          user={user}
          onClose={() => setShowProfile(false)}
          onSignOut={signOut}
          onOpenSharedGoal={(friend) => { setSharedFriend(friend); setMainTab('shared') }}
        />
      )}

      {/* Shared Goals Panel — overlay modu (profil panelinden açılınca) */}
      {showShared && (
        <SharedGoalsPanel
          user={user}
          initialFriend={sharedFriend}
          onClose={() => { setShowShared(false); setSharedFriend(null) }}
        />
      )}

      {/* Onboarding */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--r-md)', padding:'10px 18px', fontSize:13, color:'var(--text)', zIndex:999, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

/* ─── Login ──────────────────────────────────────────────────────────────── */
function LoginPage({ onLogin, dateLabel }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:32, fontWeight:700, letterSpacing:'-0.03em', marginBottom:6 }}>
            Hedef<span style={{ color:'var(--accent)' }}>.</span>Takip
          </div>
          <div style={{ fontSize:13, color:'var(--text3)' }}>{dateLabel}</div>
        </div>

        <div style={{ ...css.card, padding:28 }}>
          <div style={{ fontSize:36, marginBottom:16, textAlign:'center' }}>🎯</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8, textAlign:'center' }}>Hoş Geldin</div>
          <div style={{ fontSize:14, color:'var(--text2)', marginBottom:28, textAlign:'center', lineHeight:1.6 }}>
            Günlük hedeflerini takip et, kaliteni ölç, serine devam et.
          </div>
          <button
            onClick={onLogin}
            style={{ width:'100%', padding:'13px 20px', background:'#fff', border:'none', borderRadius:'var(--r-md)', color:'#111', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
          >
            <GoogleIcon />
            Google ile Giriş Yap
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

/* ─── Goal Card ──────────────────────────────────────────────────────────── */
function GoalCard({ goal, tasks, logs, notes, tab, openHist, noteInputs, onTabChange, onToggleHist, onToggleTask, onSetQuality, onRemoveLog, onSaveNote, onNoteChange, onEdit, onDelete, isOpen, onToggleOpen, onReorderTasks, onShare, onWeekClose, onSkipTask, onUnskipTask, onEndTask, onRestoreTask, onTransferTask }) {
  const today    = todayStr()
  const dragIdx     = useRef(null)
  const dragOverIdx = useRef(null)
  const [dragging,  setDragging]  = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null) // hangi task menüsü açık

  function handleDragStart(i) { dragIdx.current = i; setDragging(true) }
  function handleDragEnter(i) { dragOverIdx.current = i }
  function handleDragEnd() {
    setDragging(false)
    const from = dragIdx.current
    const to   = dragOverIdx.current
    dragIdx.current = null; dragOverIdx.current = null
    if (from === null || to === null || from === to) return
    onReorderTasks(from, to)
  }
  const op       = Math.round(overallScore(tasks,logs,goal.start_date,goal.total_days)*100)
  const tp       = Math.round(dayScore(tasks,logs,today)*100)
  const streak   = getStreak(tasks,logs,goal.start_date)
  const elapsed  = daysElapsed(goal.start_date)
  const remaining= daysLeft(goal.start_date,goal.total_days)
  const eta      = getETA(tasks,logs,goal.start_date,goal.total_days)
  const earned   = getEarnedBadges(tasks,logs,goal.start_date,goal.total_days)
  const todayLogs= logs.filter(l=>l.log_date===today)
  const doneTodayCount = todayLogs.length

  // Profesyonel plan: görevlerin week_number'ı varsa haftalı yapı
  const isPro = tasks.some(t=>t.week_number)
  const todayDow = new Date().getDay()
  // Hangi haftadayız? (hedef başlangıcından geçen gün sayısına göre)
  const currentWeek = isPro ? Math.min(
    Math.max(0, Math.floor(elapsed/7)),
    Math.max(...tasks.map(t=>t.week_number||1)) - 1
  ) : null
  const currentWeekNum = currentWeek !== null ? currentWeek + 1 : null
  const currentWeekName = isPro ? (tasks.find(t=>t.week_number===currentWeekNum)?.week_name || `${currentWeekNum}. Hafta`) : null

  let avgSum=0,avgCnt=0
  for (let i=0;i<elapsed;i++) {
    const ds=addDays(goal.start_date,i)
    if (logs.some(l=>l.log_date===ds)) { avgSum+=dayScore(tasks,logs,ds); avgCnt++ }
  }
  const ap = avgCnt ? Math.round((avgSum/avgCnt)*100) : 0
  const qs = logs.length ? Math.round(logs.reduce((s,l)=>s+(l.quality==='good'?100:l.quality==='mid'?60:30),0)/logs.length) : 0
  const opColor = op>=70?'var(--good)':op>=35?'var(--accent)':'var(--bad)'
  const qColor  = qs>=70?'var(--good)':qs>=40?'var(--mid)':'var(--bad)'
  const gradBg  = op>=70?'var(--good)':op>=35?'var(--accent)':'var(--bad)'

  const histDays = []
  for (let i=1;i<=14;i++) {
    const d=new Date(); d.setDate(d.getDate()-i)
    const ds=toDate(d)
    if (ds<goal.start_date) break
    histDays.push({ds,d})
  }

  const chartDays = []
  for (let i=13;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i)
    const ds=toDate(d)
    const dl=logs.filter(l=>l.log_date===ds)
    chartDays.push({ ds, isToday:ds===today, label:i===0?'Bugün':(i%3===0?(d.getDate()+'/'+MONTHS[d.getMonth()]):''),
      good:dl.filter(l=>l.quality==='good').length, mid:dl.filter(l=>l.quality==='mid').length, bad:dl.filter(l=>l.quality==='bad').length })
  }
  const n = tasks.length||1

  return (
    <div className="anim-card" style={{ ...css.card, padding:0, overflow:'hidden', marginBottom:10 }}>

      {/* Collapsed header */}
      <div onClick={onToggleOpen} style={{ padding:'14px 16px', cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{goal.name}</span>
              {isPro && currentWeekName && <span style={{ fontSize:11, background:'rgba(124,111,247,0.12)', border:'1.5px solid rgba(124,111,247,0.3)', color:'var(--accent)', borderRadius:99, padding:'1px 8px' }}>📋 {currentWeekName}</span>}
              {streak>=3 && <span style={{ fontSize:11, background:'rgba(251,146,60,0.12)', border:'1.5px solid rgba(251,146,60,0.3)', color:'var(--fire)', borderRadius:99, padding:'1px 8px' }}>🔥{streak}</span>}
            </div>
            <div style={{ height:4, background:'var(--surface2)', borderRadius:99, overflow:'hidden', marginBottom:6 }}>
              <div style={{ height:'100%', width:`${op}%`, background:gradBg, borderRadius:99, transition:'width 0.5s' }} />
            </div>
            <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--text3)' }}>
              <span>İlerleme <b style={{ color:opColor }}>{op}%</b></span>
              <span>Bugün <b style={{ color:'var(--text)' }}>{tp}%</b></span>
              <span>Kalite <b style={{ color:qColor }}>{qs}%</b></span>
              <span style={{ marginLeft:'auto' }}>{elapsed}/{goal.total_days}g</span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <span style={{ fontSize:11, color:doneTodayCount===tasks.length&&tasks.length>0?'var(--good)':'var(--text3)' }}>{doneTodayCount}/{tasks.length}</span>
            <button style={{ ...css.iconBtn, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e=>{e.stopPropagation();onShare()}} title="Paylaş">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="13" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/><circle cx="13" cy="13.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/><circle cx="3" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4"/><line x1="4.7" y1="7.1" x2="11.3" y2="3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><line x1="4.7" y1="8.9" x2="11.3" y2="12.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
            <button style={{ ...css.iconBtn, width:28, height:28, fontSize:12 }} onClick={e=>{e.stopPropagation();onEdit()}}>✎</button>
            <button style={{ ...css.iconBtn, width:28, height:28, fontSize:12, color:'var(--bad)' }} onClick={e=>{e.stopPropagation();onDelete()}}>✕</button>
            <span style={{ fontSize:16, color:'var(--text3)', transform:isOpen?'rotate(180deg)':'none', display:'inline-block', transition:'transform 0.2s' }}>⌄</span>
          </div>
        </div>
      </div>

      {/* Expanded */}
      {isOpen && (
        <div className="anim-expand" style={{ borderTop:'1px solid var(--border)' }}>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'var(--border)' }}>
            {[
              ['Bugün',  `${tp}%`,  'var(--text)'],
              ['Ort.',   `${ap}%`,  'var(--text)'],
              ['Kalite', `${qs}%`,  qColor],
              ['Seri',   streak>=3?`${streak}🔥`:`${streak}`, 'var(--fire)'],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:'var(--surface)', padding:'10px 0', textAlign:'center' }}>
                <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:16, fontWeight:800, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ margin:'12px 16px 0', background:'var(--surface2)', borderRadius:'var(--r-md)', padding:'9px 13px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13 }}>⏱</span>
            <span style={{ fontSize:12, color:eta.color }}>{eta.text}</span>
          </div>

          {streak >= 3 && (
            <div style={{ margin:'10px 16px 0', background:'var(--fire-bg)', border:'1.5px solid rgba(251,146,60,0.25)', borderRadius:'var(--r-md)', padding:'9px 13px', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18 }}>🔥</span>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--fire)' }}>{streak} günlük seri!</div>
            </div>
          )}

          <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'10px 16px 0' }}>
            {BADGES.map(b => {
              const e = earned.has(b.id)
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 9px', borderRadius:99, background:e?'var(--accent-light)':'transparent', border:`1.5px solid ${e?'rgba(124,111,247,0.3)':'var(--border)'}`, opacity:e?1:0.3, fontSize:11 }}>
                  <span>{b.icon}</span><span style={{ color:e?'var(--text)':'var(--text3)' }}>{b.label}</span>
                </div>
              )
            })}
          </div>

          <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--r-md)', padding:3, margin:'12px 16px 0' }}>
            {[['tasks','Görevler'],['history','Geçmiş'],['chart','Grafik'],['calendar','Takvim']].map(([t,l]) => (
              <button key={t} style={css.tab(tab===t)} onClick={()=>onTabChange(t)}>{l}</button>
            ))}
          </div>

          <div style={{ padding:'12px 16px 16px' }}>

            {tab==='tasks' && (
              <div className="anim-tab">

                {/* Pro plan: haftalık sekme navigasyonu */}
                {isPro && (() => {
                  const allWeekNums = [...new Set(tasks.map(t=>t.week_number).filter(Boolean))].sort((a,b)=>a-b)
                  const maxWeeks    = allWeekNums.length
                  const [proWeekTab, setProWeekTab] = [currentWeekNum, ()=>{}]
                  return null // sadece hafta nav aşağıda render edilecek
                })()}

                {isPro ? (
                  <ProWeekView
                    tasks={tasks}
                    logs={logs}
                    todayLogs={todayLogs}
                    today={today}
                    goal={goal}
                    currentWeekNum={currentWeekNum}
                    onToggleTask={onToggleTask}
                    onSetQuality={onSetQuality}
                    onSkipTask={onSkipTask}
                    onUnskipTask={onUnskipTask}
                    onEndTask={onEndTask}
                    onRestoreTask={onRestoreTask}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onWeekClose={onWeekClose}
                    onTransferTask={onTransferTask}
                  />
                ) : (
                <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <span style={{ ...css.label }}>Bugünün Görevleri · {todayLogs.length}/{activeTasks(tasks,today).length}</span>
                  <button onClick={async()=>{ for(const l of todayLogs) await supabase.from('daily_logs').delete().eq('id',l.id) }} style={{ background:'none', border:'none', fontSize:12, color:'var(--text3)', cursor:'pointer' }}>Sıfırla</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {tasks.map((t,ti) => {
                    const tStatus  = taskStatus(t, today)
                    const isActive = tStatus === 'active'
                    const isSkipped= tStatus === 'skipped'
                    const isEnded  = tStatus === 'ended'
                    const log = todayLogs.find(l=>l.task_id===t.id)
                    const q   = log?.quality
                    const qBg    = { good:'var(--good-bg)', mid:'var(--mid-bg)', bad:'var(--bad-bg)' }
                    const qBorder= { good:'rgba(74,222,128,0.3)', mid:'rgba(251,191,36,0.3)', bad:'rgba(248,113,113,0.3)' }
                    const DOW_LABELS = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
                    const activeDayLabels = t.active_days?.length ? t.active_days.map(d=>DOW_LABELS[d]).join(' · ') : null

                    // Kart arka planı ve border'ı duruma göre
                    const cardBg     = isEnded?'transparent':isSkipped?'rgba(251,191,36,0.04)':q?qBg[q]:'var(--surface2)'
                    const cardBorder = isEnded?'var(--border)':isSkipped?'rgba(251,191,36,0.25)':q?qBorder[q]:'var(--border)'
                    const cardOpacity= isEnded?0.4:isSkipped?0.6:1

                    return (
                      <div
                        key={t.id}
                        draggable={!isEnded}
                        onDragStart={()=>!isEnded&&handleDragStart(ti)}
                        onDragEnter={()=>handleDragEnter(ti)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e=>e.preventDefault()}
                        style={{ background:cardBg, border:`1.5px solid ${cardBorder}`, borderRadius:'var(--r-md)', opacity:cardOpacity, transition:'opacity 0.2s', position:'relative', overflow:'visible' }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 12px' }}>
                          {/* Sürükleme tutamacı */}
                          {!isEnded && (
                            <div style={{ color:'var(--text3)', fontSize:15, cursor:'grab', flexShrink:0, userSelect:'none', lineHeight:1 }} title="Sürükle">⠿</div>
                          )}

                          {/* Checkbox + isim */}
                          <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, cursor:isActive?'pointer':'default' }} onClick={()=>isActive&&onToggleTask(t.id)}>
                            <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${q?`var(--${q})`:isActive?'var(--border2)':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, background:q?qBg[q]:'transparent', color:`var(--${q||'text3'})`, fontWeight:700 }}>
                              {isEnded?'■':isSkipped?'–':q?QSym[q]:''}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:500, textDecoration:(q||isEnded)?'line-through':'none', color:q||isSkipped||isEnded?'var(--text3)':'var(--text)' }}>{t.name}</div>
                              {isEnded && <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Sonlandırıldı · {t.ended_at}</div>}
                              {isSkipped && <div style={{ fontSize:10, color:'var(--mid)', marginTop:2 }}>Bugün atlandı</div>}
                              {!isActive && !isSkipped && !isEnded && activeDayLabels && <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{activeDayLabels}</div>}
                            </div>
                            {q && isActive && <span style={{ fontSize:11, fontWeight:700, color:`var(--${q})`, background:qBg[q], padding:'2px 7px', borderRadius:99 }}>{QLabel[q]}</span>}
                          </div>

                          {/* Durum etiketi + aksiyon menüsü */}
                          <TaskMenu
                            taskId={t.id}
                            status={tStatus}
                            openId={openMenuId}
                            setOpenId={setOpenMenuId}
                            onSkip={()=>onSkipTask(t.id)}
                            onUnskip={()=>onUnskipTask(t.id)}
                            onEnd={()=>{ if(confirm(`"${t.name}" görevi sonlandırılsın mı? Geçmiş kayıtlar korunur.`)) onEndTask(t.id) }}
                            onRestore={()=>onRestoreTask(t.id)}
                          />
                        </div>

                        {/* Kalite seçici */}
                        {q && isActive && (
                          <div style={{ display:'flex', gap:6, padding:'0 12px 11px' }}>
                            {['good','mid','bad'].map(qv => (
                              <button key={qv} onClick={()=>onSetQuality(t.id,qv)} style={{ flex:1, padding:'7px 4px', borderRadius:'var(--r-md)', border:`1.5px solid ${q===qv?`var(--${qv})`:'var(--border)'}`, background:q===qv?qBg[qv]:'transparent', color:q===qv?`var(--${qv})`:'var(--text3)', fontSize:12, fontWeight:700, cursor:'pointer' }}>{QLabel[qv]}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <NoteSection goalId={goal.id} ds={today} notes={notes} noteInputs={noteInputs} onNoteChange={onNoteChange} onSaveNote={onSaveNote} />

                {logs.length > 0 && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ ...css.label, marginBottom:8 }}>Toplam Kalite Dağılımı</div>
                    <div style={{ display:'flex', gap:12, fontSize:13, marginBottom:8 }}>
                      <span style={{ color:'var(--good)' }}>✓ İyi: {logs.filter(l=>l.quality==='good').length}</span>
                      <span style={{ color:'var(--mid)' }}>− Orta: {logs.filter(l=>l.quality==='mid').length}</span>
                      <span style={{ color:'var(--bad)' }}>✕ Kötü: {logs.filter(l=>l.quality==='bad').length}</span>
                    </div>
                    <QBar logs={logs} />
                  </div>
                )}
                </>
                )}
              </div>
            )}

            {tab==='history' && (
              <div className="anim-tab">
                <div style={{ ...css.label, marginBottom:10 }}>Son 14 Gün</div>
                {histDays.length===0 && <div style={{ textAlign:'center', padding:20, color:'var(--text3)', fontSize:13 }}>Henüz geçmiş gün yok</div>}
                {histDays.map(({ds,d}) => {
                  const sc      = Math.round(dayScore(tasks,logs,ds)*100)
                  const hkey    = `${goal.id}:${ds}`
                  const hIsOpen = !!openHist[hkey]
                  const dayLogs = logs.filter(l=>l.log_date===ds)
                  const scColor = sc>=70?'var(--good)':sc>=30?'var(--mid)':'var(--text3)'
                  const note    = notes[hkey]||''
                  return (
                    <div key={ds} style={{ background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:'var(--r-md)', marginBottom:8, overflow:'hidden' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', cursor:'pointer' }} onClick={()=>onToggleHist(hkey)}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                          <span style={{ color:'var(--text3)', fontSize:11 }}>{hIsOpen?'▾':'▸'}</span>
                          <span>{DAYS[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}</span>
                          {note && <span style={{ fontSize:11, color:'var(--accent)' }}>📝</span>}
                        </div>
                        <span style={{ fontSize:13, fontWeight:700, color:scColor }}>{sc>0?`${sc}%`:'—'}</span>
                      </div>
                      {hIsOpen && (
                        <div style={{ padding:'0 14px 14px', borderTop:'1px solid var(--border)' }}>
                          {tasks.map(t => {
                            const log = dayLogs.find(l=>l.task_id===t.id)
                            const q   = log?.quality||null
                            const wasActive = taskActiveOnDay(t, ds)
                            return (
                              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--border)', opacity:wasActive?1:0.4 }}>
                                <div style={{ flex:1, fontSize:13, color:wasActive?'var(--text)':'var(--text3)' }}>
                                  {t.name}
                                  {!wasActive && <span style={{ fontSize:10, color:'var(--text3)', marginLeft:6 }}>· bu gün yok</span>}
                                </div>
                                {wasActive && <div style={{ display:'flex', gap:4 }}>
                                  {['good','mid','bad'].map(qv=>(
                                    <button key={qv} onClick={()=>onSetQuality(t.id,qv,ds)} style={{ padding:'4px 10px', borderRadius:'var(--r-md)', border:`1.5px solid ${q===qv?`var(--${qv})`:'var(--border)'}`, background:q===qv?{ good:'var(--good-bg)', mid:'var(--mid-bg)', bad:'var(--bad-bg)' }[qv]:'transparent', color:q===qv?`var(--${qv})`:'var(--text3)', fontSize:11, fontWeight:500, cursor:'pointer' }}>{QLabel[qv]}</button>
                                  ))}
                                  <button onClick={()=>onRemoveLog(t.id,ds)} style={{ padding:'4px 8px', borderRadius:'var(--r-md)', border:'1.5px solid var(--border)', background:'transparent', color:'var(--text3)', fontSize:11, cursor:'pointer' }}>—</button>
                                </div>}
                              </div>
                            )
                          })}
                          <NoteSection goalId={goal.id} ds={ds} notes={notes} noteInputs={noteInputs} onNoteChange={onNoteChange} onSaveNote={onSaveNote} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {tab==='chart' && (
              <div className="anim-tab">
                <div style={{ ...css.label, marginBottom:12 }}>Son 14 Gün</div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:100, marginBottom:8 }}>
                  {chartDays.map(({ds,isToday,label,good,mid,bad})=>{
                    const totalH=90, hasAny=good+mid+bad>0
                    const gH=Math.round((good/n)*totalH), mH=Math.round((mid/n)*totalH), bH=Math.round((bad/n)*totalH)
                    return (
                      <div key={ds} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%', gap:2 }}>
                        <div style={{ width:'100%', display:'flex', flexDirection:'column-reverse', borderRadius:'4px 4px 0 0', overflow:'hidden', minHeight:hasAny?Math.max(gH+mH+bH,4):3 }}>
                          {good>0 && <div style={{ height:gH, background:'var(--good)', opacity:0.8 }} />}
                          {mid >0 && <div style={{ height:mH, background:'var(--mid)',  opacity:0.8 }} />}
                          {bad >0 && <div style={{ height:bH, background:'var(--bad)',  opacity:0.8 }} />}
                          {!hasAny && <div style={{ height:3, background:'var(--border)' }} />}
                        </div>
                        {label && <div style={{ fontSize:9, color:isToday?'var(--accent)':'var(--text3)', marginTop:4, textAlign:'center' }}>{label}</div>}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  {[['var(--good)','İyi'],['var(--mid)','Orta'],['var(--bad)','Kötü'],['var(--border)','Yapılmadı']].map(([c,l])=>(
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text3)' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab==='calendar' && (
              <div className="anim-tab">
                <HeatmapCalendar tasks={tasks} logs={logs} startDate={goal.start_date} totalDays={goal.total_days} />
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Quality Bar ────────────────────────────────────────────────────────── */
function QBar({ logs }) {
  const good = logs.filter(l=>l.quality==='good').length
  const mid  = logs.filter(l=>l.quality==='mid').length
  const bad  = logs.filter(l=>l.quality==='bad').length
  const total = good+mid+bad
  if (!total) return null
  return (
    <div style={{ display:'flex', height:6, borderRadius:99, overflow:'hidden', gap:1 }}>
      <div style={{ flex:good, background:'var(--good)', opacity:0.7, borderRadius:99 }} />
      <div style={{ flex:mid,  background:'var(--mid)',  opacity:0.7, borderRadius:99 }} />
      <div style={{ flex:bad,  background:'var(--bad)',  opacity:0.7, borderRadius:99 }} />
    </div>
  )
}

/* ─── Note Section ───────────────────────────────────────────────────────── */
function NoteSection({ goalId, ds, notes, noteInputs, onNoteChange, onSaveNote }) {
  const key   = `${goalId}:${ds}`
  const saved = notes[key]||''
  const input = noteInputs[key] ?? saved
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ ...css.label, marginBottom:6 }}>Günlük Not</div>
      {saved && (
        <div style={{ background:'var(--accent-light)', border:'1.5px solid rgba(124,111,247,0.2)', borderRadius:'var(--r-md)', padding:'10px 12px', fontSize:13, color:'var(--text2)', marginBottom:8, lineHeight:1.6 }}>
          {saved}
        </div>
      )}
      <textarea
        value={input}
        onChange={e=>onNoteChange(key,e.target.value)}
        placeholder="Bu gün nasıl geçti?"
        rows={2}
        style={{ ...css.input, fontSize:13, resize:'vertical', lineHeight:1.6 }}
      />
      <button onClick={()=>onSaveNote(ds)} style={{ marginTop:6, padding:'7px 14px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer' }}>
        Kaydet
      </button>
    </div>
  )
}


/* ─── Risk Metre ─────────────────────────────────────────────────────────── */
function RiskMeter({ score }) {
  const zones = [
    { label:'Mükemmel', color:'#4ade80', from:0,  to:20 },
    { label:'İyi',      color:'#7c6ff7', from:20, to:40 },
    { label:'Orta',     color:'#fbbf24', from:40, to:60 },
    { label:'Zayıf',    color:'#fb923c', from:60, to:80 },
    { label:'Riskli',   color:'#f87171', from:80, to:100 },
  ]
  const activeZone = zones.find(z => score <= z.to) || zones[4]
  const pct = Math.min(97, Math.max(2, score))

  return (
    <div>
      {/* Zone etiketleri — şeridin üstünde */}
      <div style={{ display:'flex', marginBottom:6, gap:2 }}>
        {zones.map(z => {
          const isPast   = score > z.to
          const isActive = score > z.from && score <= z.to
          return (
            <div key={z.label} style={{ flex:1, textAlign:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, color: isPast||isActive ? z.color : z.color+'55', letterSpacing:'-0.01em' }}>{z.label}</span>
            </div>
          )
        })}
      </div>

      {/* Şerit + ibre */}
      <div style={{ position:'relative', marginBottom:8 }}>
        <div style={{ display:'flex', height:22, borderRadius:99, overflow:'hidden', gap:2 }}>
          {zones.map(z => {
            const isPast   = score > z.to
            const isActive = score > z.from && score <= z.to
            return (
              <div key={z.label} style={{ flex:1, background: isPast||isActive ? z.color : z.color+'22', borderRadius:0 }} />
            )
          })}
        </div>
        {/* İbre */}
        <div style={{ position:'absolute', top:-5, left:`${pct}%`, transform:'translateX(-50%)', pointerEvents:'none' }}>
          <div style={{ width:0, height:0, borderLeft:'6px solid transparent', borderRight:'6px solid transparent', borderTop:'8px solid var(--text)', margin:'0 auto' }} />
          <div style={{ background:'var(--text)', color:'var(--bg)', fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:99, textAlign:'center', marginTop:2, whiteSpace:'nowrap' }}>{score}</div>
        </div>
      </div>

      {/* Alt etiketler */}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'0 2px', marginTop:28 }}>
        <span style={{ fontSize:10, color:'#4ade80', fontWeight:700 }}>← Düşük risk</span>
        <span style={{ fontSize:10, color:'#f87171', fontWeight:700 }}>Yüksek risk →</span>
      </div>
    </div>
  )
}

/* ─── Analytics Panel ────────────────────────────────────────────────────── */
function AnalyticsPanel({ goals, tasks, logs }) {
  const DOW_TR = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
  const today  = todayStr()
  const [expandedId, setExpandedId] = useState(null)
  const [analyticTab, setAnalyticTab] = useState({}) // {goalId: 'overview'|'weekly'|'trend'|'tasks'}

  if (!goals.length) return (
    <div style={{ textAlign:'center', padding:'60px 24px', color:'var(--text3)' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--text2)', marginBottom:6 }}>Henüz veri yok</div>
      <div style={{ fontSize:13 }}>Hedef oluşturup görev işaretlemeye başla</div>
    </div>
  )

  const goalAnalytics = goals.map(goal => {
    const gt = tasks[goal.id]||[]
    const gl = logs[goal.id]||[]
    const e  = daysElapsed(goal.start_date)
    const remaining = daysLeft(goal.start_date, goal.total_days)
    const op = Math.round(overallScore(gt,gl,goal.start_date,goal.total_days)*100)

    // Günlük skorlar (sadece aktif günler)
    const daySc = []
    for (let i=0;i<e;i++) {
      const ds = addDays(goal.start_date,i)
      const sc = dayScore(gt,gl,ds)
      if (sc >= 0) daySc.push({ ds, sc, dow: new Date(ds+'T00:00:00').getDay() })
    }

    // ── Momentum: son 3 gün trendi (ağırlıklı) ──
    const last3  = daySc.slice(-3)
    const last7  = daySc.slice(-7)
    const prev7  = daySc.slice(-14,-7)
    const l3avg  = last3.length  ? last3.reduce((s,x)=>s+x.sc,0)/last3.length   : null
    const l7avg  = last7.length  ? last7.reduce((s,x)=>s+x.sc,0)/last7.length   : 0
    const p7avg  = prev7.length  ? prev7.reduce((s,x)=>s+x.sc,0)/prev7.length   : null
    const momentum = daySc.length < 3 ? null : Math.round((l7avg - (p7avg??l7avg))*100)
    // Son 3 günün yönü: pozitif mi negatif mi
    const recentTrend = last3.length >= 2
      ? (last3[last3.length-1].sc - last3[0].sc) * 100
      : null

    // ── Tutarlılık ──
    const consistency = daySc.length ? Math.round(daySc.filter(x=>x.sc>=0.3).length/daySc.length*100) : 0

    // ── Haftalık örüntü ──
    const dowMap = Array(7).fill(null).map(()=>({sum:0,cnt:0}))
    daySc.forEach(({sc,dow})=>{ dowMap[dow].sum+=sc; dowMap[dow].cnt++ })
    const dowAvg = dowMap.map(d=>d.cnt?Math.round(d.sum/d.cnt*100):null)
    const bestDow  = dowAvg.reduce((bi,v,i)=>v!==null&&(dowAvg[bi]===null||v>dowAvg[bi])?i:bi, 0)
    const worstDow = dowAvg.reduce((wi,v,i)=>v!==null&&(dowAvg[wi]===null||v<dowAvg[wi])?i:wi, 0)

    // ── Görev başarı oranları ──
    const taskStats = gt.map(t=>{
      const tLogs = gl.filter(l=>l.task_id===t.id)
      let activeCnt=0, doneCnt=0
      for (let i=0;i<e;i++) {
        const ds=addDays(goal.start_date,i)
        if (!taskActiveOnDay(t,ds)) continue
        activeCnt++
        if (tLogs.find(l=>l.log_date===ds)) doneCnt++
      }
      const rate = activeCnt ? Math.round(doneCnt/activeCnt*100) : 0
      const qAvg = tLogs.length ? Math.round(tLogs.reduce((s,l)=>s+(l.quality==='good'?100:l.quality==='mid'?60:30),0)/tLogs.length) : 0
      return { ...t, rate, qAvg, activeCnt, doneCnt }
    }).sort((a,b)=>b.rate-a.rate)

    // ── Kalite trendi ──
    const half = Math.floor(daySc.length/2)
    const fhAvg = half>0 ? Math.round(daySc.slice(0,half).reduce((s,x)=>s+x.sc,0)/half*100) : null
    const shAvg = daySc.slice(half).length>0 ? Math.round(daySc.slice(half).reduce((s,x)=>s+x.sc,0)/daySc.slice(half).length*100) : null

    const streak = getStreak(gt,gl,goal.start_date)
    const todaySc = dayScore(gt,gl,today)

    // ── Kurtarılabilirlik: bu tempoda hedefe ulaşılabilir mi? ──
    // Gerekli günlük oran = kalan hedef / kalan gün
    const neededPerDay = remaining > 0
      ? Math.max(0, (goal.total_days - (op/100*goal.total_days)) / remaining)
      : null
    const currentPerDay = l7avg ?? (daySc.length ? daySc.reduce((s,x)=>s+x.sc,0)/daySc.length : 0)
    const recoverable = neededPerDay !== null
      ? neededPerDay <= 1.0 && currentPerDay >= neededPerDay * 0.7
      : true

    // ── GELİŞMİŞ RISK SKORU (0=güvenli, 100=çok riskli) ──
    // 1. Veri güveni: az gün geçmişse belirsizlik yüksek
    const dataConfidence = Math.min(1, e / 7) // 7 gün sonra tam güven

    // 2. İlerleme riski: kalan süreye göre ne kadar geride?
    const expectedProgress = e / goal.total_days * 100
    const progressGap = Math.max(0, expectedProgress - op)       // % geride
    const progressRisk = Math.min(100, progressGap * 2)          // 50 puan geride = max risk

    // 3. Tutarlılık riski
    const consistencyRisk = Math.max(0, 100 - consistency)

    // 4. Momentum riski: son 3 gün düşüyor mu?
    const momentumRisk = recentTrend !== null
      ? Math.min(100, Math.max(0, -recentTrend * 2))             // düşüş → risk artar
      : 30                                                         // veri yok → orta risk

    // 5. Süre baskısı: son %30'luk dilimde mi?
    const timePressure = e / goal.total_days > 0.7
      ? Math.min(100, progressGap * 3)
      : 0

    // 6. Seri kırılma riski: bugün aktif görev var ama henüz sıfır
    const streakRisk = (streak >= 3 && todaySc === 0 && activeTasks(gt,today).length > 0) ? 40 : 0

    // Ağırlıklı toplam (veri güvenine göre scale)
    const rawRisk = (
      progressRisk   * 0.30 +
      consistencyRisk* 0.25 +
      momentumRisk   * 0.20 +
      timePressure   * 0.15 +
      streakRisk     * 0.10
    )
    // Veri az → riski ortaya çek (belirsiz)
    const riskScore = Math.round(rawRisk * dataConfidence + 50 * (1 - dataConfidence))

    // Sağlık = risk'in tersi (gösterge tutarlılığı için)
    const healthScore = Math.max(0, 100 - riskScore)
    const healthLabel = riskScore<=20?'Mükemmel':riskScore<=40?'İyi':riskScore<=60?'Orta':riskScore<=80?'Zayıf':'Riskli'
    const healthColor = riskScore<=20?'var(--good)':riskScore<=40?'var(--accent)':riskScore<=60?'var(--mid)':riskScore<=80?'var(--fire)':'var(--bad)'

    // ── Akıllı uyarılar ──
    const warnings = []
    if (streak>=3 && todaySc===0 && activeTasks(gt,today).length>0)
      warnings.push({ type:'danger', text:`🔥 ${streak} günlük serin tehlikede — bugün henüz görev işaretlemedin` })
    if (riskScore>70 && remaining>0)
      warnings.push({ type:'danger', text:`⚠️ Yüksek risk — mevcut tempoda hedefe ulaşmak zorlaşıyor` })
    if (momentum!==null && momentum<=-20)
      warnings.push({ type:'warn', text:`📉 Son 7 günde performans ${Math.abs(momentum)} puan düştü` })
    if (recentTrend!==null && recentTrend<=-20)
      warnings.push({ type:'warn', text:`📉 Son 3 gün düşüş trendinde — ivmeyi artır` })
    if (consistency<50 && e>7)
      warnings.push({ type:'warn', text:`⚠️ Tutarlılık düşük — aktif günlerin %${consistency}'inde hedefe ulaştın` })
    if (!recoverable && remaining>0 && e>5)
      warnings.push({ type:'danger', text:`🚨 Mevcut tempoda ${remaining} günde hedefe ulaşmak çok zor` })
    if (timePressure>50)
      warnings.push({ type:'warn', text:`⏰ Süre baskısı — son dilimdesin, günlük tempo artmalı` })
    if (riskScore<=20)
      warnings.push({ type:'good', text:`🏆 Mükemmel gidiyorsun — risk çok düşük` })
    if (momentum!==null && momentum>=15)
      warnings.push({ type:'good', text:`📈 Momentum yükseliyor — harika ivme` })
    if (recentTrend!==null && recentTrend>=20)
      warnings.push({ type:'good', text:`🚀 Son 3 günde sürekli yükseliş!` })

    return { goal, op, riskScore, healthScore, healthLabel, healthColor, momentum, recentTrend, consistency, dowAvg, bestDow, worstDow, taskStats, fhAvg, shAvg, warnings, daySc, e, remaining, recoverable, neededPerDay, currentPerDay }
  })

  const totalActive = goals.length
  const avgRisk     = Math.round(goalAnalytics.reduce((s,g)=>s+g.riskScore,0)/totalActive)
  const totalStreak = Math.max(...goals.map(g=>getStreak(tasks[g.id]||[],logs[g.id]||[],g.start_date)))
  const allWarnings = goalAnalytics.flatMap(g=>g.warnings).filter((w,i,a)=>a.findIndex(x=>x.text===w.text)===i).slice(0,5)

  return (
    <div>

      {/* Genel özet kartlar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {[
          { label:'Ort. Risk', val:avgRisk<=20?'Düşük':avgRisk<=40?'İyi':avgRisk<=60?'Orta':avgRisk<=80?'Zayıf':'Yüksek', color:avgRisk<=20?'var(--good)':avgRisk<=40?'var(--accent)':avgRisk<=60?'var(--mid)':avgRisk<=80?'var(--fire)':'var(--bad)' },
          { label:'Aktif Hedef', val:totalActive+'', color:'var(--accent)' },
          { label:'En Uzun Seri', val:totalStreak+'🔥', color:'var(--fire)' },
        ].map((s,i)=>(
          <div key={i} style={{ background:'var(--surface2)', borderRadius:16, padding:'13px 10px', textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text3)', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:i===0?15:22, fontWeight:800, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Uyarılar / içgörüler */}
      {allWarnings.length>0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ ...css.label, marginBottom:8 }}>Akıllı İçgörüler</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {allWarnings.map((w,i)=>(
              <div key={i} style={{ background:w.type==='danger'?'rgba(248,113,113,0.08)':w.type==='good'?'rgba(74,222,128,0.08)':'rgba(251,191,36,0.08)', border:`1.5px solid ${w.type==='danger'?'rgba(248,113,113,0.25)':w.type==='good'?'rgba(74,222,128,0.25)':'rgba(251,191,36,0.25)'}`, borderRadius:14, padding:'10px 13px', fontSize:13, color:w.type==='danger'?'var(--bad)':w.type==='good'?'var(--good)':'var(--mid)', fontWeight:500 }}>
                {w.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Her hedef için accordion analiz kartları */}
      {goalAnalytics.map(({ goal, op, riskScore, momentum, recentTrend, consistency, dowAvg, bestDow, worstDow, taskStats, fhAvg, shAvg, daySc, e, remaining, recoverable }) => {
        const isOpen = expandedId === goal.id
        const atab   = analyticTab[goal.id] || 'overview'
        const riskColor = riskScore<=20?'var(--good)':riskScore<=40?'var(--accent)':riskScore<=60?'var(--mid)':riskScore<=80?'var(--fire)':'var(--bad)'
        const riskLabel = riskScore<=20?'Mükemmel':riskScore<=40?'İyi':riskScore<=60?'Orta':riskScore<=80?'Zayıf':'Riskli'
        return (
          <div key={goal.id} style={{ background:'var(--surface)', border:`1.5px solid ${riskScore>70?'rgba(248,113,113,0.3)':riskScore>40?'rgba(251,191,36,0.2)':'var(--border)'}`, borderRadius:20, marginBottom:10, overflow:'hidden' }}>

            {/* Tıklanabilir başlık */}
            <div onClick={()=>setExpandedId(isOpen?null:goal.id)} style={{ padding:'13px 16px', cursor:'pointer', userSelect:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:6 }}>{goal.name}</div>
                  {/* Mini risk şeridi */}
                  <div style={{ height:4, background:'var(--surface2)', borderRadius:99, overflow:'hidden', marginBottom:5 }}>
                    <div style={{ height:'100%', width:`${riskScore}%`, background:riskColor, borderRadius:99 }}/>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--text3)' }}>
                    <span>Risk <b style={{ color:riskColor }}>{riskLabel}</b></span>
                    <span>İlerleme <b style={{ color:'var(--text)' }}>{op}%</b></span>
                    <span>Tutarlılık <b style={{ color:consistency>=70?'var(--good)':consistency>=40?'var(--mid)':'var(--bad)' }}>{consistency}%</b></span>
                  </div>
                </div>
                <span style={{ fontSize:16, color:'var(--text3)', transform:isOpen?'rotate(180deg)':'none', display:'inline-block', transition:'transform 0.2s', flexShrink:0 }}>⌄</span>
              </div>
            </div>

            {/* Açılır detay */}
            {isOpen && (
              <div className="anim-expand" style={{ borderTop:'1.5px solid var(--border)' }}>

                {/* Sekmeler */}
                <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--r-md)', padding:3, margin:'12px 16px 0' }}>
                  {[['overview','Özet'],['weekly','Haftalık'],['trend','Trend'],['tasks','Görevler']].map(([t,l])=>(
                    <button key={t} style={css.tab(atab===t)} onClick={()=>setAnalyticTab(p=>({...p,[goal.id]:t}))}>{l}</button>
                  ))}
                </div>

                <div style={{ padding:'12px 16px 16px' }}>

                  {/* ÖZET */}
                  {atab==='overview' && (
                    <div className="anim-tab">
                      <div style={{ marginBottom:14 }}>
                        <RiskMeter score={riskScore} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                        <div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:3 }}>
                            <span>İlerleme</span><b style={{ color:'var(--text)' }}>{op}%</b>
                          </div>
                          <div style={{ height:5, background:'var(--surface2)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${op}%`, background:op>=70?'var(--good)':op>=40?'var(--accent)':'var(--bad)', borderRadius:99 }}/>
                          </div>
                        </div>
                        <div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:3 }}>
                            <span>Tutarlılık</span><b style={{ color:consistency>=70?'var(--good)':consistency>=40?'var(--mid)':'var(--bad)' }}>{consistency}%</b>
                          </div>
                          <div style={{ height:5, background:'var(--surface2)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${consistency}%`, background:consistency>=70?'var(--good)':consistency>=40?'var(--mid)':'var(--bad)', borderRadius:99 }}/>
                          </div>
                        </div>
                      </div>
                      {momentum!==null && (
                        <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--text3)', marginBottom:8 }}>
                          <span>7 günlük trend <b style={{ color:momentum>=0?'var(--good)':'var(--bad)' }}>{momentum>=0?'+':''}{momentum}p</b></span>
                          {recentTrend!==null && <span>Son 3 gün <b style={{ color:recentTrend>=0?'var(--good)':'var(--bad)' }}>{recentTrend>=0?'↑':'↓'}</b></span>}
                        </div>
                      )}
                      {remaining>0 && (
                        <div style={{ background:recoverable?'rgba(74,222,128,0.08)':'rgba(248,113,113,0.08)', border:`1px solid ${recoverable?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'}`, borderRadius:10, padding:'7px 11px', fontSize:11, color:recoverable?'var(--good)':'var(--bad)', fontWeight:600 }}>
                          {recoverable?`✓ ${remaining} günde hedefe ulaşmak mümkün`:`✗ Mevcut tempoda ${remaining} günde yetişmek zor`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* HAFTALIK */}
                  {atab==='weekly' && (
                    <div className="anim-tab">
                      {e<7 ? (
                        <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:13 }}>En az 7 gün geçmesi gerekiyor</div>
                      ) : (
                        <>
                          <div style={{ ...css.label, marginBottom:8 }}>Gün Bazlı Ortalama</div>
                          <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:64, marginBottom:6 }}>
                            {DOW_TR.map((d,dow)=>{
                              const v = dowAvg[dow]
                              const h = v!==null ? Math.max(6, Math.round(v/100*50)) : 4
                              const isBest  = dow===bestDow  && v!==null
                              const isWorst = dow===worstDow && v!==null && v!==dowAvg[bestDow]
                              const col = isBest?'var(--good)':isWorst?'var(--bad)':'var(--accent)'
                              return (
                                <div key={dow} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                                  <div style={{ fontSize:9, color:isBest?'var(--good)':isWorst?'var(--bad)':'var(--text3)', fontWeight:700 }}>{v!==null?v+'%':''}</div>
                                  <div style={{ width:'100%', height:h, background:v!==null?col:'var(--surface2)', borderRadius:6, opacity:v!==null?0.85:0.3 }} />
                                  <div style={{ fontSize:10, color:isBest?'var(--good)':isWorst?'var(--bad)':'var(--text3)', fontWeight:isBest||isWorst?700:500 }}>{d}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text3)' }}>
                            {dowAvg[bestDow]!==null && <span style={{ color:'var(--good)', fontWeight:600 }}>En güçlü: {DOW_TR[bestDow]}</span>}
                            {dowAvg[worstDow]!==null && worstDow!==bestDow && <span style={{ color:'var(--bad)', fontWeight:600, marginLeft:10 }}>En zayıf: {DOW_TR[worstDow]}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* TREND */}
                  {atab==='trend' && (
                    <div className="anim-tab">
                      {fhAvg===null||shAvg===null||e<6 ? (
                        <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:13 }}>Yeterli veri yok</div>
                      ) : (
                        <div style={{ background:'var(--surface2)', borderRadius:14, padding:'12px 14px' }}>
                          <div style={{ ...css.label, marginBottom:10 }}>İlk Yarı vs Son Yarı</div>
                          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:3 }}>İlk {Math.floor(e/2)} gün</div>
                              <div style={{ height:7, background:'var(--surface)', borderRadius:99, overflow:'hidden', marginBottom:3 }}>
                                <div style={{ height:'100%', width:`${fhAvg}%`, background:'var(--accent)', borderRadius:99, opacity:.7 }} />
                              </div>
                              <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)' }}>{fhAvg}%</div>
                            </div>
                            <div style={{ fontSize:22, color:shAvg>=fhAvg?'var(--good)':'var(--bad)', fontWeight:800 }}>{shAvg>=fhAvg?'↑':'↓'}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:3 }}>Son {e-Math.floor(e/2)} gün</div>
                              <div style={{ height:7, background:'var(--surface)', borderRadius:99, overflow:'hidden', marginBottom:3 }}>
                                <div style={{ height:'100%', width:`${shAvg}%`, background:shAvg>=fhAvg?'var(--good)':'var(--bad)', borderRadius:99, opacity:.8 }} />
                              </div>
                              <div style={{ fontSize:14, fontWeight:700, color:shAvg>=fhAvg?'var(--good)':'var(--bad)' }}>{shAvg}%</div>
                            </div>
                          </div>
                          <div style={{ fontSize:12, color:'var(--text3)' }}>
                            {shAvg>fhAvg?`📈 ${shAvg-fhAvg} puan gelişim — giderek daha iyi`:shAvg<fhAvg?`📉 ${fhAvg-shAvg} puan düşüş — tempo yavaşladı`:'➡️ Sabit tempo'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* GÖREVLER */}
                  {atab==='tasks' && (
                    <div className="anim-tab">
                      <div style={{ ...css.label, marginBottom:10 }}>Görev Başarı Oranları</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {taskStats.map(t=>(
                          <div key={t.id}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                              <span style={{ fontSize:12, color:'var(--text2)', flex:1, marginRight:8 }}>{t.name}</span>
                              <span style={{ fontSize:12, fontWeight:700, color:t.rate>=70?'var(--good)':t.rate>=40?'var(--mid)':'var(--bad)', minWidth:32, textAlign:'right' }}>{t.rate}%</span>
                              {t.qAvg>0 && <span style={{ fontSize:10, color:'var(--text3)', marginLeft:8 }}>kalite {t.qAvg}%</span>}
                            </div>
                            <div style={{ height:5, background:'var(--surface2)', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${t.rate}%`, background:t.rate>=70?'var(--good)':t.rate>=40?'var(--mid)':'var(--bad)', borderRadius:99 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/* ─── Heatmap Calendar ───────────────────────────────────────────────────── */
function HeatmapCalendar({ tasks, logs, startDate, totalDays }) {
  const today = todayStr()
  // Son 3 ayı göster (veya hedef başından beri hangisi kısaysa)
  const endDate   = today
  const startShow = addDays(today, -89) < startDate ? startDate : addDays(today, -89)

  // Tüm günleri hesapla
  const days = []
  let cur = new Date(startShow + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (cur <= end) {
    const ds = toDate(cur)
    const sc = dayScore(tasks, logs, ds)
    const isActive = sc >= 0
    const isToday  = ds === today
    const isFuture = ds > today
    const inGoal   = ds >= startDate
    days.push({ ds, sc, isActive, isToday, isFuture, inGoal, dow: cur.getDay() })
    cur.setDate(cur.getDate() + 1)
  }

  // Haftalara böl (Pazartesi başlangıç)
  // İlk günün haftasını bul
  const firstDow = days[0]?.dow ?? 0
  const padStart = firstDow === 0 ? 6 : firstDow - 1
  const paddedDays = [...Array(padStart).fill(null), ...days]
  const weeks = []
  for (let i = 0; i < paddedDays.length; i += 7) weeks.push(paddedDays.slice(i, i+7))

  // Ay etiketleri
  const monthLabels = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const firstReal = week.find(d => d !== null)
    if (!firstReal) return
    const m = new Date(firstReal.ds + 'T00:00:00').getMonth()
    if (m !== lastMonth) { monthLabels.push({ wi, label: MONTHS[m] }); lastMonth = m }
  })

  function cellColor(d) {
    if (!d || !d.inGoal || d.isFuture) return 'var(--surface2)'
    if (!d.isActive) return 'rgba(124,111,247,0.08)' // aktif görev yok bu gün
    const sc = d.sc
    if (sc >= 0.8) return 'rgba(74,222,128,0.85)'
    if (sc >= 0.5) return 'rgba(74,222,128,0.45)'
    if (sc >= 0.2) return 'rgba(251,191,36,0.55)'
    if (sc  >  0)  return 'rgba(248,113,113,0.5)'
    return 'rgba(248,113,113,0.18)' // aktif gün ama yapılmadı
  }

  const DOW_SHORT = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz']

  // İstatistikler
  const activeDays = days.filter(d => d.inGoal && !d.isFuture && d.isActive)
  const doneDays   = activeDays.filter(d => d.sc >= 0.5)
  const perfectDays= activeDays.filter(d => d.sc >= 0.9)
  const streak     = getStreak(tasks, logs, startDate)

  return (
    <div>
      <div style={{ ...css.label, marginBottom:10 }}>Aktivite Takvimi</div>

      {/* Ay etiketleri */}
      <div style={{ display:'flex', marginBottom:4, paddingLeft:22 }}>
        {weeks.map((_, wi) => {
          const ml = monthLabels.find(m => m.wi === wi)
          return <div key={wi} style={{ flex:1, fontSize:9, color:'var(--text3)', fontWeight:600, textAlign:'center' }}>{ml ? ml.label : ''}</div>
        })}
      </div>

      <div style={{ display:'flex', gap:2 }}>
        {/* Gün etiketleri */}
        <div style={{ display:'flex', flexDirection:'column', gap:2, marginRight:2 }}>
          {DOW_SHORT.map((d,i) => (
            <div key={i} style={{ height:12, fontSize:8, color:'var(--text3)', display:'flex', alignItems:'center', fontWeight:500 }}>{i%2===0?d:''}</div>
          ))}
        </div>

        {/* Hücre grid */}
        <div style={{ display:'flex', gap:2, flex:1 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
              {week.map((d, di) => (
                <div key={di} title={d ? `${d.ds}: ${d.isActive ? Math.round(d.sc*100)+'%' : 'Görev yok'}` : ''} style={{
                  height:12,
                  borderRadius:3,
                  background: cellColor(d),
                  border: d?.isToday ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
        {[
          ['rgba(74,222,128,0.85)','%80+'],
          ['rgba(74,222,128,0.45)','%50+'],
          ['rgba(251,191,36,0.55)','%20+'],
          ['rgba(248,113,113,0.5)','Düşük'],
          ['rgba(248,113,113,0.18)','Yapılmadı'],
          ['rgba(124,111,247,0.08)','Görev yok'],
        ].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--text3)' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:c }} />{l}
          </div>
        ))}
      </div>

      {/* Özet istatistikler */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:14 }}>
        {[
          { label:'Aktif Gün', val:doneDays.length, color:'var(--good)' },
          { label:'Mükemmel', val:perfectDays.length, color:'var(--accent)' },
          { label:'Seri', val:`${streak}🔥`, color:'var(--fire)' },
        ].map((s,i) => (
          <div key={i} style={{ background:'var(--surface2)', borderRadius:12, padding:'10px 0', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


/* ─── Pro Week View ──────────────────────────────────────────────────────── */
function ProWeekView({ tasks, logs, todayLogs, today, goal, currentWeekNum, onToggleTask, onSetQuality, onSkipTask, onUnskipTask, onEndTask, onRestoreTask, openMenuId, setOpenMenuId, onWeekClose, onTransferTask }) {
  const allWeekNums = [...new Set(tasks.map(t=>t.week_number).filter(Boolean))].sort((a,b)=>a-b)
  const [activeWeek, setActiveWeek] = useState(currentWeekNum || allWeekNums[0] || 1)
  const DOW_FULL = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']

  const weekTasks = tasks.filter(t => t.week_number === activeWeek)
  const weekName  = weekTasks[0]?.week_name || `${activeWeek}. Hafta`

  // O haftanın aktif günleri
  const activeDows = [...new Set(weekTasks.flatMap(t => t.active_days||[]))].sort()

  // Bugün bu haftada mı?
  const isCurrent = activeWeek === currentWeekNum

  return (
    <div>
      {/* Hafta sekmeleri */}
      <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:8, marginBottom:12, WebkitOverflowScrolling:'touch' }}>
        {allWeekNums.map(wn => {
          const wTasks = tasks.filter(t=>t.week_number===wn)
          const wName  = wTasks[0]?.week_name || `${wn}. Hafta`
          const isCur  = wn===currentWeekNum
          const isMs   = wn%4===0
          return (
            <button key={wn} onClick={()=>setActiveWeek(wn)} style={{
              flexShrink:0, padding:'6px 12px', borderRadius:10, cursor:'pointer', fontFamily:'inherit',
              background: wn===activeWeek?'var(--accent)':isCur?'rgba(124,111,247,0.15)':'var(--surface2)',
              border: `1.5px solid ${wn===activeWeek?'var(--accent)':isCur?'rgba(124,111,247,0.4)':isMs?'rgba(251,191,36,0.35)':'var(--border)'}`,
              color: wn===activeWeek?'#fff':isCur?'var(--accent)':isMs?'var(--mid)':'var(--text3)',
              fontSize:11, fontWeight:700, position:'relative', whiteSpace:'nowrap'
            }}>
              {wName}
              {isCur && wn!==activeWeek && <span style={{ position:'absolute', top:-4, right:-4, width:7, height:7, borderRadius:'50%', background:'var(--good)', display:'block' }}/>}
              {isMs && !isCur && wn!==activeWeek && <span style={{ position:'absolute', top:-4, right:-4, fontSize:9 }}>🏆</span>}
            </button>
          )
        })}
      </div>

      {/* Haftanın başlığı */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{weekName}</div>
          {isCurrent && <div style={{ fontSize:11, color:'var(--accent)', marginTop:1 }}>● Aktif hafta</div>}
          {!isCurrent && activeWeek<currentWeekNum && <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>Geçmiş hafta</div>}
          {!isCurrent && activeWeek>currentWeekNum && <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>Gelecek hafta</div>}
        </div>
        {isCurrent && (
          <span style={{ fontSize:11, color:'var(--text3)' }}>
            {todayLogs.filter(l=>weekTasks.find(t=>t.id===l.task_id)).length}/{activeTasks(weekTasks,today).length} bugün
          </span>
        )}
      </div>

      {/* Günlere göre grupla */}
      {activeDows.length===0 ? (
        <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:13 }}>Bu haftada görev yok</div>
      ) : activeDows.map(dow => {
        const dayTasks = weekTasks.filter(t => t.active_days?.includes(dow) && !t.is_buffer)
        if (!dayTasks.length) return null
        const [dayOpen, setDayOpen] = [true, ()=>{}] // hep açık
        const dayName = DOW_FULL[dow]
        const dayDone = isCurrent ? dayTasks.filter(t=>todayLogs.find(l=>l.task_id===t.id)).length : 0
        const isToday = new Date().getDay()===dow && isCurrent

        return (
          <div key={dow} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'0 2px' }}>
              <span style={{ fontSize:11, fontWeight:700, color: isToday?'var(--accent)':'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em' }}>{dayName}</span>
              {isToday && <span style={{ fontSize:10, background:'rgba(124,111,247,0.15)', color:'var(--accent)', borderRadius:99, padding:'1px 7px', fontWeight:600 }}>Bugün · {dayDone}/{dayTasks.length}</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {dayTasks.map((t,ti) => {
                const tStatus  = isCurrent ? taskStatus(t, today) : (activeWeek<currentWeekNum?'ended':'active')
                const isActive = tStatus==='active'
                const isSkipped= tStatus==='skipped'
                const isEnded  = tStatus==='ended'
                const log = todayLogs.find(l=>l.task_id===t.id)
                const q   = log?.quality
                const qBg    = { good:'var(--good-bg)', mid:'var(--mid-bg)', bad:'var(--bad-bg)' }
                const qBorder= { good:'rgba(74,222,128,0.3)', mid:'rgba(251,191,36,0.3)', bad:'rgba(248,113,113,0.3)' }
                const cardBg     = isEnded?'transparent':isSkipped?'rgba(251,191,36,0.04)':q?qBg[q]:'var(--surface2)'
                const cardBorder = isEnded?'var(--border)':isSkipped?'rgba(251,191,36,0.25)':q?qBorder[q]:'var(--border)'
                return (
                  <div key={t.id} style={{ background:cardBg, border:`1.5px solid ${cardBorder}`, borderRadius:'var(--r-md)', opacity:isEnded?0.4:isSkipped?0.6:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, cursor:isActive?'pointer':'default' }} onClick={()=>isActive&&onToggleTask(t.id)}>
                        <div style={{ width:20, height:20, borderRadius:5, border:`2px solid ${q?`var(--${q})`:isActive?'var(--border2)':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0, background:q?qBg[q]:'transparent', color:`var(--${q||'text3'})` }}>
                          {isEnded?'■':isSkipped?'–':q?{good:'✓',mid:'−',bad:'✕'}[q]:''}
                        </div>
                        <div style={{ flex:1, fontSize:13, fontWeight:500, textDecoration:(q||isEnded)?'line-through':'none', color:q||isSkipped||isEnded?'var(--text3)':'var(--text)' }}>
                          {t.name}
                          {isSkipped && <span style={{ fontSize:10, color:'var(--mid)', marginLeft:6 }}>atlandı</span>}
                        </div>
                        {q && isActive && <span style={{ fontSize:10, fontWeight:700, color:`var(--${q})`, background:qBg[q], padding:'2px 7px', borderRadius:99 }}>{{good:'İyi',mid:'Orta',bad:'Kötü'}[q]}</span>}
                      </div>
                      {isCurrent && (
                        <TaskMenu taskId={t.id} status={tStatus} openId={openMenuId} setOpenId={setOpenMenuId}
                          onSkip={()=>onSkipTask(t.id)} onUnskip={()=>onUnskipTask(t.id)}
                          onEnd={()=>{ if(confirm(`"${t.name}" sonlandırılsın mı?`)) onEndTask(t.id) }}
                          onRestore={()=>onRestoreTask(t.id)}
                          isPro={true}
                          bufferDay={goal?.buffer_day}
                          goalStartDate={goal?.start_date}
                          activeWeekNum={activeWeek}
                          onTransferToTomorrow={onTransferTask ? ()=>{
                            const tomorrow = addDays(today, 1)
                            onTransferTask(t.id, tomorrow)
                          } : null}
                          onTransferToBuffer={onTransferTask && goal?.buffer_day!=null ? ()=>{
                            // Bu haftanın telafi gününü bul
                            const wStart = new Date(addDays(goal.start_date,(activeWeek-1)*7)+'T00:00:00')
                            const bufDow = goal.buffer_day
                            // Haftanın başından itibaren telafi gününü bul
                            let bufDate = null
                            for(let i=0;i<7;i++){
                              const d = new Date(wStart); d.setDate(d.getDate()+i)
                              if(d.getDay()===bufDow){ bufDate=d.toISOString().slice(0,10); break }
                            }
                            if(bufDate) onTransferTask(t.id, bufDate)
                          } : null}
                        />
                      )}
                    </div>
                    {q && isActive && (
                      <div style={{ display:'flex', gap:6, padding:'0 12px 10px' }}>
                        {['good','mid','bad'].map(qv=>(
                          <button key={qv} onClick={()=>onSetQuality(t.id,qv)} style={{ flex:1, padding:'6px 4px', borderRadius:'var(--r-md)', border:`1.5px solid ${q===qv?`var(--${qv})`:'var(--border)'}`, background:q===qv?qBg[qv]:'transparent', color:q===qv?`var(--${qv})`:'var(--text3)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {{good:'İyi',mid:'Orta',bad:'Kötü'}[qv]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Haftalık değerlendirme butonu — aktif haftanın altında */}
      {isCurrent && onWeekClose && (
        <div style={{ marginTop:16, background:'rgba(124,111,247,0.07)', border:'1.5px solid rgba(124,111,247,0.2)', borderRadius:14, padding:'13px 14px' }}>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10 }}>
            📋 <b style={{ color:'var(--text2)' }}>{weekName}</b> — bu haftayı değerlendirmeye hazır mısın?
          </div>
          <button
            onClick={()=>{
              const wStart = addDays(goal.start_date,(activeWeek-1)*7)
              const wEnd   = addDays(goal.start_date,activeWeek*7)
              const weekLogs  = logs.filter(l=>l.log_date>=wStart&&l.log_date<wEnd)
              const wTasks    = tasks.filter(t=>t.week_number===activeWeek)
              const dayScores = Array.from({length:7},(_,i)=>{
                const ds=addDays(goal.start_date,(activeWeek-1)*7+i)
                return Math.round(dayScore(wTasks,weekLogs,ds)*100)
              })
              const activeDays    = dayScores.filter(s=>s>0).length
              const total         = wTasks.length*7
              const completionPct = total>0?Math.round(weekLogs.length/total*100):0
              const qs = weekLogs.length?Math.round(weekLogs.reduce((s,l)=>s+(l.quality==='good'?100:l.quality==='mid'?60:30),0)/weekLogs.length):0
              const qualityLabel  = qs>=70?'İyi':qs>=40?'Orta':'Düşük'
              const streak        = getStreak(wTasks,weekLogs,goal.start_date)
              onWeekClose(activeWeek, weekName, { completionPct, activeDays, dailyScores:dayScores, qualityLabel, streak })
            }}
            style={{ width:'100%', padding:'12px', background:'var(--accent)', border:'none', borderRadius:12, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
          >
            Haftayı Değerlendir ve Kapat →
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Task Menu ──────────────────────────────────────────────────────────── */
function TaskMenu({ taskId, status, openId, setOpenId, onSkip, onUnskip, onEnd, onRestore, isPro, onTransferToTomorrow, onTransferToBuffer, bufferDay }) {
  const isOpen    = openId === taskId
  const isActive  = status === 'active'
  const isSkipped = status === 'skipped'
  const isEnded   = status === 'ended'
  const isInactive= status === 'inactive'

  // Dışarı tıklanınca kapat
  useEffect(() => {
    if (!isOpen) return
    const close = (e) => { setOpenId(null) }
    setTimeout(() => document.addEventListener('click', close), 0)
    return () => document.removeEventListener('click', close)
  }, [isOpen])

  return (
    <div style={{ position:'relative', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
      <button
        onClick={()=>setOpenId(isOpen ? null : taskId)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', padding:'4px 7px', borderRadius:6, display:'flex', flexDirection:'column', alignItems:'center', gap:3.5 }}
        title="Seçenekler"
      >
        <span style={{ display:'block', width:3.5, height:3.5, borderRadius:'50%', background:'currentColor' }}/>
        <span style={{ display:'block', width:3.5, height:3.5, borderRadius:'50%', background:'currentColor' }}/>
        <span style={{ display:'block', width:3.5, height:3.5, borderRadius:'50%', background:'currentColor' }}/>
      </button>

      {isOpen && (
        <div style={{
          position:'absolute', right:0, top:'calc(100% + 4px)',
          background:'var(--surface)', border:'1.5px solid var(--border)',
          borderRadius:14, padding:6, zIndex:500, minWidth:192,
          boxShadow:'0 8px 32px rgba(0,0,0,0.45)'
        }}>
          {/* Pro plan transfer seçenekleri */}
          {isPro && isActive && onTransferToTomorrow && (
            <>
              <button onClick={()=>{setOpenId(null);onTransferToTomorrow()}} style={menuBtn}>
                <span style={{ fontSize:15 }}>📅</span> Yarına aktar
              </button>
              {onTransferToBuffer && (
                <button onClick={()=>{setOpenId(null);onTransferToBuffer()}} style={menuBtn}>
                  <span style={{ fontSize:15 }}>⚡</span> Telafi gününe aktar
                </button>
              )}
              <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
            </>
          )}
          {(isActive || isInactive) && !isPro && (
            <button onClick={()=>{setOpenId(null);onSkip()}} style={menuBtn}>
              <span style={{ fontSize:15 }}>⏭</span> Bugün atla
            </button>
          )}
          {isSkipped && (
            <button onClick={()=>{setOpenId(null);onUnskip()}} style={menuBtn}>
              <span style={{ fontSize:15 }}>↩</span> Atlamayı geri al
            </button>
          )}
          {!isEnded && (
            <>
              {!isPro && <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>}
              <button onClick={()=>{setOpenId(null);onEnd()}} style={{ ...menuBtn, color:'var(--bad)' }}>
                <span style={{ fontSize:15 }}>⏹</span> Görevi sonlandır
              </button>
            </>
          )}
          {isEnded && (
            <button onClick={()=>{setOpenId(null);onRestore()}} style={{ ...menuBtn, color:'var(--good)' }}>
              <span style={{ fontSize:15 }}>▶</span> Görevi geri al
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const menuBtn = {
  display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px',
  background:'none', border:'none', borderRadius:9, color:'var(--text2)', fontSize:13,
  fontWeight:500, cursor:'pointer', fontFamily:'inherit', textAlign:'left'
}

/* ─── Goal Modal ─────────────────────────────────────────────────────────── */
const DOW_TR  = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']

const GOAL_TEMPLATES = [
  { icon:'🏃', name:'30 günde koşu alışkanlığı', days:30,
    tasks:[ {name:'Sabah 5km koşu', active_days:[1,2,3,4,5]}, {name:'Esneme hareketleri', active_days:[]}, {name:'Protein shake iç', active_days:[]} ] },
  { icon:'📚', name:'Günde 30 sayfa kitap', days:30,
    tasks:[ {name:'30 sayfa oku', active_days:[]}, {name:'Not al', active_days:[]} ] },
  { icon:'🧘', name:'21 günde meditasyon', days:21,
    tasks:[ {name:'10 dk meditasyon', active_days:[]}, {name:'Nefes egzersizi', active_days:[]} ] },
  { icon:'💧', name:'Su içme alışkanlığı', days:30,
    tasks:[ {name:'Sabah 1 bardak', active_days:[]}, {name:'Öğlen 2 bardak', active_days:[]}, {name:'Akşam 1 bardak', active_days:[]} ] },
  { icon:'💪', name:'Haftalık spor rutini', days:60,
    tasks:[ {name:'Antrenman yap', active_days:[1,3,5]}, {name:'Esneme', active_days:[1,2,3,4,5,6,0]}, {name:'Protein al', active_days:[1,3,5]} ] },
  { icon:'🥗', name:'Sağlıklı beslenme', days:30,
    tasks:[ {name:'Kahvaltı yap', active_days:[]}, {name:'Fast food yeme', active_days:[]}, {name:'Sebze/meyve ye', active_days:[]} ] },
  { icon:'✍️', name:'Günlük yazma', days:30,
    tasks:[ {name:'Günlük yaz (5 dk)', active_days:[]}, {name:'3 minnet yaz', active_days:[]} ] },
  { icon:'📵', name:'Telefon detoksu', days:21,
    tasks:[ {name:'Sabah 1 saat telefonsuz', active_days:[]}, {name:'Akşam yemekte telefon yok', active_days:[]}, {name:'Yatmadan 1 saat önce kapat', active_days:[]} ] },
]

function GoalModal({ goal, tasks, onSave, onClose }) {
  const [name,     setName]     = useState(goal?.name||'')
  const [days,     setDays]     = useState(goal?.total_days||'')
  // taskList: [{name, active_days, _key}]
  const initTasks = tasks.length
    ? tasks.map((t,i) => ({ id:t.id, name:t.name, active_days:t.active_days||[], _key:i }))
    : [{ name:'', active_days:[], _key:0 }]
  const [taskList, setTaskList] = useState(initTasks)
  const [dayPicker, setDayPicker] = useState(null)
  const [showTemplates, setShowTemplates] = useState(!goal)
  const dragIdx = useRef(null)
  const dragOverIdx = useRef(null)

  function onDragStart(i) { dragIdx.current = i }
  function onDragEnter(i) { dragOverIdx.current = i }
  function onDragEnd() {
    const from = dragIdx.current
    const to   = dragOverIdx.current
    if (from === null || to === null || from === to) { dragIdx.current=null; dragOverIdx.current=null; return }
    setTaskList(p => {
      const arr = [...p]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
    dragIdx.current = null
    dragOverIdx.current = null
  }

  function toggleDay(i, dow) {
    setTaskList(p => p.map((t,j) => {
      if (j!==i) return t
      const has = t.active_days.includes(dow)
      return { ...t, active_days: has ? t.active_days.filter(d=>d!==dow) : [...t.active_days, dow].sort() }
    }))
  }

  function handleSave() {
    const filtered = taskList.filter(t=>t.name.trim())
    if (!name.trim()||!days||!filtered.length) { alert('Lütfen tüm alanları doldur.'); return }
    onSave(name.trim(), parseInt(days), filtered.map(t=>({ id:t.id, name:t.name.trim(), active_days:t.active_days })))
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,12,18,0.88)', backdropFilter:'blur(6px)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0' }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--surface)', borderRadius:'26px 26px 0 0', padding:'26px 20px 44px', width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:800 }}>{goal?'Hedefi Düzenle':'Yeni Hedef'}</div>
          <button onClick={onClose} style={{ ...css.iconBtn }}>✕</button>
        </div>

        {/* Şablon seçici — sadece yeni hedefte */}
        {!goal && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ ...css.label }}>Şablondan Başla</div>
              <button onClick={()=>setShowTemplates(p=>!p)} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {showTemplates ? 'Gizle' : 'Göster'}
              </button>
            </div>
            {showTemplates && (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {GOAL_TEMPLATES.map((tpl,i) => (
                  <button key={i} onClick={()=>{
                    setName(tpl.name)
                    setDays(String(tpl.days))
                    setTaskList(tpl.tasks.map((t,j)=>({...t, _key:j})))
                    setShowTemplates(false)
                  }} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:'var(--r-md)', cursor:'pointer', textAlign:'left', width:'100%' }}>
                    <span style={{ fontSize:20 }}>{tpl.icon}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{tpl.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{tpl.days} gün · {tpl.tasks.length} görev</div>
                    </div>
                  </button>
                ))}
                <div style={{ height:1, background:'var(--border)', margin:'4px 0' }} />
                <button onClick={()=>setShowTemplates(false)} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, fontWeight:600, cursor:'pointer', padding:'4px 0', textAlign:'left' }}>
                  + Sıfırdan oluştur
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <div style={{ ...css.label, marginBottom:6 }}>Hedef Adı</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="örn: 30 günde 5kg ver" style={css.input} />
        </div>

        <div style={{ marginBottom:14 }}>
          <div style={{ ...css.label, marginBottom:6 }}>Süre (gün)</div>
          <input type="number" value={days} onChange={e=>setDays(e.target.value)} placeholder="örn: 30" min="1" style={css.input} />
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ ...css.label, marginBottom:6 }}>Görevler</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {taskList.map((t,i)=>(
              <div
                key={t._key}
                draggable
                onDragStart={()=>onDragStart(i)}
                onDragEnter={()=>onDragEnter(i)}
                onDragEnd={onDragEnd}
                onDragOver={e=>e.preventDefault()}
                style={{ opacity:1, transition:'opacity 0.15s' }}
              >
                {/* Görev satırı */}
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  {/* Sürükleme tutamacı */}
                  <div
                    title="Sürükle"
                    style={{ color:'var(--text3)', fontSize:16, cursor:'grab', flexShrink:0, padding:'0 2px', userSelect:'none', lineHeight:1, display:'flex', alignItems:'center' }}
                  >⠿</div>
                  <input
                    value={t.name}
                    onChange={e=>setTaskList(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                    placeholder={`Görev ${i+1}`}
                    style={{ ...css.input, flex:1 }}
                  />
                  {/* Takvim ikonu */}
                  <button
                    onClick={()=>setDayPicker(dayPicker===i?null:i)}
                    title="Hangi günler?"
                    style={{ ...css.iconBtn, flexShrink:0, width:36, height:36, fontSize:16,
                      background: t.active_days.length ? 'rgba(124,111,247,0.15)' : 'var(--surface2)',
                      border: `1.5px solid ${t.active_days.length ? 'rgba(124,111,247,0.4)' : 'var(--border)'}`,
                      color: t.active_days.length ? 'var(--accent)' : 'var(--text3)',
                      borderRadius: 'var(--r-md)'
                    }}
                  >📅</button>
                  <button onClick={()=>{ if(taskList.length>1) setTaskList(p=>p.filter((_,j)=>j!==i)) }} style={{ ...css.iconBtn, flexShrink:0 }}>✕</button>
                </div>

                {/* Gün seçici */}
                {dayPicker===i && (
                  <div style={{ background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:'var(--r-md)', padding:'10px 12px', marginBottom:4 }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text3)', marginBottom:8 }}>
                      Hangi günler aktif? {t.active_days.length===0 && <span style={{ color:'var(--accent)', fontWeight:500, textTransform:'none', letterSpacing:'normal', fontSize:11 }}>· her gün (varsayılan)</span>}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      {DOW_TR.map((label,dow)=>{
                        const on = t.active_days.includes(dow)
                        return (
                          <button key={dow} onClick={()=>toggleDay(i,dow)} style={{
                            flex:1, padding:'7px 2px', borderRadius:10, fontSize:11, fontWeight:700, cursor:'pointer',
                            background: on ? 'var(--accent)' : 'var(--surface)',
                            border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                            color: on ? '#fff' : 'var(--text3)',
                          }}>{label}</button>
                        )
                      })}
                    </div>
                    {t.active_days.length > 0 && (
                      <button onClick={()=>setTaskList(p=>p.map((x,j)=>j===i?{...x,active_days:[]}:x))} style={{ marginTop:8, background:'none', border:'none', color:'var(--text3)', fontSize:11, cursor:'pointer' }}>
                        × Tümünü temizle (her gün aktif)
                      </button>
                    )}
                  </div>
                )}

                {/* Seçili günler özeti */}
                {t.active_days.length > 0 && dayPicker!==i && (
                  <div style={{ fontSize:11, color:'var(--accent2)', paddingLeft:4 }}>
                    📅 {t.active_days.map(d=>DOW_TR[d]).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={()=>setTaskList(p=>[...p,{name:'',active_days:[],_key:Date.now()}])} style={{ marginTop:10, background:'none', border:'none', color:'var(--accent)', fontSize:13, fontWeight:500, cursor:'pointer' }}>+ Görev Ekle</button>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ ...css.btn('secondary'), flex:'0 0 auto' }}>İptal</button>
          <button onClick={handleSave} style={{ ...css.btn('primary'), flex:1 }}>Kaydet</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Onboarding Modal ────────────────────────────────────────────────────── */
function OnboardingModal({ onClose }) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      icon: '🎯',
      title: 'Hedef Oluştur',
      desc: 'Her hedef için bir süre ve günlük görevler belirlersin. Örneğin "30 günde koşu alışkanlığı" için görevler: sabah koşusu, esneme.',
      tip: '+ Yeni Hedef butonuna bas ve hedefini oluştur.',
    },
    {
      icon: '✓',
      title: 'Görevleri İşaretle',
      desc: 'Her gün görevlerine tıklayarak tamamlandı işareti koy. İşaretin yanında kalite seçebilirsin: İyi / Orta / Kötü.',
      tip: 'Kalite skoru günün ve genel puanını belirler.',
    },
    {
      icon: '📊',
      title: 'Puanlar Ne Anlama Gelir?',
      desc: 'Her görev için: İyi = 100p, Orta = 60p, Kötü = 30p. Günlük puan = o günkü görevlerin ortalaması. Genel ilerleme = tüm günlerin ortalaması.',
      tip: '🔥 Seri: arka arkaya %50+ skorlu günler.',
    },
    {
      icon: '🤝',
      title: 'Ortak Hedefler',
      desc: 'Arkadaşınla birlikte hedef oluşturabilirsiniz. Herkes kendi görevlerini ekler, birbirinizin ilerlemesini anlık olarak görürsünüz.',
      tip: 'Profilini aç → Arkadaş ekle → Ortak Hedef oluştur.',
    },
    {
      icon: '👤',
      title: 'Profil ve Arkadaşlar',
      desc: 'Sağ üstteki avatarına tıklayarak profilini açabilirsin. Kimlik kodunu paylaşarak arkadaşlarını ekleyebilirsin.',
      tip: 'Kodun HT-XXXXXX formatındadır, paylaşmak yeterli.',
    },
  ]

  const s = steps[step]
  const isLast = step === steps.length - 1

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(5,6,10,0.88)', backdropFilter:'blur(6px)', zIndex:500 }} onClick={onClose} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:501, width:'min(420px,92vw)', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:24, overflow:'hidden' }}>

        {/* Progress bar */}
        <div style={{ height:3, background:'#242830' }}>
          <div style={{ height:'100%', width:`${((step+1)/steps.length)*100}%`, background:'#7c6ff7', transition:'width 0.3s' }} />
        </div>

        <div style={{ padding:'28px 24px 24px' }}>
          {/* Icon + step */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div style={{ fontSize:40 }}>{s.icon}</div>
            <div style={{ fontSize:12, color:'#5c6475' }}>{step+1} / {steps.length}</div>
          </div>

          <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginBottom:10 }}>{s.title}</div>
          <div style={{ fontSize:14, fontWeight:500, color:'var(--text2)', lineHeight:1.7, marginBottom:16 }}>{s.desc}</div>

          {/* Tip kutusu */}
          <div style={{ background:'rgba(124,111,247,0.08)', border:'1.5px solid rgba(124,111,247,0.2)', borderRadius:14, padding:'10px 14px', fontSize:13, color:'#a89cf7', marginBottom:24 }}>
            💡 {s.tip}
          </div>

          {/* Butonlar */}
          <div style={{ display:'flex', gap:10 }}>
            {step > 0 && (
              <button onClick={()=>setStep(p=>p-1)} style={{ padding:'10px 16px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:14, color:'var(--text2)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>← Geri</button>
            )}
            <button
              onClick={()=>isLast ? onClose() : setStep(p=>p+1)}
              style={{ flex:1, padding:'11px 16px', background:'var(--accent)', border:'none', borderRadius:14, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
            >
              {isLast ? '🚀 Başla!' : 'İleri →'}
            </button>
          </div>

          {/* Atla */}
          {!isLast && (
            <button onClick={onClose} style={{ display:'block', width:'100%', marginTop:12, padding:'8px', background:'transparent', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              Atla
            </button>
          )}
        </div>
      </div>
    </>
  )
}
