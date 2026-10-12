'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase, aziLocal } from '@/lib/supabase'

// Cheltuieli → "Fișe pe apartamente" (cerut direct, varianta aleasă din previzualizări): fiecare apartament are
// fișa lui pe lună, cu TOATE plățile pe care le are de obicei (deduse din ultimele 3 luni + facturile lui),
// deci se vede și ce lipsește ("factura n-a venit încă"), plus restanțele din lunile trecute. Bife rotunde,
// plătitul estompat, depășitul roșu, inel de progres. Furnizorul ("unde" se plătește) vine din facturi.
const CAT: Record<string, string> = { chirie: 'Chirie', asociatie: 'Asociație', eon_curent: 'E.ON Energie', eon_gaz: 'E.ON Gaz', internet: 'Internet', salubris: 'Salubris' }
const ORD = ['chirie', 'asociatie', 'eon_curent', 'eon_gaz', 'internet', 'salubris']
const LUNI_S = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']
const LUNI_L = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const fmt = (n: number) => Math.round(n).toLocaleString('ro-RO')
const zi = (d: string) => { const p = d.split('-'); return `${+p[2]} ${LUNI_S[+p[1] - 1]}` }
const lunaDe = (d: string) => { const p = d.split('-'); return `${LUNI_S[+p[1] - 1]} ${p[0]}` }
const furnizorDin = (descriere?: string | null) => { const s = String(descriere || ''); return s.includes('—') ? s.split('—').pop()!.trim() : '' }
const etichetaCat = (c: string, descriere?: string | null) => CAT[c] || String(descriere || c).split('—')[0].trim() || c

type Rand = { id: string; apartament_id: string; categorie: string; descriere: string | null; valoare: number; status: string; data: string; fisier_url: string | null }
type Apt = { id: string; nota: string | null; nume: string; status?: string }

