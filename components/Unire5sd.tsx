'use client'
import { useEffect, useState } from 'react'
import { citesteUnite, esteUnita, idsDinObs, type Unire5sd } from '@/lib/syncFivestar'

// Rezervarea creata in apartpro si unita cu dublura ei din 5starDesk (cerut direct: „să rămână doar cea creată pe
// apartpro ca originală, iar cealaltă cumva în spate”): arata ca e unita si ce zice 5starDesk, cu diferentele marcate.
let cache: { t: number; p: Promise<Record<string, Unire5sd>> } | null = null
const incarca = () => { if (!cache || Date.now() - cache.t > 60000) cache = { t: Date.now(), p: citesteUnite().catch(() => ({})) }; return cache.p }

export default function Unire5sdInfo({ rez }: { rez: any }) {
  const [u, setU] = useState<Unire5sd | null>(null)
  const unita = esteUnita(rez?.observatii)
  useEffect(() => { if (unita && rez?.id) incarca().then(m => setU(m[rez.id] || null)) }, [unita, rez?.id])
  if (!unita) return null
  const id = u?.id5sd || idsDinObs(rez.observatii)[0] || ''
  const lei = (n: any) => Math.round(Number(n) || 0).toLocaleString('ro-RO')
  const d = (s: string) => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '?'
  const camp = (txt: string, diferit: boolean) => <span style={{ color: diferit ? '#FBBF24' : 'rgba(214,228,244,0.75)', fontWeight: diferit ? 700 : 400 }}>{txt}</span>
  return (
    <div data-unire-5sd style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.28)', borderRadius: 7 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7DD3FC' }}>🔗 Unită cu 5starDesk{id ? ` #${id}` : ''}</div>
      <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.55)', marginTop: 2 }}>Originala e cea creată în apartpro; dublura din 5starDesk e păstrată în spate.</div>
      {u && (
        <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
          <span style={{ color: 'rgba(159,215,255,0.5)' }}>În 5starDesk: </span>
          {camp(u.nume, u.nume !== rez.nume_client)} · {camp(`${d(u.checkin)} → ${d(u.checkout)}`, u.checkin !== rez.data_checkin || u.checkout !== rez.data_checkout)}
          {u.pret > 0 && <> · {camp(`${lei(u.pret)} lei`, Math.round(u.pret) !== Math.round(Number(rez.suma_incasata) || 0))}</>}
          {' · '}{camp(u.canal, u.canal !== rez.canal)}{u.cod && <> · {camp(u.cod, !!rez.apartament?.nota && u.cod !== rez.apartament.nota)}</>}
          {u.status === 'anulata' && <div style={{ color: '#F87171', fontWeight: 700, marginTop: 3 }}>⚠ Anulată în 5starDesk — verifică</div>}
          <div style={{ fontSize: 10.5, color: 'rgba(159,215,255,0.35)', marginTop: 2 }}>cu galben = diferit față de rezervarea ta</div>
        </div>
      )}
    </div>
  )
}
