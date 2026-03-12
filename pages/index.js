import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../lib/supabase'

// ── Quality weights ───────────────────────────────────────────────────────
const Q = { good: 1.0, mid: 0.6, bad: 0.3 }
const QSym = { good: '✓', mid: '~', bad: '✗' }
const QLabel = { good: 'İyi', mid: 'Orta', bad: 'Kötü' }
const DAYS = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']
const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

const BADGES = [
  { id:'first_day',   icon:'🌱', label:'İlk Adım',      color:'rgba(106,255,212,0.2)', border:'rgba(106,255,212,0.5)' },
  { id:'streak3',     icon:'🔥', label:'3 Günlük Seri',  color:'rgba(255,147,64,0.2)',  border:'rgba(255,147,64,0.5)'  },
  { id:'streak7',     icon:'⚡', label:'Haftalık Seri',  color:'rgba(255,217,106,0.2)', border:'rgba(255,217,106,0.5)' },
  { id:'streak14',    icon:'💎', label:'2 Haftalık',     color:'rgba(124,106,255,0.2)', border:'rgba(124,106,255,0.5)' },
  { id:'perfect_day', icon:'⭐', label:'Mükemmel Gün',   color:'rgba(255,217,106,0.2)', border:'rgba(255,217,106,0.5)' },
  { id:'half_done',   icon:'🎯', label:'Yarı Yolda',     color:'rgba(124,106,255,0.2)', border:'rgba(124,106,255,0.5)' },
  { id:'quality_pro', icon:'🏆', label:'Kalite Pro',     color:'rgba(255,107,158,0.2)', border:'rgba(255,107,158,0.5)' },
  { id:'completed',   icon:'🎉', label:'Tamamlandı!',    color:'rgba(106,255,212,0.2)', border:'rgba(106,255,212,0.5)' },
]

function toDate(d) { return d.toISOString().slice(0,10) }
function todayStr() { return toDate(new Date()) }
function addDays(ds, n) { const d = new Date(ds); d.setDate(d.getDate()+n); return toDate(d) }
function daysElapsed(s) { return Math.max(0, Math.floor((new Date() - new Date(s)) / 86400000)) }
function daysLeft(s, t) { return Math.max(0, t - daysElapsed(s)) }

// ── Score helpers (client-side, from loaded data) ─────────────────────────
function dayScore(tasks, logs, ds) {
  if (!tasks.length) return 0
  const dayLogs = logs.filter(l => l.log_date === ds)
  return tasks.reduce((s, t) => {
    const log = dayLogs.find(l => l.task_id === t.id)
    return s + (log ? Q[log.quality] : 0)
  }, 0) / tasks.length
}

function overallScore(tasks, logs, startDate, totalDays) {
  const e = daysElapsed(startDate)
  if (!e) return 0
  let sum = 0
  for (let i = 0; i < e; i++) {
    const ds = addDays(startDate, i)
    sum += dayScore(tasks, logs, ds)
  }
  return sum / totalDays
}

function getStreak(tasks, logs, startDate) {
  let streak = 0
  const today = todayStr()
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = toDate(d)
    if (ds < startDate) break
    const score = dayScore(tasks, logs, ds)
    const hasData = logs.some(l => l.log_date === ds)
    if (i === 0 && score === 0 && !hasData) continue
    if (score >= 0.5) streak++
    else break
  }
  return streak
}

function getEarnedBadges(tasks, logs, startDate, totalDays) {
  const earned = new Set()
  const e = daysElapsed(startDate)
  const op = overallScore(tasks, logs, startDate, totalDays)
  const streak = getStreak(tasks, logs, startDate)

  for (let i = 0; i < e; i++) {
    const ds = addDays(startDate, i)
    if (dayScore(tasks, logs, ds) > 0) { earned.add('first_day'); break }
  }
  if (streak >= 3)  earned.add('streak3')
  if (streak >= 7)  earned.add('streak7')
  if (streak >= 14) earned.add('streak14')
  if (op >= 0.5)    earned.add('half_done')
  if (op >= 1)      earned.add('completed')

  for (let i = 0; i < e; i++) {
    const ds = addDays(startDate, i)
    const dayLogs = logs.filter(l => l.log_date === ds)
    if (tasks.length > 0 && tasks.every(t => dayLogs.find(l => l.task_id === t.id)?.quality === 'good')) {
      earned.add('perfect_day'); break
    }
  }

  // quality pro: overall quality weighted avg >= 80
  const total = logs.length
  if (total >= 10) {
    const qs = total ? Math.round(logs.reduce((s,l) => s + (l.quality==='good'?100:l.quality==='mid'?60:30), 0) / total) : 0
    if (qs >= 80) earned.add('quality_pro')
  }

  return earned
}

