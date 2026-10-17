import type { Metadata } from 'next'
import { incarcaGhidPublic } from '@/lib/ghidServer'
import GhidPublicClient from './GhidPublicClient'

// Pagina publica a ghidului de check-in: /ghid/<COD> (si ghid-ul pe adresa oaspetilor, ex. abhomes-checkin.vercel.app/GS08).
// Se construieste pe server cu datele deja incluse (cerut direct: „să dispară încărcarea de la început: se încarcă ghidul”),
// mereu proaspete - orice modificare din editor apare la urmatoarea deschidere.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ cod: string }> }): Promise<Metadata> {
  const r = await incarcaGhidPublic((await params).cod)
  return { title: r ? `${r.ghid.titlu || r.apt.nume} — AB Homes` : 'AB Homes', robots: { index: false, follow: false } }
}

export default async function GhidPublic({ params }: { params: Promise<{ cod: string }> }) {
  const r = await incarcaGhidPublic((await params).cod)
  if (!r) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#120d0a', color: '#a9a89f', fontFamily: 'system-ui,sans-serif', fontSize: 15, padding: 24, textAlign: 'center' }}>
      Ghidul nu a fost găsit. Scrieți-ne pe WhatsApp: +40 712 290 109
    </div>
  )
  return <GhidPublicClient g={r.ghid} aptId={r.apt.id} />
}
