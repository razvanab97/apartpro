'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageCircle, X, Send, Loader2, Phone, ExternalLink } from 'lucide-react'

type Message = {
  role: 'user' | 'assistant'
  content: string
  ts: Date
}

const WHATSAPP_RAZVAN = '40749558705'
const WHATSAPP_MSG = encodeURIComponent('Salut! Am o întrebare despre apartamentele AB Homes și am nevoie de ajutor.')

async function getContext() {
  const today = new Date().toISOString().split('T')[0]
  const [{ data: apts }, { data: rez }, { data: stats }] = await Promise.all([
    supabase.from('apartamente').select('nume, nota, adresa, capacitate_max, pret_standard, dotari, reguli, instructiuni_checkin, link_site, link_booking, status').eq('status', 'activ').order('nota'),
    supabase.from('rezervari').select('apartament:apartamente(nume), data_checkin, data_checkout, status_rezervare').gte('data_checkout', today).in('status_rezervare', ['confirmata', 'finalizata']).order('data_checkin').limit(30),
    supabase.from('rezervari').select('suma_incasata, status_rezervare').gte('data_checkin', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
  ])

  const apartamenteInfo = (apts || []).map((a: any) =>
    `- ${a.nota ? `[${a.nota}] ` : ''}${a.nume}: ${a.adresa}, max ${a.capacitate_max} pers, ${a.pret_standard} RON/noapte. Dotări: ${Array.isArray(a.dotari) ? a.dotari.join(', ') : a.dotari || 'standard'}. ${a.reguli || ''}`
  ).join('\n')

  const rezervariActive = (rez || []).map((r: any) =>
    `- ${r.apartament?.nume || '?'}: ${r.data_checkin} → ${r.data_checkout} (${r.status_rezervare})`
  ).join('\n')

  const incLuna = (stats || []).filter((r: any) => ['confirmata','finalizata'].includes(r.status_rezervare)).reduce((s: number, r: any) => s + Number(r.suma_incasata || 0), 0)

  return `Ești asistentul AI al AB Homes Iași — o companie de apartamente în regim hotelier. Răspunzi în română, ești prietenos, concis și util.

APARTAMENTE DISPONIBILE:
${apartamenteInfo || 'Informații indisponibile momentan.'}

REZERVĂRI ACTIVE (next 30 zile):
${rezervariActive || 'Nicio rezervare activă.'}

CONTEXT BUSINESS:
- Companie: AB Homes Iași
- Site: https://abhomesiasi.ro
- WhatsApp rezervări: +40 749 558 705
- Venituri luna curentă: ${incLuna.toLocaleString('ro-RO')} RON
- Check-in standard: 15:00, Check-out: 11:00
- Self check-in disponibil

INSTRUCȚIUNI:
1. Dacă cineva întreabă de disponibilitate, spune-le să verifice pe site sau să scrie pe WhatsApp (+40 749 558 705)
2. Dacă nu știi răspunsul exact, spune sincer și oferă contactul WhatsApp
3. Nu inventa informații despre prețuri sau disponibilitate
4. Dacă întrebarea e complexă sau urgentă, recomandă contactul direct
5. Fii scurt — maxim 3-4 propoziții per răspuns`
}

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Bună! 👋 Sunt asistentul AB Homes. Te pot ajuta cu informații despre apartamentele noastre, disponibilitate, prețuri sau alte întrebări. Cu ce te pot ajuta?', ts: new Date() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg, ts: new Date() }])
    setLoading(true)

    try {
      const context = await getContext()
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: context,
          messages: [...history, { role: 'user', content: userMsg }]
        })
      })

      const data = await res.json()
      const reply = data.content?.[0]?.text || 'Îmi pare rău, nu am putut procesa întrebarea. Te rog să mă contactezi pe WhatsApp.'

      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date() }])
      if (!open) setUnread(n => n + 1)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'A apărut o eroare. Te rog să mă contactezi direct pe WhatsApp pentru ajutor rapid. 🙏',
        ts: new Date()
      }])
    }
    setLoading(false)
  }

  const showEscalate = messages.length >= 4 || messages.some(m => m.role === 'assistant' && (m.content.includes('nu știu') || m.content.includes('nu pot') || m.content.includes('contactezi')))

  return (
    <>
      {/* Floating button */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
        {!open && unread > 0 && (
          <div style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            {unread}
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: 54, height: 54, borderRadius: '50%',
            background: open ? 'rgba(14,27,43,0.9)' : 'rgba(77,163,255,0.9)',
            border: '2px solid rgba(159,215,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#FFFFFF',
            boxShadow: '0 4px 20px rgba(77,163,255,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {open ? <X size={22} /> : <MessageCircle size={22} />}
        </button>
      </div>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, zIndex: 999,
          width: 360, maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(11,18,32,0.95)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(159,215,255,0.18)',
          borderRadius: 18,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.2s ease',
          overflow: 'hidden',
          maxHeight: '70vh',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
            background: 'rgba(14,27,43,0.6)',
            borderBottom: '1px solid rgba(159,215,255,0.1)',
            flexShrink: 0,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(77,163,255,0.2)', border: '2px solid rgba(77,163,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏢</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>AB Homes Assistant</div>
              <div style={{ fontSize: 10, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }} />
                Online
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(159,215,255,0.5)', display: 'flex', padding: 4 }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'rgba(77,163,255,0.8)' : 'rgba(214,228,244,0.08)',
                  border: m.role === 'user' ? '1px solid rgba(159,215,255,0.3)' : '1px solid rgba(159,215,255,0.1)',
                  fontSize: 13,
                  color: '#FFFFFF',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(214,228,244,0.08)', border: '1px solid rgba(159,215,255,0.1)', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DA3FF', animation: 'pulse 1s infinite' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DA3FF', animation: 'pulse 1s infinite 0.2s' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DA3FF', animation: 'pulse 1s infinite 0.4s' }} />
                </div>
              </div>
            )}
            {/* Escalate to WhatsApp */}
            {showEscalate && !loading && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'rgba(214,228,244,0.7)' }}>
                <div style={{ marginBottom: 7 }}>Preferi să vorbești direct cu noi? 👇</div>
                <a href={`https://wa.me/${WHATSAPP_RAZVAN}?text=${WHATSAPP_MSG}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
                  <Phone size={13} /> Scrie pe WhatsApp
                </a>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(159,215,255,0.08)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Scrie un mesaj..."
              style={{
                flex: 1, padding: '9px 13px', borderRadius: 10,
                background: 'rgba(214,228,244,0.08)',
                border: '1px solid rgba(159,215,255,0.15)',
                color: '#FFFFFF', fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: input.trim() ? 'rgba(77,163,255,0.85)' : 'rgba(77,163,255,0.2)',
                border: '1px solid rgba(159,215,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                color: '#FFFFFF', transition: 'all 0.15s',
              }}
            >
              {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>
    </>
  )
}
