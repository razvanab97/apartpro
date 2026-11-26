'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import { TARI } from '@/lib/tariOrase'
import { JUDETE } from '@/lib/judete'
import { localitatiJudet } from '@/lib/locatii-romania'

// Oferta de rezervare trimisa clientului (link public /o/<token>, vezi lib/ofertaLink.ts) - clientul vede oferta,
// completeaza datele (ca la 5starDesk: nume, contact, act, domiciliu, auto, GDPR, semnatura) si confirma rezervarea.
// Aceeasi tema ca pagina proprietarului (/p/<token>): bleumarin, sky → violet, Space Grotesk.

type Info = { ok: boolean; error?: string; stare: 'trimisa' | 'confirmata' | 'anulata' | 'expirata'; apartament: string; checkin: string; checkout: string; nopti: number
  adulti: number; copii: number; total: number; moneda: string; expira: string; limba: 'ro' | 'en'; nota: string; salut: string; oraCi: string; oraCo: string }
type L = 'ro' | 'en'

const TXT = {
  ro: { titlu: 'Ofertă de rezervare', sosire: 'Sosire', plecare: 'Plecare', nopti: (n: number) => n === 1 ? '1 noapte' : `${n} nopți`, dupa: 'de la', pana: 'până la',
    pers: (a: number, c: number) => `${a} ${a === 1 ? 'adult' : 'adulți'}${c ? `, ${c} ${c === 1 ? 'copil' : 'copii'}` : ''}`, total: 'Total', peNoapte: 'pe noapte',
    valabil: 'Oferta este valabilă până la', intro: 'Completați datele de mai jos și rezervarea se înregistrează imediat.', salut: (n: string) => `Bună ziua, ${n}!`,
    s1: 'Datele dumneavoastră', s2: 'Act de identitate', s3: 'Domiciliu', s4: 'Autoturism', s5: 'Semnătură online',
    nume: 'Nume și prenume', email: 'Email', tel: 'Telefon', tara: 'Țara', ci: 'Buletin (CI)', pas: 'Pașaport', cnp: 'CNP', serieCi: 'Serie și număr buletin', seriePas: 'Număr pașaport / act',
    judet: 'Județ', loc: 'Localitate', adr: 'Stradă, număr, bloc, apartament', auto: 'Număr de înmatriculare', faraAuto: 'Nu vin cu mașina',
    firma: 'Doresc factură pe firmă', cui: 'CUI', denFirma: 'Denumirea firmei', ment: 'Mențiuni (opțional)', mentPh: 'ex. ora estimată a sosirii, pat suplimentar…',
    gdpr: 'Sunt de acord cu prelucrarea datelor personale în scopul înregistrării rezervării și al cazării, conform Regulamentului (UE) 2016/679 (GDPR).',
    gdprMai: 'Detalii', gdprTxt: 'Datele sunt folosite doar pentru rezervare, înregistrarea oaspeților (obligatorie legal), facturare și comunicarea legată de sejur. Nu sunt transmise terților în scop de marketing. Puteți cere oricând accesul, rectificarea sau ștergerea lor.',
    semn: 'Semnați cu degetul sau cu mouse-ul în chenar.', sterge: 'Șterge', faraSemn: 'Semnez mai târziu', confirma: 'Confirmă rezervarea', trimit: 'Se înregistrează…',
    okT: 'Rezervare confirmată!', okD: 'Vă mulțumim! Rezervarea a fost înregistrată. Vă vom trimite detaliile de acces înainte de sosire.',
    deja: 'Această ofertă a fost deja confirmată. Vă mulțumim!', exp: 'Oferta a expirat. Vă rugăm să ne contactați pentru o ofertă nouă.', anul: 'Oferta a fost retrasă. Vă rugăm să ne contactați.',
    inv: 'Link invalid sau ofertă inexistentă.', inc: 'Se încarcă oferta…', checkin: 'Check-in', checkout: 'Check-out', obl: 'obligatoriu' },
  en: { titlu: 'Booking offer', sosire: 'Arrival', plecare: 'Departure', nopti: (n: number) => n === 1 ? '1 night' : `${n} nights`, dupa: 'from', pana: 'until',
    pers: (a: number, c: number) => `${a} ${a === 1 ? 'adult' : 'adults'}${c ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`, total: 'Total', peNoapte: 'per night',
    valabil: 'This offer is valid until', intro: 'Fill in the details below and your booking is registered immediately.', salut: (n: string) => `Hello, ${n}!`,
    s1: 'Your details', s2: 'Identity document', s3: 'Home address', s4: 'Car', s5: 'Online signature',
    nume: 'Full name', email: 'Email', tel: 'Phone', tara: 'Country', ci: 'ID card', pas: 'Passport', cnp: 'Personal number (CNP)', serieCi: 'ID card series and number', seriePas: 'Passport / ID number',
    judet: 'County', loc: 'City', adr: 'Street address', auto: 'Plate number', faraAuto: 'I am not coming by car',
    firma: 'I need a company invoice', cui: 'VAT / registration no.', denFirma: 'Company name', ment: 'Notes (optional)', mentPh: 'e.g. estimated arrival time, extra bed…',
    gdpr: 'I agree to the processing of my personal data for the purpose of the booking and accommodation, according to Regulation (EU) 2016/679 (GDPR).',
    gdprMai: 'Details', gdprTxt: 'Your data is used only for the booking, the legally required guest registration, invoicing and stay-related communication. It is not shared with third parties for marketing. You can request access, correction or deletion at any time.',
    semn: 'Sign with your finger or mouse inside the box.', sterge: 'Clear', faraSemn: 'Sign later', confirma: 'Confirm booking', trimit: 'Registering…',
    okT: 'Booking confirmed!', okD: 'Thank you! Your booking has been registered. We will send you the access details before your arrival.',
    deja: 'This offer has already been confirmed. Thank you!', exp: 'This offer has expired. Please contact us for a new one.', anul: 'This offer has been withdrawn. Please contact us.',
    inv: 'Invalid link or the offer does not exist.', inc: 'Loading the offer…', checkin: 'Check-in', checkout: 'Check-out', obl: 'required' },
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
.abo{--bg:#050A14;--panel:rgba(14,26,46,.62);--line:rgba(125,211,252,.16);--ink:#E8F4FF;--dim:rgba(186,214,255,.62);--sky:#38BDF8;--glow:0 0 0 1px rgba(56,189,248,.45),0 8px 30px rgba(56,189,248,.25);
  position:fixed;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--ink);font-family:'Space Grotesk',system-ui,-apple-system,sans-serif;
  background:radial-gradient(900px 520px at 85% -10%,rgba(139,92,246,.22),transparent 60%),radial-gradient(800px 500px at -10% 20%,rgba(56,189,248,.16),transparent 60%),var(--bg)}
