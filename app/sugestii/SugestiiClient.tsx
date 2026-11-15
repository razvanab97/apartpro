'use client'
import { useEffect, useState } from 'react'
import { CATEGORII_SUGESTII } from '@/lib/sugestii'

// Formularul public de sugestii al oaspetilor (lib/sugestii.ts): 1) numarul de telefon, 2) sugestia. Acelasi stil ca ghidul.
// Aplicatia blocheaza derularea documentului (html, body overflow hidden) -> pagina are zona ei de derulare, ca ghidul.
const CSS = `
.sg{--ink:#D1D0CB;--dim:#a9a89f;--faint:#7d7a70;--acc:#ff6600;--panel:rgba(28,22,16,.82);--line:rgba(209,208,203,.16);--line2:rgba(209,208,203,.28);--green:#1ebe57;
  --disp:"Anton",Impact,"Arial Narrow",sans-serif;--body:"Quicksand","Nunito","Segoe UI",system-ui,sans-serif;
  position:fixed;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:radial-gradient(120% 80% at 50% 0%,#2a1d14 0%,#120d0a 60%);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.6;color-scheme:dark;-webkit-font-smoothing:antialiased;padding:0 16px 48px}
.sg *{box-sizing:border-box}
.sg-in{max-width:560px;margin:0 auto}
.sg-top{display:flex;justify-content:space-between;align-items:center;padding:18px 0 34px}
.sg-brand{font-weight:700;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.sg-lang{display:inline-flex;padding:3px;border-radius:50px;border:1px solid var(--line);background:rgba(20,16,12,.62)}
.sg-lang button{border:0;background:transparent;color:var(--dim);font:700 12px/1 var(--body);letter-spacing:.08em;padding:7px 12px;border-radius:50px;cursor:pointer}
.sg-lang button[aria-pressed="true"]{background:var(--acc);color:#fff}
.sg-eye{margin:0 0 10px;font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.sg h1{margin:0 0 14px;font-family:var(--disp);font-weight:400;font-size:clamp(40px,11vw,64px);line-height:.95;letter-spacing:.01em;text-wrap:balance}
.sg-lead{margin:0 0 28px;color:var(--dim);font-weight:500;text-wrap:pretty}
.sg-card{border:1px solid var(--line2);background:var(--panel);border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:18px}
.sg-l{display:block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:8px}
.sg input,.sg textarea{width:100%;border:1px solid var(--line2);background:rgba(10,8,6,.55);color:var(--ink);border-radius:14px;padding:13px 14px;font:600 17px/1.4 var(--body);outline:none}
.sg input:focus,.sg textarea:focus{border-color:var(--acc)}
.sg textarea{min-height:140px;resize:vertical;font-weight:500;font-size:16px}
.sg-btn{border:0;border-radius:50px;background:var(--acc);color:#fff;font:700 16px/1 var(--body);padding:15px 22px;cursor:pointer;box-shadow:0 8px 22px rgba(255,102,0,.3)}
.sg-btn:disabled{opacity:.55;cursor:default}
.sg-chips{display:flex;flex-wrap:wrap;gap:8px}
.sg-chip{border:1px solid var(--line2);background:transparent;color:var(--dim);border-radius:50px;padding:8px 14px;font:700 14px/1 var(--body);cursor:pointer}
.sg-chip[aria-pressed="true"]{background:rgba(255,102,0,.16);border-color:var(--acc);color:var(--ink)}
.sg-stars{display:flex;gap:6px}
.sg-star{border:0;background:transparent;font-size:34px;line-height:1;cursor:pointer;color:var(--line2);padding:0 2px}
.sg-star.on{color:var(--acc)}
.sg-hi{font-family:var(--disp);font-size:28px;line-height:1.05;letter-spacing:.02em}
.sg-err{color:#ff8a65;font-size:14px;font-weight:600}
.sg-note{color:var(--faint);font-size:13px}
.sg-ok{text-align:center;padding:30px 10px}
.sg-ok .sg-hi{font-size:40px;margin-bottom:10px}
`
const T = {
  ro: { eye: 'Părerea dumneavoastră', h1: 'Ce am putea face mai bine?', lead: 'Lucrăm la câteva îmbunătățiri și orice sugestie ne ajută. Durează mai puțin de un minut.',
    tel: 'Numărul de telefon folosit la rezervare', telPh: 'ex. 0751 305 969', cont: 'Continuă', telNote: 'Îl folosim doar ca să știm despre ce ședere este vorba.',
    hi: (p: string | null) => p ? `Bună, ${p}!` : 'Bună!', negasit: 'Nu am găsit rezervarea după acest număr, dar sugestia ajunge oricum la noi.', schimba: 'alt număr',
    nota: 'Cum v-ați simțit? (opțional)', cat: 'Despre ce este vorba? (opțional)', text: 'Sugestia dumneavoastră', textPh: 'Ce ar trebui să schimbăm, să adăugăm sau să reparăm?',
    trimite: 'Trimite sugestia', ok1: 'Mulțumim!', ok2: 'Am primit sugestia și o vom citi cu atenție.', err: 'Nu s-a putut trimite. Încercați din nou sau scrieți-ne pe WhatsApp: +40 712 290 109', errTel: 'Introduceți un număr de telefon valid.' },
  en: { eye: 'Your feedback', h1: 'What could we do better?', lead: 'We are making a few improvements and every suggestion helps. It takes less than a minute.',
    tel: 'Phone number used for the booking', telPh: 'e.g. +40 751 305 969', cont: 'Continue', telNote: 'We only use it to know which stay this is about.',
    hi: (p: string | null) => p ? `Hello, ${p}!` : 'Hello!', negasit: 'We could not find a booking with this number, but your suggestion will still reach us.', schimba: 'different number',
    nota: 'How was your stay? (optional)', cat: 'What is it about? (optional)', text: 'Your suggestion', textPh: 'What should we change, add or fix?',
    trimite: 'Send suggestion', ok1: 'Thank you!', ok2: 'We received your suggestion and will read it carefully.', err: 'Could not send. Please try again or message us on WhatsApp: +40 712 290 109', errTel: 'Please enter a valid phone number.' },
}

