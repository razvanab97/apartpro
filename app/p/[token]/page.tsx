'use client'
import { use, useEffect, useState } from 'react'

// Pagina proprietarului (link public /p/<token>, vezi lib/blocariProprietar.ts). Varianta simpla (cerut direct: „alegi
// apartamentul și ai funcția de blochează / deblochează”), in tema AB Homes futurista (ca la confirmarea pentru client:
// bleumarin, sky → violet, Space Grotesk) + selector de perioada mare, cu calendar propriu (cerut direct: „selectarea
// datelor să fie mai ușoară, iar calendarul mai mare și mai de efect”). Calendarul NU arata rezervarile - doar alegi
// zilele; daca e ceva rezervat apare imediat „Există rezervare pentru perioada …”.

type Blocare = { id: string; apt: string; de_la: string; pana_la: string; nota: string; al_meu: boolean }
type Date_ = { ok: boolean; error?: string; nume: string; azi: string; apartamente: { id: string; nume: string }[]; blocari: Blocare[] }

const LUNI = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
const ZS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']
const scurt = (n: string) => n.replace(/\s*by AB HOMES\s*/i, '').trim()
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const ziRO = (s: string, an = false) => new Date(s + 'T12:00:00Z').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', ...(an ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const nopti = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1
const nTxt = (n: number) => `${n} ${n === 1 ? 'noapte' : 'nopți'}`

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
.abp{--bg:#050A14;--panel:rgba(14,26,46,.62);--line:rgba(125,211,252,.16);--ink:#E8F4FF;--dim:rgba(186,214,255,.62);--sky:#38BDF8;--vio:#8B5CF6;--glow:0 0 0 1px rgba(56,189,248,.45),0 8px 30px rgba(56,189,248,.25);
  position:fixed;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--ink);font-family:'Space Grotesk',system-ui,-apple-system,sans-serif;
  background:radial-gradient(900px 520px at 85% -10%,rgba(139,92,246,.22),transparent 60%),radial-gradient(800px 500px at -10% 20%,rgba(56,189,248,.16),transparent 60%),var(--bg)}
