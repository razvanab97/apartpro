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
// Luna (perioada) pentru care e factura, din nota „Factură <nr> | <perioadă>” (cerut direct: „să se preia și luna
// pentru care e factura”). Ex: „Luna August 2026” -> „august 2026”; „02.08.2026 - 30.09.2026” -> „aug – sep 2026”.
const LUNI_LUNG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const LUNI_SC = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']
export function lunaFactura(nota?: string | null): string {
  const p = String(nota || '').split('|')[1]?.trim() || ''
  if (!p) return ''
  const r = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(p)
  if (r) {
    const [m1, y1, m2, y2] = [+r[2] - 1, r[3], +r[5] - 1, r[6]]
    if (m1 === m2 && y1 === y2) return `${LUNI_LUNG[m1]} ${y1}`
    return y1 === y2 ? `${LUNI_SC[m1]} – ${LUNI_SC[m2]} ${y2}` : `${LUNI_SC[m1]} ${y1} – ${LUNI_SC[m2]} ${y2}`
  }
  const low = p.toLowerCase()
  const i = LUNI_LUNG.findIndex(l => low.includes(l))
  const y = (/(20\d{2})/.exec(p) || [])[1]
  if (i >= 0) return `${LUNI_LUNG[i]}${y ? ' ' + y : ''}`
  return p.length <= 40 ? p : ''
}

// Rosu atenuat cand e putin de platit (cerut direct: „când avem puțin de plătit, roșul să devină mai puțin agresiv”)
const PRAG_MIC = 150
const rosu = (suma: number) => suma > 0 && suma < PRAG_MIC ? 'rgba(248,113,113,0.62)' : '#F87171'
const chenarRosu = (suma: number) => suma > 0 && suma < PRAG_MIC ? 'rgba(248,113,113,0.16)' : 'rgba(248,113,113,0.35)'
const zi = (d: string) => { const p = d.split('-'); return `${+p[2]} ${LUNI_S[+p[1] - 1]}` }
const lunaDe = (d: string) => { const p = d.split('-'); return `${LUNI_S[+p[1] - 1]} ${p[0]}` }
const furnizorDin = (descriere?: string | null) => { const s = String(descriere || ''); return s.includes('—') ? s.split('—').pop()!.trim() : '' }
const etichetaCat = (c: string, descriere?: string | null) => CAT[c] || String(descriere || c).split('—')[0].trim() || c

