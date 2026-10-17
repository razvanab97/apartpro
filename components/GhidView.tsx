'use client'
import { useEffect, useState } from 'react'
import type { Ghid } from '@/lib/ghid'

// Afisarea ghidului de check-in (aceeasi pe pagina publica /ghid/<COD> si in previzualizarea din editor).
// Identitatea vizuala a paginii R7-101: fundal cald inchis din poza cladirii, accent portocaliu, Anton + Quicksand.

const CSS = `
.gh{--ink:#D1D0CB;--dim:#a9a89f;--faint:#7d7a70;--acc:#ff6600;--accd:#e65c00;--accs:rgba(255,102,0,.14);--green:#1ebe57;--panel:rgba(20,16,12,.62);--panel2:rgba(28,22,16,.82);--line:rgba(209,208,203,.16);--line2:rgba(209,208,203,.28);
  --disp:"Anton",Impact,"Arial Narrow",sans-serif;--body:"Quicksand","Nunito","Segoe UI",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  position:relative;isolation:isolate;min-height:100%;color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.6;background:#120d0a;color-scheme:dark;-webkit-font-smoothing:antialiased;overflow:hidden}
.gh *{box-sizing:border-box}
.gh-bg{position:absolute;inset:-24px;z-index:-2;background:#120d0a center/cover no-repeat;filter:blur(20px) brightness(.45) saturate(1.1);transform:scale(1.1)}
.gh-veil{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(10,8,6,.5) 0%,rgba(10,8,6,.86) 40%,rgba(10,8,6,.94) 100%)}
.gh.fix .gh-bg,.gh.fix .gh-veil{position:fixed}
.gh-wrap{max-width:720px;margin:0 auto;padding:28px 18px 72px}
.gh-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:34px}
.gh-brand{font-weight:700;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.gh-brand b{color:var(--acc)}
.gh-lang{display:inline-flex;padding:3px;border-radius:50px;border:1px solid var(--line);background:var(--panel)}
.gh-lang button{border:0;background:transparent;color:var(--dim);font:700 12px/1 var(--body);letter-spacing:.08em;padding:7px 12px;border-radius:50px;cursor:pointer}
.gh-lang button[aria-pressed="true"]{background:var(--acc);color:#fff}
.gh button:focus-visible,.gh a:focus-visible,.gh figure:focus-visible{outline:2px solid var(--acc);outline-offset:3px}
.gh header{text-align:center;margin-bottom:30px}
.gh-eye{margin:0 0 10px;font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.gh h1{margin:0;font-family:var(--disp);font-weight:400;font-size:clamp(46px,13vw,96px);line-height:.92;letter-spacing:.01em;color:var(--ink);text-wrap:balance;text-shadow:0 6px 34px rgba(0,0,0,.45)}
.gh-sub{margin:12px 0 0;color:var(--dim);font-weight:600}
.gh-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:18px}
.gh-badge{display:inline-flex;gap:7px;padding:8px 16px;border-radius:50px;border:1px solid var(--line2);background:var(--panel);font-weight:700;font-size:14px}
.gh-badge.hot{background:var(--acc);border-color:var(--acc);color:#fff;box-shadow:0 8px 22px rgba(255,102,0,.32)}
.gh-badge .k{color:var(--faint);font-weight:600}
.gh-quick{border:1px solid var(--line2);background:var(--panel2);border-radius:24px;padding:18px;backdrop-filter:blur(8px);margin-bottom:38px}
.gh-quick h2{margin:0 0 12px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);font-weight:700}
.gh-qgrid{display:flex;flex-direction:column;gap:8px}
.gh-q{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(10,8,6,.45)}
.gh-q .l{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.gh-q>span{min-width:0}
.gh-q .v{display:block;font-family:var(--mono);font-weight:600;font-size:19px;color:var(--ink);letter-spacing:.04em;overflow-wrap:anywhere}
.gh-q.cod .v{font-size:28px;color:var(--acc);letter-spacing:.18em}
.gh-copy{flex-shrink:0;border:1px solid var(--line2);background:transparent;color:var(--ink);border-radius:50px;padding:7px 12px;font:700 12px/1 var(--body);cursor:pointer}
.gh-copy:hover{background:var(--acc);border-color:var(--acc);color:#fff}
.gh-copy.ok{background:var(--green);border-color:var(--green);color:#fff}
.gh-note{margin:10px 2px 0;font-size:13px;color:var(--faint)}
.gh-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:34px}
.gh-step{display:grid;grid-template-columns:54px 1fr;gap:16px}
.gh-num{font-family:var(--disp);font-size:46px;line-height:.9;color:var(--acc);text-align:right}
.gh-step h3{margin:2px 0 6px;font-size:22px;line-height:1.25;font-weight:700;color:var(--ink);text-wrap:balance}
.gh-step p{margin:0 0 12px;color:var(--dim);max-width:62ch;white-space:pre-line}
.gh-call{margin:0 0 12px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,102,0,.35);background:var(--accs);color:var(--ink);font-size:14.5px;white-space:pre-line}
.gh-cp{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:10px 12px 10px 14px;border-radius:14px;border:1px solid var(--line2);background:rgba(10,8,6,.45)}
.gh-cp span{min-width:0;font-weight:700;color:var(--ink);font-size:15.5px;overflow-wrap:anywhere}
.gh-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:50px;background:var(--acc);color:#fff;font-weight:700;font-size:14.5px;text-decoration:none;box-shadow:0 8px 20px rgba(255,102,0,.3)}
.gh-btn:hover{background:var(--accd)}
.gh-row{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;align-items:center}
.gh-pics{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.gh figure{position:relative;margin:0;border-radius:20px;overflow:hidden;border:1px solid var(--line);background:var(--panel)}
.gh figure.img{cursor:zoom-in}
.gh figure img,.gh figure video{display:block;width:100%;height:auto;max-height:640px;object-fit:cover;background:#000}
.gh figcaption{padding:9px 14px;font-size:13px;font-weight:600;color:var(--dim)}
.gh-rules{margin-top:44px;border-top:1px solid var(--line);padding-top:26px}
.gh-rules h2,.gh-end h2{margin:0 0 12px;font-family:var(--disp);font-weight:400;font-size:30px;letter-spacing:.02em;color:var(--ink)}
.gh-rules ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.gh-rules li{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:baseline;padding:10px 14px;border-radius:14px;background:var(--panel);border:1px solid var(--line);color:var(--dim)}
.gh-rules li b{font-family:var(--mono);font-weight:600;color:var(--acc);font-size:13px;white-space:nowrap}
.gh-end{margin-top:38px;text-align:center;padding:24px 18px;border-radius:24px;background:var(--panel2);border:1px solid var(--line2)}
.gh-end p{margin:0 0 14px;color:var(--dim)}
.gh-tel{font-family:var(--mono);font-weight:600;font-size:20px;color:var(--ink);letter-spacing:.04em}
.gh footer{margin-top:28px;text-align:center;font-size:12.5px;color:var(--faint)}
.gh-lb{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,6,4,.93);backdrop-filter:blur(10px)}
.gh-lb img{max-width:100%;max-height:100%;border-radius:18px}
.gh-lb button{position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;border:0;background:var(--acc);color:#fff;font-size:22px;cursor:pointer}
.gh-empty{padding:16px;border:1.5px dashed var(--line2);border-radius:16px;color:var(--faint);font-size:13px;text-align:center}
@media (max-width:520px){.gh-step{grid-template-columns:38px 1fr;gap:12px}.gh-num{font-size:36px}.gh-step h3{font-size:20px}}
`

