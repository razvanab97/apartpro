'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Card } from '@/components/ui'
import { CHEI_BLOCARE, blocariDinSetari } from '@/lib/mentenanta'
import { roomTypes, allocation, rates, cerere, compara, scurt, plusZile, apartamenteActive, CHEIE_JURNAL, type Rezervare5sd } from '@/lib/pms5sd'

// 5starDesk PMS Connect - pagina de TEST (vezi lib/pms5sd.ts). Nu trimite nimic si nu scrie nicio rezervare: arata ce am
// trimite (camere, disponibilitate, preturi) si ce am primit de la 5starDesk, comparat cu ce avem deja din sincronizarea actuala.

const C = { text: '#E6EEF9', dim: 'rgba(159,215,255,0.55)', line: 'rgba(159,215,255,0.14)', ok: '#4ADE80', warn: '#FBBF24', err: '#F87171', acc: '#7DD3FC' }
const aziRo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const zz = (iso: string) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : ''
const ZS = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']
const URL_NOSTRU = 'https://apartpro.work/api/pms-5stardesk'
const ET: Record<string, [string, string]> = {
  exista: ['✓ Există deja', C.ok], exista_diferit: ['⚠ Diferă', C.warn], lipseste: ['＋ Ar fi creată', C.acc],
  anulata_ok: ['✓ Anulare', C.ok], anulata_dar_activa: ['⚠ Anulare neaplicată', C.warn], camera_necunoscuta: ['✕ Cameră nemapată', C.err],
}

