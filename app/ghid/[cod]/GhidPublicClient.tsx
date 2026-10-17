'use client'
import { useEffect, useState } from 'react'
import GhidView from '@/components/GhidView'
import type { Ghid } from '@/lib/ghid'

// Partea interactiva a paginii publice; datele vin deja completate de pe server (fara ecran „Se încarcă ghidul”).
export default function GhidPublicClient({ g, aptId }: { g: Ghid; aptId: string }) {
  // butonul „Editează” apare doar pe dispozitivele de pe care s-a folosit aplicatia ca admin (vezi Layout) - nu la oaspeti
  const [admin, setAdmin] = useState(false)
  useEffect(() => { try { setAdmin(localStorage.getItem('apartpro_admin') === '1') } catch {} }, [])
  // aplicatia blocheaza derularea documentului (html, body overflow hidden) -> ghidul are zona lui de derulare
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#120d0a' }}>
      <GhidView g={g} />
      {admin && (
        <a href={`/ghiduri/${aptId}`} style={{ position: 'fixed', left: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 50, background: '#ff6600', color: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>✏️ Editează ghidul</a>
      )}
    </div>
  )
}