export default function GhidView({ g, fix = true, limbaStart }: { g: Ghid; fix?: boolean; limbaStart?: 'ro' | 'en' }) {
  const [l, setL] = useState<'ro' | 'en'>(limbaStart || 'ro')
  const [mare, setMare] = useState<string | null>(null)
  const [copiat, setCopiat] = useState<string | null>(null)
  useEffect(() => { if (limbaStart) return; try { if (localStorage.getItem('ghid-limba') === 'en') setL('en') } catch {} }, [limbaStart])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMare(null) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  const alege = (x: 'ro' | 'en') => { setL(x); try { localStorage.setItem('ghid-limba', x) } catch {} }
  // textul in limba aleasa; daca lipseste traducerea, ramane romana
  const t = (ro?: string, en?: string) => (l === 'en' && en?.trim() ? en : ro) || ''
  const copiaza = (id: string, val: string) => {
    navigator.clipboard?.writeText(val).then(() => { setCopiat(id); setTimeout(() => setCopiat(x => x === id ? null : x), 1600) }).catch(() => {})
  }
  const btnCopy = (id: string, val: string, ro = 'Copiază', en = 'Copy') => (
    <button type="button" className={'gh-copy' + (copiat === id ? ' ok' : '')} onClick={() => copiaza(id, val)}>{copiat === id ? (l === 'en' ? 'Copied' : 'Copiat') : t(ro, en)}</button>
  )
  const fundal = g.fundal || g.pasi.flatMap(p => p.media).find(m => m.tip === 'img')?.url || ''
  const acces = g.acces.filter(a => a.valoare.trim())
  const tel = g.telefon.replace(/[^0-9]/g, '')

  return (
    <div className={'gh' + (fix ? ' fix' : '')} lang={l}>
      <style>{CSS}</style>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Quicksand:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      <div className="gh-bg" style={{ backgroundImage: fundal ? `url("${fundal}")` : undefined }} />
      <div className="gh-veil" />
      <div className="gh-wrap">
        <div className="gh-top">
          <span className="gh-brand"><b>AB</b> HOMES · IAȘI</span>
          <div className="gh-lang" role="group" aria-label="Limba / Language">
            <button type="button" aria-pressed={l === 'ro'} onClick={() => alege('ro')}>RO</button>
            <button type="button" aria-pressed={l === 'en'} onClick={() => alege('en')}>EN</button>
          </div>
        </div>

        <header>
          <p className="gh-eye">{t('Ghid de check-in', 'Check-in guide')}</p>
          <h1>{g.titlu || '—'}</h1>
          {t(g.sub_ro, g.sub_en) && <p className="gh-sub">{t(g.sub_ro, g.sub_en)}</p>}
          <div className="gh-badges">
            {g.checkin && <span className="gh-badge hot">{t('Check-in de la', 'Check-in from')} {g.checkin}</span>}
            {g.checkout && <span className="gh-badge"><span className="k">{t('Check-out până la', 'Check-out by')}</span> {g.checkout}</span>}
          </div>
        </header>

        {acces.length > 0 && (
          <section className="gh-quick">
            <h2>{t('Acces rapid', 'Quick access')}</h2>
            <div className="gh-qgrid">
              {acces.map((a, i) => (
                <div key={i} className={'gh-q' + (a.cod ? ' cod' : '')}>
                  <span><span className="l">{t(a.ro, a.en)}</span><span className="v">{a.valoare}</span></span>
                  {btnCopy('a' + i, a.valoare)}
                </div>
              ))}
            </div>
            {t(g.acces_nota_ro, g.acces_nota_en) && <p className="gh-note">{t(g.acces_nota_ro, g.acces_nota_en)}</p>}
          </section>
        )}

        <ol className="gh-steps">
          {g.pasi.map((p, i) => (
            <li key={i} className="gh-step">
              <span className="gh-num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{t(p.titlu_ro, p.titlu_en) || '…'}</h3>
                {t(p.text_ro, p.text_en) && <p>{t(p.text_ro, p.text_en)}</p>}
                {p.copiaza?.trim() && <div className="gh-cp"><span>{p.copiaza}</span>{btnCopy('p' + i, p.copiaza)}</div>}
                {t(p.nota_ro, p.nota_en) && <p className="gh-call">{t(p.nota_ro, p.nota_en)}</p>}
                {p.link_url && <div className="gh-row"><a className="gh-btn" href={p.link_url} target="_blank" rel="noopener noreferrer">{t(p.link_ro, p.link_en) || p.link_url}</a></div>}
                {p.media.length > 0 && (
                  <div className="gh-pics">
                    {p.media.map((m, j) => (
                      <figure key={j} className={m.tip === 'img' ? 'img' : 'vid'} tabIndex={m.tip === 'img' ? 0 : undefined}
                        onClick={() => m.tip === 'img' && setMare(m.url)} onKeyDown={e => { if (m.tip === 'img' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setMare(m.url) } }}>
                        {m.tip === 'img'
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={m.url} alt={t(m.ro, m.en) || t(p.titlu_ro, p.titlu_en)} loading="lazy" />
                          : <video src={m.url} controls playsInline preload="metadata" />}
                        {t(m.ro, m.en) && <figcaption>{t(m.ro, m.en)}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {g.reguli.length > 0 && (
          <section className="gh-rules">
            <h2>{t('Regulile locației', 'House rules')}</h2>
            <ul>{g.reguli.map((r, i) => <li key={i}><b>{t(r.eticheta_ro, r.eticheta_en)}</b><span>{t(r.text_ro, r.text_en)}</span></li>)}</ul>
          </section>
        )}

        {tel && (
          <section className="gh-end">
            <h2>{t('Aveți nevoie de ajutor?', 'Need help?')}</h2>
            <p>{t('Scrieți-ne pe WhatsApp, vă răspundem repede.', 'Message us on WhatsApp, we reply quickly.')}</p>
            <div className="gh-row" style={{ justifyContent: 'center' }}><span className="gh-tel">{g.telefon}</span>{btnCopy('tel', g.telefon)}</div>
            <a className="gh-btn" style={{ background: 'var(--green)', boxShadow: '0 8px 20px rgba(30,190,87,.3)' }} href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer">{t('Deschide WhatsApp', 'Open WhatsApp')}</a>
          </section>
        )}
        {t(g.final_ro, g.final_en) && <footer>{t(g.final_ro, g.final_en)}</footer>}
      </div>
      {mare && (
        <div className="gh-lb" onClick={() => setMare(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mare} alt="" onClick={e => e.stopPropagation()} />
          <button type="button" aria-label={t('Închide', 'Close')} onClick={() => setMare(null)}>×</button>
        </div>
      )}
    </div>
  )
}
