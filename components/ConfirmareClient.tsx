'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Download, FileText, MessageCircle, Loader2 } from 'lucide-react'

// Confirmare de rezervare pentru client, ca imagine / PDF (cerut direct: „o poză cu confirmarea către client,
// cu buton de copiere, cu detaliile standard + observațiile către client — să arate oficial, premium, futurist”).
// Imaginea se desenează local pe canvas (1080×1350, format bun pentru WhatsApp) - fără servicii externe.
// Observațiile INTERNE ale rezervării (pot conține CNP etc.) nu apar niciodată pe confirmare; textul pentru
// client e un câmp separat, precompletat cu informațiile standard.

const ORA_CHECKIN = '15:00', ORA_CHECKOUT = '11:00', SITE = 'abhomesiasi.ro'
const W = 1080, H = 1350

type Limba = 'ro' | 'en'
const T = {
  ro: {
    titlu: 'Rezervare confirmată', sub: 'CONFIRMARE REZERVARE', nr: 'Nr. rezervare', checkin: 'CHECK-IN', checkout: 'CHECK-OUT',
    dela: 'de la ora', panala: 'până la ora', nopti: (n: number) => n === 1 ? '1 noapte' : `${n} nopți`, apt: 'Apartament', adresa: 'Adresă',
    oaspeti: 'Oaspeți', pers: (n: number) => n === 1 ? '1 persoană' : `${n} persoane`, total: 'Total', plata: 'Plată', info: 'INFORMAȚII PENTRU DUMNEAVOASTRĂ',
    multumim: 'Vă mulțumim că ați ales AB Homes Iași!', emis: 'Emis', verif: 'Cod verificare',
    luni: ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'],
    zile: ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'],
    plati: { achitat: 'Achitat integral', avans: 'Avans achitat · restul la sosire', neplatit: 'De achitat la sosire', airbnb: 'Achitat prin Airbnb', booking: 'Plată prin Booking.com' },
    note: [
      `Check-in începând cu ora ${ORA_CHECKIN}, check-out până la ora ${ORA_CHECKOUT}.`,
      'Detaliile de acces (cheie, cod, indicații) vă vor fi trimise pe WhatsApp în ziua sosirii.',
      'Vă rugăm să ne comunicați ora aproximativă la care ajungeți.',
    ].join('\n'),
  },
  en: {
    titlu: 'Booking confirmed', sub: 'BOOKING CONFIRMATION', nr: 'Booking no.', checkin: 'CHECK-IN', checkout: 'CHECK-OUT',
    dela: 'from', panala: 'until', nopti: (n: number) => n === 1 ? '1 night' : `${n} nights`, apt: 'Apartment', adresa: 'Address',
    oaspeti: 'Guests', pers: (n: number) => n === 1 ? '1 guest' : `${n} guests`, total: 'Total', plata: 'Payment', info: 'INFORMATION FOR YOU',
    multumim: 'Thank you for choosing AB Homes Iași!', emis: 'Issued', verif: 'Verification code',
    luni: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    zile: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    plati: { achitat: 'Paid in full', avans: 'Deposit paid · balance on arrival', neplatit: 'Payable on arrival', airbnb: 'Paid via Airbnb', booking: 'Payment via Booking.com' },
    note: [
      `Check-in from ${ORA_CHECKIN}, check-out until ${ORA_CHECKOUT}.`,
      'Access details (key, code, directions) will be sent to you on WhatsApp on the day of arrival.',
      'Please let us know your approximate arrival time.',
    ].join('\n'),
  },
}

function dataLunga(iso: string, l: Limba) {
  if (!iso) return { zi: '—', rest: '' }
  const d = new Date(iso + 'T12:00:00')
  return { zi: String(d.getDate()).padStart(2, '0'), rest: `${T[l].luni[d.getMonth()]} ${d.getFullYear()} · ${T[l].zile[d.getDay()]}` }
}
function codRezervare(r: any) { return String(r.cod_rezervare_platforma || ('AB-' + String(r.id || '').replace(/-/g, '').slice(0, 6))).toUpperCase() }
// cod scurt deterministic (aspect „oficial”; nu e semnătură criptografică)
function codVerificare(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7)
}
function fmtBani(v: any, moneda: string) { const n = Number(v) || 0; return n.toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + ' ' + (moneda || 'RON') }

