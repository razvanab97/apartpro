'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Selector de apartament cu cautare si grupare pe firme (cerut direct: „împărțit în secțiuni de privat și pe fiecare
// firmă” + „secțiune de search pentru apartamentul pe care îl vrem”). Firmele vin din setari „apartamente_firma”
// (aceeasi lista ca in Apartamente si Cheltuieli → Fișe).
type Apt = { id: string; nota?: string | null; nume: string; status?: string }

let firmeCache: Promise<Record<string, string>> | null = null
export function citesteFirme(fortat = false) {
  if (!firmeCache || fortat) firmeCache = Promise.resolve(supabase.from('setari').select('valoare').eq('cheie', 'apartamente_firma').maybeSingle())
    .then(({ data }) => { try { const v = JSON.parse(data?.valoare || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } })
    .catch(() => ({}))
  return firmeCache
}
const GRUPE = [
  { cheie: 'Privat', titlu: 'Privat', c: '#C4B5FD' },
  { cheie: 'ABXHOMES', titlu: 'AB Homes · ABXHOMES', c: '#7BC8FF' },
  { cheie: 'AB HOMES INVEST SRL', titlu: 'AB Homes Invest SRL', c: '#3DDC97' },
]
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const eticheta = (a: Apt) => `${a.nota ? a.nota + ' · ' : ''}${String(a.nume || '').trim()}`

export default function AptPicker({ apts, value, onChange, placeholder = '— Selectează apartament —', style, eroare }: {
  apts: Apt[]; value: string | null | undefined; onChange: (id: string | null) => void; placeholder?: string; style?: React.CSSProperties; eroare?: boolean
}) {
  const [firme, setFirme] = useState<Record<string, string>>({})
  const [deschis, setDeschis] = useState(false)
  const [q, setQ] = useState('')
  const [activ, setActiv] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { citesteFirme().then(setFirme) }, [])
  useEffect(() => {
    if (!deschis) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setDeschis(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [deschis])

  const grupuri = useMemo(() => {
    const t = norm(q.trim())
    const potrivite = apts.filter(a => !t || norm(eticheta(a)).includes(t))
    const alfa = (x: Apt, y: Apt) => (Number(x.status && x.status !== 'activ') - Number(y.status && y.status !== 'activ')) || eticheta(x).localeCompare(eticheta(y), 'ro')
    const alte = [...new Set(Object.values(firme))].filter(f => !GRUPE.some(g => g.cheie === f)).map(f => ({ cheie: f, titlu: f, c: '#7BC8FF' }))
    return [...GRUPE, ...alte, { cheie: '', titlu: 'Fără firmă setată', c: '#8EA3BF' }]
      .map(g => ({ ...g, lista: potrivite.filter(a => (firme[a.id] || '') === g.cheie).sort(alfa) }))
      .filter(g => g.lista.length)
  }, [apts, firme, q])
  const plat = grupuri.flatMap(g => g.lista)
  const ales = apts.find(a => a.id === value)
  const alege = (id: string | null) => { onChange(id); setDeschis(false); setQ('') }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button type="button" onClick={() => { setDeschis(d => !d); setActiv(0) }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: '6px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
          background: eroare ? 'rgba(40,20,20,0.9)' : 'rgba(20,38,65,0.8)', border: `1px solid ${eroare ? 'rgba(248,113,113,0.4)' : 'rgba(100,160,255,0.2)'}`, color: ales ? '#E8F4FF' : 'rgba(159,215,255,0.6)', fontSize: 12, fontWeight: 600 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ales ? eticheta(ales) : placeholder}</span>
        <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>
      {deschis && (
        <div style={{ position: 'absolute', zIndex: 80, top: 'calc(100% + 4px)', right: 0, width: 280, maxWidth: '86vw', background: '#0E1B30', border: '1px solid rgba(148,190,255,0.25)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.55)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid rgba(148,190,255,0.12)' }}>
            <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActiv(0) }} placeholder="Caută cod sau nume…"
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiv(i => Math.min(i + 1, plat.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiv(i => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter') { e.preventDefault(); if (plat[activ]) alege(plat[activ].id) }
                else if (e.key === 'Escape') setDeschis(false)
              }}
              style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 8 }} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
            {value && <button type="button" onClick={() => alege(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: 'rgba(159,215,255,0.5)', fontSize: 12, cursor: 'pointer' }}>— fără apartament —</button>}
            {grupuri.map(g => (
              <div key={g.cheie || '-'}>
                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: g.c }}>{g.titlu}</div>
                {g.lista.map(a => {
                  const idx = plat.indexOf(a), sel = a.id === value, act = idx === activ
                  return (
                    <button key={a.id} type="button" onClick={() => alege(a.id)} onMouseEnter={() => setActiv(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5,
                        background: act ? 'rgba(77,163,255,0.16)' : 'transparent', color: a.status && a.status !== 'activ' ? 'rgba(159,215,255,0.45)' : '#E8F4FF' }}>
                      {a.nota && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, color: '#4DA3FF', minWidth: 44 }}>{a.nota}</span>}
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(a.nume || '').trim()}</span>
                      {a.status && a.status !== 'activ' && <span style={{ fontSize: 10, opacity: 0.7 }}>inactiv</span>}
                      {sel && <span style={{ color: '#3DDC97' }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            ))}
            {!plat.length && <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>Niciun apartament pentru „{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
