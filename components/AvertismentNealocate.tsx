'use client'
import { useEffect, useState } from 'react'
import { nealocateCache, citesteNoteNealocate, type Nealocata } from '@/lib/syncFivestar'

// Avertisment la rezervare noua (cerut direct): rezervarile nealocate din 5starDesk care se suprapun cu
// datele alese, ca sa tii cont de ele (au nevoie si ele de un apartament pe acele nopti), cu notitele interne.
const fmtZi = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'][m-1]}` }

export default function AvertismentNealocate({ checkin, checkout, compact }: { checkin?: string | null; checkout?: string | null; compact?: boolean }) {
  const [lista, setLista] = useState<Nealocata[]>([])
  const [note, setNote] = useState<Record<string, { text: string }>>({})
  useEffect(() => {
    let viu = true
    if (!checkin || !checkout || checkout <= checkin) { setLista([]); return }
    Promise.all([nealocateCache(), citesteNoteNealocate().catch(() => ({}))]).then(([l, n]) => {
      if (!viu) return
      setNote(n as any)
      // doar cele care inca nu sunt alocate nici la noi (cele alocate manual ocupa deja un apartament in calendar)
      setLista(l.filter(x => !x.alocataManual && x.checkin < checkout && x.checkout > checkin))
    })
    return () => { viu = false }
  }, [checkin, checkout])
  if (!lista.length) return null
  return (
    <div style={{ background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.35)', borderRadius: 10, padding: compact ? '8px 10px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#FCD34D' }}>
        ⚠ {lista.length === 1 ? '1 rezervare nealocată' : `${lista.length} rezervări nealocate`} în 5starDesk pe aceste date — au nevoie și ele de un apartament
      </div>
      {lista.map(n => (
        <div key={n.id5sd} style={{ fontSize: 12, color: 'rgba(214,228,244,0.85)', lineHeight: 1.45 }}>
          <b>{n.nume}</b> · {fmtZi(n.checkin)} → {fmtZi(n.checkout)}{n.nrPersoane ? ` · ${n.nrPersoane} pers.` : ''} · {Math.round(n.pret).toLocaleString('ro-RO')} RON · {n.sursa}
          {note[n.id5sd]?.text && <div style={{ fontSize: 11.5, color: '#FCD34D', marginTop: 1 }}>📝 {note[n.id5sd].text}</div>}
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>Le găsești în Calendar → „Nealocate în 5starDesk”.</div>
    </div>
  )
}