function plataText(r: any, l: Limba) {
  const p = T[l].plati
  if (r.canal === 'airbnb') return p.airbnb
  if (r.canal === 'booking') return r.status_plata === 'achitat' ? p.achitat : p.booking
  return r.status_plata === 'achitat' ? p.achitat : r.status_plata === 'avans' ? p.avans : p.neplatit
}

let fonturiIncarcate: Promise<void> | null = null
function incarcaFonturi() {
  if (fonturiIncarcate) return fonturiIncarcate
  fonturiIncarcate = (async () => {
    try {
      if (!document.getElementById('font-confirmare')) {
        const l = document.createElement('link'); l.id = 'font-confirmare'; l.rel = 'stylesheet'
        l.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap'
        document.head.appendChild(l)
        await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 2500) })
      }
      await Promise.race([
        Promise.all(['400 30px "Space Grotesk"', '600 30px "Space Grotesk"', '700 30px "Space Grotesk"', '500 30px "JetBrains Mono"', '700 30px "JetBrains Mono"'].map(f => document.fonts.load(f))),
        new Promise(r => setTimeout(r, 2500)),
      ])
    } catch {}
  })()
  return fonturiIncarcate
}

const F = (w: number, px: number) => `${w} ${px}px "Space Grotesk", "Inter", -apple-system, "Segoe UI", sans-serif`
const M = (w: number, px: number) => `${w} ${px}px "JetBrains Mono", ui-monospace, Menlo, monospace`

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []
  for (const par of text.split('\n')) {
    const words = par.split(/\s+/).filter(Boolean); let line = ''
    if (!words.length) { out.push(''); continue }
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t }
    out.push(line)
  }
  return out
}
function ellipsis(ctx: CanvasRenderingContext2D, t: string, maxW: number) {
  if (ctx.measureText(t).width <= maxW) return t
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

type Opt = { limba: Limba; note: string; arataPret: boolean; arataAdresa: boolean }

function deseneaza(cv: HTMLCanvasElement, r: any, apt: any, o: Opt): boolean {
  let taiat = false
  const L = T[o.limba]
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  // fundal: navy adanc + aure cyan / violet
  ctx.fillStyle = '#050A14'; ctx.fillRect(0, 0, W, H)
  const aura = (x: number, y: number, rad: number, c: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, c); g.addColorStop(1, 'rgba(5,10,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }
  aura(980, 60, 620, 'rgba(56,189,248,0.22)'); aura(80, 1250, 700, 'rgba(139,92,246,0.20)'); aura(560, 640, 520, 'rgba(37,99,235,0.07)')
  // grila fina
  ctx.strokeStyle = 'rgba(148,197,255,0.045)'; ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke() }
  // rama + colturi de „scanner”
  ctx.strokeStyle = 'rgba(148,197,255,0.16)'; ctx.lineWidth = 2; rr(ctx, 28, 28, W - 56, H - 56, 34); ctx.stroke()
  ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 4; ctx.lineCap = 'round'
  for (const [x, y, dx, dy] of [[28, 28, 1, 1], [W - 28, 28, -1, 1], [28, H - 28, 1, -1], [W - 28, H - 28, -1, -1]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 70); ctx.lineTo(x, y + dy * 14); ctx.quadraticCurveTo(x, y, x + dx * 14, y); ctx.lineTo(x + dx * 70, y); ctx.stroke()
  }
  const X0 = 84, XW = W - 168

  // antet: marca
  const lg = ctx.createLinearGradient(X0, 92, X0 + 64, 156); lg.addColorStop(0, '#38BDF8'); lg.addColorStop(1, '#8B5CF6')
  ctx.fillStyle = lg; rr(ctx, X0, 92, 64, 64, 18); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 27); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AB', X0 + 32, 125)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 30); ctx.fillText('AB HOMES', X0 + 84, 120)
  ctx.fillStyle = 'rgba(186,214,255,0.6)'; ctx.font = M(500, 17); ctx.fillText('IAȘI · PREMIUM APARTMENTS', X0 + 84, 148)
  // insigna confirmat
  ctx.font = M(700, 17); const sub = L.sub; const sw = ctx.measureText(sub).width + 76
  ctx.fillStyle = 'rgba(74,222,128,0.12)'; rr(ctx, W - X0 - sw, 100, sw, 48, 24); ctx.fill()
  ctx.strokeStyle = 'rgba(74,222,128,0.55)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#4ADE80'; ctx.beginPath(); ctx.arc(W - X0 - sw + 28, 124, 11, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#052E16'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W - X0 - sw + 23, 124); ctx.lineTo(W - X0 - sw + 27, 128); ctx.lineTo(W - X0 - sw + 34, 120); ctx.stroke()
  ctx.fillStyle = '#4ADE80'; ctx.fillText(sub, W - X0 - sw + 50, 130)

  // titlu + oaspete
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 66); ctx.fillText(L.titlu, X0, 252)
  const tg = ctx.createLinearGradient(X0, 0, X0 + 700, 0); tg.addColorStop(0, '#7DD3FC'); tg.addColorStop(1, '#C4B5FD')
  ctx.fillStyle = tg; ctx.font = F(600, 40); ctx.fillText(ellipsis(ctx, String(r.nume_client || '').trim(), XW), X0, 306)
  // nr. rezervare
  ctx.fillStyle = 'rgba(186,214,255,0.55)'; ctx.font = M(500, 18); ctx.fillText(L.nr.toUpperCase(), X0, 354)
  const lw = ctx.measureText(L.nr.toUpperCase()).width
  ctx.fillStyle = '#E0F2FE'; ctx.font = M(700, 26); ctx.fillText(codRezervare(r), X0 + lw + 18, 355)

  // card date: check-in → check-out
  const cy = 388, ch = 230
  ctx.fillStyle = 'rgba(15,30,56,0.72)'; rr(ctx, X0, cy, XW, ch, 28); ctx.fill()
  const bg = ctx.createLinearGradient(X0, cy, X0 + XW, cy + ch); bg.addColorStop(0, 'rgba(56,189,248,0.6)'); bg.addColorStop(1, 'rgba(139,92,246,0.6)')
  ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.stroke()
  const col = (x: number, et: string, iso: string, ora: string, dir: 'l' | 'r') => {
    const d = dataLunga(iso, o.limba)
    ctx.textAlign = dir === 'l' ? 'left' : 'right'
    ctx.fillStyle = '#38BDF8'; ctx.font = M(700, 19); ctx.fillText(et, x, cy + 56)
    ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 88); ctx.fillText(d.zi, x, cy + 146)
    ctx.fillStyle = 'rgba(224,242,254,0.85)'; ctx.font = F(500, 23); ctx.fillText(d.rest, x, cy + 182)
    ctx.fillStyle = '#FCD34D'; ctx.font = M(700, 21); ctx.fillText(ora, x, cy + 214)
    ctx.textAlign = 'left'
  }
  col(X0 + 40, L.checkin, r.data_checkin, `${L.dela} ${ORA_CHECKIN}`, 'l')
  col(X0 + XW - 40, L.checkout, r.data_checkout, `${L.panala} ${ORA_CHECKOUT}`, 'r')
  // linie + nopti
  const mx = X0 + XW / 2, nN = Math.max(1, Math.round((new Date(r.data_checkout + 'T12:00:00').getTime() - new Date(r.data_checkin + 'T12:00:00').getTime()) / 86400000)) || 0
  ctx.strokeStyle = 'rgba(148,197,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(mx - 120, cy + 118); ctx.lineTo(mx + 120, cy + 118); ctx.stroke(); ctx.setLineDash([])
  ctx.font = M(700, 19); const nt = L.nopti(nN); const nw = ctx.measureText(nt).width + 40
  ctx.fillStyle = '#0B1730'; rr(ctx, mx - nw / 2, cy + 98, nw, 40, 20); ctx.fill(); ctx.strokeStyle = 'rgba(56,189,248,0.6)'; ctx.stroke()
  ctx.fillStyle = '#7DD3FC'; ctx.textAlign = 'center'; ctx.fillText(nt, mx, cy + 125); ctx.textAlign = 'left'

  // detalii
  let y = cy + ch + 62
  const rand = (et: string, val: string, culoare = '#FFFFFF', mare = false) => {
    ctx.fillStyle = 'rgba(186,214,255,0.55)'; ctx.font = M(500, 19); ctx.fillText(et.toUpperCase(), X0, y)
    ctx.fillStyle = culoare; ctx.font = F(mare ? 700 : 600, mare ? 34 : 27)
    const linii = wrap(ctx, val, XW - 260).slice(0, 2)
    linii.forEach((ln, i) => ctx.fillText(i === 1 && wrap(ctx, val, XW - 260).length > 2 ? ellipsis(ctx, ln + ' …', XW - 260) : ln, X0 + 260, y + i * 34))
    y += 34 * Math.max(1, linii.length) + 18
    ctx.strokeStyle = 'rgba(148,197,255,0.09)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X0, y - 26); ctx.lineTo(X0 + XW, y - 26); ctx.stroke()
  }
  rand(L.apt, String(apt?.nume || '').trim() || '—')
  if (o.arataAdresa && apt?.adresa) rand(L.adresa, String(apt.adresa).trim())
  rand(L.oaspeti, L.pers(Number(r.nr_persoane) || 1))
  if (o.arataPret && Number(r.valoare_bruta) > 0) rand(L.total, fmtBani(r.valoare_bruta, r.moneda), '#4ADE80', true)
  rand(L.plata, plataText(r, o.limba), r.status_plata === 'achitat' || r.canal === 'airbnb' ? '#4ADE80' : '#FCD34D')

  // informatii pentru client - fiecare rand cu bulina; textul lung se micsoreaza (24→17px) inainte sa fie taiat
  const fy = H - 138
  const note = o.note.trim()
  if (note) {
    const parag = note.split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace(/^[•\-–·*]\s*/, ''))
    const top = y - 6, loc = fy - 34 - top - 58
    let fs = 24, lh = 34, linii: { t: string; b: boolean }[] = []
    for (fs = 24; fs >= 17; fs--) {
      lh = Math.round(fs * 1.38); ctx.font = F(400, fs)
      linii = parag.flatMap(pp => wrap(ctx, pp, XW - 92).map((t, i) => ({ t, b: i === 0 })))
      if (linii.length * lh <= loc) break
    }
    const maxL = Math.max(1, Math.floor(loc / lh))
    if (linii.length > maxL) { taiat = true; linii = linii.slice(0, maxL); linii[maxL - 1] = { ...linii[maxL - 1], t: ellipsis(ctx, linii[maxL - 1].t + ' …', XW - 92) } }
    const bh = 58 + linii.length * lh + 10
    ctx.fillStyle = 'rgba(139,92,246,0.10)'; rr(ctx, X0, top, XW, bh, 22); ctx.fill()
    ctx.strokeStyle = 'rgba(167,139,250,0.35)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#C4B5FD'; ctx.font = M(700, 17); ctx.fillText(L.info, X0 + 32, top + 40)
    ctx.font = F(400, fs)
    linii.forEach((ln, i) => {
      const yy = top + 58 + lh * (i + 1) - Math.round(lh * 0.32)
      if (ln.b) { ctx.fillStyle = '#A78BFA'; ctx.beginPath(); ctx.arc(X0 + 40, yy - fs * 0.33, 4, 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = 'rgba(237,233,254,0.92)'; ctx.fillText(ln.t, X0 + 58, yy)
    })
  }

  // subsol: multumim + emis + cod verificare + bara holografica
  const hg = ctx.createLinearGradient(X0, 0, X0 + XW, 0); hg.addColorStop(0, '#38BDF8'); hg.addColorStop(0.5, '#8B5CF6'); hg.addColorStop(1, '#FCD34D')
  ctx.fillStyle = hg; rr(ctx, X0, fy, XW, 4, 2); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(600, 25); ctx.fillText(L.multumim, X0, fy + 50)
  ctx.fillStyle = 'rgba(186,214,255,0.55)'; ctx.font = M(500, 17)
  const azi = new Date(); const emis = `${L.emis} ${String(azi.getDate()).padStart(2, '0')}.${String(azi.getMonth() + 1).padStart(2, '0')}.${azi.getFullYear()}`
  ctx.fillText(`${SITE}  ·  ${emis}`, X0, fy + 84)
  ctx.textAlign = 'right'
  ctx.fillText(L.verif.toUpperCase(), X0 + XW, fy + 50)
  ctx.fillStyle = '#E0F2FE'; ctx.font = M(700, 24); ctx.fillText(codVerificare(codRezervare(r) + r.data_checkin + r.data_checkout + r.nume_client), X0 + XW, fy + 84)
  ctx.textAlign = 'left'
  return taiat
}