.abp::before{content:'';position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(125,211,252,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(125,211,252,.05) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,#000,transparent 75%)}
.abp *{box-sizing:border-box}
.abp .wrap{position:relative;max-width:540px;margin:0 auto;padding:22px 16px 48px}
.abp .mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.abp .card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 20px 50px rgba(0,0,0,.35)}
.abp .lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.abp .grad{background:linear-gradient(90deg,#7DD3FC,#C4B5FD);-webkit-background-clip:text;background-clip:text;color:transparent}
.abp .apt{position:relative;padding:16px 12px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink);font:700 17px 'Space Grotesk',sans-serif;cursor:pointer;transition:all .2s}
.abp .apt.on{border-color:transparent;background:linear-gradient(135deg,rgba(56,189,248,.22),rgba(139,92,246,.22));box-shadow:var(--glow)}
.abp .apt small{display:block;font:500 11px 'JetBrains Mono',monospace;color:var(--dim);margin-top:4px;letter-spacing:.06em}
.abp .per{width:100%;display:flex;align-items:center;gap:12px;padding:16px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink);cursor:pointer;text-align:left;font-family:inherit;transition:all .2s}
.abp .per:hover,.abp .per.on{box-shadow:var(--glow);border-color:transparent}
.abp .inp{width:100%;border:1px solid var(--line);border-radius:14px;padding:13px 14px;font:500 16px 'Space Grotesk',sans-serif;color:var(--ink);background:rgba(255,255,255,.03);outline:none}
.abp .inp:focus{box-shadow:var(--glow);border-color:transparent}
.abp .inp::placeholder{color:rgba(186,214,255,.35)}
.abp .cta{width:100%;padding:17px;border-radius:16px;border:none;font:700 17px 'Space Grotesk',sans-serif;cursor:pointer;color:#fff;background:linear-gradient(135deg,#0EA5E9,#7C3AED);box-shadow:0 10px 30px rgba(124,58,237,.35);transition:transform .15s,opacity .2s}
.abp .cta:active{transform:scale(.985)}
.abp .cta:disabled{background:rgba(255,255,255,.06);color:var(--dim);box-shadow:none;cursor:default}
.abp .msg{margin-top:12px;padding:12px 14px;border-radius:14px;font-size:14.5px;font-weight:600;line-height:1.45}
.abp .err{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);color:#FCA5A5}
.abp .ok{background:rgba(74,222,128,.10);border:1px solid rgba(74,222,128,.35);color:#86EFAC}
.abp .ghost{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font:700 14px 'Space Grotesk',sans-serif;cursor:pointer}
.abp .sheetbg{position:fixed;inset:0;background:rgba(2,6,14,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:20;display:flex;align-items:flex-end;justify-content:center;animation:abfade .2s ease}
.abp .sheet{width:100%;max-width:560px;max-height:94vh;overflow-y:auto;background:linear-gradient(180deg,#0B1730,#070F1F);border:1px solid var(--line);border-bottom:none;border-radius:26px 26px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 60px rgba(56,189,248,.18);animation:abup .28s cubic-bezier(.2,.8,.2,1)}
@media(min-width:640px){.abp .sheetbg{align-items:center}.abp .sheet{border-radius:26px;border-bottom:1px solid var(--line)}}
.abp .nav{width:44px;height:44px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font-size:22px;cursor:pointer}
.abp .nav:disabled{opacity:.25;cursor:default}
.abp .grid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:6px}
.abp .dow{text-align:center;font:700 11px 'JetBrains Mono',monospace;color:var(--dim);letter-spacing:.06em;padding:4px 0 8px}
.abp .z{position:relative;height:52px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.abp .z span{position:relative;z-index:1;width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font:600 18px 'Space Grotesk',sans-serif;color:var(--ink);transition:background .15s,box-shadow .15s}
.abp .z:hover span{background:rgba(125,211,252,.10)}
.abp .z.trecut{cursor:default}.abp .z.trecut span{color:rgba(186,214,255,.22);background:none}
.abp .z.azi span{box-shadow:inset 0 0 0 1.5px rgba(125,211,252,.55)}
.abp .z.in::before{content:'';position:absolute;inset:3px 0;background:linear-gradient(90deg,rgba(56,189,248,.20),rgba(139,92,246,.20))}
.abp .z.start::before{left:50%}.abp .z.end::before{right:50%}.abp .z.start.end::before{display:none}
.abp .z.start span,.abp .z.end span{background:linear-gradient(135deg,#0EA5E9,#7C3AED);color:#fff;font-weight:700;box-shadow:0 6px 22px rgba(124,58,237,.55),0 0 0 1px rgba(255,255,255,.18) inset}
.abp .z.prev span{background:rgba(139,92,246,.18)}
@keyframes abup{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes abfade{from{opacity:0}to{opacity:1}}
`

function Calendar({ azi, de, pana, onAlege }: { azi: string; de: string; pana: string; onAlege: (de: string, pana: string) => void }) {
  const start = de || azi
  const [luna, setLuna] = useState({ y: +start.slice(0, 4), m: +start.slice(5, 7) - 1 })
  const [hover, setHover] = useState('')
  const zile = new Date(Date.UTC(luna.y, luna.m + 1, 0)).getUTCDate()
  const gol = (new Date(Date.UTC(luna.y, luna.m, 1)).getUTCDay() + 6) % 7
  const lunaAzi = luna.y === +azi.slice(0, 4) && luna.m === +azi.slice(5, 7) - 1
  const muta = (k: number) => setLuna(l => { const t = new Date(Date.UTC(l.y, l.m + k, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() } })
  // previzualizare pe hover dupa ce ai ales prima zi (desktop)
  const capat = pana || (de && hover >= de ? hover : '')
  function apasa(zi: string) {
    if (zi < azi) return
    if (!de || pana || zi < de) onAlege(zi, '')
    else onAlege(de, zi)
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="nav" onClick={() => muta(-1)} disabled={lunaAzi} aria-label="Luna precedentă">‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.01em' }}>{LUNI[luna.m]}</div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--dim)', letterSpacing: '.2em' }}>{luna.y}</div>
        </div>
        <button className="nav" onClick={() => muta(1)} aria-label="Luna următoare">›</button>
      </div>
      <div className="grid" onMouseLeave={() => setHover('')}>
        {ZS.map(z => <div key={z} className="dow">{z}</div>)}
        {Array.from({ length: gol }, (_, i) => <div key={'g' + i} />)}
        {Array.from({ length: zile }, (_, i) => {
          const zi = iso(luna.y, luna.m, i + 1), trecut = zi < azi
          const st = !!de && zi === de, en = !!capat && zi === capat
          const inn = !!de && !!capat && de <= zi && zi <= capat
          const cls = ['z', trecut && 'trecut', zi === azi && 'azi', inn && 'in', st && 'start', (en || (st && !capat)) && 'end', inn && !pana && !st && !en && 'prev'].filter(Boolean).join(' ')
          return <div key={zi} className={cls} data-zi={zi} onClick={() => apasa(zi)} onMouseEnter={() => setHover(zi)}><span>{i + 1}</span></div>
        })}
      </div>
    </div>
  )
}

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
  const [deschis, setDeschis] = useState(false)
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

  if (eroare) return <div className="abp"><style>{CSS}</style><div className="wrap" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh', textAlign: 'center' }}><div><div style={{ fontSize: 40 }}>🔒</div><div style={{ fontWeight: 700, marginTop: 8, fontSize: 18 }}>{eroare}</div></div></div></div>
  if (!d) return <div className="abp"><style>{CSS}</style><div className="wrap mono" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh', color: 'var(--dim)', letterSpacing: '.2em', fontSize: 12 }}>SE ÎNCARCĂ…</div></div>

  const ocupatMesaj = ocupat && ocupat.cheie === `${apt}|${de}|${pana}` ? ocupat.mesaj : ''
  const greseala = !apt ? 'Alege apartamentul' : !de || !pana ? 'Alege perioada' : ocupatMesaj ? 'Alege alte zile' : ''
  const ale = d.blocari.filter(b => b.al_meu && b.pana_la >= d.azi && (!apt || b.apt === apt)).sort((x, y) => x.de_la.localeCompare(y.de_la))
  const numeApt = (id: string) => scurt(d.apartamente.find(a => a.id === id)?.nume || '')

  return (
    <div className="abp">
      <style>{CSS}</style>
      <div className="wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="AB Homes" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', boxShadow: '0 0 0 1px rgba(125,211,252,.3),0 6px 20px rgba(56,189,248,.25)' }} />
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '.22em', color: 'var(--dim)' }}>AB HOMES · PROPRIETAR</div>
            <div style={{ fontSize: 13, color: 'var(--dim)' }}>Bună, <b style={{ color: 'var(--ink)' }}>{d.nume}</b> 👋</div>
          </div>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-.02em' }}><span className="grad">Blochează zile</span></h1>
        <p style={{ margin: '0 0 22px', fontSize: 15, color: 'var(--dim)', lineHeight: 1.5 }}>Alege apartamentul și perioada în care nu vrei să fie închiriat. Echipa AB Homes e anunțată automat.</p>

        <div className="card" style={{ marginBottom: 16 }}>
          <span className="lbl">01 · Apartamentul</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(d.apartamente.length, 3)},1fr)`, gap: 10, marginBottom: 20 }}>
            {d.apartamente.map(a => (
              <button key={a.id} data-apt={a.id} className={'apt' + (apt === a.id ? ' on' : '')} onClick={() => { setApt(a.id); setMesaj(''); setConfirmId(null) }}>
                {scurt(a.nume)}<small>{apt === a.id ? '● SELECTAT' : 'APARTAMENT'}</small>
              </button>
            ))}
          </div>

          <span className="lbl">02 · Perioada</span>
          <button data-perioada className={'per' + (de ? ' on' : '')} onClick={() => { setDeschis(true); setMesaj('') }} style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 24 }}>🗓️</span>
            <span style={{ flex: 1 }}>
              {de && pana
                ? <><span style={{ display: 'block', fontWeight: 700, fontSize: 17 }}>{ziRO(de)} → {ziRO(pana)}</span><span className="mono" style={{ fontSize: 12, color: 'var(--dim)' }}>{nTxt(nopti(de, pana))} · {de.slice(0, 4)}</span></>
                : <><span style={{ display: 'block', fontWeight: 700, fontSize: 17 }}>Alege zilele</span><span style={{ fontSize: 13, color: 'var(--dim)' }}>prima zi și ultima noapte blocată</span></>}
            </span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--sky)' }}>{de && pana ? 'SCHIMBĂ' : 'DESCHIDE'} ›</span>
          </button>

          <span className="lbl">03 · Motiv <span style={{ textTransform: 'none', letterSpacing: 0 }}>(opțional)</span></span>
          <input className="inp" value={nota} onChange={e => setNota(e.target.value)} placeholder="ex. vin eu în vizită" maxLength={200} style={{ marginBottom: 18 }} />

          {ocupatMesaj && <div data-ocupat className="msg err" style={{ marginTop: 0, marginBottom: 12 }}>⚠ {ocupatMesaj}</div>}
          <button className="cta" disabled={!!greseala || lucru} onClick={() => trimite({ actiune: 'blocheaza', apt, de_la: de, pana_la: pana, nota }, '✓ Zilele au fost blocate. Echipa AB Homes a fost anunțată.')}>
            {lucru ? 'Se salvează…' : greseala || `🔒 Blochează ${numeApt(apt)}`}
          </button>
          {mesaj && <div data-mesaj className={'msg ' + (mesaj.startsWith('⚠') ? 'err' : 'ok')}>{mesaj}</div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Zile blocate de dvs.</span>
            {apt && <span className="mono" style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.12em' }}>{numeApt(apt).toUpperCase()}</span>}
          </div>
          {ale.length === 0 ? <div style={{ fontSize: 14, color: 'var(--dim)' }}>Nicio perioadă blocată.</div> : ale.map(b => (
            <div key={b.id} data-blocare style={{ borderTop: '1px solid var(--line)', padding: '13px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,rgba(56,189,248,.18),rgba(139,92,246,.22))', border: '1px solid var(--line)' }}>🔒</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{ziRO(b.de_la, true)} → {ziRO(b.pana_la, true)}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--dim)' }}>{!apt && `${numeApt(b.apt)} · `}{nTxt(nopti(b.de_la, b.pana_la))}{b.nota ? ` · ${b.nota}` : ''}</div>
              </div>
              {confirmId === b.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="ghost" onClick={() => setConfirmId(null)}>Nu</button>
                  <button className="ghost" disabled={lucru} onClick={() => trimite({ actiune: 'deblocheaza', id: b.id }, '✓ Zilele au fost deblocate.')} style={{ background: 'linear-gradient(135deg,#0EA5E9,#7C3AED)', border: 'none', color: '#fff' }}>Da, deblochează</button>
                </div>
              ) : <button className="ghost" onClick={() => setConfirmId(b.id)}>🔓 Deblochează</button>}
            </div>
          ))}
        </div>
        <div className="mono" style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--dim)', marginTop: 18, letterSpacing: '.06em' }}>ÎNTREBĂRI? WHATSAPP / TELEFON · +40 712 290 109</div>
      </div>

      {deschis && (
        <div className="sheetbg" onClick={() => setDeschis(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Alege perioada">
            <div style={{ width: 44, height: 5, borderRadius: 3, background: 'rgba(125,211,252,.25)', margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--dim)' }}>{apt ? numeApt(apt).toUpperCase() : 'PERIOADA'}</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{!de ? 'Atinge prima zi' : !pana ? 'Acum atinge ultima noapte' : 'Perioada aleasă'}</div>
              </div>
              <button className="ghost" onClick={() => setDeschis(false)} aria-label="Închide" style={{ padding: '8px 12px' }}>✕</button>
            </div>
            <Calendar azi={d.azi} de={de} pana={pana} onAlege={(a, b) => { setDe(a); setPana(b); setMesaj('') }} />
            <div style={{ marginTop: 14, padding: '14px', borderRadius: 16, border: '1px solid var(--line)', background: 'rgba(255,255,255,.03)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.16em', color: 'var(--dim)' }}>DE LA → PÂNĂ LA</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{de ? ziRO(de) : '—'} → {pana ? ziRO(pana) : '—'}</div>
              </div>
              {de && pana && <div className="mono" style={{ padding: '6px 10px', borderRadius: 10, background: 'linear-gradient(135deg,rgba(56,189,248,.2),rgba(139,92,246,.25))', fontSize: 13, fontWeight: 700 }}>{nTxt(nopti(de, pana))}</div>}
            </div>
            {ocupatMesaj && <div data-ocupat-sheet className="msg err">⚠ {ocupatMesaj}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {(de || pana) && <button className="ghost" onClick={() => { setDe(''); setPana('') }} style={{ flex: 1 }}>Resetează</button>}
              <button data-confirma className="cta" disabled={!de || !pana} onClick={() => setDeschis(false)} style={{ flex: 2, padding: 15 }}>{de && pana ? 'Confirmă perioada' : 'Alege ambele zile'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
