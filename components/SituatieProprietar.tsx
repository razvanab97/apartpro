'use client'
import { useState } from 'react'

// Situatia lunii pentru un proprietar (cerut direct: „vreau ca în apartpro să-mi apară de fiecare dată o listă completă
// cu toate detaliile, astfel încât să fie totul clar” + „fă un redesign, nu înțeleg nimic... așază-le cu mai multă
// logică”). De sus in jos: rezumat (total / plătit / rest), CHIRII (un rând pe apartament: EUR × curs = lei, plăți cu
// data, rest, buton de plată), UTILITĂȚI (un rând pe apartament: E.ON + Asociație = total, rest, buton; facturile pe
// care se bazează se deschid la cerere), apartamentele fără chirie. „Copiază lista” dă același conținut ca text.

type Rand = { id: string; categorie: string; valoare: any; status: string; data_plata?: string | null; nota?: string | null; descriere?: string | null; created_at?: string }
type Linie = { tip: 'chirie' | 'utilitati' | 'decont'; suma: number; platit: boolean; platitSuma?: number; label: string; randuri?: Rand[]; decont?: any; linie?: any }
type Detaliu = { apt: any; linii: Linie[]; subtotal: number }

const LUNI_LUNG = ['', 'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const zi = (d?: string | null) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : ''
const r2 = (n: number) => Math.round(n * 100) / 100
const eticheta = (a: any) => `${a.nota || ''} ${a.nume || ''}`.trim()

// „Factură A1559 - Urbica (3).pdf | septembrie 2026” -> { nr: 'A1559', perioada: 'septembrie 2026' }
function dinNota(nota?: string | null) {
  const [cap, ...rest] = String(nota || '').split('|')
  const perioada = rest.join('|').split('—')[0].replace(/\(.*?\)/g, '').trim()
  const urbica = cap.match(/\bA\d{3,5}\b/), factura = cap.match(/Factur[ăa]\s+([^\s|]+)/)
  return { nr: (urbica ? urbica[0] : factura ? factura[1] : '').replace(/\.pdf$/i, ''), perioada }
}

export default function SituatieProprietar({ proprietar, luna, an, detalii, faraChirie, chirii, partialeDet, platitRand, onToggle, saving }: {
  proprietar: string; luna: number; an: number; detalii: Detaliu[]
  faraChirie: { apt: any; motiv: string }[]; chirii: any[]
  partialeDet: Record<string, { suma: number; data: string }[]>; platitRand: (c: any) => number
  onToggle: (d: Detaliu, l: Linie) => void; saving: string | null
}) {
  const [copiat, setCopiat] = useState(false)
  const [deschis, setDeschis] = useState<Record<string, boolean>>({})
  // doua asezari, de ales (cerut direct: „dă-mi o idee să văd cum ar arăta”): pe categorii (chirii / utilități) sau pe apartamente
  const [mod, setMod] = useState<'categorii' | 'apartamente'>(() => { try { return localStorage.getItem('situatie_mod') === 'categorii' ? 'categorii' : 'apartamente' } catch { return 'apartamente' } })
  const alegeMod = (m: 'categorii' | 'apartamente') => { setMod(m); try { localStorage.setItem('situatie_mod', m) } catch {} }

  const chiriiRows = detalii.flatMap(d => d.linii.filter(l => l.tip === 'chirie').map(l => {
    const cf = chirii.find(c => c.apartament_id === d.apt.id)
    const eur = cf?.moneda === 'EUR' ? Number(cf.suma) || 0 : 0
    const plati: { suma: number; data: string }[] = []
    for (const c of l.randuri || []) {
      if (['validat', 'platit'].includes(c.status)) plati.push({ suma: Number(c.valoare) || 0, data: c.data_plata || '' })
      else plati.push(...(partialeDet[c.id] || []))
    }
    if (!l.randuri?.length && l.platit) plati.push({ suma: l.suma, data: l.linie?.data_platii || '' })
    const platit = r2(l.platitSuma != null ? Number(l.platitSuma) : l.platit ? l.suma : 0)
    return { d, l, apt: d.apt, eur, curs: eur ? l.suma / eur : 0, suma: l.suma, plati, platit, rest: r2(l.suma - platit) }
  }))

  const utilRows = detalii.flatMap(d => d.linii.filter(l => l.tip === 'utilitati').map(l => {
    const randuri = l.randuri || []
    const eon = r2(randuri.filter(c => c.categorie.startsWith('eon')).reduce((t, c) => t + Number(c.valoare || 0), 0))
    const asoc = r2(randuri.filter(c => c.categorie === 'asociatie').reduce((t, c) => t + Number(c.valoare || 0), 0))
    const cod = randuri.map(c => (String(c.nota || '').match(/\bA\d{3,5}\b/) || [])[0]).find(Boolean) || ''
    const facturi = randuri.map(c => {
      const v = Number(c.valoare || 0), pc = platitRand(c)
      return { id: c.id, ...dinNota(c.nota), tip: c.categorie.startsWith('eon') ? 'E.ON' : 'Asociație', valoare: v, ajustare: /^Diferen/i.test(c.descriere || ''),
        stare: v <= 0 ? '' : pc >= v ? 'plătit' : pc > 0 ? `plătit ${lei(pc)}` : 'neplătit', adaugat: String(c.created_at || '').slice(0, 10) }
    }).sort((x, y) => Number(x.ajustare) - Number(y.ajustare) || x.tip.localeCompare(y.tip))
    const platit = r2(randuri.reduce((t, c) => t + platitRand(c), 0))
    const total = r2(eon + asoc)
    return { d, l, apt: d.apt, cod, eon, asoc, total, facturi, platit, rest: r2(total - platit) }
  }))

  const decontRows = detalii.flatMap(d => d.linii.filter(l => l.tip === 'decont').map(l => {
    const platit = r2(l.platitSuma ?? (l.platit ? l.suma : 0))
    return { d, l, apt: d.apt, suma: l.suma, platit, rest: r2(l.suma - platit), label: l.label }
  }))

  const sum = (a: any[], k: string) => r2(a.reduce((t, x) => t + (Number(x[k]) || 0), 0))
  const tot = {
    chirie: sum(chiriiRows, 'suma'), chiriePlatit: sum(chiriiRows, 'platit'),
    eon: sum(utilRows, 'eon'), asoc: sum(utilRows, 'asoc'), util: sum(utilRows, 'total'), utilPlatit: sum(utilRows, 'platit'),
    decont: sum(decontRows, 'suma'), decontPlatit: sum(decontRows, 'platit'),
  }
  const total = r2(tot.chirie + tot.util + tot.decont), platit = r2(tot.chiriePlatit + tot.utilPlatit + tot.decontPlatit), rest = r2(total - platit)
  const ziFacturi = [...new Set(utilRows.flatMap(u => u.facturi.map(f => f.adaugat)).filter(Boolean))].sort()

  function text() {
    const L: string[] = [`Situație ${LUNI_LUNG[luna]} ${an} — ${proprietar}`, '']
    if (chiriiRows.length) {
      L.push('CHIRII')
      for (const c of chiriiRows) {
        L.push(`• ${eticheta(c.apt)}: ${c.eur ? `${c.eur} EUR × ${c.curs.toFixed(4)} = ` : ''}${lei(c.suma)} lei`)
        for (const p of c.plati) L.push(`   plătit ${lei(p.suma)} lei${p.data ? ' pe ' + zi(p.data) : ''}`)
        L.push(`   rest: ${c.rest > 0 ? lei(c.rest) + ' lei' : 'achitat'}`)
      }
      L.push(`Total chirii: ${lei(tot.chirie)} · plătit ${lei(tot.chiriePlatit)} · rest ${lei(r2(tot.chirie - tot.chiriePlatit))} lei`, '')
    }
    if (utilRows.length) {
      L.push('UTILITĂȚI')
      for (const u of utilRows) L.push(`• ${eticheta(u.apt)}${u.cod ? ` (${u.cod})` : ''}: E.ON ${lei(u.eon)} + Asociație ${lei(u.asoc)} = ${lei(u.total)} lei${u.platit > 0 ? ` · plătit ${lei(u.platit)}` : ''}`)
      L.push(`Total utilități: E.ON ${lei(tot.eon)} + Asociație ${lei(tot.asoc)} = ${lei(tot.util)} lei`, '')
    }
    for (const d of decontRows) L.push(`• Decont ${eticheta(d.apt)}: ${lei(d.suma)} lei${d.platit > 0 ? ` · plătit ${lei(d.platit)}` : ''}`)
    if (decontRows.length) L.push('')
    for (const f of faraChirie) L.push(`(${eticheta(f.apt)}: fără chirie — ${f.motiv})`)
    if (faraChirie.length) L.push('')
    L.push(`TOTAL: ${lei(total)} lei`, `Plătit: ${lei(platit)} lei`, `REST DE PLATĂ: ${lei(rest)} lei`)
    return L.join('\n')
  }
  async function copiaza() {
    try { await navigator.clipboard.writeText(text()); setCopiat(true); setTimeout(() => setCopiat(false), 2000) } catch {}
  }

  // ── stiluri
  const COL = 'minmax(0,1fr) 110px 110px 110px 132px'
  const rand: React.CSSProperties = { display: 'grid', gridTemplateColumns: COL, columnGap: 12, alignItems: 'center', padding: '10px 12px', minWidth: 620 }
  const num = (color = 'rgba(232,244,255,0.92)', w = 600): React.CSSProperties => ({ fontFamily: 'monospace', fontSize: 13, fontWeight: w, color, textAlign: 'right', whiteSpace: 'nowrap' })
  const restCul = (n: number) => n > 0 ? '#FCD34D' : '#4ADE80'
  const sectiune = (titlu: string, sub: string, coloana2: string, total: number, platitS: number, children: React.ReactNode, key: string) => (
    <div data-sectiune={key} style={{ marginTop: 14, border: '1px solid rgba(159,215,255,0.12)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ ...rand, padding: '9px 12px', background: 'rgba(77,163,255,0.07)', borderBottom: '1px solid rgba(159,215,255,0.12)' }}>
          <div><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: '#7BC8FF' }}>{titlu}</span>{sub && <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.55)', marginLeft: 8 }}>{sub}</span>}</div>
          {[coloana2, 'Plătit', 'Rest'].map(h => <div key={h} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.5)', textAlign: 'right' }}>{h}</div>)}
          <div />
        </div>
        {children}
        <div style={{ ...rand, borderTop: '1px solid rgba(159,215,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(214,228,244,0.8)' }}>Total {titlu.toLowerCase()}</div>
          <div style={num('#fff', 800)}>{lei(total)}</div>
          <div style={num('#4ADE80', 700)}>{lei(platitS)}</div>
          <div style={num(restCul(total - platitS), 800)}>{lei(r2(total - platitS))}</div>
          <div />
        </div>
      </div>
    </div>
  )
  const buton = (d: Detaliu, l: Linie) => {
    const ocupat = saving === `${d.apt.id}_${l.tip}`
    return (
      <button data-plata-btn onClick={() => onToggle(d, l)} disabled={ocupat} title={l.platit ? 'Apasă ca să marchezi neplătit' : 'Marchează plătit integral (și în Cheltuieli)'}
        style={{ justifySelf: 'end', padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: ocupat ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: ocupat ? 0.5 : 1,
          border: `1px solid ${l.platit ? 'rgba(74,222,128,0.45)' : 'rgba(159,215,255,0.25)'}`, background: l.platit ? 'rgba(74,222,128,0.12)' : 'transparent', color: l.platit ? '#4ADE80' : 'rgba(214,228,244,0.85)' }}>
        {l.platit ? '✓ Plătit' : 'Marchează plătit'}
      </button>
    )
  }
  const numeApt = (a: any, sub?: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'rgba(77,163,255,0.12)', color: '#4DA3FF', fontWeight: 700 }}>{a.nota}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{a.nume}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.55)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
  const linieSep: React.CSSProperties = { borderTop: '1px solid rgba(255,255,255,0.05)' }

  // ── varianta „pe apartamente”: un card pe apartament, cu tot ce e de plată pentru el
  const peApt = detalii.map(d => {
    const c = chiriiRows.find(x => x.apt.id === d.apt.id), u = utilRows.find(x => x.apt.id === d.apt.id), x = decontRows.find(y => y.apt.id === d.apt.id)
    const totalA = r2((c?.suma || 0) + (u?.total || 0) + (x?.suma || 0)), platitA = r2((c?.platit || 0) + (u?.platit || 0) + (x?.platit || 0))
    return { d, c, u, x, total: totalA, platit: platitA, rest: r2(totalA - platitA), fara: faraChirie.find(f => f.apt.id === d.apt.id) }
  })
  function PeApartamente() {
    const linie = (eticheta: React.ReactNode, detaliu: React.ReactNode, suma: number, platitL: number, l: Linie | null, d: Detaliu, extra?: React.ReactNode, dataPlata?: string) => (
      <div style={{ padding: '9px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(232,244,255,0.9)' }}>{eticheta}</div>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.55)', marginTop: 1 }}>{detaliu}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={num('#fff', 700)}>{lei(suma)}</div>
            {platitL > 0 && <div style={{ ...num('#4ADE80', 600), fontSize: 11 }}>plătit {lei(platitL)}{dataPlata && <span style={{ color: 'rgba(159,215,255,0.5)', fontWeight: 400 }}> · {dataPlata}</span>}</div>}
          </div>
          {l && buton(d, l)}
        </div>
        {extra}
      </div>
    )
    return (
      <div data-pe-apartamente style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, marginTop: 12 }}>
        {peApt.map(a => {
          const open = !!deschis[a.d.apt.id]
          return (
            <div key={a.d.apt.id} data-card-apt style={{ borderRadius: 14, border: `1px solid ${a.rest > 0 ? 'rgba(252,211,77,0.25)' : 'rgba(74,222,128,0.3)'}`, background: 'rgba(255,255,255,0.03)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                {numeApt(a.d.apt, a.fara ? `fără chirie — ${a.fara.motiv}` : undefined)}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.5)' }}>{a.rest > 0 ? 'Rest de plată' : 'Achitat'}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'monospace', color: restCul(a.rest) }}>{a.rest > 0 ? lei(a.rest) : '✓'}</div>
                </div>
              </div>
              {a.c && linie('Chirie', a.c.eur > 0 ? `${a.c.eur} EUR × ${a.c.curs.toFixed(4)}` : 'în lei', a.c.suma, a.c.platit, a.c.l, a.d, undefined, a.c.plati.map(p => p.data ? zi(p.data) : '').filter(Boolean).join(', '))}
              {a.u && linie('Utilități', <>E.ON {lei(a.u.eon)} + Asociație {lei(a.u.asoc)}{a.u.cod && <span style={{ color: '#7BC8FF', fontFamily: 'monospace' }}> · {a.u.cod}</span>} <button data-facturi-toggle onClick={() => setDeschis(s => ({ ...s, [a.d.apt.id]: !open }))} style={{ marginLeft: 4, padding: 0, border: 'none', background: 'none', color: '#7BC8FF', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>{open ? 'ascunde' : `facturi (${a.u.facturi.length}) ▸`}</button></>, a.u.total, a.u.platit, a.u.l, a.d,
                open ? <div data-facturi style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.18)' }}>
                  {a.u.facturi.map(f => <div key={f.id} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0', color: 'rgba(214,228,244,0.8)' }}>
                    <span style={{ fontWeight: 700, width: 62, flexShrink: 0 }}>{f.tip}</span>
                    <span style={{ flex: 1, minWidth: 0, color: 'rgba(159,215,255,0.6)' }}>{f.ajustare ? 'ajustare după tabelul proprietarului' : [f.nr, f.perioada].filter(Boolean).join(' · ')}</span>
                    <span style={{ fontFamily: 'monospace', color: f.valoare < 0 ? '#F87171' : 'rgba(232,244,255,0.9)' }}>{f.valoare > 0 && f.ajustare ? '+' : ''}{lei(f.valoare)}</span>
                  </div>)}
                </div> : null)}
              {a.x && linie('Decont', a.x.label, a.x.suma, a.x.platit, a.x.l, a.d)}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(159,215,255,0.15)', fontSize: 12, fontWeight: 700, color: 'rgba(214,228,244,0.85)' }}>
                <span>Total apartament</span><span style={{ fontFamily: 'monospace' }}>{lei(a.total)}{a.platit > 0 && <span style={{ color: '#4ADE80' }}> · plătit {lei(a.platit)}</span>}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div data-situatie style={{ marginTop: 12 }}>
      {/* rezumat */}
      <div data-situatie-total style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {[
          { l: `De plată · ${LUNI_LUNG[luna]} ${an}`, v: total, c: '#E8F4FF', sub: [tot.chirie && `chirii ${lei(tot.chirie)}`, tot.util && `utilități ${lei(tot.util)}`, tot.decont && `decont ${lei(tot.decont)}`].filter(Boolean).join(' + ') },
          { l: 'Plătit', v: platit, c: '#4ADE80', sub: '' },
          { l: 'Rest de plată', v: rest, c: restCul(rest), sub: rest > 0 ? '' : 'totul e achitat' },
        ].map(x => (
          <div key={x.l} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(159,215,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.55)' }}>{x.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: x.c, marginTop: 2 }}>{lei(x.v)} <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>lei</span></div>
            {x.sub && <div style={{ fontSize: 10.5, color: 'rgba(159,215,255,0.5)', marginTop: 2 }}>{x.sub}</div>}
          </div>
        ))}
      </div>

      <div data-comutator style={{ display: 'inline-flex', marginTop: 14, padding: 3, borderRadius: 10, border: '1px solid rgba(159,215,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
        {([['categorii', 'Pe categorii'], ['apartamente', 'Pe apartamente']] as const).map(([k, t]) => (
          <button key={k} data-mod={k} onClick={() => alegeMod(k)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: mod === k ? 'rgba(77,163,255,0.2)' : 'transparent', color: mod === k ? '#E8F4FF' : 'rgba(159,215,255,0.6)' }}>{t}</button>
        ))}
      </div>

      {mod === 'apartamente' && PeApartamente()}

      {mod === 'categorii' && <>
      {/* chirii */}
      {chiriiRows.length > 0 && sectiune('CHIRII', '', 'Chirie', tot.chirie, tot.chiriePlatit, chiriiRows.map(c => (
        <div key={c.apt.id} data-situatie-chirie style={{ ...rand, ...linieSep }}>
          {numeApt(c.apt, c.eur > 0 ? `${c.eur} EUR × ${c.curs.toFixed(4)}` : 'în lei')}
          <div style={num()}>{lei(c.suma)}</div>
          <div style={{ textAlign: 'right' }}>
            {c.plati.length ? c.plati.map((p, i) => <div key={i} style={num('#4ADE80')}>{lei(p.suma)}{p.data && <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.5)', fontWeight: 400 }}> · {zi(p.data)}</span>}</div>) : <div style={num('rgba(159,215,255,0.35)', 400)}>—</div>}
          </div>
          <div style={num(restCul(c.rest), 800)}>{c.rest > 0 ? lei(c.rest) : '✓ achitat'}</div>
          {buton(c.d, c.l)}
        </div>
      )), 'chirii')}

      {/* utilitati */}
      {utilRows.length > 0 && sectiune('UTILITĂȚI', ziFacturi.length ? `ultimele facturi adăugate · ${ziFacturi.map(zi).join(', ')}` : '', 'De plată', tot.util, tot.utilPlatit, utilRows.map(u => {
        const open = !!deschis[u.apt.id]
        return (
          <div key={u.apt.id} data-situatie-util style={linieSep}>
            <div style={rand}>
              {numeApt(u.apt, <>E.ON {lei(u.eon)} + Asociație {lei(u.asoc)}{u.cod && <span style={{ color: '#7BC8FF', fontFamily: 'monospace' }}> · {u.cod}</span>}
                {' '}<button data-facturi-toggle onClick={() => setDeschis(s => ({ ...s, [u.apt.id]: !open }))} style={{ marginLeft: 6, padding: 0, border: 'none', background: 'none', color: '#7BC8FF', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>{open ? 'ascunde facturile' : `facturi (${u.facturi.length}) ▸`}</button></>)}
              <div style={num()}>{lei(u.total)}</div>
              <div style={num(u.platit > 0 ? '#4ADE80' : 'rgba(159,215,255,0.35)', u.platit > 0 ? 600 : 400)}>{u.platit > 0 ? lei(u.platit) : '—'}</div>
              <div style={num(restCul(u.rest), 800)}>{u.rest > 0 ? lei(u.rest) : '✓ achitat'}</div>
              {buton(u.d, u.l)}
            </div>
            {open && (
              <div data-facturi style={{ margin: '0 12px 10px', padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.18)', minWidth: 596 }}>
                {u.facturi.map(f => (
                  <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 110px 90px', columnGap: 12, fontSize: 11.5, padding: '3px 0', color: 'rgba(214,228,244,0.8)' }}>
                    <span style={{ fontWeight: 700 }}>{f.tip}</span>
                    <span style={{ color: 'rgba(159,215,255,0.6)' }}>{f.ajustare ? 'ajustare după tabelul proprietarului' : [f.nr && `factura ${f.nr}`, f.perioada].filter(Boolean).join(' · ')}</span>
                    <span style={{ ...num(f.valoare < 0 ? '#F87171' : 'rgba(232,244,255,0.9)', 600), fontSize: 11.5 }}>{f.valoare > 0 && f.ajustare ? '+' : ''}{lei(f.valoare)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600, color: f.stare === 'plătit' ? '#4ADE80' : f.stare === 'neplătit' ? '#F87171' : '#FCD34D' }}>{f.stare}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 110px 90px', columnGap: 12, fontSize: 11.5, padding: '5px 0 0', marginTop: 3, borderTop: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, color: '#E8F4FF' }}>
                  <span>Total</span><span /><span style={{ ...num('#fff', 800), fontSize: 11.5 }}>{lei(u.total)}</span><span />
                </div>
              </div>
            )}
          </div>
        )
      }), 'utilitati')}

      {/* decont pe comision */}
      {decontRows.length > 0 && sectiune('DECONT', 'apartamente pe comision', 'De virat', tot.decont, tot.decontPlatit, decontRows.map(x => (
        <div key={x.apt.id} style={{ ...rand, ...linieSep }}>
          {numeApt(x.apt, x.label)}
          <div style={num()}>{lei(x.suma)}</div>
          <div style={num(x.platit > 0 ? '#4ADE80' : 'rgba(159,215,255,0.35)')}>{x.platit > 0 ? lei(x.platit) : '—'}</div>
          <div style={num(restCul(x.rest), 800)}>{x.rest > 0 ? lei(x.rest) : '✓ achitat'}</div>
          {buton(x.d, x.l)}
        </div>
      )), 'decont')}

      </>}

      {/* fara chirie */}
      {mod === 'categorii' && faraChirie.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'rgba(159,215,255,0.6)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {faraChirie.map(f => <div key={f.apt.id} data-fara-chirie><b style={{ color: 'rgba(232,244,255,0.85)' }}>{eticheta(f.apt)}</b> — fără chirie ({f.motiv})</div>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button data-copiaza-situatie onClick={copiaza} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(123,200,255,0.35)', background: copiat ? 'rgba(74,222,128,0.12)' : 'rgba(77,163,255,0.1)', color: copiat ? '#4ADE80' : '#7BC8FF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copiat ? '✓ Copiat' : '📋 Copiază lista (text)'}</button>
      </div>
    </div>
  )
}
