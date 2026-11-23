'use client'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, format, isSameMonth } from 'date-fns'
import { ro } from 'date-fns/locale'

// Selectorul de perioada (Calculator, Calendar → „Alege data”, Dublează rezervarea) - refacut (cerut direct: „fă
// calendarul mult mai frumos și mai plăcut la selecție”): zile rotunde, banda continua intre check-in si check-out,
// previzualizare la hover cu nr. de nopti, weekend evidentiat, punct pe ziua de azi, buton „Azi”, linie de stare jos.
const ZILE = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D']
const aziIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const noapteN = (a: string, b: string) => Math.max(0, Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000))
const scurt = (iso: string) => format(new Date(iso + 'T12:00:00'), 'd MMM', { locale: ro })

export function RangeCalendar({ checkin, checkout, onPick, stare = true }: {
  checkin: string; checkout: string; onPick: (checkin: string, checkout: string) => void
  stare?: boolean   // linia de jos („Alege check-out” / „3 nopți”)
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(checkin ? new Date(checkin + 'T12:00:00') : new Date()))
  const [hover, setHover] = useState<string | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const azi = aziIso()
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }) }), [viewMonth])

  const asteptCo = !!checkin && !checkout
  // capatul benzii: check-out-ul ales sau, cat timp se alege, ziua de sub cursor (previzualizare)
  const capat = checkout || (asteptCo && hover && hover > checkin ? hover : '')
  const preview = !checkout && !!capat

  function pickDay(iso: string) {
    if (!checkin || checkout) { onPick(iso, ''); return }
    if (iso <= checkin) { onPick(iso, ''); return }
    onPick(checkin, iso); setHover(null)
  }
  const muta = (n: 1 | -1) => { setDir(n); setViewMonth(m => n > 0 ? addMonths(m, 1) : subMonths(m, 1)) }
  const laAzi = () => { const t = startOfMonth(new Date()); setDir(t > viewMonth ? 1 : -1); setViewMonth(t) }
  const nN = capat ? noapteN(checkin, capat) : 0

  return (
    <div className="rc" onMouseLeave={() => setHover(null)}>
      <div className="rc-cap">
        <button type="button" className="rc-nav" onClick={() => muta(-1)} aria-label="Luna anterioară"><ChevronLeft size={16} /></button>
        <div className="rc-luna">
          <span>{format(viewMonth, 'LLLL', { locale: ro })}</span> <b>{format(viewMonth, 'yyyy')}</b>
        </div>
        {!isSameMonth(viewMonth, new Date()) && <button type="button" className="rc-azi" onClick={laAzi}>Azi</button>}
        <button type="button" className="rc-nav" onClick={() => muta(1)} aria-label="Luna următoare"><ChevronRight size={16} /></button>
      </div>

      <div className="rc-grid rc-zile">
        {ZILE.map((z, i) => <div key={i} className={i >= 5 ? 'rc-we' : ''}>{z}</div>)}
      </div>

      <div key={format(viewMonth, 'yyyy-MM')} className={`rc-grid rc-luna-anim ${dir > 0 ? 'rc-din-dr' : 'rc-din-st'}`}>
        {days.map((d, i) => {
          const iso = format(d, 'yyyy-MM-dd')
          const inMonth = isSameMonth(d, viewMonth)
          const col = i % 7
          const isCi = iso === checkin, isCo = !!capat && iso === capat
          const inBanda = !!capat && iso > checkin && iso < capat
          const capete = isCi || isCo
          // banda: plina intre capete, jumatate pe capete; rotunjita la marginea randului (luni / duminica)
          const banda = inBanda || (isCi && !!capat) || isCo
          const cls = ['rc-zi', !inMonth && 'rc-alta', col >= 5 && 'rc-wezi', iso === azi && 'rc-azi-zi', iso < azi && 'rc-trecut',
            capete && 'rc-capat', isCi && 'rc-ci', isCo && 'rc-co', preview && 'rc-prev', asteptCo && iso <= checkin && 'rc-inapoi'].filter(Boolean).join(' ')
          return (
            <div key={iso} className={`rc-cel${banda ? ' rc-banda' : ''}${preview ? ' rc-banda-prev' : ''}${isCi && capat ? ' rc-b-dr' : ''}${isCo ? ' rc-b-st' : ''}${inBanda && col === 0 ? ' rc-r-st' : ''}${inBanda && col === 6 ? ' rc-r-dr' : ''}`}>
              <button type="button" data-zi={iso} className={cls} onClick={() => pickDay(iso)} onMouseEnter={() => setHover(iso)}
                title={asteptCo && iso > checkin ? `${noapteN(checkin, iso)} ${noapteN(checkin, iso) === 1 ? 'noapte' : 'nopți'}` : undefined}>
                {format(d, 'd')}
                {isCo && nN > 0 && <span className="rc-nopti">{nN}n</span>}
              </button>
            </div>
          )
        })}
      </div>

      {stare && (
        <div className="rc-stare" data-rc-stare>
          {!checkin ? <><i className="rc-pas">1</i> Alege ziua de check-in</>
            : !checkout ? <><i className="rc-pas">2</i> {scurt(checkin)} → alege check-out{nN > 0 ? <b> · {nN} {nN === 1 ? 'noapte' : 'nopți'}</b> : ''}</>
            : <><span className="rc-ok">✓</span> {scurt(checkin)} → {scurt(checkout)} <b>· {nN} {nN === 1 ? 'noapte' : 'nopți'}</b></>}
        </div>
      )}

      <style>{`
.rc{--rc-acc:#4DA3FF;--rc-acc2:#8B5CF6;--rc-band:rgba(77,163,255,0.16);--rc-band-p:rgba(77,163,255,0.08);user-select:none;-webkit-user-select:none}
.rc-cap{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.rc-luna{flex:1;font-size:15px;color:#fff;text-transform:capitalize;letter-spacing:.01em}
.rc-luna span{font-weight:700}.rc-luna b{font-weight:400;color:rgba(159,215,255,0.55)}
.rc-nav{width:32px;height:32px;border-radius:50%;border:1px solid rgba(159,215,255,0.16);background:rgba(159,215,255,0.06);color:#9FD7FF;display:grid;place-items:center;cursor:pointer;transition:background .15s,transform .15s,border-color .15s}
.rc-nav:hover{background:rgba(77,163,255,0.18);border-color:rgba(77,163,255,0.45)}.rc-nav:active{transform:scale(.92)}
.rc-azi{font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;border:1px solid rgba(74,222,128,0.4);background:rgba(74,222,128,0.1);color:#4ADE80;cursor:pointer}
.rc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.rc-zile div{text-align:center;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:rgba(159,215,255,0.6);padding:2px 0 6px}
.rc-zile .rc-we{color:rgba(196,181,253,0.8)}
.rc-luna-anim{row-gap:3px;animation:rcIn .22s ease-out}
.rc-din-dr{--rc-dx:14px}.rc-din-st{--rc-dx:-14px}
@keyframes rcIn{from{opacity:0;transform:translateX(var(--rc-dx))}to{opacity:1;transform:none}}
.rc-cel{position:relative;display:flex;justify-content:center;height:40px}
.rc-banda::before{content:'';position:absolute;inset:3px 0;background:var(--rc-band);transition:background .12s}
.rc-banda-prev::before{background:var(--rc-band-p)}
.rc-b-dr::before{left:50%}.rc-b-st::before{right:50%}
.rc-r-st::before{border-radius:999px 0 0 999px;left:3px}.rc-r-dr::before{border-radius:0 999px 999px 0;right:3px}
.rc-zi{position:relative;z-index:1;width:34px;height:34px;margin-top:3px;border-radius:50%;border:none;background:transparent;color:#E8F4FF;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;cursor:pointer;transition:background .12s,color .12s,transform .12s,box-shadow .15s}
.rc-zi:hover{background:rgba(159,215,255,0.13)}
.rc-zi:active{transform:scale(.9)}
.rc-wezi{color:#D9CCFF}
.rc-alta{color:rgba(159,215,255,0.22)}
.rc-trecut:not(.rc-capat){color:rgba(214,228,244,0.42)}
.rc-inapoi:not(.rc-capat){opacity:.55}
.rc-azi-zi::after{content:'';position:absolute;left:50%;bottom:4px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:#4ADE80}
.rc-capat{color:#fff;font-weight:800;background:linear-gradient(135deg,var(--rc-acc),var(--rc-acc2));box-shadow:0 4px 14px rgba(99,102,241,0.45),inset 0 0 0 1px rgba(255,255,255,0.18)}
.rc-capat:hover{background:linear-gradient(135deg,#63B0FF,#9B70FF)}
.rc-capat.rc-azi-zi::after{background:#fff}
.rc-co.rc-prev{background:rgba(77,163,255,0.28);box-shadow:inset 0 0 0 1.5px rgba(123,200,255,0.8)}
.rc-nopti{position:absolute;top:-7px;right:-9px;font-size:9px;font-weight:800;line-height:1;padding:3px 5px;border-radius:999px;background:#0B1524;color:#C4B5FD;border:1px solid rgba(167,139,250,0.6);pointer-events:none}
.rc-stare{display:flex;align-items:center;gap:7px;margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(159,215,255,0.05);border:1px solid rgba(159,215,255,0.1);font-size:12px;color:rgba(214,228,244,0.8)}
.rc-stare b{color:#C4B5FD;font-weight:700}
.rc-pas{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-style:normal;font-size:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--rc-acc),var(--rc-acc2))}
.rc-ok{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;font-weight:800;color:#06210F;background:#4ADE80}
@media (prefers-reduced-motion: reduce){.rc-luna-anim{animation:none}.rc-zi,.rc-nav{transition:none}}
@media (hover: none){.rc-zi:hover{background:transparent}.rc-capat:hover{background:linear-gradient(135deg,var(--rc-acc),var(--rc-acc2))}}
`}</style>
    </div>
  )
}

export default RangeCalendar