function getETA(tasks, logs, startDate, totalDays) {
  const op = overallScore(tasks, logs, startDate, totalDays)
  if (op >= 1) return { text: "Hedef tamamlandı! 🎉", color: "var(--good)" }
  const e = daysElapsed(startDate)
  if (!e) return { text: "Bugün başladın, devam et!", color: "var(--muted)" }
  const rate = op / e
  if (!rate) return { text: "Henüz veri yok", color: "var(--muted)" }
  const need = Math.ceil((1 - op) / rate)
  const left = daysLeft(startDate, totalDays)
  if (need <= left) return { text: `~${need} gün içinde ulaşabilirsin ✓`, color: "var(--good)" }
  return { text: `Mevcut tempo: ${need} gün gerekiyor (+${need-left} gecikme)`, color: "var(--mid)" }
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState([])
  const [tasks, setTasks] = useState({})   // goalId → tasks[]
  const [logs, setLogs] = useState({})     // goalId → logs[]
  const [notes, setNotes] = useState({})   // goalId:date → note
  const [toast, setToast] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [tabs, setTabs] = useState({})
  const [openHistory, setOpenHistory] = useState({})
  const [noteInputs, setNoteInputs] = useState({})
  const supabase = createClient()

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (user) loadAll() }, [user])

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    setGoals([]); setTasks({}); setLogs({})
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function loadAll() {
    const { data: goalsData } = await supabase.from('goals').select('*').order('created_at')
    if (!goalsData) return
    setGoals(goalsData)

    const tasksMap = {}, logsMap = {}, notesMap = {}
    for (const g of goalsData) {
      const { data: t } = await supabase.from('tasks').select('*').eq('goal_id', g.id).order('order_index')
      tasksMap[g.id] = t || []

      const { data: l } = await supabase.from('daily_logs').select('*').in('task_id', (t||[]).map(x=>x.id))
      logsMap[g.id] = l || []

      const { data: n } = await supabase.from('daily_notes').select('*').eq('goal_id', g.id)
      ;(n||[]).forEach(note => { notesMap[`${g.id}:${note.note_date}`] = note.note })
    }
    setTasks(tasksMap)
    setLogs(logsMap)
    setNotes(notesMap)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Goal CRUD ─────────────────────────────────────────────────────────────
  async function handleSaveGoal(name, totalDays, taskNames) {
    if (editGoal) {
      await supabase.from('goals').update({ name, total_days: totalDays }).eq('id', editGoal.id)
      // update tasks: delete old, insert new
      await supabase.from('tasks').delete().eq('goal_id', editGoal.id)
      await supabase.from('tasks').insert(taskNames.map((n,i) => ({ goal_id: editGoal.id, name: n, order_index: i })))
    } else {
      const { data: g } = await supabase.from('goals').insert({ name, total_days: totalDays, start_date: todayStr(), user_id: user.id }).select().single()
      if (g) await supabase.from('tasks').insert(taskNames.map((n,i) => ({ goal_id: g.id, name: n, order_index: i })))
    }
    setShowModal(false); setEditGoal(null)
    await loadAll()
  }

  async function handleDeleteGoal(goalId) {
    if (!confirm('Bu hedef silinsin mi?')) return
    await supabase.from('goals').delete().eq('id', goalId)
    await loadAll()
  }

  // ── Log helpers ───────────────────────────────────────────────────────────
  async function toggleTask(goalId, taskId) {
    const ds = todayStr()
    const existing = (logs[goalId]||[]).find(l => l.task_id === taskId && l.log_date === ds)
    if (existing) {
      await supabase.from('daily_logs').delete().eq('id', existing.id)
    } else {
      await supabase.from('daily_logs').insert({ task_id: taskId, log_date: ds, quality: 'good', user_id: user.id })
    }
    await reloadLogs(goalId)
  }

  async function setQuality(goalId, taskId, quality, ds = todayStr()) {
    const existing = (logs[goalId]||[]).find(l => l.task_id === taskId && l.log_date === ds)
    if (existing) {
      await supabase.from('daily_logs').update({ quality }).eq('id', existing.id)
    } else {
      await supabase.from('daily_logs').insert({ task_id: taskId, log_date: ds, quality, user_id: user.id })
    }
    await reloadLogs(goalId)
  }

  async function removeLog(goalId, taskId, ds) {
    const existing = (logs[goalId]||[]).find(l => l.task_id === taskId && l.log_date === ds)
    if (existing) await supabase.from('daily_logs').delete().eq('id', existing.id)
    await reloadLogs(goalId)
  }

  async function reloadLogs(goalId) {
    const goalTasks = tasks[goalId] || []
    const { data: l } = await supabase.from('daily_logs').select('*').in('task_id', goalTasks.map(x=>x.id))
    setLogs(prev => ({ ...prev, [goalId]: l || [] }))
  }

  async function saveNote(goalId, ds) {
    const key = `${goalId}:${ds}`
    const note = noteInputs[key] ?? notes[key] ?? ''
    const existing = await supabase.from('daily_notes').select('id').eq('goal_id', goalId).eq('note_date', ds).single()
    if (existing.data) {
      await supabase.from('daily_notes').update({ note }).eq('id', existing.data.id)
    } else {
      await supabase.from('daily_notes').insert({ goal_id: goalId, note_date: ds, note, user_id: user.id })
    }
    setNotes(prev => ({ ...prev, [key]: note }))
    showToast('📝 Not kaydedildi!')
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const now = new Date()
  const dateLabel = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--muted)', fontFamily:'DM Mono,monospace', position:'relative', zIndex:1 }}>
      Yükleniyor...
    </div>
  )

  if (!user) return <LoginPage onLogin={signInWithGoogle} dateLabel={dateLabel} />

  return (
    <div style={{ position:'relative', zIndex:1, maxWidth:960, margin:'0 auto', padding:'40px 24px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:48 }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:28, letterSpacing:-1 }}>
          hedef<span style={{ color:'var(--accent)' }}>.</span>takip
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:2, padding:'6px 14px', border:'1px solid var(--border)', borderRadius:20 }}>{dateLabel}</div>
          <button onClick={signOut} style={{ fontSize:11, background:'transparent', border:'1px solid var(--border)', borderRadius:20, color:'var(--muted)', padding:'6px 14px', cursor:'pointer', fontFamily:'DM Mono,monospace', textTransform:'uppercase', letterSpacing:1 }}>Çıkış</button>
        </div>
      </div>

      {/* Add Goal Button */}
      <button onClick={() => { setEditGoal(null); setShowModal(true) }} style={{ width:'100%', padding:16, background:'transparent', border:'1.5px dashed var(--border)', borderRadius:16, color:'var(--muted)', fontFamily:'DM Mono,monospace', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:32, letterSpacing:1, textTransform:'uppercase' }}
        onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}>
        + yeni hedef ekle
      </button>

      {/* Goals */}
      {goals.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 24px', color:'var(--muted)' }}>
          <div style={{ fontSize:48, marginBottom:16, opacity:0.4 }}>🎯</div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:18, color:'var(--text)', marginBottom:8 }}>Henüz hedef yok</div>
          <div style={{ fontSize:13 }}>İlk hedefini ekleyerek başla</div>
        </div>
      ) : goals.map(goal => (
        <GoalCard
          key={goal.id}
          goal={goal}
          tasks={tasks[goal.id] || []}
          logs={logs[goal.id] || []}
          notes={notes}
          tab={tabs[goal.id] || 'tasks'}
          openHistory={openHistory}
          noteInputs={noteInputs}
          onTabChange={(t) => setTabs(p => ({...p, [goal.id]: t}))}
          onToggleHistory={(k) => setOpenHistory(p => ({...p, [k]: !p[k]}))}
          onToggleTask={(tid) => toggleTask(goal.id, tid)}
          onSetQuality={(tid, q, ds) => setQuality(goal.id, tid, q, ds)}
          onRemoveLog={(tid, ds) => removeLog(goal.id, tid, ds)}
          onSaveNote={(ds) => saveNote(goal.id, ds)}
          onNoteChange={(k, v) => setNoteInputs(p => ({...p, [k]: v}))}
          onEdit={() => { setEditGoal(goal); setShowModal(true) }}
          onDelete={() => handleDeleteGoal(goal.id)}
          userId={user.id}
        />
      ))}

      {/* Modal */}
      {showModal && (
        <GoalModal
          goal={editGoal}
          tasks={editGoal ? (tasks[editGoal.id]||[]) : []}
          onSave={handleSaveGoal}
          onClose={() => { setShowModal(false); setEditGoal(null) }}
        />
      )}

      {/* Toast */}
      <div style={{ position:'fixed', bottom:32, left:'50%', transform:`translateX(-50%) translateY(${toast?0:20}px)`, background:'var(--surface)', border:'1px solid var(--accent)', borderRadius:12, padding:'12px 20px', fontSize:13, color:'var(--text)', opacity:toast?1:0, transition:'all 0.3s', zIndex:999, pointerEvents:'none', whiteSpace:'nowrap' }}>
        {toast}
      </div>
    </div>
  )
}

