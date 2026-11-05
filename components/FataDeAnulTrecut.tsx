'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Comparatie cu anul trecut + prognoza pe luna curenta si luna viitoare (cerut direct: „o secțiune cu preconizările de
// rezervări pe luna aceasta și luna viitoare, pe baza informațiilor din anul trecut. Gen cum stăteam anul trecut pe
// vremea asta, la general, și când apăsam, pe fiecare apartament pe care îl aveam și anul trecut”).
// Bază: valoarea rezervărilor (suma încasată, brut) și nopțile, pro-rata pe nopțile din lună (ca „Încasări”), fără
// anulate și fără cele nealocate. Istoricul vechi e importat (created_at = iunie 2026), deci „pe vremea asta” = nopțile
// de la 1 la ziua de azi ale lunii (realizat), nu data la care s-a făcut rezervarea.
// Prognoza = luna de anul trecut × tendința (ultimele 3 luni încheiate față de aceleași luni de anul trecut, doar pe
// apartamentele prezente în ambii ani), dar niciodată sub ce e deja rezervat; apartamentele inactive = doar ce e rezervat,
// cele noi (fără istoric) = doar ce e rezervat.

type Rez = { apartament_id: string; data_checkin: string; data_checkout: string; nr_nopti: number | null; suma_incasata: any; status_rezervare: string; camera_semnalata?: string | null }
type Cifre = { nopti: number; lei: number }

const LUNI = ['', 'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const zileIntre = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
const lei = (n: number) => Math.round(n).toLocaleString('ro-RO')
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b - 1) * 100) : null

// partea unei rezervari intr-un interval [start, end) (nopti si lei pro-rata)
function inInterval(r: Rez, start: string, end: string): Cifre {
  const tot = Math.max(1, Number(r.nr_nopti) || zileIntre(r.data_checkin, r.data_checkout))
  const a = r.data_checkin > start ? r.data_checkin : start, b = r.data_checkout < end ? r.data_checkout : end
  const n = Math.max(0, zileIntre(a, b))
  return { nopti: n, lei: (Number(r.suma_incasata) || 0) * Math.min(1, n / tot) }
}
function suma(rez: Rez[], start: string, end: string, aptId?: string): Cifre {
  let nopti = 0, l = 0
  for (const r of rez) { if (aptId && r.apartament_id !== aptId) continue; const c = inInterval(r, start, end); nopti += c.nopti; l += c.lei }
  return { nopti, lei: l }
}
async function toate(start: string, end: string): Promise<Rez[]> {
  const out: Rez[] = []
  for (let de = 0; de < 10000; de += 1000) {
    const { data, error } = await supabase.from('rezervari').select('apartament_id,data_checkin,data_checkout,nr_nopti,suma_incasata,status_rezervare,camera_semnalata')
      .lt('data_checkin', end).gt('data_checkout', start).neq('status_rezervare', 'anulata').order('data_checkin').range(de, de + 999)
    if (error || !data) break
    out.push(...(data as Rez[]))
    if (data.length < 1000) break
  }
  return out.filter(r => r.camera_semnalata !== 'NEALOCAT' && r.apartament_id)
}

type Luna = {
  an: number; luna: number; zile: number; curenta: boolean; ziAzi: number
  acum: Cifre; anTrecut: Cifre; acumLaZi: Cifre; anTrecutLaZi: Cifre; prognoza: number
  apts: { apt: any; acum: Cifre; anTrecut: Cifre; acumLaZi: Cifre; anTrecutLaZi: Cifre; prognoza: number }[]
}

