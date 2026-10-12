'use client'
import { useEffect, useState } from 'react'

// Tema aplicatiei (cerut direct: "format de light - alb cremos, sa pot alege intre inchis si deschis, pentru
// tot proiectul"). Se tine minte pe dispozitiv; se aplica pe <html data-theme> inainte de afisare (script din
// app/layout.tsx), iar culorile luminoase vin din app/tema-luminoasa.css.
export function aplicaTema(t: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem('tema', t) } catch {}
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'light' ? '#F6F1E7' : '#0A1628')
}

export default function ComutatorTema({ compact }: { compact?: boolean }) {
  const [tema, setTema] = useState<'dark' | 'light'>('dark')
  useEffect(() => { setTema(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark') }, [])
  const alege = (t: 'dark' | 'light') => { setTema(t); aplicaTema(t) }
  const b = (on: boolean): React.CSSProperties => ({ flex: 1, border: 'none', borderRadius: 7, padding: compact ? '6px 4px' : '7px 6px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    background: on ? '#4DA3FF' : 'transparent', color: on ? '#FFFFFF' : 'rgba(159,215,255,0.6)' })
  return (
    <div role="group" aria-label="Temă" style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9, border: '1px solid rgba(159,215,255,0.15)', background: 'rgba(14,27,43,0.5)' }}>
      <button onClick={() => alege('dark')} style={b(tema === 'dark')} title="Temă închisă">☾ Închis</button>
      <button onClick={() => alege('light')} style={b(tema === 'light')} title="Temă deschisă (alb cremos)">☀︎ Deschis</button>
    </div>
  )
}