// ── Login Page ────────────────────────────────────────────────────────────
function LoginPage({ onLogin, dateLabel }) {
  return (
    <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:24 }}>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:36, letterSpacing:-1, marginBottom:8 }}>
        hedef<span style={{ color:'var(--accent)' }}>.</span>takip
      </div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:48 }}>{dateLabel}</div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:40, width:'100%', maxWidth:400, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🎯</div>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:20, marginBottom:8 }}>Hoş Geldin</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginBottom:32, lineHeight:1.6 }}>
          Hedeflerini takip etmeye başlamak için giriş yap.
        </div>
        <button onClick={onLogin} style={{ width:'100%', padding:'14px 24px', background:'white', border:'none', borderRadius:12, color:'#1a1a2e', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google ile Giriş Yap
        </button>
      </div>
    </div>
  )
}

// ── Goal Card ─────────────────────────────────────────────────────────────
function GoalCard({ goal, tasks, logs, notes, tab, openHistory, noteInputs, onTabChange, onToggleHistory, onToggleTask, onSetQuality, onRemoveLog, onSaveNote, onNoteChange, onEdit, onDelete }) {
  const today = todayStr()
  const op    = Math.round(overallScore(tasks, logs, goal.start_date, goal.total_days) * 100)
  const tp    = Math.round(dayScore(tasks, logs, today) * 100)
  const streak= getStreak(tasks, logs, goal.start_date)
  const elapsed   = daysElapsed(goal.start_date)
  const remaining = daysLeft(goal.start_date, goal.total_days)
  const eta   = getETA(tasks, logs, goal.start_date, goal.total_days)
  const earned= getEarnedBadges(tasks, logs, goal.start_date, goal.total_days)

  // avg daily
  let avgSum = 0, avgCnt = 0
  for (let i = 0; i < elapsed; i++) {
    const ds = addDays(goal.start_date, i)
    if (logs.some(l => l.log_date === ds)) { avgSum += dayScore(tasks, logs, ds); avgCnt++ }
  }
  const ap = avgCnt ? Math.round((avgSum/avgCnt)*100) : 0

  // quality score
  const qs = logs.length ? Math.round(logs.reduce((s,l) => s+(l.quality==='good'?100:l.quality==='mid'?60:30),0)/logs.length) : 0
  const qColor = qs>=70?'var(--good)':qs>=40?'var(--mid)':'var(--bad)'
  const opColor= op>=70?'var(--good)':op>=35?'var(--accent)':'var(--accent2)'
  const grad   = op>=80?'linear-gradient(90deg,var(--good),#3fffc4)':op>=40?'linear-gradient(90deg,var(--accent),#b46aff)':'linear-gradient(90deg,var(--accent2),#ff9e6a)'

  // quality breakdown
  const qb = { good: logs.filter(l=>l.quality==='good').length, mid: logs.filter(l=>l.quality==='mid').length, bad: logs.filter(l=>l.quality==='bad').length }
  const qTotal = qb.good+qb.mid+qb.bad

  const todayLogs = logs.filter(l => l.log_date === today)

  // chart: last 21 days
  const chartDays = []
  for (let i = 20; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i)
    const ds = toDate(d)
    const dayLogs = logs.filter(l => l.log_date === ds)
    const c = { good: dayLogs.filter(l=>l.quality==='good').length, mid: dayLogs.filter(l=>l.quality==='mid').length, bad: dayLogs.filter(l=>l.quality==='bad').length }
    chartDays.push({ ds, c, isToday: ds===today, label: i===0?'bugün':(i%4===0?(d.getDate()+'/'+(d.getMonth()+1)):'') })
  }

  // history: last 14 days
  const histDays = []
  for (let i = 1; i <= 14; i++) {
    const d = new Date(); d.setDate(d.getDate()-i)
    const ds = toDate(d)
    if (ds < goal.start_date) break
    histDays.push({ ds, d })
  }

  const n = tasks.length || 1

  const s = { // inline styles shorthand
    card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:28, marginBottom:24 },
    sectionLabel: { fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' },
    statBox: (color) => ({ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 8px', textAlign:'center', flex:1 }),
    iconBtn: { width:32, height:32, background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' },
    tabBtn: (active) => ({ flex:1, padding:8, background: active?'var(--surface2)':'transparent', border:'none', borderRadius:8, color: active?'var(--text)':'var(--muted)', fontFamily:'DM Mono,monospace', fontSize:10, cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }),
    qBtn: (q, active) => {
      const colors = { good:'var(--good)', mid:'var(--mid)', bad:'var(--bad)' }
      const bgs    = { good:'rgba(106,255,212,0.15)', mid:'rgba(255,217,106,0.15)', bad:'rgba(255,106,106,0.15)' }
      return { flex:1, padding:'6px 4px', borderRadius:8, border:`1.5px solid ${active?colors[q]:'var(--border)'}`, fontFamily:'DM Mono,monospace', fontSize:11, cursor:'pointer', textTransform:'uppercase', letterSpacing:1, background: active?bgs[q]:'transparent', color: active?colors[q]:'var(--muted)' }
    },
    hqBtn: (q, active) => {
      const colors = { good:'var(--good)', mid:'var(--mid)', bad:'var(--bad)', none:'var(--muted)' }
      const bgs    = { good:'rgba(106,255,212,0.15)', mid:'rgba(255,217,106,0.15)', bad:'rgba(255,106,106,0.15)', none:'rgba(107,107,136,0.15)' }
      return { padding:'3px 8px', borderRadius:6, border:`1px solid ${active?colors[q]:'var(--border)'}`, fontFamily:'DM Mono,monospace', fontSize:10, cursor:'pointer', background: active?bgs[q]:'transparent', color: active?colors[q]:'var(--muted)', textTransform:'uppercase' }
    }
  }

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:18, marginBottom:4 }}>🎯 {goal.name}</div>
          <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{elapsed} / {goal.total_days} gün • {remaining} gün kaldı</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button style={s.iconBtn} onClick={onEdit}>✎</button>
          <button style={s.iconBtn} onClick={onDelete}>✕</button>
        </div>
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,147,64,0.08)', border:'1px solid rgba(255,147,64,0.3)', borderRadius:12, padding:'10px 16px', marginBottom:16 }}>
          <span style={{ fontSize:20 }}>🔥</span>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20, color:'var(--fire)' }}>{streak}</span>
          <span style={{ color:'var(--muted)', fontSize:12 }}>günlük seri</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[
          { val:`${op}%`, label:'Genel',     color:'var(--accent)' },
          { val:`${tp}%`, label:'Bugün',     color:'var(--good)'   },
          { val:`${ap}%`, label:'Günlük Ort',color:'var(--mid)'    },
          { val:`${qs}%`, label:'Kalite',    color:qColor          },
          { val:`${streak}🔥`, label:'Seri', color:'var(--fire)'   },
        ].map((st,i) => (
          <div key={i} style={s.statBox()}>
            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:18, lineHeight:1, marginBottom:4, color:st.color }}>{st.val}</div>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)' }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'1.5px', color:'var(--muted)' }}>Hedef İlerlemesi</span>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:opColor }}>{op}%</span>
        </div>
        <div style={{ height:6, background:'var(--bg)', borderRadius:99, overflow:'hidden', border:'1px solid var(--border)' }}>
          <div style={{ height:'100%', width:`${op}%`, borderRadius:99, background:grad, transition:'width 0.6s' }} />
        </div>
      </div>

      {/* ETA */}
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <span style={{ fontSize:16 }}>⏱</span>
        <span style={{ fontSize:12, color:eta.color }}>{eta.text}</span>
      </div>

      {/* Badges */}
      <div style={{ marginBottom:20 }}>
        <div style={s.sectionLabel}><span>🏆 Rozetler</span></div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {BADGES.map(b => {
            const e = earned.has(b.id)
            return (
              <div key={b.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20, border:`1px solid ${e?b.border:'var(--border)'}`, background:e?b.color:'transparent', opacity:e?1:0.3, filter:e?'none':'grayscale(1)', fontSize:11 }}>
                <span style={{ fontSize:14 }}>{b.icon}</span>
                <span>{b.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:4 }}>
        {['tasks','history','chart'].map(t => (
          <button key={t} style={s.tabBtn(tab===t)} onClick={() => onTabChange(t)}>
            {t==='tasks'?'Görevler':t==='history'?'Geçmiş':'Grafik'}
          </button>
        ))}
      </div>

      {/* TASKS TAB */}
      {tab === 'tasks' && (
        <div>
          <div style={s.sectionLabel}>
            <span>Bugünün Görevleri ({todayLogs.length}/{tasks.length})</span>
            <button onClick={async () => { for (const l of todayLogs) await supabase.from('daily_logs').delete().eq('id', l.id); await reloadLogsLocal() }} style={{ fontSize:10, background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>Günü sıfırla</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
            {tasks.map(t => {
              const log = todayLogs.find(l => l.task_id === t.id)
              const q = log?.quality
              const colors = { good:'rgba(106,255,212,0.45)', mid:'rgba(255,217,106,0.45)', bad:'rgba(255,106,106,0.45)' }
              return (
                <div key={t.id} style={{ background:'var(--bg)', border:`1px solid ${q?colors[q]:'var(--border)'}`, borderRadius:12, overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', cursor:'pointer' }} onClick={() => onToggleTask(t.id)}>
                    <div style={{ width:18, height:18, border:`1.5px solid ${q?('var(--'+q+')'):'var(--border)'}`, borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0, background:q?`rgba(${q==='good'?'106,255,212':q==='mid'?'255,217,106':'255,106,106'},0.15)`:'transparent', color:q?`var(--${q})`:'transparent' }}>
                      {q ? QSym[q] : ''}
                    </div>
                    <div style={{ fontSize:13, flex:1, textDecoration:q?'line-through':'none', color:q?'var(--muted)':'var(--text)' }}>{t.name}</div>
                    {q && <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:1, color:`var(--${q})` }}>{QLabel[q]}</div>}
                  </div>
                  {q && (
                    <div style={{ display:'flex', padding:'0 14px 10px', gap:6 }}>
                      {['good','mid','bad'].map(qv => (
                        <button key={qv} style={s.qBtn(qv, q===qv)} onClick={() => onSetQuality(t.id, qv)}>
                          {qv==='good'?'✓ İyi':qv==='mid'?'~ Orta':'✗ Kötü'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Today note */}
          <NoteSection goalId={goal.id} ds={today} notes={notes} noteInputs={noteInputs} onNoteChange={onNoteChange} onSaveNote={onSaveNote} />

          {/* Quality breakdown */}
          <div style={{ marginTop:18 }}>
            <div style={s.sectionLabel}><span>Toplam Kalite Dağılımı</span></div>
            <div style={{ display:'flex', gap:16, fontSize:11, marginBottom:8 }}>
              <span style={{ color:'var(--good)' }}>✓ İyi: {qb.good}</span>
              <span style={{ color:'var(--mid)' }}>~ Orta: {qb.mid}</span>
              <span style={{ color:'var(--bad)' }}>✗ Kötü: {qb.bad}</span>
            </div>
            {qTotal > 0 && (
              <div style={{ display:'flex', height:6, borderRadius:99, overflow:'hidden', gap:1 }}>
                <div style={{ flex:qb.good/qTotal*100, background:'var(--good)', opacity:0.7, borderRadius:99 }} />
                <div style={{ flex:qb.mid /qTotal*100, background:'var(--mid)',  opacity:0.7, borderRadius:99 }} />
                <div style={{ flex:qb.bad /qTotal*100, background:'var(--bad)',  opacity:0.7, borderRadius:99 }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div>
          <div style={s.sectionLabel}><span>Son 14 Gün — Düzenle</span></div>
          {histDays.length === 0 && <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:12 }}>Henüz geçmiş gün yok</div>}
          {histDays.map(({ ds, d }) => {
            const sc = Math.round(dayScore(tasks, logs, ds) * 100)
            const key = `${goal.id}:${ds}`
            const isOpen = !!openHistory[key]
            const dayLabel = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
            const scColor = sc>=70?'var(--good)':sc>=30?'var(--mid)':'var(--bad)'
            const note = notes[key] || ''
            const dayLogs = logs.filter(l => l.log_date === ds)

            return (
              <div key={ds} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, marginBottom:8, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', cursor:'pointer' }} onClick={() => onToggleHistory(key)}>
                  <div style={{ fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
                    <span>{isOpen?'▾':'▸'}</span>
                    <span>{dayLabel}</span>
                    {note && <span style={{ fontSize:10, color:'var(--accent)' }}>📝</span>}
                  </div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, color:scColor }}>{sc>0?`${sc}%`:'—'}</div>
                </div>
                {isOpen && (
                  <div style={{ padding:'0 14px 14px' }}>
                    {tasks.map(t => {
                      const log = dayLogs.find(l => l.task_id === t.id)
                      const q = log?.quality || null
                      return (
                        <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ flex:1, fontSize:12 }}>{t.name}</div>
                          <div style={{ display:'flex', gap:4 }}>
                            {['good','mid','bad'].map(qv => (
                              <button key={qv} style={s.hqBtn(qv, q===qv)} onClick={() => onSetQuality(t.id, qv, ds)}>
                                {qv==='good'?'İyi':qv==='mid'?'Orta':'Kötü'}
                              </button>
                            ))}
                            <button style={s.hqBtn('none', !q)} onClick={() => onRemoveLog(t.id, ds)}>—</button>
                          </div>
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

      {/* CHART TAB */}
      {tab === 'chart' && (
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:14, padding:'20px 16px 16px' }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:16 }}>Son 21 Gün — Görev Kalite Dağılımı</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:120 }}>
            {chartDays.map(({ ds, c, isToday, label }) => {
              const totalH = 110, hasAny = c.good+c.mid+c.bad > 0
              const gH = Math.round((c.good/n)*totalH), mH = Math.round((c.mid/n)*totalH), bH = Math.round((c.bad/n)*totalH)
              const stackH = hasAny ? Math.max(gH+mH+bH, 4) : 3
              return (
                <div key={ds} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, height:'100%', justifyContent:'flex-end' }}>
                  <div style={{ width:'100%', display:'flex', flexDirection:'column-reverse', borderRadius:'3px 3px 0 0', overflow:'hidden', height:stackH }}>
                    {c.good>0 && <div style={{ width:'100%', height:gH, background:'var(--good)', opacity:0.8 }} />}
                    {c.mid >0 && <div style={{ width:'100%', height:mH, background:'var(--mid)',  opacity:0.8 }} />}
                    {c.bad >0 && <div style={{ width:'100%', height:bH, background:'var(--bad)',  opacity:0.8 }} />}
                    {!hasAny   && <div style={{ width:'100%', height:3,  background:'var(--border)', opacity:0.5 }} />}
                  </div>
                  <div style={{ fontSize:8, color: isToday?'var(--accent)':'var(--muted)', marginTop:5 }}>{label}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:14, marginTop:14, flexWrap:'wrap' }}>
            {[['var(--good)','İyi'],['var(--mid)','Orta'],['var(--bad)','Kötü'],['var(--border)','Yapılmadı']].map(([c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--muted)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:c }} />{l}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  async function reloadLogsLocal() {
    const { data: l } = await createClient().from('daily_logs').select('*').in('task_id', tasks.map(x=>x.id))
    // This is handled by parent via onToggleTask
  }
}

// ── Note Section ──────────────────────────────────────────────────────────
function NoteSection({ goalId, ds, notes, noteInputs, onNoteChange, onSaveNote }) {
  const key = `${goalId}:${ds}`
  const saved = notes[key] || ''
  const input = noteInputs[key] ?? saved

  return (
    <div style={{ marginTop:16 }}>
      <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:6 }}>Günlük Not</div>
      {saved && (
        <div style={{ background:'rgba(124,106,255,0.06)', border:'1px solid rgba(124,106,255,0.2)', borderRadius:10, padding:'10px 12px', fontSize:12, color:'var(--text)', marginBottom:8, lineHeight:1.6 }}>
          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>📝 Kaydedildi</div>
          {saved}
        </div>
      )}
      <textarea
        value={input}
        onChange={e => onNoteChange(key, e.target.value)}
        placeholder="Bu gün hakkında bir şeyler yaz..."
        style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', color:'var(--text)', fontFamily:'DM Mono,monospace', fontSize:12, outline:'none', resize:'vertical', minHeight:60 }}
      />
      <button onClick={() => onSaveNote(ds)} style={{ marginTop:6, padding:'6px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'DM Mono,monospace', fontSize:10, cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
        Notu Kaydet
      </button>
    </div>
  )
}

// ── Goal Modal ────────────────────────────────────────────────────────────
function GoalModal({ goal, tasks, onSave, onClose }) {
  const [name, setName] = useState(goal?.name || '')
  const [days, setDays] = useState(goal?.total_days || '')
  const [taskNames, setTaskNames] = useState(tasks.length ? tasks.map(t=>t.name) : [''])

  function addTask() { setTaskNames(p => [...p, '']) }
  function removeTask(i) { if (taskNames.length <= 1) return; setTaskNames(p => p.filter((_,j)=>j!==i)) }
  function updateTask(i, v) { setTaskNames(p => p.map((t,j)=>j===i?v:t)) }

  function handleSave() {
    const filtered = taskNames.filter(t=>t.trim())
    if (!name.trim() || !days || !filtered.length) { alert('Lütfen tüm alanları doldur.'); return }
    onSave(name.trim(), parseInt(days), filtered)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,10,15,0.9)', backdropFilter:'blur(8px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24, overflowY:'auto' }} onClick={e => e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:32, width:'100%', maxWidth:500, margin:'auto' }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:20, marginBottom:24 }}>{goal ? 'Hedefi Düzenle' : 'Yeni Hedef'}</div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:8 }}>Hedef Adı</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="örn: 30 günde 5kg ver" style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontFamily:'DM Mono,monospace', fontSize:13, outline:'none' }} />
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:8 }}>Süre (gün)</div>
          <input type="number" value={days} onChange={e=>setDays(e.target.value)} placeholder="örn: 30" min="1" style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontFamily:'DM Mono,monospace', fontSize:13, outline:'none' }} />
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:2, color:'var(--muted)', marginBottom:8 }}>Günlük Görevler</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {taskNames.map((t,i) => (
              <div key={i} style={{ display:'flex', gap:8 }}>
                <input value={t} onChange={e=>updateTask(i,e.target.value)} placeholder={`Görev ${i+1}`} style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontFamily:'DM Mono,monospace', fontSize:13, outline:'none' }} />
                <button onClick={()=>removeTask(i)} style={{ width:32, height:44, background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontSize:16 }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={addTask} style={{ marginTop:10, background:'transparent', border:'none', color:'var(--accent)', fontFamily:'DM Mono,monospace', fontSize:11, cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>+ görev ekle</button>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:24 }}>
          <button onClick={onClose} style={{ padding:'12px 20px', background:'transparent', border:'1px solid var(--border)', borderRadius:10, color:'var(--muted)', fontFamily:'DM Mono,monospace', fontSize:13, cursor:'pointer' }}>İptal</button>
          <button onClick={handleSave} style={{ flex:1, padding:12, background:'var(--accent)', border:'none', borderRadius:10, color:'white', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, cursor:'pointer' }}>Kaydet</button>
        </div>
      </div>
    </div>
  )
}