type Rand = { id: string; apartament_id: string; categorie: string; descriere: string | null; valoare: number; status: string; data: string; fisier_url: string | null; nota?: string | null; created_at?: string | null; data_scadenta?: string | null; data_plata?: string | null }
// scadenta: campul dedicat daca e completat, altfel data platii (la facturi = scadenta de pe factura, la chirie / asociatie = 1 ale lunii)
const scad = (r: Rand) => r.data_scadenta || r.data
const ziDin = (iso?: string | null) => iso ? zi(iso.slice(0, 10)) : ''
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
  // firma pe care e fiecare apartament (cerut direct: „ordonate alfabetic și pe firme / privat”) - setari „apartamente_firma”
  const CHEIE_FIRME = 'apartamente_firma'
  const FIRME = ['ABXHOMES', 'AB HOMES INVEST SRL', 'Privat']
  const [firme, setFirme] = useState<Record<string, string>>({})
  useEffect(() => {
    Promise.resolve(supabase.from('setari').select('valoare').eq('cheie', CHEIE_FIRME).maybeSingle())
      .then(({ data }) => { try { const v = JSON.parse(data?.valoare || '{}'); if (v && typeof v === 'object') setFirme(v) } catch {} }).catch(() => {})
  }, [])
  async function schimbaFirma(aptId: string, firma: string) {
    const nou = { ...firme }; if (firma) nou[aptId] = firma; else delete nou[aptId]
    setFirme(nou)
    await supabase.from('setari').upsert({ cheie: CHEIE_FIRME, valoare: JSON.stringify(nou) }, { onConflict: 'cheie' })
  }
  const [ultime, setUltime] = useState<Record<string, { plata?: string; adaugare?: string }>>({})
  // apartamente inactive / personale ale caror cheltuieli le urmarim totusi ca pe cele active (cerut direct:
  // „Urban Oasis, Canta și R99 — ultimele 2 sunt personale, dar trebuie să avem cheltuielile și evidența plăților”)
  const CHEIE_URMARITE = 'cheltuieli_inactive_urmarite'
  const [urmarite, setUrmarite] = useState<string[]>([])
  useEffect(() => {
    Promise.resolve(supabase.from('setari').select('valoare').eq('cheie', CHEIE_URMARITE).maybeSingle())
      .then(({ data }) => { try { const v = JSON.parse(data?.valoare || '[]'); if (Array.isArray(v)) setUrmarite(v.map(String)) } catch {} }).catch(() => {})
  }, [])
  async function comutaUrmarit(id: string) {
    const nou = urmarite.includes(id) ? urmarite.filter(x => x !== id) : [...urmarite, id]
    setUrmarite(nou)
    await supabase.from('setari').upsert({ cheie: CHEIE_URMARITE, valoare: JSON.stringify(nou) }, { onConflict: 'cheie' })
  }
  const [ultim, setUltim] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [vezi, setVezi] = useState<{ r: Rand; eticheta: string; sub: string | null } | null>(null)  // factura deschisa in pop-up
  useEffect(() => { if (!vezi) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setVezi(null) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [vezi])
  // fișe închise (rămâne doar numele apartamentului) — ținute minte pe dispozitiv
  const [inchise, setInchise] = useState<string[]>([])
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('fise_inchise') || '[]'); if (Array.isArray(v)) setInchise(v.map(String)) } catch {} }, [])
  const salveazaInchise = (v: string[]) => { setInchise(v); try { localStorage.setItem('fise_inchise', JSON.stringify(v)) } catch {} }
  const comutaFisa = (id: string) => salveazaInchise(inchise.includes(id) ? inchise.filter(x => x !== id) : [...inchise, id])

  async function load() {
    setLoading(true)
    const dIst = aziLocal(new Date(an, luna - 4, 1))
    const sel = 'id,apartament_id,categorie,descriere,valoare,status,data,fisier_url,nota,created_at,data_scadenta,data_plata'
    const [{ data: a }, { data: r }, { data: h }] = await Promise.all([
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).gte('data', start).lte('data', sfarsit),
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).eq('status', 'nevalidat').lt('data', start).gt('valoare', 0).order('data'),
      supabase.from('cheltuieli').select(sel).not('apartament_id', 'is', null).gte('data', dIst).lt('data', start),
    ])
    setLuna0((a || []) as any); setRestante((r || []) as any); setIstoric((h || []) as any)
    setLoading(false)
    // ultima plata / ultima adaugare pe apartament, indiferent de luna randului (ex. restantele din ian-apr platite azi)
    const de6 = aziLocal(new Date(Date.now() - 183 * 86400000))
    const [{ data: pl }, { data: ad }] = await Promise.all([
      supabase.from('cheltuieli').select('apartament_id,data_plata').not('apartament_id', 'is', null).gte('data_plata', de6).order('data_plata', { ascending: false }).limit(1000),
      supabase.from('cheltuieli').select('apartament_id,created_at').not('apartament_id', 'is', null).gte('created_at', de6).order('created_at', { ascending: false }).limit(1000),
    ])
    const ult: Record<string, { plata?: string; adaugare?: string }> = {}
    for (const x of pl || []) if (!ult[x.apartament_id]?.plata) (ult[x.apartament_id] ||= {}).plata = x.data_plata
    for (const x of ad || []) if (!ult[x.apartament_id]?.adaugare) (ult[x.apartament_id] ||= {}).adaugare = x.created_at
    setUltime(ult)
  }
  useEffect(() => { load() }, [an, luna]) // eslint-disable-line react-hooks/exhaustive-deps

  async function comuta(r: Rand) {
    const plateste = !['validat', 'platit'].includes(r.status)
    setBusy(r.id)
    const upd = plateste ? { status: 'validat', data_plata: azi } : { status: 'nevalidat', data_plata: null }
    const { error } = await supabase.from('cheltuieli').update(upd).eq('id', r.id)
    setBusy(null)
    if (error) return
    const f = (l: Rand[]) => l.map(x => x.id === r.id ? { ...x, status: upd.status, data_plata: upd.data_plata } : x)
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
        for (const r of s.randuri) { tot += Number(r.valoare); if (platit(r)) pl += Number(r.valoare); else if (scad(r) < azi) depasite++ }
      }
      const restanteDeplata = rest.filter(r => !platit(r))
      const sumaRestante = restanteDeplata.reduce((s, r) => s + Number(r.valoare), 0)
      depasite += restanteDeplata.length
      const urmarit = apt.status === 'inactiv' && urmarite.includes(String(apt.id))
      // evidenta pe apartament (cerut direct: „când au fost ultimele adăugate, când au fost plătite, și scadența — cel mai important”)
      const toate = [...ale, ...rest, ...ist]
      const neplatite = [...ale, ...rest].filter(r => !platit(r))
      const urmScad = neplatite.map(scad).sort()[0] || null
      const urmViitoare = neplatite.map(scad).filter(d => d >= azi).sort()[0] || null
      const ultimaPlata = [ultime[apt.id]?.plata || '', ...toate.map(r => r.data_plata || '')].filter(Boolean).sort().pop() || null
      const ultimaAdaugare = [ultime[apt.id]?.adaugare || '', ...toate.map(r => r.created_at || '')].filter(Boolean).sort().pop() || null
      return { apt, sloturi, rest, furn, tot, pl, rest_luna: tot - pl, depasite, lipsa, sumaRestante, inactiv: apt.status === 'inactiv' && !urmarit, urmarit, urmScad, urmViitoare, ultimaPlata, ultimaAdaugare }
    })
  }, [apts, luna0, restante, istoric, azi, lunaCurentaSauTrecuta, urmarite, ultime])

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
    const late = !platit && (restanta || scad(r) < azi)
    return (
      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 6px', borderRadius: 12, background: late ? (Number(r.valoare) < PRAG_MIC ? 'rgba(248,113,113,0.05)' : 'rgba(248,113,113,0.12)') : 'transparent', opacity: platit ? 0.5 : 1, transition: 'opacity .2s' }}>
        <button onClick={() => comuta(r)} disabled={busy === r.id} aria-label={platit ? 'Plătit — apasă ca să anulezi' : 'Marchează plătit'}
          style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${platit ? '#4ADE80' : late ? rosu(Number(r.valoare)) : 'rgba(159,215,255,0.3)'}`, background: platit ? '#4ADE80' : 'transparent', color: '#03250F', fontSize: 13, fontWeight: 800, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          {busy === r.id ? '…' : platit ? '✓' : ''}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#E8F4FF', textDecoration: platit ? 'line-through' : 'none', textDecorationColor: 'rgba(159,215,255,0.5)' }}>
            {eticheta}
            {r.fisier_url && <button type="button" onClick={e => { e.stopPropagation(); setVezi({ r, eticheta, sub }) }} title="Vezi factura" style={{ marginLeft: 6, fontSize: 12, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>📎</button>}
            {lunaFactura(r.nota) && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', verticalAlign: 'middle', textDecoration: 'none', display: 'inline-block' }}>{lunaFactura(r.nota)}</span>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: late ? rosu(Number(r.valoare)) : 'rgba(159,215,255,0.5)' }}>
            {sub ? sub + ' · ' : ''}{platit ? `plătit${r.data_plata ? ' ' + ziDin(r.data_plata) : ''}` : restanta ? `restanță din ${lunaDe(r.data)} · scadent ${zi(scad(r))}` : late ? `depășit · scadent ${zi(scad(r))}` : `scadent ${zi(scad(r))}`}
            {r.created_at && <span style={{ marginLeft: 6, fontWeight: 500, color: 'rgba(159,215,255,0.38)' }}>· adăugat {ziDin(r.created_at)}</span>}
            {ultim === r.id && <button onClick={() => comuta({ ...r, status: 'validat' })} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#7BC8FF', fontSize: 11, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Anulează</button>}
          </div>
        </div>
        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 13.5, color: '#E8F4FF', whiteSpace: 'nowrap' }}>{fmt(Number(r.valoare))}</span>
      </div>
    )
  }

  // rezumatul de date al apartamentului: urmatoarea scadenta (cea mai importanta), ultima plata, ultima adaugare
  const rezumatDate = (f: typeof fise[number], compact = false) => {
    const dep = f.urmScad && f.urmScad < azi
    const zile = f.urmScad ? Math.round((new Date(f.urmScad + 'T12:00:00').getTime() - new Date(azi + 'T12:00:00').getTime()) / 86400000) : null
    const cand = zile == null ? '' : zile < 0 ? `de ${-zile} ${-zile === 1 ? 'zi' : 'zile'}` : zile === 0 ? 'azi' : zile === 1 ? 'mâine' : `în ${zile} zile`
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 8 : 10, fontSize: compact ? 11 : 11.5, fontWeight: 600, color: 'rgba(159,215,255,0.55)' }}>
        <span style={{ color: f.urmScad ? (dep ? rosu(f.rest_luna + f.sumaRestante) : '#FCD34D') : '#4ADE80', fontWeight: 800 }}>
          {f.urmScad ? `📅 ${dep ? 'scadență depășită' : 'scadență'} ${zi(f.urmScad)}${cand ? ' (' + cand + ')' : ''}` : '📅 nimic de plătit'}
        </span>
        {dep && f.urmViitoare && <span style={{ color: '#FCD34D', fontWeight: 700 }}>următoarea {zi(f.urmViitoare)}</span>}
        {f.ultimaPlata && <span>✓ ultima plată {ziDin(f.ultimaPlata)}</span>}
        {f.ultimaAdaugare && <span>＋ adăugat {ziDin(f.ultimaAdaugare)}</span>}
      </div>
    )
  }

  const fisa = (f: typeof fise[number]) => {
    const deplata = f.rest_luna + f.sumaRestante
    const id = String(f.apt.id)
    if (inchise.includes(id)) {
      // fisa inchisa, aerisita (cerut direct: „mai aerisită, cu mai mult sens”): nume + rest mare, bara de plata,
      // un singur rand de stare (cel mai important) si ultima plata; „adăugat” ramane doar pe fisa deschisa
      const total = f.tot + f.sumaRestante, pctPl = total > 0 ? Math.min(1, f.pl / total) : 1
      const dep = !!f.urmScad && f.urmScad < azi
      const zileD = f.urmScad ? Math.round((new Date(f.urmScad + 'T12:00:00').getTime() - new Date(azi + 'T12:00:00').getTime()) / 86400000) : 0
      const stare = !deplata ? { t: f.lipsa ? `lipsesc ${f.lipsa} facturi` : 'totul plătit', c: f.lipsa ? '#FCD34D' : '#4ADE80' }
        : dep ? { t: `depășit din ${zi(f.urmScad!)} · ${-zileD} ${-zileD === 1 ? 'zi' : 'zile'}`, c: rosu(deplata) }
        : f.urmScad ? { t: `scadent ${zi(f.urmScad)}${zileD === 0 ? ' · azi' : zileD === 1 ? ' · mâine' : ` · în ${zileD} zile`}`, c: '#FCD34D' }
        : { t: 'de plătit', c: '#E8F4FF' }
      return (
        <button key={f.apt.id} onClick={() => comutaFisa(id)} title="Deschide fișa"
          style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', textAlign: 'left', background: 'linear-gradient(180deg,#101C2F,#0B1422)', border: `1px solid ${f.depasite ? chenarRosu(deplata) : 'rgba(148,190,255,0.1)'}`, borderRadius: 16, padding: '16px 18px', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.apt.nume}</span>
            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap', color: deplata ? (f.depasite ? rosu(deplata) : '#E8F4FF') : '#4ADE80' }}>
              {deplata ? fmt(deplata) : '✓'}{deplata ? <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 3 }}>RON</span> : null}
            </span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
            <span style={{ height: 4, borderRadius: 3, background: 'rgba(148,190,255,0.1)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round(pctPl * 100)}%`, background: pctPl >= 1 ? '#4ADE80' : 'linear-gradient(90deg,#3DDC97,#4DA3FF)', borderRadius: 3 }} />
            </span>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8EA3BF', fontVariantNumeric: 'tabular-nums' }}>
              <span>plătit {fmt(f.pl)} RON</span>{total > 0 && <span>{Math.round(pctPl * 100)}%</span>}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: stare.c, flexShrink: 0 }} />
            <span style={{ color: stare.c, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stare.t}</span>
            {f.ultimaPlata && <span style={{ fontWeight: 500, color: '#55688A', whiteSpace: 'nowrap' }}>ultima plată {ziDin(f.ultimaPlata)}</span>}
          </span>
        </button>
      )
    }
    return (
      <div key={f.apt.id} style={{ background: '#0E1B30', border: `1px solid ${f.depasite ? chenarRosu(f.rest_luna + f.sumaRestante) : 'rgba(159,215,255,0.12)'}`, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div onClick={() => comutaFisa(id)} title="Închide fișa (rămâne doar numele)" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid rgba(159,215,255,0.1)', marginBottom: 4, cursor: 'pointer' }}>
          {ring(f.tot ? f.pl / f.tot : (f.lipsa ? 0 : 1))}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#E8F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.apt.nume}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5, fontWeight: 700, color: 'rgba(159,215,255,0.5)' }}>
              {f.apt.nota || ''}{f.inactiv ? ' · inactiv' : f.urmarit ? (f.apt.nota ? ' · ' : '') + 'inactiv' : ''}
              {f.urmarit && <span style={{ whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'rgba(196,181,253,0.12)', border: '1px solid rgba(196,181,253,0.3)', color: '#C4B5FD' }}>urmărit</span>}
              <select value={firme[String(f.apt.id)] || ''} onClick={e => e.stopPropagation()} onChange={e => schimbaFirma(String(f.apt.id), e.target.value)} title="Firma pe care e apartamentul"
                style={{ fontFamily: 'inherit', fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 6, border: '1px solid rgba(159,215,255,0.2)', background: 'transparent', color: 'rgba(159,215,255,0.75)', width: 'auto', maxWidth: 140 }}>
                <option value="">fără firmă</option>
                {[...new Set([...FIRME, ...Object.values(firme)])].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              {(f.inactiv || f.urmarit) && (
                <button onClick={e => { e.stopPropagation(); comutaUrmarit(String(f.apt.id)) }} title={f.urmarit ? 'Scoate din cheltuielile urmărite (revine la „Apartamente inactive”)' : 'Urmărește cheltuielile acestui apartament ca pe cele active'}
                  style={{ whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 10, padding: '1px 7px', borderRadius: 20, border: '1px dashed rgba(159,215,255,0.3)', background: 'transparent', color: 'rgba(159,215,255,0.7)', cursor: 'pointer' }}>
                  {f.urmarit ? '✕' : '+ urmărește'}
                </button>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 15, color: deplata ? (f.depasite ? rosu(deplata) : '#E8F4FF') : '#4ADE80' }}>{deplata ? fmt(deplata) + ' RON' : '✓'}</div>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{deplata ? 'de plătit' : f.lipsa ? 'lipsesc facturi' : 'totul plătit'}</div>
          </div>
          <span style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)' }}>▾</span>
        </div>
        <div style={{ padding: '2px 4px 8px' }}>{rezumatDate(f)}</div>
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
  const alfabetic = (a: typeof fise[number], b: typeof fise[number]) => String(a.apt.nume).trim().localeCompare(String(b.apt.nume).trim(), 'ro')
  const vizibile = active.filter(trece).sort(alfabetic)
  const firmaDe = (f: typeof fise[number]) => firme[String(f.apt.id)] || ''
  const grupuri = [...new Set(vizibile.map(firmaDe))]
    .sort((x, y) => !x ? 1 : !y ? -1 : x.localeCompare(y, 'ro'))
    .map(firma => ({ firma, lista: vizibile.filter(f => firmaDe(f) === firma) }))
  const inactiveViz = inactive.filter(trece).sort(alfabetic)
  const pdf = vezi && /\.pdf($|\?)/i.test(vezi.r.fisier_url || '')
  const popup = vezi && (
    <div onClick={() => setVezi(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(3,7,15,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(900px,100%)', height: 'min(92dvh,1000px)', display: 'flex', flexDirection: 'column', background: '#0E1B30', border: '1px solid rgba(148,190,255,0.25)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(148,190,255,0.12)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#E8F4FF' }}>{vezi.eticheta}{lunaFactura(vezi.r.nota) && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: '#7BC8FF' }}>· {lunaFactura(vezi.r.nota)}</span>}</div>
            <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.6)', marginTop: 2 }}>
              {[vezi.sub, `${fmt(Number(vezi.r.valoare))} RON`, `scadent ${zi(scad(vezi.r))}`, ['validat', 'platit'].includes(vezi.r.status) ? `plătit${vezi.r.data_plata ? ' ' + ziDin(vezi.r.data_plata) : ''}` : 'neachitat', (vezi.r.nota || '').split('|')[0].trim()].filter(Boolean).join(' · ')}
            </div>
          </div>
          <a href={vezi.r.fisier_url!} target="_blank" rel="noreferrer" style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(77,163,255,0.35)', color: '#7BC8FF', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Deschide în tab nou</a>
          <button onClick={() => setVezi(null)} aria-label="Închide" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(159,215,255,0.2)', background: 'transparent', color: 'rgba(214,228,244,0.8)', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#1a2230' }}>
          {pdf ? <iframe src={vezi.r.fisier_url!} title="Factura" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'grid', placeItems: 'center' }}><img src={vezi.r.fisier_url!} alt="Factura" style={{ maxWidth: '100%' }} /></div>}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {popup}
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
      {grupuri.map(g => (
        <div key={g.firma || '-'} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: g.firma === 'Privat' ? '#C4B5FD' : g.firma ? '#7BC8FF' : 'rgba(159,215,255,0.45)' }}>
            {g.firma || 'Fără firmă setată'} · {g.lista.length}
            {(() => { const rest = g.lista.reduce((s, f) => s + f.rest_luna + f.sumaRestante, 0); return rest > 0 ? <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: 0, color: '#F87171' }}>de plătit {fmt(rest)} RON</span> : null })()}
            <span style={{ flex: 1, height: 1, background: 'rgba(159,215,255,0.1)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14, alignItems: 'start' }}>
            {g.lista.map(fisa)}
          </div>
        </div>
      ))}
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