export default function FiseCheltuieli({ an, luna, apts, onChanged }: { an: number; luna: number; apts: Apt[]; onChanged?: () => void }) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${an}-${pad(luna)}-01`
  const sfarsit = aziLocal(new Date(an, luna, 0))
  const azi = aziLocal()
  const lunaCurentaSauTrecuta = start <= azi
  const [luna0, setLuna0] = useState<Rand[]>([])
  const [restante, setRestante] = useState<Rand[]>([])
  const [istoric, setIstoric] = useState<Rand[]>([])
  const [loading, setLoading] = useState(true)
  const [filtru, setFiltru] = useState<'toate' | 'rest' | 'late' | 'miss' | 'ok'>('toate')
  const [aratInactive, setAratInactive] = useState(false)
  const [ultim, setUltim] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // fișe închise (rămâne doar numele apartamentului) — ținute minte pe dispozitiv
  const [inchise, setInchise] = useState<string[]>([])
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('fise_inchise') || '[]'); if (Array.isArray(v)) setInchise(v.map(String)) } catch {} }, [])
  const salveazaInchise = (v: string[]) => { setInchise(v); try { localStorage.setItem('fise_inchise', JSON.stringify(v)) } catch {} }
  const comutaFisa = (id: string) => salveazaInchise(inchise.includes(id) ? inchise.filter(x => x !== id) : [...inchise, id])

  async function load() {
    setLoading(true)
    const dIst = aziLocal(new Date(an, luna - 4, 1))
    const sel = 'id,apartament_id,categorie,descriere,valoare,status,data,fisier_url'
    const [{ data: a }, { data: r }, { data: h }] = await Promise.all([
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).gte('data', start).lte('data', sfarsit),
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).eq('status', 'nevalidat').lt('data', start).gt('valoare', 0).order('data'),
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).gte('data', dIst).lt('data', start),
    ])
    setLuna0((a || []) as any); setRestante((r || []) as any); setIstoric((h || []) as any)
    setLoading(false)
  }
  useEffect(() => { load() }, [an, luna]) // eslint-disable-line react-hooks/exhaustive-deps

  async function comuta(r: Rand) {
    const plateste = !['validat', 'platit'].includes(r.status)
    setBusy(r.id)
    const upd = plateste ? { status: 'validat', data_plata: azi } : { status: 'nevalidat', data_plata: null }
    const { error } = await supabase.from('cheltuieli').update(upd).eq('id', r.id)
    setBusy(null)
    if (error) return
    const f = (l: Rand[]) => l.map(x => x.id === r.id ? { ...x, status: upd.status } : x)
    setLuna0(f); setRestante(f)
    setUltim(plateste ? r.id : null)
    onChanged?.()
  }

  // Fișele: plățile lunii + rândurile obișnuite lipsă + restanțele, pe apartament
  const fise = useMemo(() => {
    return apts.map(apt => {
      const ale = luna0.filter(r => r.apartament_id === apt.id)
      const ist = istoric.filter(r => r.apartament_id === apt.id)
      // obișnuite = categoriile principale prezente în cel puțin 2 din ultimele 3 luni, sau cu factură în istoric
      const luniPeCat: Record<string, Set<string>> = {}
      const furn: Record<string, string> = {}
      for (const r of ist.sort((x, y) => x.data.localeCompare(y.data))) {
        ;(luniPeCat[r.categorie] ||= new Set()).add(r.data.slice(0, 7))
        const fz = furnizorDin(r.descriere); if (fz && r.fisier_url) furn[r.categorie] = fz
      }
      for (const r of ale) { const fz = furnizorDin(r.descriere); if (fz) furn[r.categorie] = fz }
      const obisnuite = ORD.filter(c => (luniPeCat[c]?.size || 0) >= 2 || ist.some(r => r.categorie === c && r.fisier_url))
      const cats = [...new Set([...obisnuite, ...ale.map(r => r.categorie)])]
        .sort((x, y) => (ORD.indexOf(x) < 0 ? 99 : ORD.indexOf(x)) - (ORD.indexOf(y) < 0 ? 99 : ORD.indexOf(y)))
      const sloturi = cats.map(c => ({ cat: c, randuri: ale.filter(r => r.categorie === c).sort((x, y) => x.data.localeCompare(y.data)) }))
      const rest = restante.filter(r => r.apartament_id === apt.id)
      const platit = (r: Rand) => ['validat', 'platit'].includes(r.status)
      let tot = 0, pl = 0, depasite = 0, lipsa = 0
      for (const s of sloturi) {
        if (!s.randuri.length) { if (lunaCurentaSauTrecuta) lipsa++; continue }
        for (const r of s.randuri) { tot += Number(r.valoare); if (platit(r)) pl += Number(r.valoare); else if (r.data < azi) depasite++ }
      }
      const restanteDeplata = rest.filter(r => !platit(r))
      const sumaRestante = restanteDeplata.reduce((s, r) => s + Number(r.valoare), 0)
      depasite += restanteDeplata.length
      return { apt, sloturi, rest, furn, tot, pl, rest_luna: tot - pl, depasite, lipsa, sumaRestante, inactiv: apt.status === 'inactiv' }
    })
  }, [apts, luna0, restante, istoric, azi, lunaCurentaSauTrecuta])

  const active = fise.filter(f => !f.inactiv && (f.sloturi.length || f.rest.length))
  const inactive = fise.filter(f => f.inactiv && (f.sloturi.some(s => s.randuri.length) || f.rest.some(r => r.status === 'nevalidat')))
  const trece = (f: typeof fise[number]) => filtru === 'toate' || (filtru === 'rest' && f.rest_luna + f.sumaRestante > 0) ||
    (filtru === 'late' && f.depasite > 0) || (filtru === 'miss' && f.lipsa > 0) || (filtru === 'ok' && !f.rest_luna && !f.sumaRestante && !f.lipsa)
  const tot = active.reduce((s, f) => s + f.tot, 0), pl = active.reduce((s, f) => s + f.pl, 0)
  const depasite = active.reduce((s, f) => s + f.depasite, 0), lipsa = active.reduce((s, f) => s + f.lipsa, 0)
  const sumaRestante = active.reduce((s, f) => s + f.sumaRestante, 0)

  const ring = (p: number) => {
    const r = 18, c = 2 * Math.PI * r
    return (
      <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(159,215,255,0.12)" strokeWidth={5} />
        <circle cx={22} cy={22} r={r} fill="none" stroke="#4ADE80" strokeWidth={5} strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - p)).toFixed(1)} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dashoffset .3s' }} />
        <text x={22} y={26} textAnchor="middle" style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 700, fill: '#E8F4FF' }}>{Math.round(p * 100)}%</text>
      </svg>
    )
  }

  const randEl = (r: Rand, eticheta: string, sub: string | null, restanta: boolean) => {
    const platit = ['validat', 'platit'].includes(r.status)
    const late = !platit && (restanta || r.data < azi)
    return (
      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 6px', borderRadius: 12, background: late ? 'rgba(248,113,113,0.12)' : 'transparent', opacity: platit ? 0.5 : 1, transition: 'opacity .2s' }}>
        <button onClick={() => comuta(r)} disabled={busy === r.id} aria-label={platit ? 'Plătit — apasă ca să anulezi' : 'Marchează plătit'}
          style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${platit ? '#4ADE80' : late ? '#F87171' : 'rgba(159,215,255,0.3)'}`, background: platit ? '#4ADE80' : 'transparent', color: '#03250F', fontSize: 13, fontWeight: 800, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          {busy === r.id ? '…' : platit ? '✓' : ''}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#E8F4FF', textDecoration: platit ? 'line-through' : 'none', textDecorationColor: 'rgba(159,215,255,0.5)' }}>
            {eticheta}
            {r.fisier_url && <a href={r.fisier_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Deschide factura" style={{ marginLeft: 6, fontSize: 12, textDecoration: 'none' }}>📎</a>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: late ? '#F87171' : 'rgba(159,215,255,0.5)' }}>
            {sub ? sub + ' · ' : ''}{platit ? 'plătit' : restanta ? `restanță din ${lunaDe(r.data)}` : late ? `depășit · ${zi(r.data)}` : `scadent ${zi(r.data)}`}
            {ultim === r.id && <button onClick={() => comuta({ ...r, status: 'validat' })} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#7BC8FF', fontSize: 11, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Anulează</button>}
          </div>
        </div>
        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 13.5, color: '#E8F4FF', whiteSpace: 'nowrap' }}>{fmt(Number(r.valoare))}</span>
      </div>
    )
  }

  const fisa = (f: typeof fise[number]) => {
    const deplata = f.rest_luna + f.sumaRestante
    const id = String(f.apt.id)
    if (inchise.includes(id)) return (
      <button key={f.apt.id} onClick={() => comutaFisa(id)} title="Deschide fișa"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: '#0E1B30', border: `1px solid ${f.depasite ? 'rgba(248,113,113,0.35)' : 'rgba(159,215,255,0.12)'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer' }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.apt.nume}</span>
        <span style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)' }}>▸</span>
      </button>
    )
    return (
      <div key={f.apt.id} style={{ background: '#0E1B30', border: `1px solid ${f.depasite ? 'rgba(248,113,113,0.35)' : 'rgba(159,215,255,0.12)'}`, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div onClick={() => comutaFisa(id)} title="Închide fișa (rămâne doar numele)" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid rgba(159,215,255,0.1)', marginBottom: 4, cursor: 'pointer' }}>
          {ring(f.tot ? f.pl / f.tot : (f.lipsa ? 0 : 1))}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.apt.nume}</div>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5, fontWeight: 700, color: 'rgba(159,215,255,0.5)' }}>{f.apt.nota || ''}{f.inactiv ? ' · inactiv' : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 15, color: deplata ? (f.depasite ? '#F87171' : '#E8F4FF') : '#4ADE80' }}>{deplata ? fmt(deplata) + ' RON' : '✓'}</div>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{deplata ? 'de plătit' : f.lipsa ? 'lipsesc facturi' : 'totul plătit'}</div>
          </div>
          <span style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)' }}>▾</span>
        </div>
        {f.sloturi.map(s => s.randuri.length
          ? s.randuri.map((r, k) => randEl(r, etichetaCat(s.cat, r.descriere) + (s.randuri.length > 1 ? ` ${k + 1}/${s.randuri.length}` : ''), f.furn[s.cat] || null, false))
          : lunaCurentaSauTrecuta ? (
            <Link key={s.cat} href="/facturi" title="Încarcă factura în secțiunea Facturi"
              style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 6px', borderRadius: 12, border: '1.5px dashed #FCD34D', background: 'rgba(252,211,77,0.08)', textDecoration: 'none' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px dashed #FCD34D', color: '#FCD34D', display: 'grid', placeItems: 'center', fontWeight: 800 }}>+</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#E8F4FF' }}>{etichetaCat(s.cat)}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#FCD34D' }}>{f.furn[s.cat] ? f.furn[s.cat] + ' · ' : ''}factura pe {LUNI_L[luna - 1]} n-a venit încă</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FCD34D' }}>Adaugă</span>
            </Link>
          ) : null)}
        {f.rest.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#F87171', padding: '8px 6px 2px' }}>Restanțe din lunile trecute · {fmt(f.sumaRestante)} RON</div>
            {f.rest.map(r => randEl(r, etichetaCat(r.categorie, r.descriere), furnizorDin(r.descriere) || f.furn[r.categorie] || null, true))}
          </>
        )}
      </div>
    )
  }

  const kpi = (k: typeof filtru, val: string, lbl: string, fg: string, bg: string) => (
    <button key={k} onClick={() => setFiltru(x => x === k ? 'toate' : k)}
      style={{ borderRadius: 14, padding: '10px 12px', textAlign: 'left', border: `1px solid ${filtru === k ? '#7C9BFF' : 'transparent'}`, background: bg, cursor: 'pointer' }}>
      <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 19, fontWeight: 700, color: fg }}>{val}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(214,228,244,0.7)' }}>{lbl}</div>
    </button>
  )

  if (loading) return <div style={{ color: 'rgba(159,215,255,0.35)', fontSize: 13, padding: '40px 0' }}>Se încarcă fișele...</div>
  const vizibile = active.filter(trece).sort((a, b) => (b.depasite - a.depasite) || ((b.rest_luna + b.sumaRestante) - (a.rest_luna + a.sumaRestante)) || (b.lipsa - a.lipsa))
  const inactiveViz = inactive.filter(trece)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        {kpi('rest', fmt(tot - pl + sumaRestante) + ' RON', `de plătit${sumaRestante ? ` (din care ${fmt(sumaRestante)} restanțe)` : ''}`, '#E8F4FF', 'rgba(214,228,244,0.06)')}
        {kpi('late', String(depasite), 'plăți depășite', '#F87171', 'rgba(248,113,113,0.12)')}
        {kpi('miss', String(lipsa), 'facturi lipsă', '#FCD34D', 'rgba(252,211,77,0.1)')}
        {kpi('ok', fmt(pl) + ' RON', `plătit (${tot ? Math.round(pl / tot * 100) : 0}%)`, '#4ADE80', 'rgba(74,222,128,0.1)')}
      </div>
      {vizibile.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
          {(() => { const ids = [...vizibile, ...(aratInactive ? inactiveViz : [])].map(f => String(f.apt.id)); const toateInchise = ids.every(x => inchise.includes(x)); return (
            <button onClick={() => salveazaInchise(toateInchise ? inchise.filter(x => !ids.includes(x)) : [...new Set([...inchise, ...ids])])}
              style={{ border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', borderRadius: 10, padding: '6px 12px', fontWeight: 700, fontSize: 12, color: 'rgba(214,228,244,0.7)', cursor: 'pointer' }}>{toateInchise ? '▾ Deschide toate' : '▸ Închide toate'}</button>
          ) })()}
        </div>
      )}
      {vizibile.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(159,215,255,0.45)', fontSize: 13 }}>Niciun apartament pentru filtrul ales.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14, alignItems: 'start' }}>
        {vizibile.map(fisa)}
      </div>
      {inactiveViz.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.5)' }}>Apartamente inactive ({inactiveViz.length})</span>
            <button onClick={() => setAratInactive(v => !v)} style={{ border: '1px dashed rgba(159,215,255,0.25)', background: 'transparent', borderRadius: 10, padding: '6px 12px', fontWeight: 700, fontSize: 12, color: 'rgba(214,228,244,0.7)', cursor: 'pointer' }}>{aratInactive ? 'ascunde' : 'arată'}</button>
          </div>
          {aratInactive && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14, alignItems: 'start' }}>{inactiveViz.map(fisa)}</div>}
        </>
      )}
    </div>
  )
}