export default function Pms5sdTest() {
  const [stare, setStare] = useState<{ token_configurat: boolean; url_5sd_configurat: boolean } | null>(null)
  const [apts, setApts] = useState<any[]>([]), [rez, setRez] = useState<any[]>([]), [bl, setBl] = useState<any[]>([]), [jur, setJur] = useState<any[]>([])
  const [zile, setZile] = useState(30), [copiat, setCopiat] = useState(''), [incarcat, setIncarcat] = useState(false)
  const azi = aziRo()

  async function load() {
    const [s, a, r, b, j] = await Promise.all([
      fetch('/api/pms-5stardesk', { cache: 'no-store' }).then(x => x.json()).catch(() => null),
      supabase.from('apartamente').select('id,nume,status,pret_standard,capacitate_max').order('nume'),
      supabase.from('rezervari').select('id,apartament_id,data_checkin,data_checkout,status_rezervare,camera_semnalata,observatii,nume_client').gte('data_checkout', plusZile(azi, -120)),
      supabase.from('setari').select('cheie,valoare').in('cheie', CHEI_BLOCARE),
      supabase.from('setari').select('valoare').eq('cheie', CHEIE_JURNAL).maybeSingle(),
    ])
    setStare(s); setApts(a.data || []); setRez(r.data || []); setBl(blocariDinSetari(b.data) as any)  // blocari proprietari + mentenante active
    try { const v = JSON.parse(j.data?.valoare || '[]'); setJur(Array.isArray(v) ? v : []) } catch { setJur([]) }
    setIncarcat(true)
  }
  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const active = useMemo(() => apartamenteActive(apts), [apts])
  const rt = useMemo(() => roomTypes(apts), [apts])
  const disp = useMemo(() => allocation(apts, rez, bl, azi, 365), [apts, rez, bl, azi])
  const pr = useMemo(() => rates(apts, azi, 365), [apts, azi])
  const copiaza = async (t: string, k: string) => { try { await navigator.clipboard.writeText(t); setCopiat(k); setTimeout(() => setCopiat(''), 1600) } catch {} }
  const json = (o: any) => JSON.stringify(o, null, 2)
  async function golesteJurnal() { await supabase.from('setari').upsert({ cheie: CHEIE_JURNAL, valoare: '[]' }, { onConflict: 'cheie' }); load() }

  const zileGrila = Array.from({ length: zile }, (_, i) => plusZile(azi, i))
  const btn: React.CSSProperties = { padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const h2: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }
  const sub: React.CSSProperties = { fontSize: 12, color: C.dim, margin: '0 0 12px', lineHeight: 1.5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <PageHeader title="5starDesk PMS Connect — TEST" subtitle="În paralel cu sincronizarea actuală · nu trimite nimic și nu creează rezervări"
        actions={<a href="/sync" style={{ ...btn, textDecoration: 'none' }}>← Sync 5starDesk</a>} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        <Card style={{ padding: 16 }}>
          <div data-pms-stare style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.4)', color: C.warn, fontSize: 12, fontWeight: 700 }}>MOD TEST</span>
            <span style={{ fontSize: 12.5, color: stare?.token_configurat ? C.ok : C.err }}>{!stare ? '…' : stare.token_configurat ? '✓ Token configurat (FIVESTAR_PMS_TOKEN)' : '✕ Token lipsă — adaugă FIVESTAR_PMS_TOKEN în Vercel'}</span>
            <span style={{ fontSize: 12.5, color: stare?.url_5sd_configurat ? C.ok : C.dim }}>{stare?.url_5sd_configurat ? '✓ URL 5starDesk configurat' : '○ URL 5starDesk (FIVESTAR_PMS_URL) — nu e nevoie în test'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            URL-ul nostru pentru 5starDesk (GetRooms + rezervări): <code data-pms-url style={{ color: C.acc, userSelect: 'all' }}>{URL_NOSTRU}</code>{' '}
            <button style={btn} onClick={() => copiaza(URL_NOSTRU, 'url')}>{copiat === 'url' ? '✓ Copiat' : 'Copiază'}</button>
          </div>
          <ol style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, margin: '10px 0 0', paddingLeft: 18 }}>
            <li>Ceri de la 5starDesk activarea PMS Connect → primești tokenul (și URL-ul lor).</li>
            <li>Pui tokenul în Vercel → Settings → Environment Variables: <b>FIVESTAR_PMS_TOKEN</b> (și <b>FIVESTAR_PMS_URL</b>), apoi Redeploy.</li>
            <li>Le dai URL-ul de mai sus; ei apelează GetRooms și leagă fiecare apartament de camera lui din 5starDesk.</li>
            <li>Rezervările de pe Booking / Airbnb încep să apară mai jos, în „Rezervări primite” — <b>doar ca test</b>, comparate cu ce aduce deja sincronizarea actuală.</li>
          </ol>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={h2}>1 · Camere (GetRooms) — ce vede 5starDesk la mapare</div>
          <div style={sub}>Fiecare apartament activ = o cameră cu un singur plan tarifar „Standard”. Id-ul e id-ul apartamentului din apartpro.</div>
          <div style={{ overflowX: 'auto' }}>
            <table data-pms-camere style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: C.dim, textAlign: 'left' }}><th style={{ padding: 6 }}>Apartament</th><th style={{ padding: 6 }}>Id (RoomTypeId)</th><th style={{ padding: 6 }}>Plan</th><th style={{ padding: 6 }}>Pers. max</th></tr></thead>
              <tbody>{rt.map(r => <tr key={r.Id} style={{ borderTop: `1px solid ${C.line}`, color: C.text }}><td style={{ padding: 6, fontWeight: 600 }}>{r.Name}</td><td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11, color: C.dim }}>{r.Id}</td><td style={{ padding: 6 }}>STD · Standard</td><td style={{ padding: 6 }}>{(r as any).GuestMax || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          {incarcat && <div style={{ fontSize: 11.5, color: C.dim, marginTop: 8 }}>{rt.length} apartamente active{apts.length > rt.length ? ` · ${apts.length - rt.length} inactive nu se trimit` : ''}</div>}
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div><div style={h2}>2 · Disponibilitate (set_disp) — previzualizare, NU se trimite</div>
              <div style={sub}>Calculată din rezervările din apartpro + blocările proprietarilor: verde = liber (1), roșu = ocupat (0). Pe 365 de zile.</div></div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[14, 30, 60].map(z => <button key={z} style={{ ...btn, ...(zile === z ? { borderColor: C.acc, color: C.acc } : {}) }} onClick={() => setZile(z)}>{z} zile</button>)}
              <button data-pms-copiaza-disp style={btn} onClick={() => copiaza(json(cerere('set_disp', '***', { Allocation: disp })), 'disp')}>{copiat === 'disp' ? '✓ Copiat' : 'Copiază JSON'}</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table data-pms-disp style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 10.5 }}>
              <thead><tr><th style={{ minWidth: 120 }} />{zileGrila.map(z => { const d = new Date(z + 'T12:00:00Z').getUTCDay(); return <th key={z} style={{ color: d === 0 || d === 6 ? C.warn : C.dim, fontWeight: 600, padding: '0 1px', whiteSpace: 'nowrap' }}>{ZS[d]}<br />{z.slice(8, 10)}</th> })}<th style={{ color: C.dim, paddingLeft: 8, whiteSpace: 'nowrap' }}>libere / 365</th></tr></thead>
              <tbody>{active.map(a => { const m = disp[a.id] || {}; const lib = Object.values(m).filter(v => v.AvailableRooms > 0).length; return (
                <tr key={a.id}><td style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap', paddingRight: 8 }}>{scurt(a.nume)}</td>
                  {zileGrila.map(z => <td key={z} data-zi={z} title={`${scurt(a.nume)} · ${zz(z)} · ${m[z]?.AvailableRooms ? 'liber' : 'ocupat'}`} style={{ width: 18, height: 18, borderRadius: 4, background: m[z]?.AvailableRooms ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.45)' }} />)}
                  <td style={{ color: C.dim, paddingLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{lib}</td></tr>) })}</tbody>
            </table>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div><div style={h2}>3 · Prețuri (set_prices) — previzualizare, NU se trimite</div>
              <div style={sub}>Deocamdată prețul standard al apartamentului (Apartamente → Preț RON/n), același în fiecare zi. Regulile din „Prețuri” se leagă în etapa următoare.</div></div>
            <button style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => copiaza(json(cerere('set_prices', '***', { Rates: pr })), 'pr')}>{copiat === 'pr' ? '✓ Copiat' : 'Copiază JSON'}</button>
          </div>
          <div data-pms-preturi style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {active.map(a => <span key={a.id} style={{ fontSize: 12, padding: '5px 9px', borderRadius: 8, border: `1px solid ${C.line}`, color: Number(a.pret_standard) > 0 ? C.text : C.dim }}>{scurt(a.nume)}: {Number(a.pret_standard) > 0 ? <b>{a.pret_standard} RON</b> : 'fără preț — nu s-ar trimite'}</span>)}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div><div style={h2}>4 · Rezervări primite de la 5starDesk (jurnal de test)</div>
              <div style={sub}>Nu intră în rezervări. Fiecare e comparată cu ce există deja în apartpro (adus de sincronizarea actuală) — așa vedem dacă sistemul nou ar face exact ce trebuie, înainte să-l pornim.</div></div>
            <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>
              <button style={btn} onClick={load}>↻ Reîncarcă</button>
              {jur.length > 0 && <button style={{ ...btn, color: C.err }} onClick={golesteJurnal}>Golește</button>}
            </div>
          </div>
          <div data-pms-jurnal style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {incarcat && !jur.length && <div style={{ fontSize: 12.5, color: C.dim }}>Nimic primit încă. După activare, aici apar apelurile GetRooms și rezervările.</div>}
            {jur.map((j, i) => {
              const la = new Date(j.la).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
              if (j.tip !== 'reservation' || !j.r) return <div key={i} style={{ fontSize: 12, color: j.tip === 'refuzat' || j.tip === 'reservation_invalida' ? C.err : C.dim, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}` }}>{la} · {j.tip}{j.detaliu ? ' — ' + j.detaliu : ''}</div>
              const r = j.r as Rezervare5sd, c = compara(r, rez, apts), [et, col] = ET[c.stare]
              const apt = apts.find(a => a.id === r.roomTypeId)
              return (
                <div key={i} data-pms-rez style={{ padding: '8px 11px', borderRadius: 10, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: C.text }}>
                    <b>{r.status === 'Cancelled' ? '✕ ' : ''}{r.nume || '—'} · {apt ? scurt(apt.nume) : '?'} · {zz(r.checkin)} – {zz(r.checkout)}</b>
                    <span style={{ color: col, fontWeight: 700, fontSize: 12 }}>{et}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.dim }}>#{r.reservationId} · {r.status} · {r.total ? `${r.total.toLocaleString('ro-RO')} ${r.moneda} · ` : ''}{r.oaspeti} pers.{r.copii ? ` (${r.copii} copii)` : ''} · primită {la}</div>
                  <div style={{ fontSize: 11.5, color: col }}>{c.detaliu}</div>
                  {r.comentariu && <div style={{ fontSize: 11, color: C.dim, whiteSpace: 'pre-wrap' }}>{r.comentariu}</div>}
                </div>)
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
