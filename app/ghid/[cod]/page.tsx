'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import GhidView from '@/components/GhidView'
import { ghidNou, type Ghid } from '@/lib/ghid'

// Pagina publica a ghidului de check-in pentru oaspeti: /ghid/<COD> (ex. /ghid/GS08). Fara meniul aplicatiei.
export default function GhidPublic() {
  const { cod } = useParams<{ cod: string }>()
  const [g, setG] = useState<Ghid | null>(null)
  const [stare, setStare] = useState<'incarc' | 'gata' | 'lipsa'>('incarc')
  const [aptId, setAptId] = useState<string | null>(null)
  // butonul „Editează” apare doar pe dispozitivele de pe care s-a folosit aplicatia ca admin (vezi Layout) - nu la oaspeti
  const [admin, setAdmin] = useState(false)
  useEffect(() => { try { setAdmin(localStorage.getItem('apartpro_admin') === '1') } catch {} }, [])
  useEffect(() => {
    let viu = true
    ;(async () => {
      // doar ghidul acesta, prin ruta dedicata (pe adresa oaspetilor nu exista alt acces la date)
      let apt: { id: string; nume: string } | null = null, ghid: Ghid | null = null
      try { const r = await fetch(`/api/ghid/${encodeURIComponent(String(cod || ''))}`, { cache: 'no-store' }); const j = await r.json(); if (j.ok) { apt = j.apt; ghid = { ...ghidNou(), ...j.ghid } } } catch {}
      if (apt) setAptId(apt.id)
      if (!viu) return
      if (ghid) { setG(ghid); setStare('gata'); document.title = `${ghid.titlu || apt?.nume} — AB Homes` } else setStare('lipsa')
    })()
    return () => { viu = false }
  }, [cod])
  // aplicatia blocheaza derularea documentului (html, body overflow hidden) -> ghidul are zona lui de derulare
  if (stare === 'gata' && g) return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#120d0a' }}>
      <GhidView g={g} />
      {admin && aptId && (
        <a href={`/ghiduri/${aptId}`} style={{ position: 'fixed', left: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 50, background: '#ff6600', color: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>✏️ Editează ghidul</a>
      )}
    </div>
  )
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#120d0a', color: '#a9a89f', fontFamily: 'system-ui,sans-serif', fontSize: 15, padding: 24, textAlign: 'center' }}>
      {stare === 'incarc' ? 'Se încarcă ghidul… / Loading the guide…' : 'Ghidul nu a fost găsit. Scrieți-ne pe WhatsApp: +40 712 290 109'}
    </div>
  )
}
