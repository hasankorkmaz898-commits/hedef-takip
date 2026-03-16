import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'

export default function ChatPanel({ user, friend, onClose }) {
  const [messages, setMessages]   = useState([])
  const [input,    setInput]      = useState('')
  const [loading,  setLoading]    = useState(true)
  const bottomRef  = useRef(null)
  const channelRef = useRef(null)
  const supabase   = createClient()

  // İki kullanıcı arasındaki konuşma id'si — küçük uuid önce
  const convId = [user.id, friend.id].sort().join('_')

  useEffect(() => {
    loadMessages()
    subscribeRealtime()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  async function loadMessages() {
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages(data || [])
    setLoading(false)
    // Okundu işaretle
    await supabase.from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('receiver_id', user.id)
      .is('read_at', null)
  }

  function subscribeRealtime() {
    channelRef.current = supabase
      .channel('chat_' + convId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `conversation_id=eq.${convId}`
      }, payload => {
        setMessages(p => [...p, payload.new])
        // Gelen mesajı okundu işaretle
        if (payload.new.receiver_id === user.id) {
          supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', payload.new.id)
        }
      })
      .subscribe()
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await supabase.from('direct_messages').insert({
      conversation_id: convId,
      sender_id:   user.id,
      receiver_id: friend.id,
      text,
    })
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const todayStr = new Date().toISOString().slice(0,10)
  function dateLabel(ts) {
    const d = ts.slice(0,10)
    if (d === todayStr) return 'Bugün'
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1)
    if (d === yesterday.toISOString().slice(0,10)) return 'Dün'
    return new Date(ts).toLocaleDateString('tr-TR', { day:'numeric', month:'long' })
  }

  // Mesajları güne göre grupla
  const grouped = []
  let lastDay = null
  messages.forEach(m => {
    const day = m.created_at.slice(0,10)
    if (day !== lastDay) { grouped.push({ type:'day', label: dateLabel(m.created_at) }); lastDay = day }
    grouped.push({ type:'msg', ...m })
  })

  const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(10,12,18,0.7)', zIndex:400 }} onClick={onClose} />
      <div style={{ position:'fixed', inset:0, zIndex:401, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto', background:'var(--bg)' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px', borderBottom:'1.5px solid var(--border)', display:'flex', alignItems:'center', gap:12, background:'var(--surface)', flexShrink:0 }}>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text2)', fontSize:20, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>←</button>
          <div style={{ width:38, height:38, borderRadius:'50%', background:'#fb923c', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {friend.avatar_url
              ? <img src={friend.avatar_url} style={{ width:38, height:38, borderRadius:'50%' }} alt="" />
              : initials(friend.display_name)
            }
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{friend.display_name}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{friend.user_code}</div>
          </div>
        </div>

        {/* Mesajlar */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 14px' }}>
          {loading && <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:20 }}>Yükleniyor...</div>}
          {!loading && messages.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>💬</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>Henüz mesaj yok</div>
              <div style={{ fontSize:12 }}>Merhaba de, konuşmayı başlat!</div>
            </div>
          )}
          {grouped.map((item, i) => {
            if (item.type === 'day') return (
              <div key={i} style={{ textAlign:'center', margin:'16px 0 10px' }}>
                <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', padding:'3px 12px', borderRadius:99, fontWeight:600 }}>{item.label}</span>
              </div>
            )
            const isMe = item.sender_id === user.id
            const time = new Date(item.created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })
            return (
              <div key={item.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom:6 }}>
                <div style={{
                  maxWidth:'78%',
                  background: isMe ? 'var(--accent)' : 'var(--surface)',
                  border: isMe ? 'none' : '1.5px solid var(--border)',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding:'10px 14px',
                }}>
                  <div style={{ fontSize:14, color: isMe ? '#fff' : 'var(--text)', lineHeight:1.5, wordBreak:'break-word' }}>{item.text}</div>
                  <div style={{ fontSize:10, color: isMe ? 'rgba(255,255,255,0.6)' : 'var(--text3)', marginTop:4, textAlign:'right' }}>
                    {time}{isMe && <span style={{ marginLeft:4 }}>{item.read_at ? '✓✓' : '✓'}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding:'10px 14px 28px', borderTop:'1.5px solid var(--border)', background:'var(--surface)', display:'flex', gap:10, alignItems:'flex-end', flexShrink:0 }}>
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Mesaj yaz..."
            rows={1}
            style={{
              flex:1, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:18,
              padding:'10px 14px', color:'var(--text)', fontSize:14, outline:'none', fontFamily:'inherit',
              resize:'none', maxHeight:100, lineHeight:1.5, fontWeight:500
            }}
            onInput={e=>{ e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            style={{
              width:42, height:42, borderRadius:'50%', background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
              border:'none', cursor: input.trim() ? 'pointer' : 'default',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              transition:'background 0.15s'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke={input.trim()?"#fff":"var(--text3)"} strokeWidth="2" strokeLinecap="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim()?"#fff":"var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

      </div>
    </>
  )
}