export default function SugestiiClient() {
  const [limba, setLimba] = useState<'ro' | 'en'>('ro')
  useEffect(() => { try { if (!navigator.language.toLowerCase().startsWith('ro')) setLimba('en') } catch {} }, [])
  const t = T[limba]
  const [pas, setPas] = useState<1 | 2 | 3>(1)
  const [tel, setTel] = useState(''), [prenume, setPrenume] = useState<string | null>(null), [gasit, setGasit] = useState(true)
  const [nota, setNota] = useState(0), [cat, setCat] = useState<string[]>([]), [text, setText] = useState('')
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const api = (body: any) => fetch('/api/sugestii', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

  async function verifica(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (tel.replace(/[^0-9]/g, '').length < 8) { setErr(t.errTel); return }
    setBusy(true)
    try { const j = await api({ pas: 'verifica', telefon: tel }); if (!j.ok) throw 0; setPrenume(j.prenume); setGasit(j.gasit); setPas(2) }
    catch { setErr(t.err) }
    setBusy(false)
  }
  async function trimite(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { const j = await api({ pas: 'trimite', telefon: tel, text, nota: nota || null, categorii: cat, limba }); if (!j.ok) throw 0; setPas(3) }
    catch { setErr(t.err) }
    setBusy(false)
  }
  return (
    <div className="sg">
      <style>{CSS}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Quicksand:wght@500;600;700&display=swap" />
      <div className="sg-in">
        <div className="sg-top">
          <span className="sg-brand">AB Homes Iași</span>
          <span className="sg-lang">{(['ro', 'en'] as const).map(l => <button key={l} aria-pressed={limba === l} onClick={() => setLimba(l)}>{l.toUpperCase()}</button>)}</span>
        </div>
        {pas === 3 ? (
          <div className="sg-card sg-ok" data-sg-gata><div className="sg-hi">{t.ok1}</div><div className="sg-lead" style={{ margin: 0 }}>{t.ok2}</div></div>
        ) : (<>
          <p className="sg-eye">{t.eye}</p>
          <h1>{t.h1}</h1>
          <p className="sg-lead">{t.lead}</p>
          {pas === 1 ? (
            <form className="sg-card" onSubmit={verifica} data-sg-pas1>
              <label><span className="sg-l">{t.tel}</span>
                <input type="tel" inputMode="tel" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder={t.telPh} /></label>
              <div className="sg-note">{t.telNote}</div>
              {err && <div className="sg-err">{err}</div>}
              <button className="sg-btn" disabled={busy}>{busy ? '…' : t.cont}</button>
            </form>
          ) : (
            <form className="sg-card" onSubmit={trimite} data-sg-pas2>
              <div>
                <div className="sg-hi" data-sg-salut>{t.hi(prenume)}</div>
                <div className="sg-note">{!gasit && <>{t.negasit} </>}<button type="button" onClick={() => { setPas(1); setErr('') }} style={{ border: 0, background: 'none', color: 'var(--acc)', font: 'inherit', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{t.schimba}</button></div>
              </div>
              <div><span className="sg-l">{t.nota}</span>
                <div className="sg-stars">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n}/5`} className={'sg-star' + (n <= nota ? ' on' : '')} onClick={() => setNota(nota === n ? 0 : n)}>★</button>)}</div></div>
              <div><span className="sg-l">{t.cat}</span>
                <div className="sg-chips">{CATEGORII_SUGESTII.map(c => <button type="button" key={c.k} className="sg-chip" aria-pressed={cat.includes(c.k)} onClick={() => setCat(v => v.includes(c.k) ? v.filter(x => x !== c.k) : [...v, c.k])}>{c[limba]}</button>)}</div></div>
              <label><span className="sg-l">{t.text}</span>
                <textarea value={text} onChange={e => setText(e.target.value)} placeholder={t.textPh} maxLength={3000} /></label>
              {err && <div className="sg-err">{err}</div>}
              <button className="sg-btn" disabled={busy || text.trim().length < 3}>{busy ? '…' : t.trimite}</button>
            </form>
          )}
        </>)}
      </div>
    </div>
  )
}
