'use client'
import { use, useEffect, useMemo, useState } from 'react'

// Calendarul proprietarului (link public /p/<token>, vezi lib/blocariProprietar.ts): vede rezervarile apartamentelor
// lui si poate bloca / debloca zile libere. Fiecare blocare ne trimite notificare. Simplu, pe telefon.

type Date_ = { ok: boolean; error?: string; nume: string; azi: string; apartamente: { id: string; nume: string }[]
  rezervari: { apt: string; ci: string; co: string }[]; blocari: { id: string; apt: string; de_la: string; pana_la: string; nota: string; al_meu: boolean }[] }

const LUNI = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
const ZS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const iso = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m, d)); return t.toISOString().slice(0, 10) }
const ziScurt = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const nopti = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1
const C = { bg: '#F5F7FA', card: '#FFFFFF', ink: '#14213D', muted: '#6B7A90', line: '#E3E8EF', rez: '#2563EB', rezBg: '#DBE7FE', bl: '#C2410C', blBg: '#FFEDD5', alt: '#9AA5B5', sel: '#7C3AED', selBg: '#EDE4FF' }

// aplicatia blocheaza derularea documentului (html, body overflow hidden - globals.css) -> pagina are zona ei de derulare
const Ecran = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
  <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, color: C.ink, fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', ...style }}>{children}</div>

