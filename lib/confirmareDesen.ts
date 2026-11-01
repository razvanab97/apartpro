// Desenul confirmarii de rezervare pentru client (canvas) - separat de panou ca sa poata fi randat si verificat singur.
// Design „Futuristic Luxury” reprodus dupa imaginea de referinta aprobata (1098×1432) - vezi components/ConfirmareClient.tsx

export const SITE = 'abhomesiasi.ro', WHATSAPP = '+40 712 290 109'
export const W = 1098, H = 1432, S = 2   // dimensiunile referintei; exportul e la S× (PNG / PDF clare pe telefon)

export type Limba = 'ro' | 'en'
export const T = {
  ro: {
    sub: 'CONFIRMARE REZERVARE', loc: 'IAȘI · PRIVATE STAYS', titlu: 'Rezervare confirmată', multumim: 'Vă mulțumim, ',
    sejur: 'Sejurul dumneavoastră la AB HOMES este confirmat.', apt: 'APARTAMENT', checkin: 'CHECK-IN', checkout: 'CHECK-OUT',
    dela: 'de la ', panala: 'până la ', oaspeti: (n: number) => n === 1 ? '1 oaspete' : `${n} oaspeți`, nopti: (n: number) => n === 1 ? '1 noapte' : `${n} nopți`,
    total: 'TOTAL SEJUR', avans: 'AVANS PLĂTIT', achitat: 'ACHITAT', rest: 'REST DE PLATĂ', integral: 'ACHITAT INTEGRAL',
    wa: 'Detalii pentru acces: le veți primi pe WhatsApp în ziua sosirii.', nr: 'NR. REZERVARE', motto: 'Your stay, thoughtfully curated.',
    luni: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
    zile: ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'],
  },
  en: {
    sub: 'BOOKING CONFIRMATION', loc: 'IAȘI · PRIVATE STAYS', titlu: 'Booking confirmed', multumim: 'Thank you, ',
    sejur: 'Your stay at AB HOMES is confirmed.', apt: 'APARTMENT', checkin: 'CHECK-IN', checkout: 'CHECK-OUT',
    dela: 'from ', panala: 'until ', oaspeti: (n: number) => n === 1 ? '1 guest' : `${n} guests`, nopti: (n: number) => n === 1 ? '1 night' : `${n} nights`,
    total: 'TOTAL STAY', avans: 'DEPOSIT PAID', achitat: 'PAID', rest: 'BALANCE DUE', integral: 'PAID IN FULL',
    wa: 'Access details: you will receive them on WhatsApp on the day of arrival.', nr: 'BOOKING NO.', motto: 'Your stay, thoughtfully curated.',
    luni: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    zile: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
}

export function codRezervare(r: any) { return String(r.cod_rezervare_platforma || ('AB-' + String(r.id || '').replace(/-/g, '').slice(0, 6))).toUpperCase() }
export const nr = (v: any) => Math.round((Number(String(v ?? '').replace(',', '.')) || 0) * 100) / 100
export function fmtBani(v: number, moneda: string) { return v.toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + ' ' + (moneda || 'RON') }
export const noptiIntre = (ci: string, co: string) => Math.max(1, Math.round((new Date(co + 'T12:00:00').getTime() - new Date(ci + 'T12:00:00').getTime()) / 86400000) || 1)
// prenumele pentru „Vă mulțumim, …!” (modificabil in panou): rezervarile directe / interne sunt scrise „Nume Prenume”
// (ex. Solari Victoria → Victoria), cele de pe Airbnb / Booking „Prenume Nume” (ex. Maximilian Ziegler → Maximilian)
export const prenumeImplicit = (nume: string, canal?: string) => {
  const c = String(nume || '').trim().split(/\s+/).filter(Boolean)
  if (c.length < 2) return c[0] || ''
  const w = ['airbnb', 'booking'].includes(String(canal || '')) ? c[0] : c[c.length - 1]
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

let fonturiIncarcate: Promise<void> | null = null
export function incarcaFonturi() {
  if (fonturiIncarcate) return fonturiIncarcate
  fonturiIncarcate = (async () => {
    try {
      if (!document.getElementById('font-confirmare-2')) {
        const l = document.createElement('link'); l.id = 'font-confirmare-2'; l.rel = 'stylesheet'
        l.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&family=Montserrat:wght@300;400&family=Inter:ital,wght@1,300&display=swap'
        document.head.appendChild(l)
        await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 3000) })
      }
      await Promise.race([
        Promise.all(['300 30px Lexend', '400 30px Lexend', '500 30px Lexend', '600 30px Lexend', '300 30px Montserrat', '400 30px Montserrat', 'italic 300 30px Inter'].map(f => document.fonts.load(f, 'AĂȘȚăîâșț04'))),
        new Promise(r => setTimeout(r, 3000)),
      ])
    } catch {}
  })()
  return fonturiIncarcate
}