export default function FataDeAnulTrecut() {
  const [date, setDate] = useState<{ luni: Luna[]; tendinta: number | null; perioadaTendinta: string } | null>(null)
  const [eroare, setEroare] = useState(false)
  const [deschis, setDeschis] = useState<number | null>(null)
  // doua stiluri de afisare (cerut direct: „dă-mi și un redesign, să vedem cum ar putea arăta mai futurist”)
  const [stil, setStil] = useState<'futurist' | 'clasic'>(() => { try { return localStorage.getItem('anTrecut_stil') === 'clasic' ? 'clasic' : 'futurist' } catch { return 'futurist' } })
  const alegeStil = (x: 'futurist' | 'clasic') => { setStil(x); try { localStorage.setItem('anTrecut_stil', x) } catch {} }
  const comutator = (
    <div data-stil-comutator style={{ display: 'inline-flex', padding: 2, borderRadius: 999, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(10,8,30,0.5)' }}>
      {(['futurist', 'clasic'] as const).map(k => <button key={k} data-stil={k} onClick={() => alegeStil(k)} style={{ padding: '3px 11px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', cursor: 'pointer', textTransform: 'uppercase', background: stil === k ? 'linear-gradient(90deg,#5E54A8,#4E8FA3)' : 'transparent', color: stil === k ? '#fff' : 'rgba(196,181,253,0.7)' }}>{k}</button>)}
    </div>
  )

  useEffect(() => { (async () => {
    try {
      const azi = new Date(); azi.setHours(12, 0, 0, 0)
      const an = azi.getFullYear(), luna = azi.getMonth() + 1
      const inceput = (a: number, l: number) => ymd(new Date(a, l - 1, 1))
      // fereastra: 3 luni inainte de luna curenta .. sfarsitul lunii viitoare, anul acesta si anul trecut
      const [rezAcum, rezTrecut, { data: aptData }] = await Promise.all([
        toate(inceput(an, luna - 3), inceput(an, luna + 2)),
        toate(inceput(an - 1, luna - 3), inceput(an - 1, luna + 2)),
        supabase.from('apartamente').select('id,nume,nota,status,exclus_statistici').order('nota'),
      ])
      // apartamentele „Exclus din statistici” (ex. N45, la care firma ia doar comisionul) nu intră în comparație / prognoză
      const apts = (aptData || []).filter((a: any) => !a.exclus_statistici)
      // tendinta: ultimele 3 luni incheiate, doar apartamentele cu rezervari in ambii ani
      const tS = inceput(an, luna - 3), tE = inceput(an, luna), tS1 = inceput(an - 1, luna - 3), tE1 = inceput(an - 1, luna)
      const comune = apts.filter(a => suma(rezAcum, tS, tE, a.id).nopti > 0 && suma(rezTrecut, tS1, tE1, a.id).nopti > 0)
      const tA = comune.reduce((t, a) => t + suma(rezAcum, tS, tE, a.id).lei, 0), tT = comune.reduce((t, a) => t + suma(rezTrecut, tS1, tE1, a.id).lei, 0)
      const tendinta = tT > 0 ? tA / tT : null
      const perioadaTendinta = `${LUNI[new Date(an, luna - 4, 1).getMonth() + 1].slice(0, 3)}–${LUNI[new Date(an, luna - 2, 1).getMonth() + 1].slice(0, 3)}`

      const luni: Luna[] = [0, 1].map(k => {
        const d = new Date(an, luna - 1 + k, 1), A = d.getFullYear(), L = d.getMonth() + 1
        const s = ymd(d), e = inceput(A, L + 1), s1 = inceput(A - 1, L), e1 = inceput(A - 1, L + 1)
        const zile = new Date(A, L, 0).getDate(), curenta = k === 0, ziAzi = azi.getDate()
        const laZi = curenta ? ymd(new Date(A, L - 1, ziAzi + 1)) : s   // nopti 1..azi
        const laZi1 = curenta ? ymd(new Date(A - 1, L - 1, Math.min(ziAzi, new Date(A - 1, L, 0).getDate()) + 1)) : s1
        const aptsL = apts.map(a => {
          const acum = suma(rezAcum, s, e, a.id), anTrecut = suma(rezTrecut, s1, e1, a.id)
          const acumLaZi = curenta ? suma(rezAcum, s, laZi, a.id) : { nopti: 0, lei: 0 }, anTrecutLaZi = curenta ? suma(rezTrecut, s1, laZi1, a.id) : { nopti: 0, lei: 0 }
          // apartamentele inactive (renuntate, ex. L83, L94) nu mai aduc nimic in plus fata de ce e deja rezervat
          const prognoza = a.status === 'inactiv' ? acum.lei : Math.max(acum.lei, anTrecut.lei * (tendinta ?? 1))
          return { apt: a, acum, anTrecut, acumLaZi, anTrecutLaZi, prognoza }
        }).filter(x => x.anTrecut.nopti > 0 || x.acum.nopti > 0)
          .sort((x, y) => Number(y.anTrecut.nopti > 0) - Number(x.anTrecut.nopti > 0) || String(x.apt.nota || x.apt.nume).localeCompare(String(y.apt.nota || y.apt.nume)))
        const tot = (f: (x: typeof aptsL[number]) => Cifre) => aptsL.reduce((t, x) => ({ nopti: t.nopti + f(x).nopti, lei: t.lei + f(x).lei }), { nopti: 0, lei: 0 })
        return { an: A, luna: L, zile, curenta, ziAzi, acum: tot(x => x.acum), anTrecut: tot(x => x.anTrecut), acumLaZi: tot(x => x.acumLaZi), anTrecutLaZi: tot(x => x.anTrecutLaZi), prognoza: aptsL.reduce((t, x) => t + x.prognoza, 0), apts: aptsL }
      })
      setDate({ luni, tendinta, perioadaTendinta })
    } catch { setEroare(true) }
  })() }, [])

  const card: React.CSSProperties = { background: 'rgba(214,228,244,0.05)', border: '1px solid rgba(159,215,255,0.12)', borderRadius: 12, padding: '12px 14px' }
  const mic: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.5)' }
  const delta = (p: number | null) => p == null ? <span style={{ color: 'rgba(159,215,255,0.4)' }}>—</span>
    : <span style={{ color: p >= 0 ? '#4ADE80' : '#F87171', fontWeight: 700 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}%</span>

  if (eroare) return null
  if (date && stil === 'futurist') return <Futurist date={date} deschis={deschis} setDeschis={setDeschis} comutator={comutator} />
  if (!date) return <div style={{ ...card, fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>Se încarcă comparația cu anul trecut…</div>

  return (
    <div data-fata-de-anul-trecut style={{ ...card, borderTop: '2px solid #A497D6' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: '#C4B5FD' }}>FAȚĂ DE ANUL TRECUT · PROGNOZĂ</div>{comutator}</div>
        {date.tendinta != null && <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.6)' }}>tendință {date.perioadaTendinta}: {delta(Math.round((date.tendinta - 1) * 100))} față de anul trecut <span style={{ color: 'rgba(159,215,255,0.4)' }}>(aceleași apartamente)</span></div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
        {date.luni.map((L, i) => {
          const progres = L.prognoza > 0 ? Math.min(100, Math.round(L.acum.lei / L.prognoza * 100)) : 0
          const ltAn = L.anTrecut.lei > 0 ? Math.min(100, Math.round(L.anTrecut.lei / Math.max(L.prognoza, L.anTrecut.lei) * 100)) : 0
          return (
            <div key={i} data-luna-prognoza style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 10, padding: '10px 12px', background: 'rgba(167,139,250,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#E8F4FF', textTransform: 'capitalize' }}>{LUNI[L.luna]} {L.an}</div>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{L.curenta ? `luna curentă · ziua ${L.ziAzi}/${L.zile}` : 'luna viitoare'}</div>
              </div>

              {L.curenta && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: 'rgba(214,228,244,0.8)' }}>Până azi (1–{L.ziAzi} {LUNI[L.luna].slice(0, 3)})</span>
                  <span style={{ fontFamily: 'monospace' }}><b style={{ color: '#E8F4FF' }}>{lei(L.acumLaZi.lei)}</b> <span style={{ color: 'rgba(159,215,255,0.5)' }}>vs {lei(L.anTrecutLaZi.lei)} anul trecut</span> {delta(pct(L.acumLaZi.lei, L.anTrecutLaZi.lei))}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                <div><div style={mic}>Rezervat acum</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: '#E8F4FF' }}>{lei(L.acum.lei)}</div><div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{L.acum.nopti} nopți</div></div>
                <div><div style={mic}>{LUNI[L.luna].slice(0, 3)} {L.an - 1} (toată luna)</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: 'rgba(214,228,244,0.7)' }}>{lei(L.anTrecut.lei)}</div><div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{L.anTrecut.nopti} nopți</div></div>
                <div><div style={{ ...mic, color: '#C4B5FD' }}>Prognoză</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: '#C4B5FD' }}>{lei(L.prognoza)}</div><div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{delta(pct(L.prognoza, L.anTrecut.lei))} vs an trecut</div></div>
              </div>

              {/* bara: rezervat acum din prognoza, cu reperul „anul trecut” */}
              <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(159,215,255,0.08)', margin: '10px 0 4px' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${progres}%`, borderRadius: 4, background: 'linear-gradient(90deg,#5E54A8,#A497D6)' }} />
                {ltAn > 0 && <div title="anul trecut, toată luna" style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${ltAn}% - 1px)`, width: 2, background: '#FCD34D', borderRadius: 1 }} />}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(159,215,255,0.55)' }}>
                <span>{progres}% din prognoză e deja rezervat</span>
                <span><span style={{ color: '#FCD34D' }}>|</span> anul trecut · mai sunt de umplut ≈ {lei(Math.max(0, L.prognoza - L.acum.lei))} lei</span>
              </div>

              <button data-pe-apartamente-toggle onClick={() => setDeschis(deschis === i ? null : i)} style={{ marginTop: 8, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.35)', background: deschis === i ? 'rgba(167,139,250,0.15)' : 'transparent', color: '#C4B5FD', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {deschis === i ? 'Ascunde apartamentele' : `Pe apartamente (${L.apts.filter(a => a.anTrecut.nopti > 0).length} care erau și anul trecut) ▸`}
              </button>
            </div>
          )
        })}
      </div>

      {deschis != null && (() => {
        const L = date.luni[deschis]
        const th: React.CSSProperties = { ...mic, padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid rgba(159,215,255,0.12)', background: 'transparent' }
        const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(232,244,255,0.9)', whiteSpace: 'nowrap' }
        return (
          <div data-tabel-apartamente style={{ marginTop: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Apartament · <span style={{ textTransform: 'capitalize' }}>{LUNI[L.luna]}</span></th>
                {L.curenta && <th style={th}>Până azi · an trecut → acum</th>}
                <th style={th}>{L.an - 1} toată luna</th><th style={th}>Rezervat acum</th><th style={th}>Ocupare acum</th><th style={th}>Prognoză</th><th style={th}>Prognoză vs an trecut</th>
              </tr></thead>
              <tbody>
                {L.apts.map(a => (
                  <tr key={a.apt.id} data-rand-apt>
                    <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 11.5, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'rgba(77,163,255,0.12)', color: '#4DA3FF', fontWeight: 700, marginRight: 6 }}>{a.apt.nota || '—'}</span>{a.apt.nume}
                      {a.anTrecut.nopti === 0 && <span style={{ marginLeft: 6, fontSize: 11.5, color: '#4ADE80' }}>nou</span>}
                      {a.apt.status === 'inactiv' && <span style={{ marginLeft: 6, fontSize: 11.5, color: 'rgba(159,215,255,0.45)' }}>inactiv</span>}
                    </td>
                    {L.curenta && <td style={td}>{lei(a.anTrecutLaZi.lei)} → <b>{lei(a.acumLaZi.lei)}</b></td>}
                    <td style={{ ...td, color: 'rgba(214,228,244,0.7)' }}>{a.anTrecut.nopti ? `${lei(a.anTrecut.lei)} · ${a.anTrecut.nopti}n` : '—'}</td>
                    <td style={td}><b>{lei(a.acum.lei)}</b> · {a.acum.nopti}n</td>
                    <td style={td}>{Math.round(a.acum.nopti / L.zile * 100)}%</td>
                    <td style={{ ...td, color: '#C4B5FD', fontWeight: 700 }}>{lei(a.prognoza)}</td>
                    <td style={td}>{a.anTrecut.nopti ? delta(pct(a.prognoza, a.anTrecut.lei)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.45)', marginTop: 6 }}>Sume brute (valoarea rezervărilor), pro-rata pe nopțile din lună. Prognoza = anul trecut × tendința (aceleași apartamente), dar nu sub ce e deja rezervat; apartamentele inactive și cele noi = doar ce e rezervat. „Până azi” = nopțile de la 1 la azi, anul trecut față de acum.</div>
          </div>
        )
      })()}
    </div>
  )
}

// ── varianta futuristă: sticlă întunecată cu grilă, neon violet / cyan, inel de progres, bare comparative și,
// pe apartamente, bare luminoase (rezervat acum) cu reperul anului trecut și conturul prognozei
const NEON = { v: '#A497D6', c: '#7FC4D6', g: '#7FCFA0', y: '#E3C77A', r: '#E08E8E' }  // tonuri atenuate
function Inel({ procent, eticheta }: { procent: number; eticheta: string }) {
  const R = 54, C = 2 * Math.PI * R, p = Math.max(0, Math.min(100, procent))
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
        <defs><linearGradient id="inelGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6E62B8" /><stop offset="100%" stopColor="#6FB6C8" /></linearGradient></defs>
        <circle data-inel-fond cx="66" cy="66" r={R} fill="none" stroke="rgba(160,170,230,0.08)" strokeWidth="9" />
        <circle cx="66" cy="66" r={R} fill="none" stroke="url(#inelGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C * p / 100} ${C}`} style={{ filter: 'drop-shadow(0 0 4px rgba(111,182,200,0.3))', transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#fff', textShadow: '0 0 10px rgba(111,182,200,0.35)' }}>{p}%</div>
        <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(180,212,224,0.7)', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'pre-line' }}>{eticheta}</div>
      </div>
    </div>
  )
}
// tema deschisă (data-theme="light") - aceeași structură, pe alb-crem, cu accente lila / turcoaz mai închise
const CSS_DESCHIS = `
[data-theme="light"] [data-futurist] { background:linear-gradient(160deg,#FFFFFF,#F8F5FD 55%,#F2F8FA) !important; border-color:rgba(110,98,184,0.25) !important; box-shadow:0 8px 24px rgba(60,45,20,0.07) !important; }
[data-theme="light"] [data-futurist] [data-fx-grila] { opacity:0.6 !important; background-image:linear-gradient(rgba(110,98,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(110,98,184,0.07) 1px, transparent 1px) !important; }
[data-theme="light"] [data-futurist] [data-luna-prognoza] { background:linear-gradient(160deg,#F6F2FF,#FFFFFF 60%) !important; border-color:rgba(110,98,184,0.22) !important; }
[data-theme="light"] [data-futurist] [data-tabel-apartamente] { background:#FFFFFF !important; border-color:rgba(60,140,160,0.25) !important; }
[data-theme="light"] [data-fx-titlu] { background:linear-gradient(90deg,#4C3FA6,#24778C) !important; -webkit-background-clip:text !important; background-clip:text !important; }
[data-theme="light"] [data-inel-fond] { stroke:rgba(110,98,184,0.14) !important; }
[data-theme="light"] [data-futurist] * { text-shadow:none !important; }
[data-theme="light"] [data-bara="rezervat"] { background:linear-gradient(90deg,#2F7F96,#4FA3B8) !important; }
[data-theme="light"] [data-bara="an-trecut"] { background:#CDA94E !important; }
[data-theme="light"] [data-bara="prognoza"] { border-color:#6E62B8 !important; }
`

function Futurist({ date, deschis, setDeschis, comutator }: { date: { luni: Luna[]; tendinta: number | null; perioadaTendinta: string }; deschis: number | null; setDeschis: (n: number | null) => void; comutator: React.ReactNode }) {
  const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(180,212,224,0.6)', fontFamily: 'monospace' }
  const glow = (c: string) => ({ color: c, textShadow: `0 0 10px ${c}38` })
  const sageata = (p: number | null) => p == null ? '—' : <span style={glow(p >= 0 ? NEON.g : NEON.r)}>{p >= 0 ? '▲' : '▼'}{Math.abs(p)}%</span>
  const tend = date.tendinta != null ? Math.round((date.tendinta - 1) * 100) : null
  return (
    <div data-fata-de-anul-trecut data-futurist style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, borderRadius: 16, padding: '16px 18px', border: '1px solid rgba(160,170,230,0.16)',
      background: 'radial-gradient(1200px 300px at 0% 0%, rgba(110,95,190,0.10), transparent 60%), radial-gradient(900px 300px at 100% 100%, rgba(90,160,190,0.07), transparent 60%), rgba(8,12,28,0.55)',
      boxShadow: '0 0 0 1px rgba(127,196,214,0.06) inset, 0 10px 30px rgba(0,0,0,0.18)' }}>
      <style>{CSS_DESCHIS}</style>
      {/* grila */}
      <div aria-hidden data-fx-grila style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35, backgroundImage: 'linear-gradient(rgba(160,170,230,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(160,170,230,0.05) 1px, transparent 1px)', backgroundSize: '28px 28px', maskImage: 'linear-gradient(180deg, #000, transparent 85%)', WebkitMaskImage: 'linear-gradient(180deg, #000, transparent 85%)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: NEON.c, boxShadow: `0 0 10px ${NEON.c}` }} />
            <span data-fx-titlu style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.22em', background: 'linear-gradient(90deg,#BFB6E6,#9FCFDB)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>PROGNOZĂ · FAȚĂ DE ANUL TRECUT</span>
            {comutator}
          </div>
          {tend != null && <div style={{ ...lbl, letterSpacing: '.1em' }}>tendință {date.perioadaTendinta} <span style={{ fontSize: 12 }}>{sageata(tend)}</span> · aceleași apartamente</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
          {date.luni.map((L, i) => {
            const progres = L.prognoza > 0 ? Math.round(L.acum.lei / L.prognoza * 100) : 0
            const max = Math.max(L.prognoza, L.anTrecut.lei, L.acum.lei, 1)
            const bara = (eticheta: string, v: number, culoare: string, contur = false) => (
              <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 78px', alignItems: 'center', gap: 10 }}>
                <span style={lbl}>{eticheta}</span>
                <div style={{ height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div data-bara={culoare === NEON.c ? 'rezervat' : culoare === NEON.y ? 'an-trecut' : 'prognoza'} style={{ height: '100%', width: `${Math.round(v / max * 100)}%`, borderRadius: 5, background: contur ? 'transparent' : culoare, border: contur ? `1px dashed ${culoare}` : 'none', boxShadow: contur ? 'none' : `0 0 10px ${culoare}30`, boxSizing: 'border-box' }} />
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, textAlign: 'right', ...glow(culoare) }}>{lei(v)}</span>
              </div>
            )
            return (
              <div key={i} data-luna-prognoza style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(160deg, rgba(110,95,190,0.07), rgba(8,12,30,0.6) 55%)', border: '1px solid rgba(160,170,230,0.15)', backdropFilter: 'blur(14px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.04em', color: '#F5F3FF', textTransform: 'uppercase' }}>{LUNI[L.luna]} <span style={{ color: 'rgba(196,181,253,0.6)', fontWeight: 600 }}>{L.an}</span></div>
                  <span style={{ ...lbl, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(127,196,214,0.2)' }}>{L.curenta ? `live · ziua ${L.ziAzi}/${L.zile}` : 'luna viitoare'}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Inel procent={progres} eticheta={'din prognoză\nrezervat'} />
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 10 }}>
                    <div>
                      <div style={lbl}>Prognoză</div>
                      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1.05, ...glow('#C4B5FD') }}>{lei(L.prognoza)} <span style={{ fontSize: 12, color: 'rgba(196,181,253,0.6)', textShadow: 'none' }}>lei</span></div>
                      <div style={{ fontSize: 12.5, color: 'rgba(214,228,244,0.7)', marginTop: 2 }}>{sageata(pct(L.prognoza, L.anTrecut.lei))} față de {LUNI[L.luna].slice(0, 3)} {L.an - 1} · mai sunt ≈ <b style={glow(NEON.y)}>{lei(Math.max(0, L.prognoza - L.acum.lei))}</b> de umplut</div>
                    </div>
                    {L.curenta && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(127,196,214,0.05)', border: '1px solid rgba(127,196,214,0.14)' }}>
                      <span style={lbl}>Până azi</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, ...glow('#E0F2FE') }}>{lei(L.acumLaZi.lei)}</span>
                      <span style={{ fontSize: 12, color: 'rgba(180,212,224,0.55)' }}>vs {lei(L.anTrecutLaZi.lei)} anul trecut</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800 }}>{sageata(pct(L.acumLaZi.lei, L.anTrecutLaZi.lei))}</span>
                    </div>}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
                  {bara(`${LUNI[L.luna].slice(0, 3)} ${L.an - 1}`, L.anTrecut.lei, NEON.y)}
                  {bara('Rezervat', L.acum.lei, NEON.c)}
                  {bara('Prognoză', L.prognoza, NEON.v, true)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ ...lbl, letterSpacing: '.08em' }}>{L.acum.nopti} nopți rezervate · {L.anTrecut.nopti} anul trecut</span>
                  <button data-pe-apartamente-toggle onClick={() => setDeschis(deschis === i ? null : i)} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(127,196,214,0.32)', background: deschis === i ? 'rgba(127,196,214,0.10)' : 'transparent', color: '#A9D3DD', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: deschis === i ? '0 0 14px rgba(127,196,214,0.2)' : 'none' }}>{deschis === i ? 'Închide' : 'Pe apartamente ▸'}</button>
                </div>
              </div>
            )
          })}
        </div>

        {deschis != null && (() => {
          const L = date.luni[deschis]
          const max = Math.max(1, ...L.apts.map(a => Math.max(a.anTrecut.lei, a.acum.lei, a.prognoza)))
          return (
            <div data-tabel-apartamente style={{ marginTop: 14, borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(127,196,214,0.14)', background: 'rgba(8,12,30,0.55)' }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, ...lbl }}>
                <span style={{ textTransform: 'uppercase' }}>{LUNI[L.luna]} {L.an} · pe apartamente</span>
                <span><span style={{ display: 'inline-block', width: 14, height: 6, borderRadius: 3, background: NEON.c, boxShadow: `0 0 6px ${NEON.c}`, marginRight: 5 }} />rezervat</span>
                <span><span style={{ display: 'inline-block', width: 2, height: 10, background: NEON.y, marginRight: 5, verticalAlign: 'middle' }} />anul trecut</span>
                <span><span style={{ display: 'inline-block', width: 14, height: 6, borderRadius: 3, border: `1px dashed ${NEON.v}`, marginRight: 5 }} />prognoză</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {L.apts.map(a => (
                  <div key={a.apt.id} data-rand-apt style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) minmax(0,1fr) 150px', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 11.5, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(127,196,214,0.2)', color: '#A9D3DD', fontWeight: 700 }}>{a.apt.nota || '—'}</span>
                      <span style={{ fontSize: 12, color: '#E0E7FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.apt.nume}</span>
                      {a.anTrecut.nopti === 0 && <span style={{ fontSize: 10.5, ...glow(NEON.g) }}>NOU</span>}
                      {a.apt.status === 'inactiv' && <span style={{ fontSize: 10.5, color: 'rgba(180,212,224,0.4)' }}>INACTIV</span>}
                    </div>
                    <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${a.prognoza / max * 100}%`, borderRadius: 7, border: `1px dashed ${NEON.v}88`, boxSizing: 'border-box' }} />
                      <div style={{ position: 'absolute', top: 2, bottom: 2, left: 2, width: `calc(${a.acum.lei / max * 100}% - 4px)`, minWidth: a.acum.lei > 0 ? 3 : 0, borderRadius: 5, background: 'linear-gradient(90deg,#4F8EA0,#7FC4D6)', boxShadow: '0 0 10px rgba(127,196,214,0.22)' }} />
                      {a.anTrecut.lei > 0 && <div title={`anul trecut: ${lei(a.anTrecut.lei)}`} style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${a.anTrecut.lei / max * 100}% - 1px)`, width: 2, borderRadius: 1, background: NEON.y, boxShadow: `0 0 6px ${NEON.y}` }} />}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={glow('#E0F2FE')}>{lei(a.acum.lei)}</span><span style={{ color: 'rgba(180,212,224,0.45)' }}> / {lei(a.prognoza)}</span>
                      <span style={{ marginLeft: 6, fontWeight: 800 }}>{a.anTrecut.nopti ? sageata(pct(a.prognoza, a.anTrecut.lei)) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(180,212,224,0.4)', marginTop: 10, fontFamily: 'monospace' }}>rezervat / prognoză · ▲▼ = prognoză față de aceeași lună de anul trecut · sume brute, pro-rata pe nopțile din lună</div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
