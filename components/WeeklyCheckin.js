import { useState } from 'react'
import { createClient } from '../lib/supabase'

const s = {
  overlay: { position:'fixed', inset:0, background:'rgba(10,12,18,0.92)', backdropFilter:'blur(6px)', zIndex:400, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet:   { background:'var(--surface)', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', padding:'28px 20px 48px' },
  label:   { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)', marginBottom:8, display:'block' },
  btn: v => ({
    width:'100%', padding:'13px', borderRadius:14, fontSize:14, fontWeight:700,
    cursor:'pointer', fontFamily:'inherit',
    background: v==='primary'?'var(--accent)':'var(--surface2)',
    border: v==='primary'?'none':'1.5px solid var(--border)',
    color: v==='primary'?'#fff':'var(--text2)',
  }),
}

const DIFFICULTY_EMOJIS = ['😌','😐','😅','😤','🥵']
const DIFFICULTY_LABELS = ['Çok kolaydı','Normal geçti','Biraz zorlandım','Çok zorlandım','Yıkıldım']
const SUMMARY_WORDS = ['Güçlüydüm','Zorlandım','Tutarlıydım','Motive kayıp','Harika geçti','Toparlanıyorum','Odaklıydım','Dağınıktım']

export default function WeeklyCheckin({ goal, weekNum, weekName, stats, onComplete, onClose }) {
  const [step,       setStep]      = useState('review') // review | summary
  const [difficulty, setDifficulty]= useState(null)
  const [word,       setWord]      = useState(null)
  const [note,       setNote]      = useState('')
  const [saving,     setSaving]    = useState(false)
  const supabase = createClient()

  async function handleComplete() {
    setSaving(true)
    try {
      await supabase.from('weekly_checkins').insert({
        goal_id:    goal.id,
        week_number: weekNum,
        difficulty:  difficulty,
        summary_word: word,
        note:        note.trim() || null,
        completed_at: new Date().toISOString(),
      })
      setStep('summary')
    } catch(e) {
      console.error(e)
      setStep('summary')
    }
    setSaving(false)
  }

  const nextWeekNum  = weekNum + 1
  const isMilestone  = nextWeekNum % 4 === 1

  if (step === 'summary') {
    return (
      <div style={s.overlay}>
        <div style={s.sheet}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', marginBottom:4 }}>{weekNum}. Hafta Tamamlandı!</div>
            <div style={{ fontSize:13, color:'var(--text3)' }}>{weekName}</div>
          </div>

          {/* Skor kartları */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
            {[
              { label:'Tamamlama', val:`${stats.completionPct}%`, color: stats.completionPct>=70?'var(--good)':stats.completionPct>=40?'var(--mid)':'var(--bad)' },
              { label:'Aktif Gün',  val:`${stats.activeDays}/7`,  color:'var(--accent)' },
              { label:'Kalite',     val:stats.qualityLabel,       color:'var(--mid)' },
            ].map((s2,i)=>(
              <div key={i} style={{ background:'var(--surface2)', borderRadius:14, padding:'12px 8px', textAlign:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text3)', marginBottom:4 }}>{s2.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s2.color }}>{s2.val}</div>
              </div>
            ))}
          </div>

          {/* Günlük bar */}
          <div style={{ background:'var(--surface2)', borderRadius:16, padding:14, marginBottom:14 }}>
            <span style={s.label}>Günlük Performans</span>
            <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:56 }}>
              {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((d,i)=>{
                const v = stats.dailyScores?.[i] ?? 0
                const color = v>=70?'var(--good)':v>=40?'var(--mid)':v>0?'var(--bad)':'var(--surface)'
                return (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:'100%', height:Math.max(v*0.44,3), background:color, borderRadius:5, opacity:.85 }}/>
                    <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600 }}>{d}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Motivasyon mesajı */}
          <div style={{ background:'rgba(74,222,128,0.07)', border:'1.5px solid rgba(74,222,128,0.25)', borderRadius:16, padding:'12px 14px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--good)', marginBottom:4 }}>
              {stats.completionPct>=80 ? 'Harika iş çıkardın!' : stats.completionPct>=50 ? 'İyi bir hafta geçirdin!' : 'Devam et, pes etme!'}
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              {stats.completionPct>=80
                ? `${stats.activeDays} günü hedeflerinle geçirdin. Bir sonraki haftaya güçlü başlıyorsun.`
                : `Zorlandığın günler oldu ama devam etmen önemli. ${nextWeekNum}. haftada biraz daha odaklan.`}
            </div>
          </div>

          {/* Kilometre taşı uyarısı */}
          {isMilestone && (
            <div style={{ background:'rgba(251,191,36,0.08)', border:'1.5px solid rgba(251,191,36,0.3)', borderRadius:16, padding:'12px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:22, flexShrink:0 }}>🏆</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--mid)' }}>Kilometre Taşına Yaklaştın!</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{nextWeekNum}. hafta bir milestone haftası — başarırsan özel rozet kazanacaksın</div>
              </div>
            </div>
          )}

          <button onClick={()=>onComplete(weekNum)} style={s.btn('primary')}>
            {nextWeekNum}. Haftayı Aç 🚀
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>{weekNum}. Hafta Değerlendirmesi</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{weekName} · Kapanış</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        {/* Zorluk */}
        <div style={{ marginBottom:20 }}>
          <span style={s.label}>Bu hafta ne kadar zorlandın?</span>
          <div style={{ display:'flex', gap:8 }}>
            {DIFFICULTY_EMOJIS.map((e,i)=>(
              <button key={i} onClick={()=>setDifficulty(i)} style={{
                flex:1, padding:'12px 4px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                background: difficulty===i ? 'rgba(124,111,247,0.18)' : 'var(--surface2)',
                border: `1.5px solid ${difficulty===i ? 'var(--accent)' : 'var(--border)'}`,
                fontSize:22, transition:'all .15s'
              }}>{e}</button>
            ))}
          </div>
          {difficulty!==null && (
            <div style={{ fontSize:11, color:'var(--accent)', marginTop:6, textAlign:'center', fontWeight:600 }}>
              {DIFFICULTY_LABELS[difficulty]}
            </div>
          )}
        </div>

        {/* Özet kelime */}
        <div style={{ marginBottom:20 }}>
          <span style={s.label}>Bu haftayı bir kelimeyle özetle</span>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {SUMMARY_WORDS.map(w=>(
              <button key={w} onClick={()=>setWord(w)} style={{
                padding:'7px 13px', borderRadius:99, cursor:'pointer', fontFamily:'inherit',
                background: word===w ? 'rgba(124,111,247,0.15)' : 'var(--surface2)',
                border: `1.5px solid ${word===w ? 'rgba(124,111,247,0.4)' : 'var(--border)'}`,
                color: word===w ? '#a89cf7' : 'var(--text3)',
                fontSize:12, fontWeight:600, transition:'all .15s'
              }}>{w}</button>
            ))}
          </div>
        </div>

        {/* Not */}
        <div style={{ marginBottom:24 }}>
          <span style={s.label}>Notlar (isteğe bağlı)</span>
          <textarea
            value={note}
            onChange={e=>setNote(e.target.value)}
            placeholder="Bu hafta neler öğrendin? Sonrakine ne taşıyacaksın?"
            rows={3}
            style={{ width:'100%', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:14, padding:'11px 13px', color:'var(--text)', fontSize:13, fontFamily:'inherit', resize:'none', outline:'none', lineHeight:1.6 }}
          />
        </div>

        <button
          onClick={handleComplete}
          disabled={saving || difficulty===null}
          style={{ ...s.btn('primary'), opacity: difficulty===null||saving ? 0.5 : 1 }}
        >
          {saving ? 'Kaydediliyor...' : 'Özeti Gör →'}
        </button>
        <button onClick={onClose} style={{ ...s.btn(), marginTop:8 }}>Sonra Değerlendir</button>
      </div>
    </div>
  )
}
