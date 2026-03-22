import React from 'react'

const s = {
  overlay: { position:'fixed', inset:0, background:'rgba(10,12,18,0.95)', backdropFilter:'blur(8px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  card:    { background:'var(--surface)', border:'1.5px solid rgba(124,111,247,0.4)', borderRadius:24, padding:28, width:'100%', maxWidth:400, textAlign:'center' },
  btn: v => ({
    width:'100%', padding:'13px', borderRadius:14, fontSize:14, fontWeight:700,
    cursor:'pointer', fontFamily:'inherit', marginTop:10,
    background: v==='primary'?'var(--accent)':'transparent',
    border: v==='primary'?'none':'1.5px solid var(--border)',
    color: v==='primary'?'#fff':'var(--text2)',
  }),
}

const MILESTONE_BADGES = {
  4:  { icon:'🥉', title:'Baz Dayanıklılık',    desc:'İlk 4 haftayı tamamladın' },
  8:  { icon:'🥈', title:'Orta Yol Savaşçısı',  desc:'8 haftalık zorlu yolculuk' },
  12: { icon:'🥇', title:'Elit Performans',      desc:'Tam 12 haftalık başarı' },
  16: { icon:'💎', title:'Kristal Kararlılık',   desc:'16 hafta boyunca azim' },
  24: { icon:'👑', title:'Şampiyon',             desc:'6 aylık olağanüstü başarı' },
}

function getBadge(weekNum) {
  const milestones = Object.keys(MILESTONE_BADGES).map(Number).sort((a,b)=>a-b)
  for (const m of milestones) {
    if (weekNum === m) return MILESTONE_BADGES[m]
    if (weekNum % 4 === 0) return { icon:'🏅', title:`${weekNum}. Hafta Ustası`, desc:`${weekNum} haftalık kesintisiz hedef` }
  }
  return null
}

export default function MilestoneCelebration({ weekNum, weekName, stats, onContinue }) {
  const badge = getBadge(weekNum)

  return (
    <div style={s.overlay}>
      <div style={s.card}>

        <div style={{ fontSize:56, marginBottom:16 }}>🏆</div>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', marginBottom:4 }}>
          Kilometre Taşı!
        </div>
        <div style={{ fontSize:13, color:'var(--text3)', marginBottom:24 }}>
          {weekNum}. Hafta · {weekName}
        </div>

        {/* Rozet */}
        {badge && (
          <div style={{ background:'rgba(124,111,247,0.1)', border:'2px solid rgba(124,111,247,0.35)', borderRadius:20, padding:'20px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Yeni Rozet Kazanıldı</div>
            <div style={{ fontSize:44, marginBottom:8 }}>{badge.icon}</div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:4 }}>{badge.title}</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>{badge.desc}</div>
          </div>
        )}

        {/* İstatistikler */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:20 }}>
          {[
            { label:'Tamamlama', val:`${stats.completionPct}%` },
            { label:'Aktif Gün',  val:`${stats.activeDays}/7` },
            { label:'Seri',       val:`${stats.streak}🔥` },
          ].map((s2,i)=>(
            <div key={i} style={{ background:'var(--surface2)', borderRadius:12, padding:'10px 6px' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{s2.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--text)' }}>{s2.val}</div>
            </div>
          ))}
        </div>

        <button onClick={onContinue} style={s.btn('primary')}>
          {weekNum+1}. Haftaya Devam Et 🚀
        </button>
      </div>
    </div>
  )
}
