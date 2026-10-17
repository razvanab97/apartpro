'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import GhidView from '@/components/GhidView'
import { aptDupaCod, citesteGhid, type Ghid } from '@/lib/ghid'

// Pagina publica a ghidului de check-in pentru oaspeti: /ghid/<COD> (ex. /ghid/GS08). Fara meniul aplicatiei.
export default function GhidPublic() {
  const { cod } = useParams<{ cod: string }>()
  const [g, setG] = useState<Ghid | null>(null)
  const [stare, setStare] = useState<'incarc' | 'gata' | 'lipsa'>('incarc')
  useEffect(() => {
    let viu = true
    ;(async () => {
      const apt = await aptDupaCod(String(cod || ''))
      const ghid = apt ? await citesteGhid(apt.id) : null
      if (!viu) return
      if (ghid) { setG(ghid); setStare('gata'); document.title = `${ghid.titlu || apt?.nume} — AB Homes` } else setStare('lipsa')
    })()
    return () => { viu = false }
  }, [cod])
  if (stare === 'gata' && g) return <div style={{ minHeight: '100dvh', background: '#120d0a' }}><GhidView g={g} /></div>
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#120d0a', color: '#a9a89f', fontFamily: 'system-ui,sans-serif', fontSize: 15, padding: 24, textAlign: 'center' }}>
      {stare === 'incarc' ? 'Se încarcă ghidul… / Loading the guide…' : 'Ghidul nu a fost găsit. Scrieți-ne pe WhatsApp: +40 749 558 705'}
    </div>
  )
}