const LX = (w: number, px: number) => `${w} ${px}px Lexend, "Inter", -apple-system, "Segoe UI", sans-serif`
const MS = (w: number, px: number) => `${w} ${px}px Montserrat, "Inter", -apple-system, sans-serif`

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function ellipsis(ctx: CanvasRenderingContext2D, t: string, maxW: number) {
  if (ctx.measureText(t).width <= maxW) return t
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
// text cu spatiere intre litere, desenat litera cu litera (merge si in browserele fara ctx.letterSpacing, ex. Safari mai vechi)
function spatiat(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, sp: number, al: 'left' | 'right' = 'left') {
  const lat = [...t].reduce((s, c) => s + ctx.measureText(c).width + sp, 0) - sp
  let cx = al === 'right' ? x - lat : x
  ctx.textAlign = 'left'
  for (const c of t) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp }
  return lat
}

export type DateConfirmare = {
  limba: Limba; prenume: string; nume: string; cod: string; apt: string; adresa: string
  ci: string; co: string; oraCi: string; oraCo: string; oaspeti: number; total: number; achitat: number; moneda: string
}

// ─────────────────────────────────────────── desenul (dupa referinta 1098×1432) ───────────────────────────────────────────
export function deseneaza(cv: HTMLCanvasElement, d: DateConfirmare, poza: HTMLImageElement | null) {
  const L = T[d.limba]
  cv.width = W * S; cv.height = H * S
  const ctx = cv.getContext('2d')!
  ctx.setTransform(S, 0, 0, S, 0, 0)
  ctx.textBaseline = 'alphabetic'

  // ── fundal: negru-albastrui + navy, lumini difuze violet / albastre (nu culoare uniforma)
  const fond = ctx.createLinearGradient(0, 0, 0, H); fond.addColorStop(0, '#080D19'); fond.addColorStop(0.55, '#0B1122'); fond.addColorStop(1, '#090E1C')
  ctx.fillStyle = fond; ctx.fillRect(0, 0, W, H)
  const lum = (x: number, y: number, r: number, c: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(8,13,25,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }
  lum(860, 230, 470, 'rgba(120,76,190,0.30)'); lum(1098, 640, 560, 'rgba(70,90,220,0.16)'); lum(120, 980, 520, 'rgba(60,110,190,0.10)')
  lum(560, 1440, 420, 'rgba(150,100,240,0.22)'); lum(380, 300, 360, 'rgba(33,27,62,0.55)')
  // grila foarte fina, doar sus-dreapta
  ctx.save(); const gm = ctx.createRadialGradient(900, 160, 0, 900, 160, 520); gm.addColorStop(0, 'rgba(255,255,255,0.035)'); gm.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.strokeStyle = gm; ctx.lineWidth = 1
  for (let x = 560; x <= W; x += 46) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 640); ctx.stroke() }
  for (let y = 0; y <= 640; y += 46) { ctx.beginPath(); ctx.moveTo(560, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke() }
  ctx.restore()

  // ── forma decorativa sus-dreapta: marginea luminoasa a unei sfere (roz → violet → albastru), partial iesita din cadru
  const curba = () => { ctx.beginPath(); ctx.moveTo(790, -6); ctx.bezierCurveTo(705, 70, 680, 200, 800, 300); ctx.bezierCurveTo(860, 352, 920, 385, 1010, 425); ctx.lineTo(1110, 470) }
  ctx.save()
  curba(); ctx.lineTo(1110, -6); ctx.closePath()
  const sf = ctx.createLinearGradient(760, 0, 1098, 420); sf.addColorStop(0, 'rgba(70,48,110,0.40)'); sf.addColorStop(0.4, 'rgba(26,24,58,0.35)'); sf.addColorStop(1, 'rgba(14,16,40,0.25)')
  ctx.fillStyle = sf; ctx.fill()
  ctx.clip()
  // lumina interioara langa margine (sfera luminata din stanga-sus)
  ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = 'rgba(190,140,255,0.6)'; ctx.lineWidth = 34; ctx.shadowColor = 'rgba(190,140,255,0.8)'; ctx.shadowBlur = 40; curba(); ctx.stroke(); ctx.restore()
  const pt = ctx.createRadialGradient(805, 10, 0, 805, 10, 190); pt.addColorStop(0, 'rgba(255,225,240,0.40)'); pt.addColorStop(1, 'rgba(255,225,240,0)'); ctx.fillStyle = pt; ctx.fillRect(600, -10, 500, 400)
  ctx.restore()
  // lumina revarsata spre stanga, langa margine (sus e aproape alba)
  const rev = ctx.createRadialGradient(700, 140, 0, 700, 140, 320); rev.addColorStop(0, 'rgba(235,180,240,0.30)'); rev.addColorStop(1, 'rgba(230,170,240,0)'); ctx.fillStyle = rev; ctx.fillRect(400, -10, 500, 520)
  const cg = ctx.createLinearGradient(780, 0, 1098, 470); cg.addColorStop(0, 'rgba(255,214,236,0.95)'); cg.addColorStop(0.32, 'rgba(214,150,255,0.95)'); cg.addColorStop(0.7, 'rgba(130,120,255,0.85)'); cg.addColorStop(1, 'rgba(105,201,255,0.25)')
  for (const [lw, a, bl] of [[34, 0.12, 50], [12, 0.30, 26], [4, 0.75, 14], [1.6, 1, 6]] as const) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = cg; ctx.lineWidth = lw; ctx.shadowColor = 'rgba(199,148,246,0.9)'; ctx.shadowBlur = bl; curba(); ctx.stroke(); ctx.restore()
  }

  // ── forma decorativa jos: arc luminos cu centrul aproape alb
  const arc = () => { ctx.beginPath(); ctx.moveTo(150, H + 12); ctx.quadraticCurveTo(555, 1300, 960, H + 12) }
  const ag = ctx.createLinearGradient(150, 0, 960, 0); ag.addColorStop(0, 'rgba(105,201,255,0)'); ag.addColorStop(0.3, 'rgba(140,140,255,0.7)'); ag.addColorStop(0.5, 'rgba(240,226,255,1)'); ag.addColorStop(0.7, 'rgba(199,148,246,0.7)'); ag.addColorStop(1, 'rgba(166,108,235,0)')
  ctx.save(); arc(); ctx.lineTo(960, H + 12); ctx.closePath(); const af = ctx.createLinearGradient(0, 1360, 0, H); af.addColorStop(0, 'rgba(70,60,150,0.35)'); af.addColorStop(1, 'rgba(10,12,30,0.9)'); ctx.fillStyle = af; ctx.fill(); ctx.restore()
  for (const [lw, a, bl] of [[12, 0.15, 30], [3, 0.6, 14], [1.4, 1, 6]] as const) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = ag; ctx.lineWidth = lw; ctx.shadowColor = 'rgba(199,148,246,0.9)'; ctx.shadowBlur = bl; arc(); ctx.stroke(); ctx.restore()
  }

  // ── antet
  ctx.fillStyle = '#F5F5FA'; ctx.font = MS(300, 40); spatiat(ctx, 'AB HOMES', 81, 84, 6.2)
  ctx.fillStyle = '#B9BCCB'; ctx.font = MS(400, 15); spatiat(ctx, L.loc, 82, 121, 5.2)
  ctx.fillStyle = '#E6E7EF'; ctx.font = MS(400, 15); const sw = spatiat(ctx, L.sub, 1024, 82, 3.4, 'right')
  const ul = ctx.createLinearGradient(1024 - 78, 0, 1024, 0); ul.addColorStop(0, 'rgba(199,148,246,0.6)'); ul.addColorStop(1, '#C794F6')
  ctx.fillStyle = ul; ctx.fillRect(1024 - Math.min(78, sw), 106, Math.min(78, sw), 2)

  // ── bifa neon + „Rezervare confirmată”
  const bx = 83, by = 191, bs = 79
  ctx.save(); ctx.shadowColor = 'rgba(199,148,246,0.75)'; ctx.shadowBlur = 22
  const bf = ctx.createLinearGradient(bx, by, bx + bs, by + bs); bf.addColorStop(0, 'rgba(48,36,92,0.95)'); bf.addColorStop(1, 'rgba(20,24,52,0.95)')
  ctx.fillStyle = bf; rr(ctx, bx, by, bs, bs, 19); ctx.fill(); ctx.restore()
  const bb = ctx.createLinearGradient(bx, by, bx + bs, by + bs); bb.addColorStop(0, '#F3A6E0'); bb.addColorStop(0.5, '#C794F6'); bb.addColorStop(1, '#69C9FF')
  ctx.save(); ctx.strokeStyle = bb; ctx.lineWidth = 2.6; ctx.shadowColor = 'rgba(105,201,255,0.55)'; ctx.shadowBlur = 10; rr(ctx, bx, by, bs, bs, 19); ctx.stroke(); ctx.restore()
  ctx.save(); ctx.strokeStyle = '#EAF3FF'; ctx.lineWidth = 5.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(105,201,255,0.8)'; ctx.shadowBlur = 8
  ctx.beginPath(); ctx.moveTo(bx + 20, by + 41); ctx.lineTo(bx + 34, by + 55); ctx.lineTo(bx + 60, by + 25); ctx.stroke(); ctx.restore()
  ctx.fillStyle = '#F5F5FA'; ctx.font = LX(500, 51); ctx.fillText(ellipsis(ctx, L.titlu, W - 190 - 70), 190, 240)

  // ── „Vă mulțumim, Victoria!” + subtitlu
  ctx.font = LX(300, 40); ctx.fillStyle = '#C9CCD8'; ctx.fillText(L.multumim, 89, 328)
  const mw = ctx.measureText(L.multumim).width
  ctx.font = LX(500, 40); ctx.fillStyle = '#F5F5FA'; ctx.fillText(ellipsis(ctx, (d.prenume || '').trim() + '!', W - 89 - mw - 60), 89 + mw, 328)
  ctx.font = LX(300, 25); ctx.fillStyle = '#E8EAF2'; ctx.fillText(ellipsis(ctx, L.sejur, W - 94 - 60), 94, 368)

  // card de sticla: fundal navy semitransparent, gradient fin, bordura luminoasa (gradient), umbra moale
  const sticla = (x: number, y: number, w: number, h: number, r: number, bord: [number, string][], bordGrad: [number, number, number, number], fill?: CanvasGradient) => {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12
    ctx.fillStyle = fill || (() => { const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(26,30,58,0.78)'); g.addColorStop(1, 'rgba(12,16,34,0.82)'); return g })()
    rr(ctx, x, y, w, h, r); ctx.fill(); ctx.restore()
    const g = ctx.createLinearGradient(...bordGrad); bord.forEach(([o, c]) => g.addColorStop(o, c))
    ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 1.6; rr(ctx, x + 0.8, y + 0.8, w - 1.6, h - 1.6, r - 0.8); ctx.stroke(); ctx.restore()
  }
  const reflex = (x: number, y: number, w: number, h: number, r: number, cx: number, cy: number, rad: number, c: string) => {
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip()
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore()
  }

  // ── cardul apartamentului (poza reala in dreapta, cu tranzitie spre zona intunecata)
  const ax = 63, ay = 409, aw = 977, ah = 248, ar = 32
  sticla(ax, ay, aw, ah, ar, [[0, 'rgba(255,214,190,0.55)'], [0.35, 'rgba(255,255,255,0.22)'], [0.75, 'rgba(199,148,246,0.45)'], [1, 'rgba(255,255,255,0.35)']], [ax, ay + ah, ax + aw, ay])
  if (poza && poza.naturalWidth) {
    ctx.save(); rr(ctx, ax + 1, ay + 1, aw - 2, ah - 2, ar - 1); ctx.clip()
    const px = 430, pw = ax + aw - px, k = Math.max(pw / poza.naturalWidth, ah / poza.naturalHeight)
    const iw = poza.naturalWidth * k, ih = poza.naturalHeight * k
    ctx.drawImage(poza, px + (pw - iw) / 2, ay + (ah - ih) / 2, iw, ih)
    const fade = ctx.createLinearGradient(px, 0, px + 330, 0); fade.addColorStop(0, 'rgba(14,16,32,1)'); fade.addColorStop(0.55, 'rgba(14,16,32,0.55)'); fade.addColorStop(1, 'rgba(14,16,32,0)')
    ctx.fillStyle = fade; ctx.fillRect(px - 1, ay, 332, ah)
    const tus = ctx.createLinearGradient(0, ay, 0, ay + ah); tus.addColorStop(0, 'rgba(10,12,26,0.18)'); tus.addColorStop(1, 'rgba(10,12,26,0.38)'); ctx.fillStyle = tus; ctx.fillRect(px, ay, pw, ah)
    ctx.restore()
  }
  reflex(ax, ay, aw, ah, ar, ax + 40, ay + ah, 260, 'rgba(255,190,150,0.10)')
  ctx.fillStyle = '#C7CAD6'; ctx.font = LX(400, 15); spatiat(ctx, L.apt, 127, 472, 4.6)
  ctx.fillStyle = '#F5F5FA'; ctx.font = LX(400, 50); ctx.fillText(ellipsis(ctx, d.apt || '—', poza ? 560 : aw - 140), 125, 534)
  if (d.adresa) {
    // pin de locatie (contur)
    ctx.save(); ctx.strokeStyle = '#E3E5EE'; ctx.lineWidth = 2.2; ctx.beginPath()
    ctx.arc(138, 580, 10, Math.PI * 0.82, Math.PI * 2.18); ctx.lineTo(138, 596); ctx.closePath(); ctx.stroke()
    ctx.beginPath(); ctx.arc(138, 580, 3.6, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
    ctx.fillStyle = '#E3E5EE'; ctx.font = LX(300, 23); ctx.fillText(ellipsis(ctx, d.adresa, (poza ? 750 : aw - 160) - 167 + ax), 167, 592)
  }
  // sageata intr-un cerc transparent
  ctx.save(); ctx.fillStyle = 'rgba(20,18,30,0.45)'; ctx.beginPath(); ctx.arc(960, 585, 29, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6; ctx.stroke()
  ctx.strokeStyle = '#F5F5FA'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(948, 585); ctx.lineTo(972, 585); ctx.moveTo(963, 576); ctx.lineTo(972, 585); ctx.lineTo(963, 594); ctx.stroke(); ctx.restore()

  // ── check-in / check-out: doua carduri egale
  const dCard = (x: number, et: string, iso: string, pre: string, ora: string, rece: boolean) => {
    const y = 688, w = 474, h = 225, r = 26
    sticla(x, y, w, h, r, rece
      ? [[0, 'rgba(105,201,255,0.75)'], [0.45, 'rgba(255,255,255,0.10)'], [1, 'rgba(120,130,255,0.95)']]
      : [[0, 'rgba(105,201,255,0.75)'], [0.45, 'rgba(255,255,255,0.10)'], [1, 'rgba(199,148,246,0.95)']], [x, y + h, x + w, y])
    reflex(x, y, w, h, r, x + w * 0.82, y - 6, 300, rece ? 'rgba(120,140,255,0.62)' : 'rgba(210,150,250,0.62)')
    reflex(x, y, w, h, r, x + 20, y + h + 20, 240, 'rgba(105,201,255,0.30)')
    // pictograma calendar intr-un patrat cu contur neon
    const ix = x + 41, iy = y + 39, is = 66
    ctx.save(); ctx.fillStyle = 'rgba(40,32,80,0.7)'; ctx.shadowColor = 'rgba(199,148,246,0.6)'; ctx.shadowBlur = 16; rr(ctx, ix, iy, is, is, 15); ctx.fill(); ctx.restore()
    const ig = ctx.createLinearGradient(ix, iy, ix + is, iy + is); ig.addColorStop(0, '#E9A9F5'); ig.addColorStop(1, rece ? '#69C9FF' : '#A66CEB')
    ctx.save(); ctx.strokeStyle = ig; ctx.lineWidth = 2; rr(ctx, ix, iy, is, is, 15); ctx.stroke()
    ctx.strokeStyle = '#F5F5FA'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
    rr(ctx, ix + 18, iy + 21, 30, 28, 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ix + 18, iy + 30); ctx.lineTo(ix + 48, iy + 30); ctx.moveTo(ix + 25, iy + 16); ctx.lineTo(ix + 25, iy + 24); ctx.moveTo(ix + 41, iy + 16); ctx.lineTo(ix + 41, iy + 24); ctx.stroke(); ctx.restore()
    const zi = iso ? new Date(iso + 'T12:00:00') : null
    const tx = x + 140
    ctx.fillStyle = '#D9DBE6'; ctx.font = LX(400, 15); spatiat(ctx, et, tx, y + 47, 4.4)
    ctx.fillStyle = '#F5F5FA'; ctx.font = LX(300, 78); ctx.fillText(zi ? String(zi.getDate()).padStart(2, '0') : '—', tx - 3, y + 122)
    ctx.fillStyle = '#E3E5EE'; ctx.font = LX(400, 24); ctx.fillText(zi ? `${L.luni[zi.getMonth()]} · ${L.zile[zi.getDay()]}` : '', tx + 3, y + 160)
    ctx.font = LX(400, 22); ctx.fillStyle = '#E3E5EE'; ctx.fillText(pre, tx + 4, y + 196)
    const pw = ctx.measureText(pre).width; ctx.font = LX(600, 22); ctx.fillStyle = '#F5F5FA'; ctx.fillText(ora, tx + 4 + pw, y + 196)
  }
  dCard(63, L.checkin, d.ci, L.dela, d.oraCi, false)
  dCard(565, L.checkout, d.co, L.panala, d.oraCo, true)

  // ── cardul central: oaspeti / nopti | situatia platii
  const fx = 63, fy = 942, fw = 975, fh = 191, fr = 28
  const ff = ctx.createLinearGradient(fx, 0, fx + fw, 0); ff.addColorStop(0, 'rgba(24,40,72,0.82)'); ff.addColorStop(0.5, 'rgba(18,22,46,0.84)'); ff.addColorStop(1, 'rgba(30,24,60,0.84)')
  sticla(fx, fy, fw, fh, fr, [[0, 'rgba(105,201,255,0.55)'], [0.5, 'rgba(255,255,255,0.10)'], [1, 'rgba(199,148,246,0.85)']], [fx, fy + fh, fx + fw, fy], ff)
  reflex(fx, fy, fw, fh, fr, fx + 60, fy, 300, 'rgba(105,201,255,0.14)')
  reflex(fx, fy, fw, fh, fr, fx + fw - 80, fy, 320, 'rgba(199,148,246,0.20)')
  // oaspete (pictograma persoana) | noapte (luna)
  ctx.save(); ctx.strokeStyle = '#F5F5FA'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(125, 1018, 11, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(106, 1046); ctx.quadraticCurveTo(106, 1031, 125, 1031); ctx.quadraticCurveTo(144, 1031, 144, 1046); ctx.closePath(); ctx.stroke()
  { const cx = 352, cy = 1027, R = 18, a1 = -Math.PI * 0.30, a2 = Math.PI * 0.36
    ctx.lineJoin = 'round'; ctx.beginPath(); ctx.arc(cx, cy, R, a1, a2, true)
    ctx.quadraticCurveTo(cx - 6, cy + 3, cx + R * Math.cos(a1), cy + R * Math.sin(a1)); ctx.closePath(); ctx.stroke() }
  ctx.restore()
  const nN = noptiIntre(d.ci, d.co)
  ctx.fillStyle = '#F5F5FA'; ctx.font = LX(400, 25); ctx.fillText(L.oaspeti(d.oaspeti), 166, 1036); ctx.fillText(L.nopti(nN), 397, 1036)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(301, 996, 1, 64); ctx.fillRect(549, 966, 1, 144)
  // plata: total / avans / rest (sau „achitat integral”)
  const total = Math.max(0, d.total), achitat = Math.max(0, Math.min(d.achitat, total || d.achitat)), rest = Math.max(0, Math.round((total - achitat) * 100) / 100)
  const integral = total > 0 && achitat >= total
  ctx.fillStyle = '#C7CAD6'; ctx.font = LX(400, 15); spatiat(ctx, L.total, 603, 988, 3.2)
  const tg = ctx.createLinearGradient(820, 960, 995, 1000); tg.addColorStop(0, '#E8CCFF'); tg.addColorStop(1, '#C794F6')
  ctx.textAlign = 'right'; ctx.fillStyle = tg; ctx.font = LX(500, 37); ctx.fillText(fmtBani(total, d.moneda), 995, 994); ctx.textAlign = 'left'
  if (achitat > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(603, 1012, 392, 1)
    ctx.fillStyle = '#C7CAD6'; ctx.font = LX(400, 15); spatiat(ctx, integral ? L.achitat : L.avans, 603, 1042, 3.2)
    ctx.textAlign = 'right'; ctx.fillStyle = '#D7D9E3'; ctx.font = LX(400, 22); ctx.fillText(fmtBani(achitat, d.moneda), 995, 1044); ctx.textAlign = 'left'
  }
  // pastila „rest de plata” (cel mai vizibil element financiar) sau „achitat integral ✓”
  const py = achitat > 0 ? 1063 : 1037, pxx = 578, pww = 439, phh = 48
  ctx.save(); ctx.shadowColor = integral ? 'rgba(80,230,200,0.55)' : 'rgba(199,148,246,0.6)'; ctx.shadowBlur = 18
  const pf = ctx.createLinearGradient(pxx, 0, pxx + pww, 0)
  if (integral) { pf.addColorStop(0, 'rgba(30,110,110,0.75)'); pf.addColorStop(1, 'rgba(20,50,80,0.85)') } else { pf.addColorStop(0, 'rgba(120,52,130,0.85)'); pf.addColorStop(0.55, 'rgba(70,46,120,0.85)'); pf.addColorStop(1, 'rgba(36,40,96,0.9)') }
  ctx.fillStyle = pf; rr(ctx, pxx, py, pww, phh, 24); ctx.fill(); ctx.restore()
  const pb = ctx.createLinearGradient(pxx, 0, pxx + pww, 0)
  if (integral) { pb.addColorStop(0, '#5EEAD4'); pb.addColorStop(1, '#69C9FF') } else { pb.addColorStop(0, '#F3A6E0'); pb.addColorStop(0.5, '#C794F6'); pb.addColorStop(1, '#69C9FF') }
  ctx.save(); ctx.strokeStyle = pb; ctx.lineWidth = 2; rr(ctx, pxx, py, pww, phh, 24); ctx.stroke(); ctx.restore()
  ctx.fillStyle = '#FFFFFF'; ctx.font = LX(500, 19)
  if (integral) { spatiat(ctx, L.integral + ' ✓', 602, py + 31, 1.2) }
  else { spatiat(ctx, L.rest, 602, py + 31, 0.9); ctx.textAlign = 'right'; ctx.font = LX(500, 32); ctx.fillText(fmtBani(rest, d.moneda), 992, py + 36); ctx.textAlign = 'left' }

  // ── card compact WhatsApp
  const wx = 63, wy = 1159, ww = 975, wh = 69
  sticla(wx, wy, ww, wh, 18, [[0, 'rgba(199,148,246,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(199,148,246,0.55)']], [wx, wy, wx + ww, wy])
  ctx.save(); ctx.strokeStyle = '#F5F5FA'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.arc(132, 1193, 19, Math.PI * 0.75, Math.PI * 2.62); ctx.lineTo(114, 1213); ctx.closePath(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(125, 1184); ctx.quadraticCurveTo(124, 1200, 140, 1203); ctx.stroke()
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(124, 1183); ctx.lineTo(127, 1186); ctx.moveTo(138, 1202); ctx.lineTo(142, 1204); ctx.stroke(); ctx.restore()
  ctx.fillStyle = '#E3E5EE'; ctx.font = LX(300, 20); ctx.fillText(ellipsis(ctx, L.wa, 760), 192, 1200)
  ctx.save(); ctx.strokeStyle = '#C794F6'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(974, 1193); ctx.lineTo(998, 1193); ctx.moveTo(989, 1184); ctx.lineTo(998, 1193); ctx.lineTo(989, 1202); ctx.stroke(); ctx.restore()

  // ── subsol: nr. rezervare | site + motto
  ctx.fillStyle = '#B9BCCB'; ctx.font = LX(400, 15); spatiat(ctx, L.nr, 82, 1297, 4)
  ctx.fillStyle = '#F5F5FA'; ctx.font = LX(300, 34); spatiat(ctx, d.cod, 81, 1340, 1.6)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(555, 1297, 1.2, 44)
  ctx.fillStyle = '#F5F5FA'; ctx.font = LX(400, 19); spatiat(ctx, SITE.toUpperCase(), 986, 1303, 2.6, 'right')
  ctx.save(); ctx.strokeStyle = '#E3E5EE'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(1011, 1287); ctx.lineTo(1006, 1287); ctx.quadraticCurveTo(1004, 1287, 1004, 1289); ctx.lineTo(1004, 1302); ctx.quadraticCurveTo(1004, 1304, 1006, 1304); ctx.lineTo(1019, 1304); ctx.quadraticCurveTo(1021, 1304, 1021, 1302); ctx.lineTo(1021, 1297)
  ctx.moveTo(1015, 1286); ctx.lineTo(1022, 1286); ctx.lineTo(1022, 1293); ctx.moveTo(1022, 1286); ctx.lineTo(1012, 1296); ctx.stroke(); ctx.restore()
  ctx.textAlign = 'right'; ctx.fillStyle = '#C9CCD8'; ctx.font = `italic 300 20px Inter, -apple-system, sans-serif`; ctx.fillText(L.motto, 1027, 1338); ctx.textAlign = 'left'
}

