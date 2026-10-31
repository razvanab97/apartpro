'use client'
import { use, useEffect, useState } from 'react'

// Pagina proprietarului (link public /p/<token>, vezi lib/blocariProprietar.ts) - varianta simpla (cerut direct:
// „să poți alege datele direct, fără a se mai vedea calendarul; alegi apartamentul și ai funcția de blochează /
// deblochează”). Fiecare blocare / deblocare ne trimite notificare; zilele rezervate sunt refuzate cu mesaj clar.

type Blocare = { id: string; apt: string; de_la: string; pana_la: string; nota: string; al_meu: boolean }
type Date_ = { ok: boolean; error?: string; nume: string; azi: string; apartamente: { id: string; nume: string }[]; blocari: Blocare[] }

const C = { bg: '#F5F7FA', card: '#FFFFFF', ink: '#14213D', muted: '#6B7A90', line: '#E3E8EF', acc: '#C2410C', accBg: '#FFF4EC' }
const scurt = (n: string) => n.replace(/\s*by AB HOMES\s*/i, '').trim()
const ziRO = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const nopti = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1

// aplicatia blocheaza derularea documentului (html, body overflow hidden - globals.css) -> pagina are zona ei de derulare
const Ecran = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
  <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, color: C.ink, fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', ...style }}>{children}</div>

