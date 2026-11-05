'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Evolutia reala pe ultimele 12 luni, pentru graficele din Dashboard (inainte: date demonstrative scrise in cod - raportat
// direct: „ce reprezintă această secțiune? nu pare să arate evoluția de la o lună la alta”).
// Valoare = suma încasată (brut) pro-rata pe nopțile din fiecare lună, fără anulate și fără cele nealocate; numărul de
// rezervări = check-in în luna respectivă. Pentru fiecare lună și aceeași lună de anul trecut (reper).

export type LunaEvolutie = { cheie: string; eticheta: string; an: number; luna: number; lei: number; rezervari: number; leiAnTrecut: number; inCurs: boolean }

const SCURT = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const zile = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

export function useEvolutieLunara(nrLuni = 12) {
  const [luni, setLuni] = useState<LunaEvolutie[] | null>(null)
  useEffect(() => { (async () => {
    const azi = new Date(), an = azi.getFullYear(), luna = azi.getMonth() + 1
    const start = ymd(new Date(an - 1, luna - nrLuni, 1)), end = ymd(new Date(an, luna, 1))   // incl. anul trecut pentru reper
    const rez: any[] = []
    for (let de = 0; de < 20000; de += 1000) {
      const { data, error } = await supabase.from('rezervari').select('apartament_id,data_checkin,data_checkout,nr_nopti,suma_incasata,camera_semnalata')
        .lt('data_checkin', end).gt('data_checkout', start).neq('status_rezervare', 'anulata').order('data_checkin').range(de, de + 999)
      if (error || !data) break
      rez.push(...data); if (data.length < 1000) break
    }
    // fara apartamentele „Exclus din statistici” (ex. N45 - acolo firma ia doar comisionul)
    const { data: excl } = await supabase.from('apartamente').select('id').eq('exclus_statistici', true)
    const exclus = new Set((excl || []).map((a: any) => a.id))
    const valide = rez.filter(r => r.camera_semnalata !== 'NEALOCAT' && !exclus.has(r.apartament_id))
    const inLuna = (A: number, L: number) => {
      const s = ymd(new Date(A, L - 1, 1)), e = ymd(new Date(A, L, 1))
      let lei = 0, nr = 0
      for (const r of valide) {
        if (r.data_checkin >= s && r.data_checkin < e) nr++
        const tot = Math.max(1, Number(r.nr_nopti) || zile(r.data_checkin, r.data_checkout))
        const a = r.data_checkin > s ? r.data_checkin : s, b = r.data_checkout < e ? r.data_checkout : e
        const n = Math.max(0, zile(a, b)); if (n) lei += (Number(r.suma_incasata) || 0) * Math.min(1, n / tot)
      }
      return { lei: Math.round(lei), nr }
    }
    const out: LunaEvolutie[] = []
    for (let k = nrLuni - 1; k >= 0; k--) {
      const d = new Date(an, luna - 1 - k, 1), A = d.getFullYear(), L = d.getMonth() + 1
      const acum = inLuna(A, L), trecut = inLuna(A - 1, L)
      out.push({ cheie: `${A}-${L}`, eticheta: SCURT[L], an: A, luna: L, lei: acum.lei, rezervari: acum.nr, leiAnTrecut: trecut.lei, inCurs: k === 0 })
    }
    setLuni(out)
  })().catch(() => setLuni([])) }, [nrLuni])
  return luni
}

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)

// bare pe luni: valoarea lunii + reperul anului trecut (linie), luna curentă marcată „în curs”
export function GraficVenituri({ luni }: { luni: LunaEvolutie[] }) {
  const max = Math.max(1, ...luni.map(l => Math.max(l.lei, l.leiAnTrecut)))
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div data-grafic-venituri>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 108, padding: '0 2px' }}>
        {luni.map((l, i) => {
          const h = Math.round(l.lei / max * 92), hT = Math.round(l.leiAnTrecut / max * 92)
          const activ = hover === i
          return (
            <div key={l.cheie} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}>
              <div style={{ position: 'relative', width: '100%', height: 96, display: 'flex', alignItems: 'flex-end' }}>
                {(activ || l.inCurs || i === luni.length - 2) && <div style={{ position: 'absolute', bottom: h + 4, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, fontFamily: 'monospace', fontWeight: 700, color: l.inCurs ? '#A9C8E8' : '#7FA8E0', whiteSpace: 'nowrap' }}>{fmtK(l.lei)}</div>}
                <div style={{ width: '100%', height: Math.max(2, h), borderRadius: '4px 4px 0 0',
                  background: l.inCurs ? 'repeating-linear-gradient(135deg, rgba(127,168,224,0.45) 0 4px, rgba(127,168,224,0.2) 4px 8px)' : activ ? 'rgba(127,168,224,0.75)' : 'rgba(127,168,224,0.38)',
                  border: '1px solid rgba(127,168,224,0.45)', borderBottom: 'none', transition: 'background .15s' }} />
                {l.leiAnTrecut > 0 && <div title={`anul trecut: ${l.leiAnTrecut.toLocaleString('ro-RO')} lei`} style={{ position: 'absolute', left: -1, right: -1, bottom: hT, height: 2, borderRadius: 1, background: '#E3C77A', opacity: 0.8 }} />}
              </div>
              <div style={{ fontSize: 10.5, color: l.inCurs ? '#A9C8E8' : 'rgba(159,215,255,0.4)', fontFamily: 'monospace' }}>{l.eticheta}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, minHeight: 16, fontSize: 11.5, color: 'rgba(159,215,255,0.5)' }}>
        {hover != null ? (() => { const l = luni[hover], p = l.leiAnTrecut ? Math.round((l.lei / l.leiAnTrecut - 1) * 100) : null
          return <span><b style={{ color: '#E6EAF7' }}>{SCURT[l.luna]} {l.an}{l.inCurs ? ' (în curs)' : ''}: {l.lei.toLocaleString('ro-RO')} lei</b> · {l.rezervari} rezervări · {l.leiAnTrecut ? `anul trecut ${l.leiAnTrecut.toLocaleString('ro-RO')} lei` : 'fără date anul trecut'}{p != null && <span style={{ color: p >= 0 ? '#7FCFA0' : '#E08E8E', fontWeight: 700 }}> {p >= 0 ? '▲' : '▼'} {Math.abs(p)}%</span>}</span> })()
          : <span><span style={{ display: 'inline-block', width: 10, height: 6, borderRadius: 2, background: 'rgba(127,168,224,0.55)', marginRight: 4 }} />valoarea rezervărilor (brut) · <span style={{ display: 'inline-block', width: 10, height: 2, background: '#E3C77A', margin: '0 4px 2px', verticalAlign: 'middle' }} />aceeași lună anul trecut · treci cu mouse-ul peste o lună</span>}
      </div>
    </div>
  )
}
