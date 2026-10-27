'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { nealocateCache, citesteNoteNealocate, type Nealocata } from '@/lib/syncFivestar'

// Pop-up de atentionare pentru rezervarile nealocate in 5starDesk cu check-in in urmatoarele 4 zile (cerut direct:
// „când mai sunt 4 zile până la check-in să apară notificare ca pop-up, să ne ocupăm de ele”). Se verifica la pornire
// si la fiecare 30 de minute; „Am înțeles” il ascunde pana mâine (sau pana apare o rezervare noua in lista),
// „Mai târziu” pentru 2 ore. Cele deja alocate manual in aplicatie nu mai apar.
const ZILE = 4
const azi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const plus = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const zile = (iso: string) => Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(azi() + 'T12:00:00').getTime()) / 86400000)
const fmt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' })

export default function AlertaNealocate() {
  const pathname = usePathname()
  const [lista, setLista] = useState<Nealocata[]>([])
  const [note, setNote] = useState<Record<string, { text: string }>>({})
  const [arata, setArata] = useState(false)

  useEffect(() => {
    let viu = true
    async function verifica() {
      try {
        const [l, n] = await Promise.all([nealocateCache(), citesteNoteNealocate().catch(() => ({}))])
        const a = azi(), lim = plus(a, ZILE)
        const urgente = l.filter(x => !x.alocataManual && x.checkout > a && x.checkin <= lim)
        if (!viu) return
        setLista(urgente); setNote(n as any)
        if (!urgente.length) { setArata(false); return }
        const cheie = urgente.map(x => x.id5sd).sort().join(',')
        let ascuns = false
        try {
          const s = JSON.parse(localStorage.getItem('alerta_nealocate') || '{}')
          ascuns = (s.zi === a && s.ids === cheie) || (s.pana && Date.now() < s.pana && s.ids === cheie)
        } catch {}
        if (!ascuns) setArata(true)
      } catch {}
    }
    const t = setTimeout(verifica, 6000)
    const i = setInterval(verifica, 30 * 60 * 1000)
    return () => { viu = false; clearTimeout(t); clearInterval(i) }
  }, [])

  if (!arata || !lista.length || pathname === '/calendar') return null
  const cheie = lista.map(x => x.id5sd).sort().join(',')
  const ascunde = (ore?: number) => {
    try { localStorage.setItem('alerta_nealocate', JSON.stringify(ore ? { ids: cheie, pana: Date.now() + ore * 3600000 } : { ids: cheie, zi: azi() })) } catch {}
    setArata(false)
  }
  const btn = (bg: string, fg: string, br: string): React.CSSProperties => ({ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${br}`, background: bg, color: fg, fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'center', textDecoration: 'none' })

  return (
    <div role="dialog" aria-label="Rezervări nealocate" onClick={() => ascunde(2)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(3,7,15,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px,100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: '#0E1B30', border: '1px solid rgba(252,211,77,0.45)', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FCD34D' }}>{lista.length === 1 ? 'O rezervare nealocată' : `${lista.length} rezervări nealocate`}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(214,228,244,0.7)' }}>Check-in în următoarele {ZILE} zile și fără apartament în 5starDesk — alocă-le cât mai repede.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map(x => {
            const z = zile(x.checkin)
            const cand = z < 0 ? 'cazat deja' : z === 0 ? 'AZI' : z === 1 ? 'mâine' : `în ${z} zile`
            return (
              <div key={x.id5sd} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(252,211,77,0.06)', border: `1px solid ${z <= 1 ? 'rgba(248,113,113,0.5)' : 'rgba(252,211,77,0.25)'}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 14, color: '#E8F4FF' }}>{x.nume}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: z <= 1 ? '#F87171' : '#FCD34D', whiteSpace: 'nowrap' }}>{cand}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.65)', marginTop: 2 }}>
                  {fmt(x.checkin)} → {fmt(x.checkout)}{x.nrPersoane ? ` · ${x.nrPersoane} pers.` : ''}{x.sursa ? ` · ${x.sursa}` : ''}{x.pret ? ` · ${Math.round(x.pret)} RON` : ''}
                </div>
                {note[x.id5sd]?.text && <div style={{ fontSize: 12, color: '#C4B5FD', marginTop: 4 }}>📝 {note[x.id5sd].text}</div>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/calendar?nealocate=1" onClick={() => ascunde(2)} style={btn('#FCD34D', '#1A1405', 'transparent')}>Alocă în Calendar</a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => ascunde(2)} style={btn('transparent', 'rgba(214,228,244,0.8)', 'rgba(159,215,255,0.25)')}>Mai târziu (2 ore)</button>
          <button onClick={() => ascunde()} style={btn('transparent', 'rgba(214,228,244,0.8)', 'rgba(159,215,255,0.25)')}>Am înțeles (azi)</button>
        </div>
      </div>
    </div>
  )
}