export default function PaginaProprietar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [d, setD] = useState<Date_ | null>(null)
  const [eroare, setEroare] = useState('')
  const [apt, setApt] = useState('')
  const [de, setDe] = useState('')
  const [pana, setPana] = useState('')
  const [nota, setNota] = useState('')
  const [lucru, setLucru] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // verificare pe loc: daca in perioada aleasa exista o rezervare / blocare, apare mesajul imediat (cerut direct)
  const [ocupat, setOcupat] = useState<{ cheie: string; mesaj: string } | null>(null)

  async function incarca() {
    try {
      const j = await (await fetch(`/api/proprietar/${token}`, { cache: 'no-store' })).json()
      if (!j.ok) { setEroare(j.error || 'Link invalid'); return }
      setD(j); setApt(a => a || (j.apartamente.length === 1 ? j.apartamente[0].id : ''))
    } catch { setEroare('Nu s-a putut încărca. Verifică internetul și reîncearcă.') }
  }
  useEffect(() => { incarca() }, [token])
  useEffect(() => {
    setOcupat(null)
    if (!apt || !de || !pana || pana < de) return
    const cheie = `${apt}|${de}|${pana}`, ctrl = new AbortController()
    fetch(`/api/proprietar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ actiune: 'verifica', apt, de_la: de, pana_la: pana }) })
      .then(r => r.json()).then(j => setOcupat({ cheie, mesaj: j.ok ? (j.liber ? '' : j.mesaj) : (j.error || '') })).catch(() => {})
    return () => ctrl.abort()
  }, [apt, de, pana, token])

  async function trimite(corp: any, ok: string) {
    setLucru(true); setMesaj('')
    try {
      const j = await (await fetch(`/api/proprietar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corp) })).json()
      if (!j.ok) setMesaj('⚠ ' + (j.error || 'Eroare'))
      else { setMesaj(ok); setDe(''); setPana(''); setNota(''); setConfirmId(null); await incarca() }
    } catch { setMesaj('⚠ Nu s-a putut salva. Verifică internetul.') }
    setLucru(false)
  }

  if (eroare) return <Ecran style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 34 }}>🔒</div><div style={{ fontWeight: 700, marginTop: 6 }}>{eroare}</div></div></Ecran>
  if (!d) return <Ecran style={{ display: 'grid', placeItems: 'center', color: C.muted }}>Se încarcă…</Ecran>

  const ocupatMesaj = ocupat && ocupat.cheie === `${apt}|${de}|${pana}` ? ocupat.mesaj : ''
  const greseala = !apt ? 'Alege apartamentul.' : !de || !pana ? 'Alege prima și ultima zi.' : pana < de ? 'Ultima zi trebuie să fie după prima zi.' : ocupatMesaj ? 'Alege alte zile' : ''
  const ale = d.blocari.filter(b => b.al_meu && b.pana_la >= d.azi && (!apt || b.apt === apt)).sort((x, y) => x.de_la.localeCompare(y.de_la))
  const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }
  const camp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 12px', fontSize: 16, color: C.ink, background: '#fff', fontFamily: 'inherit', minHeight: 48 }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 14 }

  return (
    <Ecran>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '22px 16px 40px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' }}>AB Homes · proprietar</div>
        <h1 style={{ margin: '4px 0 4px', fontSize: 24, lineHeight: 1.2 }}>Blochează zile</h1>
        <div style={{ fontSize: 14.5, color: C.muted, marginBottom: 18 }}>Bună, {d.nume}! Alege apartamentul și perioada în care nu vrei să fie închiriat.</div>

        <div style={card}>
          <span style={label}>Apartamentul</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(d.apartamente.length, 3)},1fr)`, gap: 8, marginBottom: 16 }}>
            {d.apartamente.map(a => (
              <button key={a.id} data-apt={a.id} onClick={() => { setApt(a.id); setMesaj(''); setConfirmId(null) }}
                style={{ padding: '13px 10px', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${apt === a.id ? C.acc : C.line}`, background: apt === a.id ? C.accBg : '#fff', color: apt === a.id ? C.acc : C.ink }}>
                {scurt(a.nume)}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <label><span style={label}>Prima zi</span>
              <input type="date" data-camp="de" value={de} min={d.azi} onChange={e => { setDe(e.target.value); setMesaj(''); if (pana && e.target.value > pana) setPana('') }} style={camp} /></label>
            <label><span style={label}>Ultima zi</span>
              <input type="date" data-camp="pana" value={pana} min={de || d.azi} onChange={e => { setPana(e.target.value); setMesaj('') }} style={camp} /></label>
          </div>
          <label><span style={label}>Motiv (opțional)</span>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="ex. vin eu în vizită" maxLength={200} style={{ ...camp, marginBottom: 14 }} /></label>

          {de && pana && pana >= de && <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>{ziRO(de)} – {ziRO(pana)} · <b style={{ color: C.ink }}>{nopti(de, pana)} {nopti(de, pana) === 1 ? 'noapte' : 'nopți'}</b></div>}
          {ocupatMesaj && <div data-ocupat style={{ marginBottom: 10, padding: '11px 12px', borderRadius: 10, fontSize: 14.5, fontWeight: 700, lineHeight: 1.4, background: '#FEE4E2', color: '#B42318' }}>⚠ {ocupatMesaj}</div>}
          <button disabled={!!greseala || lucru} onClick={() => trimite({ actiune: 'blocheaza', apt, de_la: de, pana_la: pana, nota }, '✓ Zilele au fost blocate. Echipa AB Homes a fost anunțată.')}
            style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 800, cursor: greseala ? 'default' : 'pointer', fontFamily: 'inherit',
              background: greseala ? '#E9EDF2' : C.acc, color: greseala ? C.muted : '#fff', opacity: lucru ? 0.6 : 1 }}>
            {lucru ? 'Se salvează…' : greseala || '🔒 Blochează'}
          </button>
          {mesaj && <div data-mesaj style={{ marginTop: 12, padding: '11px 12px', borderRadius: 10, fontSize: 14.5, fontWeight: 600, lineHeight: 1.4,
            background: mesaj.startsWith('⚠') ? '#FEE4E2' : '#DCFCE7', color: mesaj.startsWith('⚠') ? '#B42318' : '#166534' }}>{mesaj}</div>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Zile blocate de dvs.{apt ? ` · ${scurt(d.apartamente.find(a => a.id === apt)?.nume || '')}` : ''}</div>
          {ale.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>Nicio perioadă blocată.</div> : ale.map(b => (
            <div key={b.id} data-blocare style={{ borderTop: `1px solid ${C.line}`, padding: '11px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>🔒 {ziRO(b.de_la)} – {ziRO(b.pana_la)}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{!apt && `${scurt(d.apartamente.find(a => a.id === b.apt)?.nume || '')} · `}{nopti(b.de_la, b.pana_la)} {nopti(b.de_la, b.pana_la) === 1 ? 'noapte' : 'nopți'}{b.nota ? ` · ${b.nota}` : ''}</div>
              </div>
              {confirmId === b.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setConfirmId(null)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>Nu</button>
                  <button disabled={lucru} onClick={() => trimite({ actiune: 'deblocheaza', id: b.id }, '✓ Zilele au fost deblocate.')} style={{ padding: '9px 12px', borderRadius: 10, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Da, deblochează</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(b.id)} style={{ padding: '9px 14px', borderRadius: 10, border: `1.5px solid ${C.ink}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>🔓 Deblochează</button>
              )}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: C.muted }}>Întrebări? WhatsApp / telefon: +40 712 290 109</div>
      </div>
    </Ecran>
  )
}
