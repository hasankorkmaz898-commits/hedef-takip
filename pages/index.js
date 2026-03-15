import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../lib/supabase'
import ProfilePanel from '../components/ProfilePanel'
import SharedGoalsPanel from '../components/SharedGoalsPanel'

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
  if (!task.active_days || task.active_days.length === 0) return true
  const dow = new Date(ds + 'T00:00:00').getDay()
  return task.active_days.includes(dow)
}

function activeTasks(tasks, ds) {
  return tasks.filter(t => taskActiveOnDay(t, ds))
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

  const supabase = createClient()

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
  async function handleSaveGoal(name, totalDays, taskList) {
    // taskList: [{name, active_days}]
    if (editGoal) {
      await supabase.from('goals').update({ name, total_days:totalDays }).eq('id',editGoal.id)
      await supabase.from('tasks').delete().eq('goal_id',editGoal.id)
      await supabase.from('tasks').insert(taskList.map((t,i)=>({ goal_id:editGoal.id, name:t.name, order_index:i, active_days:t.active_days })))
    } else {
      const { data:g } = await supabase.from('goals').insert({ name, total_days:totalDays, start_date:todayStr(), user_id:user.id }).select().single()
      if (g) await supabase.from('tasks').insert(taskList.map((t,i)=>({ goal_id:g.id, name:t.name, order_index:i, active_days:t.active_days })))
    }
    setShowModal(false); setEditGoal(null); await loadAll()
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
          {[['personal','🎯','Hedeflerim'],['shared','🤝','Ortak']].map(([t,icon,label])=>(
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

      {/* FAB — sadece kişisel sekmede */}
      {mainTab==='personal' && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:50 }}>
          <button
            onClick={() => { setEditGoal(null); setShowModal(true) }}
            style={{ padding:'13px 28px', background:'var(--accent)', border:'none', borderRadius:99, color:'#fff', fontSize:14, fontWeight:700, boxShadow:'0 4px 24px rgba(124,111,247,0.4)', display:'flex', alignItems:'center', gap:8 }}
          >
            + Yeni Hedef
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
function GoalCard({ goal, tasks, logs, notes, tab, openHist, noteInputs, onTabChange, onToggleHist, onToggleTask, onSetQuality, onRemoveLog, onSaveNote, onNoteChange, onEdit, onDelete, isOpen, onToggleOpen }) {
  const today    = todayStr()
  const op       = Math.round(overallScore(tasks,logs,goal.start_date,goal.total_days)*100)
  const tp       = Math.round(dayScore(tasks,logs,today)*100)
  const streak   = getStreak(tasks,logs,goal.start_date)
  const elapsed  = daysElapsed(goal.start_date)
  const remaining= daysLeft(goal.start_date,goal.total_days)
  const eta      = getETA(tasks,logs,goal.start_date,goal.total_days)
  const earned   = getEarnedBadges(tasks,logs,goal.start_date,goal.total_days)
  const todayLogs= logs.filter(l=>l.log_date===today)
  const doneTodayCount = todayLogs.length

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
            {[['tasks','Görevler'],['history','Geçmiş'],['chart','Grafik']].map(([t,l]) => (
              <button key={t} style={css.tab(tab===t)} onClick={()=>onTabChange(t)}>{l}</button>
            ))}
          </div>

          <div style={{ padding:'12px 16px 16px' }}>

            {tab==='tasks' && (
              <div className="anim-tab">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <span style={{ ...css.label }}>Bugünün Görevleri · {todayLogs.length}/{activeTasks(tasks,today).length}</span>
                  <button onClick={async()=>{ for(const l of todayLogs) await createClient().from('daily_logs').delete().eq('id',l.id) }} style={{ background:'none', border:'none', fontSize:12, color:'var(--text3)', cursor:'pointer' }}>Sıfırla</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {tasks.map(t => {
                    const isActive = taskActiveOnDay(t, today)
                    const log = todayLogs.find(l=>l.task_id===t.id)
                    const q   = log?.quality
                    const qBg = { good:'var(--good-bg)', mid:'var(--mid-bg)', bad:'var(--bad-bg)' }
                    const qBorder = { good:'rgba(74,222,128,0.3)', mid:'rgba(251,191,36,0.3)', bad:'rgba(248,113,113,0.3)' }
                    const DOW_TR = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
                    const activeDayLabels = t.active_days?.length ? t.active_days.map(d=>DOW_TR[d]).join(' · ') : null
                    return (
                      <div key={t.id} style={{ background:!isActive?'transparent':q?qBg[q]:'var(--surface2)', border:`1.5px solid ${!isActive?'var(--border)':q?qBorder[q]:'var(--border)'}`, borderRadius:'var(--r-md)', overflow:'hidden', opacity:isActive?1:0.45 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', cursor:isActive?'pointer':'default' }} onClick={()=>isActive&&onToggleTask(t.id)}>
                          <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${q?`var(--${q})`:isActive?'var(--border2)':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, background:q?qBg[q]:'transparent', color:`var(--${q||'text3'})`, fontWeight:700 }}>{q ? QSym[q] : ''}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, textDecoration:q?'line-through':'none', color:q?'var(--text3)':isActive?'var(--text)':'var(--text3)' }}>{t.name}</div>
                            {!isActive && activeDayLabels && <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{activeDayLabels}</div>}
                          </div>
                          {q && isActive && <span style={{ fontSize:11, fontWeight:700, color:`var(--${q})`, background:qBg[q], padding:'2px 8px', borderRadius:99 }}>{QLabel[q]}</span>}
                          {!isActive && <span style={{ fontSize:10, color:'var(--text3)', background:'var(--surface2)', padding:'2px 8px', borderRadius:99 }}>bugün yok</span>}
                        </div>
                        {q && isActive && (
                          <div style={{ display:'flex', gap:6, padding:'0 14px 12px' }}>
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

/* ─── Goal Modal ─────────────────────────────────────────────────────────── */
const DOW_TR  = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']

function GoalModal({ goal, tasks, onSave, onClose }) {
  const [name,     setName]     = useState(goal?.name||'')
  const [days,     setDays]     = useState(goal?.total_days||'')
  // taskList: [{name, active_days, _key}]
  const initTasks = tasks.length
    ? tasks.map((t,i) => ({ name:t.name, active_days:t.active_days||[], _key:i }))
    : [{ name:'', active_days:[], _key:0 }]
  const [taskList, setTaskList] = useState(initTasks)
  const [dayPicker, setDayPicker] = useState(null) // index of open picker

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
    onSave(name.trim(), parseInt(days), filtered.map(t=>({ name:t.name.trim(), active_days:t.active_days })))
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,12,18,0.88)', backdropFilter:'blur(6px)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0' }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--surface)', borderRadius:'26px 26px 0 0', padding:'26px 20px 44px', width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:18, fontWeight:800 }}>{goal?'Hedefi Düzenle':'Yeni Hedef'}</div>
          <button onClick={onClose} style={{ ...css.iconBtn }}>✕</button>
        </div>

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
              <div key={t._key}>
                {/* Görev satırı */}
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <input
                    defaultValue={t.name}
                    onBlur={e=>setTaskList(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
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
