import { useState } from 'react'
import { createClient } from '../lib/supabase'

const DOW_TR    = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const DOW_FULL  = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']
const COLORS    = ['#7c6ff7','#4ade80','#fbbf24','#fb923c','#f87171','#38bdf8','#e879f9']

const s = {
  overlay: { position:'fixed', inset:0, background:'rgba(10,12,18,0.92)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet:   { background:'var(--surface)', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:640, maxHeight:'92vh', overflowY:'auto', padding:'24px 20px 48px' },
  label:   { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)', marginBottom:7, display:'block' },
  input:   { width:'100%', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:14, padding:'11px 14px', color:'var(--text)', fontSize:14, fontWeight:500, outline:'none', fontFamily:'inherit' },
  btn: v => ({
    padding:'11px 16px', borderRadius:14, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
    background: v==='primary'?'var(--accent)':v==='danger'?'rgba(248,113,113,0.1)':'var(--surface2)',
    border: v==='primary'?'none':v==='danger'?'1px solid rgba(248,113,113,0.3)':'1.5px solid var(--border)',
    color: v==='primary'?'#fff':v==='danger'?'#f87171':'var(--text2)',
  }),
  weekCard: active => ({
    background: active ? 'rgba(124,111,247,0.07)' : 'var(--surface2)',
    border: `1.5px solid ${active ? 'rgba(124,111,247,0.35)' : 'var(--border)'}`,
    borderRadius:18, marginBottom:10, overflow:'hidden'
  }),
  dayBtn: active => ({
    flex:1, padding:'7px 3px', borderRadius:10, fontSize:11, fontWeight:700, cursor:'pointer',
    fontFamily:'inherit',
    background: active ? 'var(--accent)' : 'var(--surface)',
    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    color: active ? '#fff' : 'var(--text3)',
  }),
  taskRow: { display:'flex', gap:7, alignItems:'center', marginBottom:7 },
}

export default function ProfessionalPlanModal({ user, onClose, onSaved }) {
  const [step,      setStep]    = useState('setup') // setup | weeks
  const [planName,  setPlanName]= useState('')
  const [weekCount, setWkCount] = useState(4)
  const [weeks,     setWeeks]   = useState(() => buildWeeks(4))
  const [activeWk,  setActiveWk]= useState(0)
  const [saving,    setSaving]  = useState(false)
  const supabase = createClient()

  function buildWeeks(n) {
    return Array.from({length:n}, (_,i) => ({
      name: `${i+1}. Hafta`,
      days: Array.from({length:7}, (_,d) => ({
        dow: d,
        enabled: d>=1 && d<=5, // pzt-cum varsayılan
        tasks: ['']
      }))
    }))
  }

  function changeWeekCount(n) {
    const count = Math.max(1, Math.min(52, n))
    setWkCount(count)
    setWeeks(prev => {
      if (count > prev.length) {
        const extra = Array.from({length: count-prev.length}, (_,i) => ({
          name: `${prev.length+i+1}. Hafta`,
          days: Array.from({length:7}, (_,d) => ({
            dow: d, enabled: d>=1&&d<=5, tasks: ['']
          }))
        }))
        return [...prev, ...extra]
      }
      return prev.slice(0, count)
    })
  }

  function updateWeekName(wi, name) {
    setWeeks(p => p.map((w,i) => i===wi ? {...w,name} : w))
  }

  function toggleDay(wi, dow) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow===dow ? {...d, enabled:!d.enabled} : d)
    }))
  }

  function updateTask(wi, dow, ti, val) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow!==dow ? d : {
        ...d,
        tasks: d.tasks.map((t,j) => j===ti ? val : t)
      })
    }))
  }

  function addTask(wi, dow) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow!==dow ? d : {...d, tasks:[...d.tasks,'']})
    }))
  }

  function removeTask(wi, dow, ti) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow!==dow ? d : {
        ...d,
        tasks: d.tasks.length>1 ? d.tasks.filter((_,j)=>j!==ti) : ['']
      })
    }))
  }

  // Haftayı bir sonrakiyle kopyala
  function copyToNext(wi) {
    if (wi >= weeks.length-1) return
    setWeeks(p => p.map((w,i) => i===wi+1 ? {
      ...w,
      days: p[wi].days.map(d => ({...d, tasks:[...d.tasks]}))
    } : w))
  }

  async function handleSave() {
    if (!planName.trim()) { alert('Plan adı gir'); return }
    const totalDays = weekCount * 7
    setSaving(true)
    try {
      // 1. Ana goal oluştur
      const { data:goal } = await supabase.from('goals').insert({
        name: planName.trim(),
        total_days: totalDays,
        start_date: new Date().toISOString().slice(0,10),
        user_id: user.id,
        is_professional: true,
      }).select().single()

      if (!goal) throw new Error('Hedef oluşturulamadı')

      // 2. Her haftanın her gününün görevlerini tasks tablosuna ekle
      // Görevler: active_days = [dow], week_number = wi+1
      const taskRows = []
      weeks.forEach((week, wi) => {
        week.days.forEach(day => {
          if (!day.enabled) return
          day.tasks.filter(t=>t.trim()).forEach((taskName, ti) => {
            taskRows.push({
              goal_id:      goal.id,
              name:         taskName.trim(),
              order_index:  ti,
              active_days:  [day.dow],
              week_number:  wi + 1,
              week_name:    week.name,
            })
          })
        })
      })

      if (taskRows.length) {
        await supabase.from('tasks').insert(taskRows)
      }

      onSaved()
    } catch(e) {
      alert('Hata: ' + e.message)
    }
    setSaving(false)
  }

  const wk = weeks[activeWk]
  const enabledDays = wk?.days.filter(d=>d.enabled) || []
  const totalTasks = weeks.reduce((s,w) => s + w.days.reduce((s2,d) => s2 + (d.enabled ? d.tasks.filter(t=>t.trim()).length : 0), 0), 0)

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--text)' }}>Profesyonel Plan</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>Haftalık yapılandırılmış hedef sistemi</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        {/* Plan Ayarları */}
        <div style={{ background:'var(--surface2)', borderRadius:16, padding:16, marginBottom:16 }}>
          <div style={{ marginBottom:12 }}>
            <span style={s.label}>Plan Adı</span>
            <input
              value={planName}
              onChange={e=>setPlanName(e.target.value)}
              placeholder="örn: 12 Haftalık Fitness Programı"
              style={s.input}
            />
          </div>
          <div>
            <span style={s.label}>Toplam Hafta Sayısı</span>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={()=>changeWeekCount(weekCount-1)} style={{ ...s.btn(), width:36, height:36, padding:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, borderRadius:10 }}>−</button>
              <input
                type="number" min={1} max={52}
                value={weekCount}
                onChange={e=>changeWeekCount(parseInt(e.target.value)||1)}
                style={{ ...s.input, width:70, textAlign:'center' }}
              />
              <button onClick={()=>changeWeekCount(weekCount+1)} style={{ ...s.btn(), width:36, height:36, padding:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, borderRadius:10 }}>+</button>
              <span style={{ fontSize:12, color:'var(--text3)' }}>{weekCount * 7} gün toplam</span>
            </div>
          </div>
        </div>

        {/* Hafta seçici */}
        <span style={s.label}>Haftaları Düzenle</span>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8, marginBottom:14 }}>
          {weeks.map((w,i) => {
            const wTaskCount = w.days.reduce((s,d)=>s+(d.enabled?d.tasks.filter(t=>t.trim()).length:0),0)
            const isActive = i===activeWk
            return (
              <button
                key={i}
                onClick={()=>setActiveWk(i)}
                style={{
                  flexShrink:0, padding:'8px 14px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                  background: isActive ? 'var(--accent)' : 'var(--surface2)',
                  border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  color: isActive ? '#fff' : 'var(--text3)',
                  fontSize:12, fontWeight:700
                }}
              >
                {w.name}
                {wTaskCount>0 && <span style={{ marginLeft:5, opacity:0.7, fontSize:10 }}>{wTaskCount}</span>}
              </button>
            )
          })}
        </div>

        {/* Aktif hafta düzenleyici */}
        {wk && (
          <div style={{ background:'var(--surface2)', borderRadius:18, padding:16, marginBottom:16 }}>

            {/* Hafta adı */}
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14 }}>
              <input
                value={wk.name}
                onChange={e=>updateWeekName(activeWk, e.target.value)}
                placeholder="Hafta adı"
                style={{ ...s.input, fontSize:15, fontWeight:700 }}
              />
              {activeWk < weeks.length-1 && (
                <button onClick={()=>copyToNext(activeWk)} style={{ ...s.btn(), padding:'10px 12px', fontSize:12, flexShrink:0, whiteSpace:'nowrap' }} title="Görevleri bir sonraki haftaya kopyala">
                  Sonrakine kopyala →
                </button>
              )}
            </div>

            {/* Gün toggle */}
            <span style={s.label}>Aktif günler</span>
            <div style={{ display:'flex', gap:5, marginBottom:16 }}>
              {DOW_TR.map((d,dow) => (
                <button key={dow} onClick={()=>toggleDay(activeWk,dow)} style={s.dayBtn(wk.days[dow].enabled)}>
                  {d}
                </button>
              ))}
            </div>

            {/* Her aktif günün görevleri */}
            {wk.days.filter(d=>d.enabled).length===0 && (
              <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text3)', fontSize:13 }}>
                Hiç aktif gün seçilmedi
              </div>
            )}

            {wk.days.filter(d=>d.enabled).map(day => (
              <div key={day.dow} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--accent2)' }}>{DOW_FULL[day.dow]}</span>
                  <button onClick={()=>addTask(activeWk, day.dow)} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>+ Görev ekle</button>
                </div>
                {day.tasks.map((task,ti) => (
                  <div key={ti} style={s.taskRow}>
                    <input
                      value={task}
                      onChange={e=>updateTask(activeWk, day.dow, ti, e.target.value)}
                      placeholder={`${DOW_FULL[day.dow]} görevi ${ti+1}`}
                      style={{ ...s.input, flex:1 }}
                    />
                    <button
                      onClick={()=>removeTask(activeWk, day.dow, ti)}
                      style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:16, padding:'0 4px', flexShrink:0 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Özet */}
        <div style={{ background:'rgba(124,111,247,0.07)', border:'1.5px solid rgba(124,111,247,0.2)', borderRadius:14, padding:'10px 14px', marginBottom:20, fontSize:12, color:'var(--text2)' }}>
          <b style={{ color:'var(--accent)' }}>{weekCount} hafta</b> · <b style={{ color:'var(--accent)' }}>{weekCount*7} gün</b> · <b style={{ color:'var(--accent)' }}>{totalTasks} görev</b> toplam
          {totalTasks===0 && <span style={{ color:'var(--text3)' }}> — en az 1 görev ekle</span>}
        </div>

        {/* Kaydet */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ ...s.btn(), flex:'0 0 auto' }}>İptal</button>
          <button
            onClick={handleSave}
            disabled={saving || !planName.trim() || totalTasks===0}
            style={{ ...s.btn('primary'), flex:1, opacity: saving||!planName.trim()||totalTasks===0 ? 0.5 : 1 }}
          >
            {saving ? 'Oluşturuluyor...' : '🚀 Planı Oluştur'}
          </button>
        </div>

      </div>
    </div>
  )
}
