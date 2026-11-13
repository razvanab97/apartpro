'use client'
// „🧾 Facturare Airbnb pe rând” (cerut direct: „să rămână la îndemână aceste de facturat, să le luăm una câte una, să
// verificăm și să confirmăm - poate un sistem și mai simplu, fiind direct de pe Airbnb”). Sursa e raportul Airbnb (cod, oaspete,
// perioadă, câștig brut) - rezervarea din aplicație e doar legată, dacă există. O fișă pe rând: verifici, completezi domiciliul
// (propus din ce s-a învățat), apeși „Emite” (sau Enter ×2) și trece la următoarea. Fără rezervare în aplicație se emite factura
// direct pe codul Airbnb (ca „Generează factură”).
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { aziRo, CHEIE_DATA_EMITERE, CLIENT_GOL, JUDETE, eRomania, type ClientFactura } from '@/components/RezervareModal'
import { localitatiJudet } from '@/lib/locatii-romania'
import { TARI, oraseTara } from '@/lib/tariOrase'
import { propune, ZILE_DUPA_CHECKOUT, type Invatat } from '@/lib/invatareFactura'
import { reconciliaza, deFacturat, fmt, zz, type Linie } from '@/lib/reconciliereAirbnb'
import { citesteCoada, scrieCoada, incarcaInvatare, type Coada } from '@/lib/coadaAirbnb'

type Fisa = { suma: string; client: ClientFactura; altaTara: boolean; data: string; sursa: string; verifica: string[]; gataLa: string }
const LINK_AIRBNB = (cod: string) => `https://www.airbnb.com/hosting/reservations/details/${cod}`