export default function CalendarProprietar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [d, setD] = useState<Date_ | null>(null)
  const [eroare, setEroare] = useState('')
  const [luna, setLuna] = useState<{ y: number; m: number } | null>(null)
  const [sel, setSel] = useState<{ apt: string; de: string; pana: string | null } | null>(null)
  const [deblocare, setDeblocare] = useState<Date_['blocari'][number] | null>(null)
  const [nota, setNota] = useState('')
  const [lucru, setLucru] = useState(false)
  const [mesaj, setMesaj] = useState('')

  async function incarca() {
    try {
      const r = await fetch(`/api/proprietar/${token}`, { cache: 'no-store' }); const j = await r.json()
      if (!j.ok) { setEroare(j.error || 'Link invalid'); return }
      setD(j); setLuna(l => l || { y: +j.azi.slice(0, 4), m: +j.azi.slice(5, 7) - 1 })
    } catch { setEroare('Nu s-a putut încărca. Verifică internetul și reîncearcă.') }
  }
  useEffect(() => { incarca() }, [token])

  const stare = useMemo(() => {
    const f = (apt: string, zi: string) => {
      if (d?.rezervari.some(r => r.apt === apt && r.ci <= zi && zi < r.co)) return { tip: 'rez' as const }
      const b = d?.blocari.find(x => x.apt === apt && x.de_la <= zi && zi <= x.pana_la)
      if (b) return { tip: b.al_meu ? 'bl' as const : 'alt' as const, b }
      return { tip: 'liber' as const }
    }
    return f
  }, [d])

  function apasa(apt: string, zi: string) {
    if (!d || zi < d.azi) return
    setMesaj('')
    const s = stare(apt, zi)
    if (s.tip === 'bl') { setSel(null); setDeblocare(s.b!); return }
    if (s.tip !== 'liber') { setMesaj(s.tip === 'rez' ? 'Ziua e rezervată.' : 'Ziua e deja blocată.'); return }
    setDeblocare(null)
    if (!sel || sel.apt !== apt || sel.pana || zi < sel.de) { setSel({ apt, de: zi, pana: null }); return }
    // toate noptile dintre ele trebuie sa fie libere
    for (let x = sel.de; x <= zi; x = iso(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8) + 1))
      if (stare(apt, x).tip !== 'liber') { setMesaj('Între cele două zile există zile ocupate — alege doar zile libere.'); setSel({ apt, de: zi, pana: null }); return }
    setSel({ ...sel, pana: zi })
  }

  async function trimite(corp: any, ok: string) {
    setLucru(true); setMesaj('')
    try {
      const r = await fetch(`/api/proprietar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corp) })
      const j = await r.json()
      if (!j.ok) setMesaj('⚠ ' + (j.error || 'Eroare')); else { setMesaj(ok); setSel(null); setDeblocare(null); setNota(''); await incarca() }
    } catch { setMesaj('⚠ Nu s-a putut salva. Verifică internetul.') }
    setLucru(false)
  }

  if (eroare) return <Ecran style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 34 }}>🔒</div><div style={{ fontWeight: 700, marginTop: 6 }}>{eroare}</div></div></Ecran>
  if (!d || !luna) return <Ecran style={{ display: 'grid', placeItems: 'center', color: C.muted }}>Se încarcă calendarul…</Ecran>

  const zileLuna = new Date(Date.UTC(luna.y, luna.m + 1, 0)).getUTCDate()
  const primaZi = (new Date(Date.UTC(luna.y, luna.m, 1)).getUTCDay() + 6) % 7
  const schimba = (k: number) => setLuna(l => { const t = new Date(Date.UTC(l!.y, l!.m + k, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() } })
  const lunaAzi = luna.y === +d.azi.slice(0, 4) && luna.m === +d.azi.slice(5, 7) - 1
  const numeApt = (id: string) => d.apartamente.find(a => a.id === id)?.nume || ''
  const btn: React.CSSProperties = { border: `1px solid ${C.line}`, background: C.card, color: C.ink, borderRadius: 10, padding: '8px 14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }

  return (
    <Ecran style={{ paddingBottom: sel?.pana || deblocare ? 230 : 40 }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase' }}>AB Homes · calendar proprietar</div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 23, lineHeight: 1.2 }}>{d.apartamente.map(a => a.nume.replace(/\s*by AB HOMES\s*/i, '')).join(' & ')}</h1>
        <div style={{ fontSize: 14, color: C.muted }}>Bună, {d.nume}! Atinge o zi liberă de început, apoi ultima noapte, ca să blochezi perioada.</div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '14px 0 10px', fontSize: 12.5, color: C.muted }}>
          <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.rezBg, border: `1px solid ${C.rez}`, verticalAlign: -1, marginRight: 5 }} />Rezervat</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.blBg, border: `1px solid ${C.bl}`, verticalAlign: -1, marginRight: 5 }} />Blocat de dvs.</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#EEF1F5', border: `1px solid ${C.alt}`, verticalAlign: -1, marginRight: 5 }} />Indisponibil</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.card, border: `1px solid ${C.line}`, verticalAlign: -1, marginRight: 5 }} />Liber</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px' }}>
          <button onClick={() => schimba(-1)} style={btn} aria-label="Luna precedentă">‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 18 }}>{LUNI[luna.m]} {luna.y}</div>
          <button onClick={() => schimba(1)} style={btn} aria-label="Luna următoare">›</button>
        </div>
        {!lunaAzi && <div style={{ textAlign: 'center', marginTop: -6, marginBottom: 10 }}><button onClick={() => setLuna({ y: +d.azi.slice(0, 4), m: +d.azi.slice(5, 7) - 1 })} style={{ ...btn, fontSize: 12.5, padding: '5px 10px' }}>Luna curentă</button></div>}

        {mesaj && <div style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: mesaj.startsWith('⚠') ? '#FEE4E2' : mesaj.startsWith('✓') ? '#DCFCE7' : '#EEF1F5', color: mesaj.startsWith('⚠') ? '#B42318' : mesaj.startsWith('✓') ? '#166534' : C.ink }}>{mesaj}</div>}

        {d.apartamente.map(a => (
          <div key={a.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 14, boxShadow: '0 1px 2px rgba(20,33,61,.04)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{a.nume.replace(/\s*by AB HOMES\s*/i, '')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {ZS.map((z, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.muted, paddingBottom: 2 }}>{z}</div>)}
              {Array.from({ length: primaZi }, (_, i) => <div key={'g' + i} />)}
              {Array.from({ length: zileLuna }, (_, i) => {
                const zi = iso(luna.y, luna.m, i + 1), s = stare(a.id, zi), trecut = zi < d.azi
                const inSel = sel?.apt === a.id && (sel.pana ? sel.de <= zi && zi <= sel.pana : sel.de === zi)
                const st = inSel ? { bg: C.selBg, bd: C.sel, c: C.sel } : s.tip === 'rez' ? { bg: C.rezBg, bd: C.rez, c: C.rez } : s.tip === 'bl' ? { bg: C.blBg, bd: C.bl, c: C.bl } : s.tip === 'alt' ? { bg: '#EEF1F5', bd: C.alt, c: C.muted } : { bg: C.card, bd: C.line, c: C.ink }
                return (
                  <button key={zi} data-zi={zi} data-apt={a.id} data-stare={inSel ? 'selectat' : s.tip} onClick={() => apasa(a.id, zi)} disabled={trecut}
                    title={s.tip === 'rez' ? 'Rezervat' : s.tip === 'bl' ? 'Blocat de dvs. — atinge pentru deblocare' : s.tip === 'alt' ? 'Indisponibil' : 'Liber'}
                    style={{ aspectRatio: '1 / 1', minHeight: 38, borderRadius: 9, border: `1.5px solid ${st.bd}`, background: st.bg, color: st.c, fontSize: 14, fontWeight: s.tip === 'liber' && !inSel ? 500 : 800, cursor: trecut ? 'default' : 'pointer', opacity: trecut ? 0.38 : 1, padding: 0, position: 'relative', outline: zi === d.azi ? `2px solid ${C.ink}` : 'none', outlineOffset: 1 }}>
                    {i + 1}
                    {s.tip === 'bl' && <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 8 }}>🔒</span>}
                  </button>
                )
              })}
            </div>
            {d.blocari.filter(b => b.apt === a.id && b.al_meu && b.pana_la >= d.azi).length > 0 && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Perioadele blocate de dvs.</div>
                {d.blocari.filter(b => b.apt === a.id && b.al_meu && b.pana_la >= d.azi).sort((x, y) => x.de_la.localeCompare(y.de_la)).map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ flex: 1 }}>🔒 {ziScurt(b.de_la)} – {ziScurt(b.pana_la)} <span style={{ color: C.muted }}>({nopti(b.de_la, b.pana_la)} {nopti(b.de_la, b.pana_la) === 1 ? 'noapte' : 'nopți'}){b.nota ? ` · ${b.nota}` : ''}</span></span>
                    <button onClick={() => { setSel(null); setDeblocare(b) }} style={{ ...btn, fontSize: 12.5, padding: '5px 10px', color: C.bl }}>Deblochează</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 8 }}>Întrebări? WhatsApp / telefon: +40 712 290 109</div>
      </div>

      {(sel?.pana || deblocare) && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`, boxShadow: '0 -8px 24px rgba(20,33,61,.12)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            {sel?.pana ? <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Blochează {numeApt(sel.apt).replace(/\s*by AB HOMES\s*/i, '')}</div>
              <div style={{ fontSize: 14, color: C.muted, margin: '2px 0 10px' }}>{ziScurt(sel.de)} – {ziScurt(sel.pana)} · {nopti(sel.de, sel.pana)} {nopti(sel.de, sel.pana) === 1 ? 'noapte' : 'nopți'}</div>
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Motiv (opțional), ex. vin eu în vizită" maxLength={200}
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 12px', fontSize: 16, marginBottom: 10, color: C.ink, background: '#fff' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSel(null)} style={{ ...btn, flex: 1, fontSize: 15 }}>Renunță</button>
                <button disabled={lucru} onClick={() => trimite({ actiune: 'blocheaza', apt: sel.apt, de_la: sel.de, pana_la: sel.pana, nota }, '✓ Perioada a fost blocată. Echipa AB Homes a fost anunțată.')}
                  style={{ ...btn, flex: 2, fontSize: 15, background: C.bl, borderColor: C.bl, color: '#fff', opacity: lucru ? 0.6 : 1 }}>{lucru ? 'Se salvează…' : '🔒 Blochează'}</button>
              </div>
            </> : deblocare && <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Deblochezi {numeApt(deblocare.apt).replace(/\s*by AB HOMES\s*/i, '')}?</div>
              <div style={{ fontSize: 14, color: C.muted, margin: '2px 0 12px' }}>{ziScurt(deblocare.de_la)} – {ziScurt(deblocare.pana_la)} · zilele redevin libere pentru rezervări</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDeblocare(null)} style={{ ...btn, flex: 1, fontSize: 15 }}>Renunță</button>
                <button disabled={lucru} onClick={() => trimite({ actiune: 'deblocheaza', id: deblocare.id }, '✓ Perioada a fost deblocată.')}
                  style={{ ...btn, flex: 2, fontSize: 15, background: C.ink, borderColor: C.ink, color: '#fff', opacity: lucru ? 0.6 : 1 }}>{lucru ? 'Se salvează…' : '🔓 Deblochează'}</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </Ecran>
  )
}