.abo *{box-sizing:border-box}
.abo .wrap{position:relative;max-width:600px;margin:0 auto;padding:20px 16px 60px;display:flex;flex-direction:column;gap:14px}
.abo .mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.abo .card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 20px 50px rgba(0,0,0,.35)}
.abo .lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
.abo .sec{font-size:15px;font-weight:700;margin:0 0 12px;display:flex;align-items:center;gap:8px}
.abo .sec i{font-style:normal;width:24px;height:24px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font:700 12px 'JetBrains Mono',monospace;background:linear-gradient(135deg,rgba(56,189,248,.25),rgba(139,92,246,.25))}
.abo .grad{background:linear-gradient(90deg,#7DD3FC,#C4B5FD);-webkit-background-clip:text;background-clip:text;color:transparent}
.abo .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:460px){.abo .g2{grid-template-columns:1fr}}
.abo .f{display:flex;flex-direction:column;gap:10px}
.abo .inp{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 13px;font:500 16px 'Space Grotesk',sans-serif;color:var(--ink);background:rgba(255,255,255,.04);outline:none;color-scheme:dark}
.abo .inp:focus{box-shadow:var(--glow);border-color:transparent}
.abo .inp.bad{border-color:rgba(248,113,113,.7);box-shadow:0 0 0 1px rgba(248,113,113,.5)}
.abo .inp::placeholder{color:rgba(186,214,255,.35)}
.abo select.inp option{background:#0B1730;color:#E8F4FF}
.abo .seg{display:flex;gap:6px;padding:4px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.abo .seg button{flex:1;padding:9px;border-radius:9px;border:none;background:none;color:var(--dim);font:700 14px 'Space Grotesk',sans-serif;cursor:pointer}
.abo .seg button.on{background:linear-gradient(135deg,rgba(56,189,248,.25),rgba(139,92,246,.25));color:var(--ink)}
.abo .chk{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}
.abo .chk input{width:20px;height:20px;margin-top:1px;accent-color:#38BDF8;flex-shrink:0}
.abo .cta{width:100%;padding:17px;border-radius:16px;border:none;font:700 17px 'Space Grotesk',sans-serif;cursor:pointer;color:#fff;background:linear-gradient(135deg,#0EA5E9,#7C3AED);box-shadow:0 10px 30px rgba(124,58,237,.35)}
.abo .cta:disabled{opacity:.55;cursor:default}
.abo .msg{padding:12px 14px;border-radius:14px;font-size:14.5px;font-weight:600;line-height:1.45}
.abo .err{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);color:#FCA5A5}
.abo .ok{background:rgba(74,222,128,.10);border:1px solid rgba(74,222,128,.35);color:#86EFAC}
.abo .ghost{padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font:700 13px 'Space Grotesk',sans-serif;cursor:pointer}
.abo .stat{display:flex;flex-direction:column;gap:2px}
.abo .stat b{font-size:17px}
.abo .stat span{font-size:12.5px;color:var(--dim)}
.abo canvas{width:100%;height:160px;border-radius:14px;border:1px dashed rgba(125,211,252,.35);background:rgba(255,255,255,.96);touch-action:none;display:block}
`

const zi = (s: string, l: L) => new Date(s + 'T12:00:00Z').toLocaleDateString(l === 'en' ? 'en-GB' : 'ro-RO', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const bani = (v: number, m: string, l: L) => `${(Number(v) || 0).toLocaleString(l === 'en' ? 'en-GB' : 'ro-RO', { maximumFractionDigits: 2 })} ${m}`

export default function OfertaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [info, setInfo] = useState<Info | null>(null), [eroareInc, setEroareInc] = useState(false)
  const [l, setL] = useState<L>('ro')
  const [f, setF] = useState({ nume: '', email: '', telefon: '', tara: 'Romania', tip_act: 'ci', cnp: '', serie_act: '', judet: '', localitate: '', adresa: '',
    auto: '', fara_auto: false, firma: false, cui: '', denumire_firma: '', mentiuni: '', gdpr: false })
  const [faraSemn, setFaraSemn] = useState(false), [semnat, setSemnat] = useState(false), [gdprMai, setGdprMai] = useState(false)
  const [trimit, setTrimit] = useState(false), [eroare, setEroare] = useState(''), [camp, setCamp] = useState(''), [gata, setGata] = useState(false)
  const cv = useRef<HTMLCanvasElement | null>(null), desen = useRef(false)
  const t = TXT[l]
  const set = (p: Partial<typeof f>) => { setF(o => ({ ...o, ...p })); if (camp && Object.keys(p).includes(camp)) { setCamp(''); setEroare('') } }

  useEffect(() => {
    fetch(`/api/oferta/${encodeURIComponent(token)}`, { cache: 'no-store' }).then(r => r.json()).then((j: Info) => { setInfo(j); if (j?.limba) setL(j.limba) }).catch(() => setEroareInc(true))
  }, [token])

  // semnatura: canvas la rezolutia ecranului
  useEffect(() => {
    const c = cv.current; if (!c) return
    const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1
    c.width = Math.round(r.width * k); c.height = Math.round(r.height * k)
    const g = c.getContext('2d'); if (!g) return
    g.scale(k, k); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0B1730'
  }, [info?.stare, faraSemn])
  const pct = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const jos = (e: React.PointerEvent<HTMLCanvasElement>) => { const g = e.currentTarget.getContext('2d'); if (!g) return; e.currentTarget.setPointerCapture(e.pointerId); desen.current = true; const [x, y] = pct(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + .1, y + .1); g.stroke() }
  const misca = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!desen.current) return; const g = e.currentTarget.getContext('2d'); if (!g) return; const [x, y] = pct(e); g.lineTo(x, y); g.stroke(); if (!semnat) setSemnat(true) }
  const sus = () => { desen.current = false }
  const stergeSemn = () => { const c = cv.current, g = c?.getContext('2d'); if (c && g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore() }; setSemnat(false) }

  const ro = /^rom[aâ]nia$/i.test(f.tara.trim())
  const localitati = useMemo(() => ro && f.judet ? localitatiJudet(f.judet) : [], [ro, f.judet])

  async function confirma() {
    setEroare(''); setCamp('')
    if (!faraSemn && !semnat) { setCamp('semnatura'); setEroare(l === 'en' ? 'Please sign in the box or choose “Sign later”.' : 'Semnați în chenar sau alegeți „Semnez mai târziu”.'); return }
    setTrimit(true)
    try {
      const semnatura = !faraSemn && semnat && cv.current ? cv.current.toDataURL('image/png') : null
      const r = await fetch(`/api/oferta/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, semnatura }) })
      const j = await r.json().catch(() => ({}))
      if (j.ok) { setGata(true); document.querySelector('.abo')?.scrollTo({ top: 0, behavior: 'smooth' }) }
      else { setEroare(j.error || 'Eroare'); setCamp(j.camp || ''); if (j.camp) document.querySelector(`[data-camp="${j.camp}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    } catch { setEroare(l === 'en' ? 'Connection error. Please try again.' : 'Eroare de conexiune. Încercați din nou.') }
    setTrimit(false)
  }

  const cls = (c: string) => 'inp' + (camp === c ? ' bad' : '')
  const st = gata ? 'gata' : info?.stare

  return (
    <div className="abo">
      <style>{CSS}</style>
      <div className="wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.jpg" alt="AB Homes" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>AB Homes Iași</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em' }}>{t.titlu.toUpperCase()}</div>
          </div>
          <div className="seg" style={{ padding: 3 }}>
            {(['ro', 'en'] as L[]).map(x => <button key={x} data-limba={x} className={l === x ? 'on' : ''} onClick={() => setL(x)} style={{ padding: '6px 10px', fontSize: 12 }}>{x.toUpperCase()}</button>)}
          </div>
        </div>

        {!info && !eroareInc && <div className="card" style={{ color: 'var(--dim)' }}>{t.inc}</div>}
        {(eroareInc || (info && !info.ok)) && <div className="msg err" data-oferta-eroare>{t.inv}</div>}

        {info?.ok && <>
          <div className="card" data-oferta-rezumat>
            {info.salut && <div style={{ fontSize: 15, marginBottom: 6 }}>{t.salut(info.salut)}</div>}
            <h1 style={{ margin: '0 0 14px', fontSize: 24, lineHeight: 1.2, textWrap: 'balance' as any }}><span className="grad">{info.apartament || 'Apartament'}</span></h1>
            <div className="g2" style={{ marginBottom: 14 }}>
              <div className="stat"><span>{t.sosire} · {t.checkin} {t.dupa} {info.oraCi}</span><b>{zi(info.checkin, l)}</b></div>
              <div className="stat"><span>{t.plecare} · {t.checkout} {t.pana} {info.oraCo}</span><b>{zi(info.checkout, l)}</b></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--dim)', marginBottom: info.total > 0 ? 14 : 0 }}>
              <span>🌙 {t.nopti(info.nopti)}</span><span>·</span><span>👥 {t.pers(info.adulti, info.copii)}</span>
            </div>
            {info.total > 0 && <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(56,189,248,.14),rgba(139,92,246,.14))', border: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 700 }}>{t.total}</span>
              <span style={{ textAlign: 'right' }}><b data-oferta-total style={{ fontSize: 22 }}>{bani(info.total, info.moneda, l)}</b>
                {info.nopti > 1 && <span style={{ display: 'block', fontSize: 12, color: 'var(--dim)' }}>{bani(Math.round(info.total / info.nopti * 100) / 100, info.moneda, l)} {t.peNoapte}</span>}</span>
            </div>}
            {info.nota && <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{info.nota}</div>}
            {st === 'trimisa' && info.expira && <div style={{ marginTop: 12, fontSize: 13, color: '#FCD34D' }}>⏳ {t.valabil} <b>{new Date(info.expira).toLocaleString(l === 'en' ? 'en-GB' : 'ro-RO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })}</b></div>}
          </div>

          {st === 'gata' && <div className="card" data-oferta-confirmata><div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }} className="grad">✓ {t.okT}</div><div style={{ lineHeight: 1.5 }}>{t.okD}</div></div>}
          {st === 'confirmata' && <div className="msg ok" data-oferta-deja>{t.deja}</div>}
          {st === 'expirata' && <div className="msg err" data-oferta-expirata>{t.exp}</div>}
          {st === 'anulata' && <div className="msg err" data-oferta-anulata>{t.anul}</div>}

          {st === 'trimisa' && <>
            <div style={{ fontSize: 14.5, color: 'var(--dim)', padding: '0 4px' }}>{t.intro}</div>

            <div className="card f">
              <div className="sec"><i>1</i>{t.s1}</div>
              <div data-camp="nume"><span className="lbl">{t.nume} *</span><input className={cls('nume')} autoComplete="name" value={f.nume} onChange={e => set({ nume: e.target.value })} /></div>
              <div className="g2">
                <div data-camp="email"><span className="lbl">{t.email} *</span><input className={cls('email')} type="email" autoComplete="email" value={f.email} onChange={e => set({ email: e.target.value })} /></div>
                <div data-camp="telefon"><span className="lbl">{t.tel} *</span><input className={cls('telefon')} type="tel" autoComplete="tel" value={f.telefon} onChange={e => set({ telefon: e.target.value })} placeholder="+40 7xx xxx xxx" /></div>
              </div>
              <div data-camp="tara"><span className="lbl">{t.tara} *</span>
                <select className="inp" value={TARI.includes(f.tara) ? f.tara : ''} onChange={e => set({ tara: e.target.value, judet: '', localitate: '' })}>{TARI.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>

            <div className="card f">
              <div className="sec"><i>2</i>{t.s2}</div>
              <div className="seg">
                <button data-tip-act="ci" className={f.tip_act === 'ci' ? 'on' : ''} onClick={() => set({ tip_act: 'ci' })}>{t.ci}</button>
                <button data-tip-act="pasaport" className={f.tip_act === 'pasaport' ? 'on' : ''} onClick={() => set({ tip_act: 'pasaport' })}>{t.pas}</button>
              </div>
              <div className="g2">
                {ro && f.tip_act === 'ci' && <div data-camp="cnp"><span className="lbl">{t.cnp} *</span><input className={cls('cnp') + ' mono'} inputMode="numeric" maxLength={13} value={f.cnp} onChange={e => set({ cnp: e.target.value.replace(/\D/g, '') })} /></div>}
                <div data-camp="serie_act" style={ro && f.tip_act === 'ci' ? undefined : { gridColumn: '1/-1' }}><span className="lbl">{f.tip_act === 'ci' ? t.serieCi : t.seriePas} *</span><input className={cls('serie_act') + ' mono'} value={f.serie_act} onChange={e => set({ serie_act: e.target.value.toUpperCase() })} placeholder={f.tip_act === 'ci' ? 'MZ 123456' : ''} /></div>
              </div>
            </div>

            <div className="card f">
              <div className="sec"><i>3</i>{t.s3}</div>
              <div className="g2">
                {ro && <div data-camp="judet"><span className="lbl">{t.judet} *</span>
                  <select className={cls('judet')} value={f.judet} onChange={e => set({ judet: e.target.value, localitate: '' })}><option value="">—</option>{JUDETE.map(j => <option key={j} value={j}>{j}</option>)}</select></div>}
                <div data-camp="localitate" style={ro ? undefined : { gridColumn: '1/-1' }}><span className="lbl">{t.loc} *</span>
                  <input className={cls('localitate')} list="o-loc" autoComplete="address-level2" value={f.localitate} onChange={e => set({ localitate: e.target.value })} />
                  <datalist id="o-loc">{localitati.map(x => <option key={x} value={x} />)}</datalist></div>
              </div>
              <div data-camp="adresa"><span className="lbl">{t.adr} *</span><input className={cls('adresa')} autoComplete="street-address" value={f.adresa} onChange={e => set({ adresa: e.target.value })} /></div>
              <label className="chk"><input type="checkbox" data-firma checked={f.firma} onChange={e => set({ firma: e.target.checked })} />{t.firma}</label>
              {f.firma && <div className="g2" data-camp="cui">
                <div><span className="lbl">{t.cui} *</span><input className={cls('cui') + ' mono'} value={f.cui} onChange={e => set({ cui: e.target.value.toUpperCase() })} placeholder="RO12345678" /></div>
                <div><span className="lbl">{t.denFirma} *</span><input className={cls('cui')} value={f.denumire_firma} onChange={e => set({ denumire_firma: e.target.value })} /></div>
              </div>}
            </div>

            <div className="card f">
              <div className="sec"><i>4</i>{t.s4}</div>
              <div data-camp="auto"><span className="lbl">{t.auto}{f.fara_auto ? '' : ' *'}</span><input className={cls('auto') + ' mono'} disabled={f.fara_auto} value={f.fara_auto ? '' : f.auto} onChange={e => set({ auto: e.target.value.toUpperCase() })} placeholder="IS 12 ABC" style={f.fara_auto ? { opacity: .4 } : undefined} /></div>
              <label className="chk"><input type="checkbox" data-fara-auto checked={f.fara_auto} onChange={e => set({ fara_auto: e.target.checked, auto: '' })} />{t.faraAuto}</label>
              <div><span className="lbl">{t.ment}</span><textarea className="inp" rows={2} value={f.mentiuni} placeholder={t.mentPh} onChange={e => set({ mentiuni: e.target.value })} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></div>
            </div>

            <div className="card f" data-camp="semnatura">
              <div className="sec"><i>5</i>{t.s5}</div>
              {!faraSemn ? <>
                <div style={{ fontSize: 13, color: 'var(--dim)' }}>{t.semn}</div>
                <canvas ref={cv} data-semnatura onPointerDown={jos} onPointerMove={misca} onPointerUp={sus} onPointerCancel={sus} onPointerLeave={sus} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button className="ghost" onClick={stergeSemn}>{t.sterge}</button>
                  <button className="ghost" data-fara-semnatura onClick={() => { setFaraSemn(true); setSemnat(false); if (camp === 'semnatura') { setCamp(''); setEroare('') } }}>{t.faraSemn}</button>
                </div>
              </> : <button className="ghost" onClick={() => setFaraSemn(false)}>✍️ {t.s5}</button>}
            </div>

            <div className="card f" data-camp="gdpr">
              <label className="chk"><input type="checkbox" data-gdpr checked={f.gdpr} onChange={e => set({ gdpr: e.target.checked })} /><span>{t.gdpr} <a href="#" onClick={e => { e.preventDefault(); setGdprMai(o => !o) }} style={{ color: '#7DD3FC' }}>{t.gdprMai}</a></span></label>
              {gdprMai && <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>{t.gdprTxt}</div>}
            </div>

            {eroare && <div className="msg err" data-oferta-err>{eroare}</div>}
            <button className="cta" data-confirma disabled={trimit} onClick={confirma}>{trimit ? t.trimit : t.confirma}</button>
          </>}
        </>}
      </div>
    </div>
  )
}
