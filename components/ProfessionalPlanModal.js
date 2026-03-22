import { useState, useCallback, useRef } from 'react'
import { createClient } from '../lib/supabase'

const DOW_TR   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const DOW_FULL = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']

const s = {
  overlay: { position:'fixed', inset:0, background:'rgba(10,12,18,0.92)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet:   { background:'var(--surface)', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:640, maxHeight:'92vh', overflowY:'auto', padding:'24px 20px 48px' },
  label:   { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)', marginBottom:7, display:'block' },
  input:   { width:'100%', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:14, padding:'11px 14px', color:'var(--text)', fontSize:14, fontWeight:500, outline:'none', fontFamily:'inherit' },
  btn: v => ({
    padding:'11px 16px', borderRadius:14, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
    background: v==='primary'?'var(--accent)':v==='ghost'?'transparent':'var(--surface2)',
    border: v==='primary'?'none':v==='ghost'?'none':'1.5px solid var(--border)',
    color: v==='primary'?'#fff':v==='ghost'?'var(--accent)':'var(--text2)',
  }),
  dayBtn: on => ({
    flex:1, padding:'7px 3px', borderRadius:10, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
    background: on?'var(--accent)':'var(--surface)',
    border: `1.5px solid ${on?'var(--accent)':'var(--border)'}`,
    color: on?'#fff':'var(--text3)',
  }),
}

const PRO_TEMPLATES = [
  {
    icon:'🏃', name:'12 Haftalık Maraton Hazırlığı', weekCount:12, bufferDay:0,
    weeks: Array.from({length:12},(_,i)=>({
      name: i<4?`Baz Antrenman - ${i+1}. Hafta`: i<8?`Tempo Artışı - ${i-3}. Hafta`:`Yarış Hazırlığı - ${i-7}. Hafta`,
      days: [{dow:1,enabled:true,tasks:['Uzun koşu','Esneme']},{dow:2,enabled:true,tasks:['Tempo koşusu']},{dow:3,enabled:true,tasks:['Dinlenme koşusu','Kuvvet']},{dow:4,enabled:true,tasks:['Interval antrenmanı']},{dow:5,enabled:true,tasks:['Kısa koşu','Beslenme takibi']},{dow:6,enabled:false,tasks:['']},{dow:0,enabled:false,tasks:['']}]
    }))
  },
  {
    icon:'🗣️', name:'6 Aylık İngilizce Programı', weekCount:24, bufferDay:0,
    weeks: Array.from({length:24},(_,i)=>({
      name: i<8?`Temel - ${i+1}. Hafta`: i<16?`Orta - ${i-7}. Hafta`:`İleri - ${i-15}. Hafta`,
      days: [{dow:1,enabled:true,tasks:['30 dk kelime','10 dk konuşma']},{dow:2,enabled:true,tasks:['Gramer alıştırmaları']},{dow:3,enabled:true,tasks:['30 dk kelime','Podcast dinle']},{dow:4,enabled:true,tasks:['Yazma pratiği']},{dow:5,enabled:true,tasks:['Kelime tekrar','Haftalık özet']},{dow:6,enabled:true,tasks:['Film izle (İngilizce)']},{dow:0,enabled:false,tasks:['']}]
    }))
  },
  {
    icon:'💪', name:'4 Haftalık Detoks', weekCount:4, bufferDay:0,
    weeks: Array.from({length:4},(_,i)=>({
      name: ['Hazırlık','Yoğunlaşma','Derin Temizlik','Pekiştirme'][i]+` Haftası`,
      days: [{dow:1,enabled:true,tasks:['Sabah suyu 1L','Şekersiz beslen','30 dk egzersiz']},{dow:2,enabled:true,tasks:['Meditasyon 10 dk','Yeşil smoothie']},{dow:3,enabled:true,tasks:['Sabah suyu','30 dk yürüyüş']},{dow:4,enabled:true,tasks:['Meditasyon','Erken uyku']},{dow:5,enabled:true,tasks:['Sabah suyu','Haftalık değerlendirme']},{dow:6,enabled:true,tasks:['Aktif dinlenme']},{dow:0,enabled:true,tasks:['Haftalık hazırlık']}]
    }))
  },
  {
    icon:'🧘', name:'8 Haftalık Mindfulness', weekCount:8, bufferDay:null,
    weeks: Array.from({length:8},(_,i)=>({
      name: `${i+1}. Hafta · ${['Farkındalık','Nefes','Beden Taraması','Duygu Yönetimi','Odaklanma','Kabul','Şükran','Entegrasyon'][i]}`,
      days: [{dow:1,enabled:true,tasks:['Sabah meditasyonu 10 dk','Günlük yaz']},{dow:2,enabled:true,tasks:['Nefes egzersizi']},{dow:3,enabled:true,tasks:['Sabah meditasyonu','Şükran listesi']},{dow:4,enabled:true,tasks:['Yürüyüş meditasyonu']},{dow:5,enabled:true,tasks:['Sabah meditasyonu','Haftalık özet']},{dow:6,enabled:false,tasks:['']},{dow:0,enabled:false,tasks:['']}]
    }))
  },
]

function buildWeeks(n) {
  return Array.from({length:n}, (_,i) => ({
    name: `${i+1}. Hafta`,
    days: Array.from({length:7}, (_,d) => ({ dow:d, enabled:d>=1&&d<=5, tasks:[''] }))
  }))
}

// Stabil key ile re-render'da focus kaybı olmaz
function TaskInput({ value, onChange, placeholder, style }) {
  return (
    <input
      defaultValue={value}
      onBlur={e => { if (e.target.value !== value) onChange(e.target.value) }}
      placeholder={placeholder}
      style={style}
    />
  )
}

export default function ProfessionalPlanModal({ user, onClose, onSaved }) {
  const [view,       setView]      = useState('start')
  const [planName,   setPlanName]  = useState('')
  const [weekCount,  setWkCount]   = useState(4)
  const [bufferDay,  setBufferDay] = useState(null)
  const [weeks,      setWeeks]     = useState(() => buildWeeks(4))
  const [activeWk,   setActiveWk]  = useState(0)
  const [saving,     setSaving]    = useState(false)
  const supabase = createClient()

  function applyTemplate(tpl) {
    setPlanName(tpl.name)
    setWkCount(tpl.weekCount)
    setWeeks(tpl.weeks.map(w => ({
      ...w,
      days: Array.from({length:7}, (_,d) => {
        const found = w.days.find(x => x.dow === d)
        return found || { dow:d, enabled:false, tasks:[''] }
      })
    })))
    setBufferDay(tpl.bufferDay ?? null)
    setView('weeks')
  }

  function changeWeekCount(n) {
    const count = Math.max(1, Math.min(52, n))
    setWkCount(count)
    setWeeks(prev => {
      if (count > prev.length) {
        const extra = Array.from({length:count-prev.length}, (_,i) => ({
          name:`${prev.length+i+1}. Hafta`,
          days: Array.from({length:7}, (_,d) => ({ dow:d, enabled:d>=1&&d<=5, tasks:[''] }))
        }))
        return [...prev, ...extra]
      }
      return prev.slice(0, count)
    })
  }

  function updateWeekName(wi, name)         { setWeeks(p => p.map((w,i) => i===wi ? {...w,name} : w)) }
  function toggleDay(wi, dow)                { setWeeks(p => p.map((w,i) => i!==wi ? w : {...w, days:w.days.map(d => d.dow===dow ? {...d,enabled:!d.enabled} : d)})) }
  function updateTask(wi, dow, ti, val)      { setWeeks(p => p.map((w,i) => i!==wi ? w : {...w, days:w.days.map(d => d.dow!==dow ? d : {...d, tasks:d.tasks.map((t,j) => j===ti ? val : t)})})) }
  function addTask(wi, dow)                  { setWeeks(p => p.map((w,i) => i!==wi ? w : {...w, days:w.days.map(d => d.dow!==dow ? d : {...d, tasks:[...d.tasks,'']})})) }
  function removeTask(wi, dow, ti)           { setWeeks(p => p.map((w,i) => i!==wi ? w : {...w, days:w.days.map(d => d.dow!==dow ? d : {...d, tasks:d.tasks.length>1 ? d.tasks.filter((_,j)=>j!==ti) : ['']})})) }
  function copyToNext(wi) {
    if (wi >= weeks.length-1) return
    setWeeks(p => p.map((w,i) => i===wi+1 ? {...w, days:p[wi].days.map(d => ({...d, tasks:[...d.tasks]}))} : w))
  }

  async function handleSave() {
    if (!planName.trim()) { alert('Plan adı gir'); return }
    setSaving(true)
    try {
      const { data:goal } = await supabase.from('goals').insert({
        name:            planName.trim(),
        total_days:      weekCount * 7,
        start_date:      new Date().toISOString().slice(0,10),
        user_id:         user.id,
        is_professional: true,
        buffer_day:      bufferDay,
      }).select().single()
      if (!goal) throw new Error('Hedef oluşturulamadı')

      const taskRows = []
      weeks.forEach((week, wi) => {
        week.days.forEach(day => {
          if (!day.enabled) return
          day.tasks.filter(t => t.trim()).forEach((taskName, ti) => {
            taskRows.push({ goal_id:goal.id, name:taskName.trim(), order_index:ti, active_days:[day.dow], week_number:wi+1, week_name:week.name })
          })
        })
        if (bufferDay != null) {
          taskRows.push({ goal_id:goal.id, name:'⚡ Telafi Günü', order_index:99, active_days:[bufferDay], week_number:wi+1, week_name:week.name, is_buffer:true })
        }
      })
      if (taskRows.length) await supabase.from('tasks').insert(taskRows)
      onSaved()
    } catch(e) { alert('Hata: ' + e.message) }
    setSaving(false)
  }

  const wk = weeks[activeWk]
  const totalTasks = weeks.reduce((s,w) => s + w.days.reduce((s2,d) => s2 + (d.enabled ? d.tasks.filter(t=>t.trim()).length : 0), 0), 0)

  if (view === 'start') return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>Profesyonel Plan</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>Haftalık yapılandırılmış hedef sistemi</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>
        <span style={s.label}>Hazır Şablonlar</span>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
          {PRO_TEMPLATES.map((tpl,i) => (
            <button key={i} onClick={()=>applyTemplate(tpl)} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',background:'var(--surface2)',border:'1.5px solid var(--border)',borderRadius:16,cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:24,flexShrink:0}}>{tpl.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{tpl.name}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{tpl.weekCount} hafta · {tpl.weeks[0].days.filter(d=>d.enabled).length} gün/hafta</div>
              </div>
              <span style={{color:'var(--accent)',fontSize:16}}>→</span>
            </button>
          ))}
        </div>
        <div style={{height:1,background:'var(--border)',margin:'4px 0 16px'}}/>
        <button onClick={()=>setView('setup')} style={{...s.btn('ghost'),width:'100%',padding:'12px',textAlign:'center'}}>
          + Sıfırdan Oluştur
        </button>
      </div>
    </div>
  )

  if (view === 'setup') return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <button onClick={()=>setView('start')} style={{background:'none',border:'none',color:'var(--accent)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>← Şablonlar</button>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text)',marginTop:4}}>Plan Ayarları</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>
        <div style={{background:'var(--surface2)',borderRadius:16,padding:16,marginBottom:14}}>
          <div style={{marginBottom:12}}>
            <span style={s.label}>Plan Adı</span>
            <input value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="örn: 12 Haftalık Fitness Programı" style={s.input}/>
          </div>
          <div>
            <span style={s.label}>Toplam Hafta Sayısı</span>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>changeWeekCount(weekCount-1)} style={{...s.btn(),width:36,height:36,padding:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,borderRadius:10}}>−</button>
              <input type="number" min={1} max={52} value={weekCount} onChange={e=>changeWeekCount(parseInt(e.target.value)||1)} style={{...s.input,width:70,textAlign:'center'}}/>
              <button onClick={()=>changeWeekCount(weekCount+1)} style={{...s.btn(),width:36,height:36,padding:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,borderRadius:10}}>+</button>
              <span style={{fontSize:12,color:'var(--text3)'}}>{weekCount*7} gün</span>
            </div>
          </div>
        </div>
        <div style={{background:'rgba(251,191,36,0.07)',border:'1.5px solid rgba(251,191,36,0.25)',borderRadius:16,padding:14,marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:bufferDay!=null?10:0}}>
            <span style={{fontSize:16}}>⚡</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--mid)'}}>Telafi Günü</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>Her haftaya otomatik 1 telafi günü ekle</div>
            </div>
            <button onClick={()=>setBufferDay(bufferDay!=null?null:0)} style={{padding:'6px 12px',borderRadius:10,border:`1.5px solid ${bufferDay!=null?'rgba(251,191,36,0.5)':'var(--border)'}`,background:bufferDay!=null?'rgba(251,191,36,0.15)':'var(--surface2)',color:bufferDay!=null?'var(--mid)':'var(--text3)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              {bufferDay!=null?'Açık':'Kapalı'}
            </button>
          </div>
          {bufferDay!=null && (
            <div>
              <span style={s.label}>Hangi gün?</span>
              <div style={{display:'flex',gap:5}}>
                {DOW_TR.map((d,dow) => (
                  <button key={dow} onClick={()=>setBufferDay(dow)} style={s.dayBtn(bufferDay===dow)}>{d}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={()=>setView('weeks')} disabled={!planName.trim()} style={{...s.btn('primary'),width:'100%',padding:'13px',opacity:planName.trim()?1:0.5}}>
          Haftalara Devam →
        </button>
      </div>
    </div>
  )

  // ── Haftaları düzenle ──
  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <button onClick={()=>setView('setup')} style={{background:'none',border:'none',color:'var(--accent)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>← Ayarlar</button>
            <div style={{fontSize:16,fontWeight:800,color:'var(--text)',marginTop:4}}>{planName}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>

        {/* Hafta sekmeleri */}
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8,marginBottom:14,WebkitOverflowScrolling:'touch'}}>
          {weeks.map((w,i) => {
            const cnt = w.days.reduce((s,d) => s+(d.enabled?d.tasks.filter(t=>t.trim()).length:0), 0)
            const isMs = (i+1)%4===0
            return (
              <button key={i} onClick={()=>setActiveWk(i)} style={{
                flexShrink:0, padding:'7px 13px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                background: i===activeWk?'var(--accent)':'var(--surface2)',
                border: `1.5px solid ${i===activeWk?'var(--accent)':isMs?'rgba(251,191,36,0.4)':'var(--border)'}`,
                color: i===activeWk?'#fff':isMs?'var(--mid)':'var(--text3)',
                fontSize:12, fontWeight:700, position:'relative'
              }}>
                {w.name}
                {isMs&&i!==activeWk&&<span style={{position:'absolute',top:-4,right:-4,fontSize:10}}>🏆</span>}
                {cnt>0&&<span style={{marginLeft:5,opacity:.7,fontSize:10}}>{cnt}</span>}
              </button>
            )
          })}
        </div>

        {/* Aktif hafta */}
        {wk && (
          <div style={{background:'var(--surface2)',borderRadius:18,padding:16,marginBottom:14}}>
            {/* Hafta adı */}
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14}}>
              <input
                key={`wkname-${activeWk}`}
                defaultValue={wk.name}
                onBlur={e => updateWeekName(activeWk, e.target.value)}
                placeholder="Hafta adı"
                style={{...s.input, fontSize:14, fontWeight:700}}
              />
              {activeWk<weeks.length-1 && (
                <button onClick={()=>copyToNext(activeWk)} style={{...s.btn(),padding:'10px 11px',fontSize:11,flexShrink:0,whiteSpace:'nowrap'}}>Kopyala →</button>
              )}
            </div>

            {(activeWk+1)%4===0 && (
              <div style={{background:'rgba(251,191,36,0.07)',border:'1.5px solid rgba(251,191,36,0.25)',borderRadius:12,padding:'8px 12px',marginBottom:12,fontSize:11,color:'var(--mid)',display:'flex',gap:6,alignItems:'center'}}>
                <span>🏆</span> Kilometre taşı haftası
              </div>
            )}

            <span style={s.label}>Aktif günler</span>
            <div style={{display:'flex',gap:5,marginBottom:16}}>
              {DOW_TR.map((d,dow) => (
                <button key={dow} onClick={()=>toggleDay(activeWk,dow)} style={s.dayBtn(wk.days[dow].enabled)}>{d}</button>
              ))}
            </div>

            {wk.days.filter(d=>d.enabled).length===0 ? (
              <div style={{textAlign:'center',padding:'16px 0',color:'var(--text3)',fontSize:13}}>Hiç aktif gün seçilmedi</div>
            ) : wk.days.filter(d=>d.enabled).map(day => (
              <div key={`${activeWk}-${day.dow}`} style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--accent2)'}}>{DOW_FULL[day.dow]}</span>
                  <button onClick={()=>addTask(activeWk,day.dow)} style={{background:'none',border:'none',color:'var(--accent)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>+ Görev ekle</button>
                </div>
                {day.tasks.map((task,ti) => (
                  <div key={`${activeWk}-${day.dow}-${ti}`} style={{display:'flex',gap:7,alignItems:'center',marginBottom:7}}>
                    <input
                      key={`task-${activeWk}-${day.dow}-${ti}`}
                      defaultValue={task}
                      onBlur={e => { if (e.target.value !== task) updateTask(activeWk, day.dow, ti, e.target.value) }}
                      placeholder={`${DOW_FULL[day.dow]} görevi ${ti+1}`}
                      style={{...s.input, flex:1}}
                    />
                    <button onClick={()=>removeTask(activeWk,day.dow,ti)} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:16,padding:'0 4px',flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{background:'rgba(124,111,247,0.07)',border:'1.5px solid rgba(124,111,247,0.2)',borderRadius:14,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--text2)'}}>
          <b style={{color:'var(--accent)'}}>{weekCount} hafta</b> · <b style={{color:'var(--accent)'}}>{weekCount*7} gün</b> · <b style={{color:'var(--accent)'}}>{totalTasks} görev</b>
          {bufferDay!=null && <span style={{color:'var(--mid)'}}> · ⚡ {DOW_TR[bufferDay]} telafi günü</span>}
          {totalTasks===0 && <span style={{color:'var(--text3)'}}> — en az 1 görev ekle</span>}
        </div>

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{...s.btn(),flex:'0 0 auto'}}>İptal</button>
          <button onClick={handleSave} disabled={saving||!planName.trim()||totalTasks===0} style={{...s.btn('primary'),flex:1,opacity:saving||!planName.trim()||totalTasks===0?0.5:1}}>
            {saving?'Oluşturuluyor...':'🚀 Planı Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