// PDF minim (o pagina, imaginea JPEG pe toata pagina) - fara biblioteci
function pdfDinJpeg(jpeg: Uint8Array, wPx: number, hPx: number): Blob {
  const pw = 595.28, ph = +(pw * hPx / wPx).toFixed(2)
  const enc = new TextEncoder(); const parti: Uint8Array[] = []; const offs: number[] = []; let len = 0
  const add = (p: string | Uint8Array) => { const b = typeof p === 'string' ? enc.encode(p) : p; parti.push(b); len += b.length }
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const obj = (n: number, body: string) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`) }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offs[4] = len
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  add(jpeg); add('\nendstream\nendobj\n')
  const cont = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`
  obj(5, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`)
  const xref = len
  add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parti as BlobPart[], { type: 'application/pdf' })
}

function textConfirmare(r: any, apt: any, o: Opt) {
  const L = T[o.limba], ci = dataLunga(r.data_checkin, o.limba), co = dataLunga(r.data_checkout, o.limba)
  const linii = [
    `✅ *${L.titlu}* — AB Homes Iași`, '',
    `👤 ${String(r.nume_client || '').trim()}`,
    `🔖 ${L.nr}: ${codRezervare(r)}`,
    `🏠 ${L.apt}: ${String(apt?.nume || '').trim()}`,
    o.arataAdresa && apt?.adresa ? `📍 ${L.adresa}: ${String(apt.adresa).trim()}\nhttps://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(apt.adresa).trim())}` : null,
    `📅 ${L.checkin}: ${ci.zi} ${ci.rest} · ${L.dela} ${ORA_CHECKIN}`,
    `📅 ${L.checkout}: ${co.zi} ${co.rest} · ${L.panala} ${ORA_CHECKOUT}`,
    `👥 ${L.oaspeti}: ${L.pers(Number(r.nr_persoane) || 1)}`,
    o.arataPret && Number(r.valoare_bruta) > 0 ? `💳 ${L.total}: ${fmtBani(r.valoare_bruta, r.moneda)} · ${plataText(r, o.limba)}` : `💳 ${L.plata}: ${plataText(r, o.limba)}`,
    o.note.trim() ? '\nℹ️ ' + L.info.charAt(0) + L.info.slice(1).toLowerCase() + ':\n' + o.note.trim().split('\n').map(x => x.trim()).filter(Boolean).map(x => '• ' + x.replace(/^[•\-–·*]\s*/, '')).join('\n') : null,
    '', L.multumim, SITE,
  ]
  return linii.filter((x): x is string => x !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

export default function ConfirmareClient({ rezervare, apt, onClose }: { rezervare: any; apt: any; onClose: () => void }) {
  const [limba, setLimba] = useState<Limba>('ro')
  const [note, setNote] = useState(T.ro.note)
  const [arataPret, setArataPret] = useState(true)
  const [arataAdresa, setArataAdresa] = useState(true)
  const [img, setImg] = useState<string | null>(null)
  const [stare, setStare] = useState<string | null>(null)
  const [gata, setGata] = useState(false)
  const [taiat, setTaiat] = useState(false)
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const opt = useMemo(() => ({ limba, note, arataPret, arataAdresa }), [limba, note, arataPret, arataAdresa])

  useEffect(() => { let v = true; incarcaFonturi().then(() => v && setGata(true)); return () => { v = false } }, [])
  useEffect(() => {
    if (!gata) return
    const t = setTimeout(() => {
      const cv = cvRef.current || (cvRef.current = document.createElement('canvas'))
      setTaiat(deseneaza(cv, rezervare, apt, opt)); setImg(cv.toDataURL('image/png'))
    }, 120)
    return () => clearTimeout(t)
  }, [gata, opt, rezervare, apt])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onClose])

  function schimbaLimba(l: Limba) { setLimba(l); if (note.trim() === T[limba].note.trim()) setNote(T[l].note) }
  const flash = (m: string) => { setStare(m); setTimeout(() => setStare(s => s === m ? null : s), 2200) }
  const blobPng = () => new Promise<Blob>((res, rej) => cvRef.current ? cvRef.current.toBlob(b => b ? res(b) : rej(new Error('canvas')), 'image/png') : rej(new Error('canvas')))
  const numeFisier = `Confirmare-${codRezervare(rezervare)}-${String(rezervare.nume_client || '').trim().replace(/\s+/g, '-')}`

  async function copiazaPoza() {
    try {
      // promisiunea se da direct lui ClipboardItem (Safari cere asta in acelasi click)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPng() })])
      flash('Poza a fost copiată — lipește-o în WhatsApp (⌘/Ctrl+V)')
    } catch { flash('Browserul n-a permis copierea pozei — folosește „Descarcă PNG”') }
  }
  async function copiazaText() {
    try { await navigator.clipboard.writeText(textConfirmare(rezervare, apt, opt)); flash('Textul a fost copiat') } catch { flash('Nu s-a putut copia textul') }
  }
  function descarca(blob: Blob, nume: string) {
    const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nume; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000)
  }
  async function descarcaPng() { try { descarca(await blobPng(), numeFisier + '.png') } catch { flash('Eroare la generare') } }
  async function descarcaPdf() {
    const cv = cvRef.current; if (!cv) return
    const jb = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.93)); if (!jb) return
    descarca(pdfDinJpeg(new Uint8Array(await jb.arrayBuffer()), cv.width, cv.height), numeFisier + '.pdf')
  }
  const tel = String(rezervare.telefon_client || '').replace(/[^0-9]/g, '')

  const btn = (bgc: string, fg: string, br: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 10, border: `1px solid ${br}`, background: bgc, color: fg, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' })
  const comut = (on: boolean, set: (v: boolean) => void, l: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(214,228,244,0.85)', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 15, height: 15 }} /> {l}
    </label>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(3,7,15,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="cf-wrap" style={{ width: 'min(1060px,100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', background: '#0B1524', border: '1px solid rgba(159,215,255,0.14)', borderRadius: 18, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,20,0.6)', borderRight: '1px solid rgba(159,215,255,0.08)', minHeight: 300 }}>
          {img ? <img src={img} alt="Confirmare rezervare" style={{ width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 70px)', objectFit: 'contain', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
            : <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(159,215,255,0.6)', fontSize: 13 }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Se generează confirmarea…</div>}
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>Confirmare pentru client</div>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)', marginTop: 2 }}>Poză / PDF de trimis oaspetelui</div>
            </div>
            <button onClick={onClose} title="Închide" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', color: 'rgba(214,228,244,0.7)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={15} /></button>
          </div>

          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.1)' }}>
            {(['ro', 'en'] as Limba[]).map(l => (
              <button key={l} onClick={() => schimbaLimba(l)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: limba === l ? 'rgba(77,163,255,0.2)' : 'transparent', color: limba === l ? '#7BC8FF' : 'rgba(159,215,255,0.5)' }}>{l === 'ro' ? '🇷🇴 Română' : '🇬🇧 English'}</button>
            ))}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#C4B5FD' }}>
            Observații pentru client
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={7}
              style={{ resize: 'vertical', padding: '10px 12px', borderRadius: 10, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(167,139,250,0.3)', color: '#FFFFFF', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, fontWeight: 400, outline: 'none' }} />
            {taiat && <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#FCD34D' }}>⚠ Textul e prea lung — pe poză încap doar primele rânduri (textul copiat e complet). Scurtează-l.</span>}
            <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(159,215,255,0.45)' }}>Apare pe confirmare. Observațiile interne ale rezervării (CNP etc.) nu apar.</span>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comut(arataPret, setArataPret, 'Arată prețul total')}
            {comut(arataAdresa, setArataAdresa, 'Arată adresa apartamentului')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 'auto' }}>
            <button onClick={copiazaPoza} disabled={!img} style={{ ...btn('linear-gradient(135deg,#2563EB,#7C3AED)', '#FFFFFF', 'transparent'), gridColumn: '1 / -1', padding: '12px' }}><Copy size={15} /> Copiază poza</button>
            <button onClick={copiazaText} style={btn('rgba(77,163,255,0.1)', '#7BC8FF', 'rgba(77,163,255,0.3)')}><FileText size={14} /> Copiază textul</button>
            <button onClick={descarcaPng} disabled={!img} style={btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)')}><Download size={14} /> PNG</button>
            <button onClick={descarcaPdf} disabled={!img} style={btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)')}><Download size={14} /> PDF</button>
            {tel.length >= 9
              ? <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" style={btn('rgba(37,211,102,0.12)', '#4ADE80', 'rgba(37,211,102,0.35)')}><MessageCircle size={14} /> WhatsApp</a>
              : <span style={{ ...btn('transparent', 'rgba(159,215,255,0.35)', 'rgba(159,215,255,0.1)'), cursor: 'default', fontWeight: 500, fontSize: 11.5 }}>fără telefon</span>}
          </div>
          {stare && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: stare.startsWith('Browserul') || stare.startsWith('Nu') || stare.startsWith('Eroare') ? '#FCD34D' : '#4ADE80' }}><Check size={13} /> {stare}</div>}
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', lineHeight: 1.5 }}>Pas rapid: „Copiază poza” → „WhatsApp” (se deschide chatul cu clientul) → lipește poza.</div>
        </div>
      </div>
      <style>{`@media (max-width: 760px){ .cf-wrap{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