export default function CoadaFacturare({ onClose, onReload, onDeschide, onImport }: { onClose: () => void; onReload: () => void; onDeschide: (rezId: string) => void; onImport: () => void }) {
  const [coada, setCoada] = useState<Coada | null>(null)
  const [linii, setLinii] = useState<Linie[] | null>(null)
  const [ultimaRH, setUltimaRH] = useState<string | null>(null)
  const [oblioOk, setOblioOk] = useState(true)
  const [inv, setInv] = useState<{ salvate: Record<string, ClientFactura>; invatate: Invatat[] }>({ salvate: {}, invatate: [] })
  const [idx, setIdx] = useState(0)
  const [fisa, setFisa] = useState<Fisa | null>(null)
  const [stare, setStare] = useState<{ trimit?: boolean; eroare?: string }>({})
  const [emise, setEmise] = useState<{ nume: string; numar: string; suma: number }[]>([])
  const [eroareInc, setEroareInc] = useState('')
  const schimbat = useRef(false)
  const azi = aziRo()

  useEffect(() => {
    ;(async () => {
      try {
        const [c, i] = await Promise.all([citesteCoada(), incarcaInvatare()])
        setCoada(c); setInv(i)
        if (!c.randuri.length) { setLinii([]); return }
        const { linii: l, oblio, ultimaRH: u } = await reconciliaza(c.randuri)
        const pend = l.filter(x => deFacturat(x) && !c.ignorate[x.r.cod])
          // cele ajunse la termen intai (in ordinea check-out-ului), apoi cele care devin gata in zilele urmatoare
          .sort((a, b) => a.r.checkout.localeCompare(b.r.checkout))
        setLinii(pend); setUltimaRH(u); setOblioOk(oblio.ok)
        if (c.pendinte !== pend.length) void scrieCoada({ ...c, pendinte: pend.length }).catch(() => {})
      } catch (e) { setEroareInc(e instanceof Error ? e.message : 'Nu am putut încărca coada'); setLinii([]) }
    })()
  }, [])

  const l = linii?.[idx]
  // fisa curenta: propunerea (domiciliu salvat / invatat, data = check-out + 2 zile, nu inaintea ultimei facturi RH)
  useEffect(() => {
    if (!l) { setFisa(null); return }
    const rezLike = { id: l.rez?.id || `airbnb-${l.r.cod}`, nume_client: l.r.oaspete, telefon_client: l.rez?.telefon_client || null, cod_rezervare_platforma: l.r.cod, valoare_bruta: l.r.brut, data_checkout: l.r.checkout, moneda: 'RON' }
    const p = propune(rezLike, l.rez ? inv.salvate[l.rez.id] || null : null, inv.invatate, l.r.brut, ultimaRH, azi)
    const client: ClientFactura = p.client ? { ...CLIENT_GOL, ...p.client } : { ...CLIENT_GOL, tara: p.taraTelefon && p.taraTelefon !== 'Romania' ? p.taraTelefon : 'Romania' }
    const sursa = p.sursa === 'salvat' ? 'domiciliu salvat la rezervare' : p.sursa === 'telefon' ? `învățat: același telefon (rezervarea din ${zz(p.din!.checkin)})` : p.sursa === 'nume' ? `învățat: același nume (rezervarea din ${zz(p.din!.checkin)}) — verifică` : p.taraTelefon ? `necunoscut · telefonul e din ${p.taraTelefon}` : 'necunoscut — vezi în Airbnb „Locuiește în”'
    setFisa({ suma: String(l.r.brut), client, altaTara: !eRomania(client.tara) && !TARI.some(t => t.localeCompare(client.tara, 'ro', { sensitivity: 'base' }) === 0), data: p.dataEmitere, sursa, verifica: p.verifica, gataLa: p.gataLa })
    setStare({})
  }, [l?.r.cod, ultimaRH, inv])  // eslint-disable-line react-hooks/exhaustive-deps

  const setCl = (x: Partial<ClientFactura>) => setFisa(f => f && { ...f, client: { ...f.client, ...x } })
  const eRo = !!fisa && !fisa.altaTara && eRomania(fisa.client.tara)
  const sugestii = useMemo(() => !fisa ? [] : eRo ? (fisa.client.judet ? localitatiJudet(fisa.client.judet) : []) : oraseTara(fisa.client.tara), [fisa, eRo])
  const suma = Math.round(Number(String(fisa?.suma || '').replace(',', '.')) * 100) / 100
  const motiv = !l || !fisa ? 'Nimic de facturat' :
    fisa.gataLa > azi ? `Se facturează la ${ZILE_DUPA_CHECKOUT} zile după check-out: din ${zz(fisa.gataLa)}` :
    !(suma > 0) ? 'Scrie suma de facturat' :
    fisa.altaTara && !fisa.client.tara.trim() ? 'Scrie țara clientului' :
    eRo && !fisa.client.judet ? 'Alege județul de domiciliu' :
    !fisa.client.localitate.trim() ? 'Completează localitatea de domiciliu' :
    !/^\d{4}-\d{2}-\d{2}$/.test(fisa.data) ? 'Alege data emiterii' : fisa.data > azi ? 'Data emiterii nu poate fi în viitor' :
    ultimaRH && fisa.data < ultimaRH ? `Data nu poate fi înaintea ultimei facturi RH (${zz(ultimaRH)})` : null

  function urmatoarea(scoate: boolean) {
    if (!linii) return
    if (scoate) { const rest = linii.filter((_, i) => i !== idx); setLinii(rest); setIdx(i => Math.min(i, Math.max(0, rest.length - 1))) }
    else setIdx(i => (i + 1) % linii.length)
  }

  async function emite() {
    if (!l || !fisa || motiv || stare.trimit) return
    setStare({ trimit: true })
    const client = { ...fisa.client, tara: eRo ? 'Romania' : fisa.client.tara.trim() }
    try {
      let out: any, ok = false
      if (l.rez) {
        // rezervarea din aplicatie primeste datele din Airbnb (cu backup al valorilor vechi), apoi factura se emite pe ea
        const rez = l.rez
        const { data: sumaVeche } = await supabase.from('setari').select('valoare').eq('cheie', `suma_facturare_${rez.id}`).maybeSingle()
        const { error: eb } = await supabase.from('setari').upsert({ cheie: `import_airbnb_backup_${new Date().toISOString()}`, valoare: JSON.stringify({ coada: true, rezervari: [{ id: rez.id, cod_rezervare_platforma: rez.cod_rezervare_platforma, canal: rez.canal, status_facturare: rez.status_facturare }], sume: sumaVeche ? [{ cheie: `suma_facturare_${rez.id}`, valoare: sumaVeche.valoare }] : [] }) }, { onConflict: 'cheie' })
        if (eb) throw new Error('Backup-ul nu s-a putut salva: ' + eb.message)
        const patch: Record<string, string> = { status_facturare: 'de_facturat' }
        if (!rez.cod_rezervare_platforma) patch.cod_rezervare_platforma = l.r.cod
        if (rez.canal !== 'airbnb') patch.canal = 'airbnb'
        const { error: ep } = await supabase.from('rezervari').update(patch).eq('id', rez.id)
        if (ep) throw new Error(ep.message)
        const { error: es } = await supabase.from('setari').upsert({ cheie: `suma_facturare_${rez.id}`, valoare: String(suma) }, { onConflict: 'cheie' })
        if (es) throw new Error(es.message)
        schimbat.current = true
        const res = await fetch('/api/factura-oblio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rezervareId: rez.id, dataEmitere: fisa.data, client }) })
        out = await res.json().catch(() => ({})); ok = res.ok && !!out.numar
      } else {
        const res = await fetch('/api/factura-oblio/manuala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numeClient: l.r.oaspete, cod: l.r.cod, canal: 'airbnb', suma, dataEmitere: fisa.data, client }) })
        out = await res.json().catch(() => ({})); ok = res.ok && !!out.numar
      }
      if (!ok) {
        if (out?.ultima?.data) setUltimaRH(out.ultima.data)
        setStare({ eroare: out?.error || 'Emiterea a eșuat' }); return
      }
      schimbat.current = true
      void supabase.from('setari').upsert({ cheie: CHEIE_DATA_EMITERE, valoare: fisa.data }, { onConflict: 'cheie' }).then(() => {})
      setUltimaRH(u => !u || fisa.data > u ? fisa.data : u)
      setEmise(e => [...e, { nume: l.r.oaspete, numar: `${out.serie} ${out.numar}${out.dejaEmisa ? ' (era deja emisă)' : ''}`, suma }])
      if (coada) void scrieCoada({ ...coada, pendinte: Math.max(0, (linii?.length || 1) - 1) }).catch(() => {})
      urmatoarea(true)
    } catch (e) { setStare({ eroare: e instanceof Error ? e.message : 'Emiterea a eșuat' }) }
  }

  async function nuSeFactureaza() {
    if (!l || !coada) return
    const c = { ...coada, ignorate: { ...coada.ignorate, [l.r.cod]: azi }, pendinte: Math.max(0, (linii?.length || 1) - 1) }
    try { await scrieCoada(c); setCoada(c); urmatoarea(true) } catch (e) { setStare({ eroare: e instanceof Error ? e.message : 'Eroare' }) }
  }

  const inchide = () => { if (schimbat.current) onReload(); onClose() }
  // Esc inchide · Enter ×2 = emite (ca in fereastra rezervarii)
  const tasta = useRef<{ emite?: () => void; inchide?: () => void }>({})
  tasta.current = { emite: () => void emite(), inchide }
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { tasta.current.inchide?.(); return }
      if (e.key !== 'Enter' || e.repeat || e.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      const tg = e.target as HTMLElement | null
      if (tg && (tg.tagName === 'BUTTON' || tg.tagName === 'A' || tg.tagName === 'TEXTAREA')) return
      e.preventDefault()
      if (t) { clearTimeout(t); t = null; tasta.current.emite?.() } else t = setTimeout(() => { t = null }, 400)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (t) clearTimeout(t) }
  }, [])

  const btn = (x: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: 12, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', border: '1px solid rgba(159,215,255,0.2)', background: 'transparent', color: 'var(--text2)', ...x })
  const camp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(159,215,255,0.18)', background: 'rgba(8,16,28,0.6)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const eticheta: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', marginBottom: 4, display: 'block' }
  const total = (linii || []).reduce((s, x) => s + x.r.brut, 0)
  const aj = l?.r.ajustari || []

  return (
    <div onClick={e => { if (e.target === e.currentTarget) inchide() }} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,10,20,0.74)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div data-coada-facturare style={{ width: 720, maxWidth: '100%', maxHeight: '94vh', display: 'flex', flexDirection: 'column', background: '#0D1A2B', border: '1px solid rgba(159,215,255,0.16)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(159,215,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E8F4FF' }}>🧾 Facturare Airbnb pe rând</div>
            <div data-progres style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {linii === null ? 'Verific raportul Airbnb cu facturile din Oblio…' : linii.length ? `${idx + 1} din ${linii.length} de facturat · ${fmt(total)} RON` : 'Nimic de facturat'}
              {ultimaRH && ` · ultima factură RH din ${zz(ultimaRH)}`}{emise.length > 0 && ` · ${emise.length} emise acum`}
            </div>
          </div>
          <button type="button" onClick={onImport} style={btn()}>📥 Raport nou</button>
          <button type="button" onClick={inchide} aria-label="Închide" style={btn()}>✕</button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!oblioOk && <div style={{ fontSize: 12, color: '#FBBF24' }}>⚠ Facturile din Oblio nu s-au putut citi acum — poți emite, data e verificată oricum la emitere.</div>}
          {eroareInc && <div style={{ fontSize: 13, color: '#F87171' }}>⚠ {eroareInc}</div>}
          {emise.length > 0 && (
            <div data-emise style={{ fontSize: 12, color: '#4ADE80', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {emise.map((x, i) => <span key={i}>✓ {x.numar} · {x.nume} · {fmt(x.suma)}</span>)}
            </div>
          )}
          {linii && !linii.length && !eroareInc && (
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              {coada?.randuri.length ? '✓ Tot ce e în rapoartele Airbnb importate e facturat.' : 'Nu e încă niciun raport Airbnb încărcat.'} Când ai un raport nou: Airbnb → Câștiguri → Exportă CSV → <button type="button" onClick={onImport} style={btn({ padding: '4px 10px', color: '#7BC8FF' })}>📥 Raport nou</button>
            </div>
          )}

          {l && fisa && (
            <div data-fisa={l.r.cod} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* ce vine din Airbnb */}
              <div style={{ border: '1px solid rgba(255,90,95,0.25)', background: 'rgba(255,90,95,0.05)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#E8F4FF' }}>{l.r.oaspete}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#FF8A8E' }}>{l.r.cod}</span>
                  <a href={LINK_AIRBNB(l.r.cod)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7BC8FF', marginLeft: 'auto' }}>Deschide în Airbnb ↗</a>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{zz(l.r.checkin)} → {zz(l.r.checkout)} · {l.r.nopti} {l.r.nopti === 1 ? 'noapte' : 'nopți'} · {l.r.anunt}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Câștig brut Airbnb <b style={{ color: 'var(--text)' }}>{fmt(l.r.brut)} RON</b> = încasat {fmt(l.r.incasat)} + taxa Airbnb {fmt(Math.round((l.r.brut - l.r.incasat) * 100) / 100)}</div>
                <div style={{ fontSize: 12, marginTop: 6, color: l.rez ? (l.dupaNume ? '#FBBF24' : 'var(--text2)') : '#FBBF24' }}>
                  {l.rez
                    ? <>În aplicație: <b>{l.rez.nume_client}</b> · {l.rez.apartament?.nume || '—'} · {zz(l.rez.data_checkin)} → {zz(l.rez.data_checkout)}{l.dupaNume ? ' · găsită după nume + check-in, verifică dacă e aceeași' : ''}{l.stare === 'marcata' ? ' · era marcată „facturată” fără factură' : ''}</>
                    : 'Nu există în aplicație — se emite factura direct pe codul Airbnb.'}
                </div>
              </div>

              {aj.length > 0 && (
                <div style={{ fontSize: 12, color: '#FBBF24', lineHeight: 1.5 }}>
                  Ajustare Airbnb: {aj.map((a, i) => <span key={i}>{a.tip} {a.suma > 0 ? '+' : ''}{fmt(a.suma)} RON{a.detalii ? ` (${a.detalii})` : ''}; </span>)}
                  <button type="button" onClick={() => setFisa(f => f && { ...f, suma: String(Math.round((l.r.brut + aj.reduce((s, a) => s + a.suma, 0)) * 100) / 100) })} style={btn({ padding: '3px 9px', marginLeft: 6, color: '#FBBF24', borderColor: 'rgba(251,191,36,0.35)' })}>Include ajustarea → {fmt(Math.round((l.r.brut + aj.reduce((s, a) => s + a.suma, 0)) * 100) / 100)}</button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <label><span style={eticheta}>Suma de facturat (RON)</span><input data-suma inputMode="decimal" value={fisa.suma} onChange={e => setFisa(f => f && { ...f, suma: e.target.value })} style={camp} /></label>
                <label><span style={eticheta}>Data emiterii</span><input data-data type="date" value={fisa.data} min={ultimaRH || undefined} max={azi} onChange={e => setFisa(f => f && { ...f, data: e.target.value })} style={camp} /></label>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Domiciliul clientului <span style={{ fontWeight: 400, color: fisa.sursa.includes('verifică') || fisa.sursa.startsWith('necunoscut') ? '#FBBF24' : 'var(--text3)' }}>· {fisa.sursa}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                  <label><span style={eticheta}>Țara</span>
                    <select data-tara value={fisa.altaTara ? '__alta__' : (TARI.find(t => t.localeCompare(fisa.client.tara.trim(), 'ro', { sensitivity: 'base' }) === 0) || 'Romania')} style={camp}
                      onChange={e => { const v = e.target.value; if (v === '__alta__') { setFisa(f => f && { ...f, altaTara: true, client: { ...f.client, tara: '', judet: '', localitate: '' } }); return } setFisa(f => f && { ...f, altaTara: false, client: { ...f.client, tara: v, ...(v !== f.client.tara ? { judet: '', localitate: '' } : {}) } }) }}>
                      {TARI.map(t => <option key={t} value={t}>{t}</option>)}<option value="__alta__">Altă țară…</option>
                    </select>
                    {fisa.altaTara && <input value={fisa.client.tara} placeholder="scrie țara" onChange={e => setCl({ tara: e.target.value })} style={{ ...camp, marginTop: 6 }} />}
                  </label>
                  <label><span style={eticheta}>{eRo ? 'Județ' : 'Regiune / stat'}</span>
                    {eRo ? <select data-judet value={fisa.client.judet} onChange={e => setCl({ judet: e.target.value, localitate: '' })} style={camp}><option value="">— alege —</option>{JUDETE.map(j => <option key={j} value={j}>{j}</option>)}</select>
                      : <input value={fisa.client.judet} placeholder="opțional" onChange={e => setCl({ judet: e.target.value })} style={camp} />}
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}><span style={eticheta}>{eRo ? 'Localitate' : 'Oraș'}</span><input data-localitate list="cf-loc" value={fisa.client.localitate} onChange={e => setCl({ localitate: e.target.value })} placeholder={eRo ? 'ex. Pașcani' : 'orașul de domiciliu'} style={camp} /><datalist id="cf-loc">{sugestii.map(x => <option key={x} value={x} />)}</datalist></label>
                </div>
                {sugestii.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {sugestii.slice(0, 14).map(x => <button key={x} type="button" onClick={() => setCl({ localitate: x })} style={btn({ padding: '4px 9px', fontSize: 11, fontWeight: 500, ...(fisa.client.localitate.trim().localeCompare(x, 'ro', { sensitivity: 'base' }) === 0 ? { color: '#4ADE80', borderColor: 'rgba(34,197,94,0.45)' } : {}) })}>{x}</button>)}
                  </div>
                )}
                {fisa.verifica.length > 0 && <div style={{ fontSize: 11, color: '#FBBF24', marginTop: 6 }}>{fisa.verifica.join(' · ')}</div>}
              </div>

              {stare.eroare && <div data-eroare style={{ fontSize: 13, color: '#F87171' }}>⚠ {stare.eroare}</div>}
            </div>
          )}
        </div>

        {l && fisa && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(159,215,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" data-emite disabled={!!motiv || stare.trimit} onClick={() => void emite()} style={btn({ background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.45)', color: '#4ADE80', opacity: motiv || stare.trimit ? 0.5 : 1, cursor: motiv || stare.trimit ? 'default' : 'pointer' })}>
              {stare.trimit ? 'Se emite…' : `✓ Emite factura RH · ${suma > 0 ? fmt(suma) : '—'} RON`}
            </button>
            {linii && linii.length > 1 && <button type="button" data-sari onClick={() => urmatoarea(false)} disabled={stare.trimit} style={btn()}>Sari peste →</button>}
            {l.rez && <button type="button" onClick={() => { if (schimbat.current) onReload(); onDeschide(l.rez!.id) }} style={btn()} title="Fereastra completă (ex. factură pe firmă / PJ)">Deschide rezervarea</button>}
            <button type="button" data-nu-factura onClick={() => void nuSeFactureaza()} disabled={stare.trimit} style={btn({ marginLeft: 'auto', color: 'var(--text3)' })}>Nu se facturează</button>
            <div style={{ width: '100%', fontSize: 11, color: motiv ? '#FBBF24' : 'var(--text3)' }}>{motiv || 'Se trimite în SPV, nu se poate retrage. Enter ×2 = emite · Esc = închide'}</div>
          </div>
        )}
      </div>
    </div>
  )
}
