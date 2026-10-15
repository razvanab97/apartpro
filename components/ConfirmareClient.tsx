'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Download, FileText, MessageCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Confirmare de rezervare pentru client, ca imagine / PDF (cerut direct: „o poză cu confirmarea către client,
// cu buton de copiere, cu detaliile standard + observațiile către client — să arate oficial, premium, futurist”).
// Imaginea se desenează local pe canvas (1080×1350, format bun pentru WhatsApp) - fără servicii externe.
// Observațiile INTERNE ale rezervării (pot conține CNP etc.) nu apar niciodată pe confirmare; textul pentru
// client e un câmp separat, precompletat cu informațiile standard.

const ORA_CHECKIN = '15:00', ORA_CHECKOUT = '11:00', SITE = 'abhomesiasi.ro'
const W = 1080, H = 1440

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

// Randurile despre plata din observatiile rezervarii (ex. „avans de plata: 50 RON” / „rest de plata la check in: 500 RON”)
// apar exact asa pe confirmare (cerut direct); datele de buletin / notele interne raman pe dinafara
function plataDinObservatii(obs?: string | null) {
  return String(obs || '').split(/\n|·/).map(x => x.trim())
    .filter(x => x && /avans|rest\b|rest de|de plat|plătit|platit|achitat|achitare|plata|plată/i.test(x) && !/creat[aă] din|cnp|buletin|serie/i.test(x))
    .map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' · ')
}

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

type Opt = { limba: Limba; note: string; arataPret: boolean; arataAdresa: boolean; plata: string }

// spatiere intre litere pentru etichete (unde browserul o suporta)
function spatiere(ctx: CanvasRenderingContext2D, v: string) { try { (ctx as any).letterSpacing = v } catch {} }

function deseneaza(cv: HTMLCanvasElement, r: any, apt: any, o: Opt): boolean {
  let taiat = false
  const L = T[o.limba]
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  // fundal: navy adanc + aure cyan / violet + grila fina
  ctx.fillStyle = '#050A14'; ctx.fillRect(0, 0, W, H)
  const aura = (x: number, y: number, rad: number, c: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, c); g.addColorStop(1, 'rgba(5,10,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }
  aura(980, 40, 640, 'rgba(56,189,248,0.24)'); aura(60, H - 80, 720, 'rgba(139,92,246,0.22)'); aura(540, 700, 560, 'rgba(37,99,235,0.07)')
  ctx.strokeStyle = 'rgba(148,197,255,0.045)'; ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke() }
  // rama + colturi de „scanner”
  ctx.strokeStyle = 'rgba(148,197,255,0.16)'; ctx.lineWidth = 2; rr(ctx, 28, 28, W - 56, H - 56, 34); ctx.stroke()
  ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 5; ctx.lineCap = 'round'
  for (const [x, y, dx, dy] of [[28, 28, 1, 1], [W - 28, 28, -1, 1], [28, H - 28, 1, -1], [W - 28, H - 28, -1, -1]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 74); ctx.lineTo(x, y + dy * 14); ctx.quadraticCurveTo(x, y, x + dx * 14, y); ctx.lineTo(x + dx * 74, y); ctx.stroke()
  }
  const X0 = 80, XW = W - 160
  const eticheta = (t: string, x: number, y: number, c = 'rgba(186,214,255,0.62)', px = 19, al: CanvasTextAlign = 'left') => {
    ctx.textAlign = al; ctx.fillStyle = c; ctx.font = M(700, px); spatiere(ctx, '2px'); ctx.fillText(t, x, y); spatiere(ctx, '0px'); ctx.textAlign = 'left'
  }

  // ── antet: marca + insigna
  const lg = ctx.createLinearGradient(X0, 78, X0 + 70, 148); lg.addColorStop(0, '#38BDF8'); lg.addColorStop(1, '#8B5CF6')
  ctx.fillStyle = lg; rr(ctx, X0, 78, 70, 70, 20); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AB', X0 + 35, 114)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 34); ctx.fillText('AB HOMES', X0 + 90, 110)
  eticheta('IAȘI · PREMIUM APARTMENTS', X0 + 90, 140, 'rgba(186,214,255,0.62)', 17)
  ctx.font = M(700, 19); spatiere(ctx, '1px'); const sub = L.sub; const sw = ctx.measureText(sub).width + 84; spatiere(ctx, '0px')
  const bx = W - X0 - sw
  ctx.fillStyle = 'rgba(74,222,128,0.13)'; rr(ctx, bx, 86, sw, 54, 27); ctx.fill()
  ctx.strokeStyle = 'rgba(74,222,128,0.6)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#4ADE80'; ctx.beginPath(); ctx.arc(bx + 30, 113, 13, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#052E16'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(bx + 24, 113); ctx.lineTo(bx + 29, 118); ctx.lineTo(bx + 37, 108); ctx.stroke()
  ctx.fillStyle = '#4ADE80'; ctx.font = M(700, 19); spatiere(ctx, '1px'); ctx.fillText(sub, bx + 54, 120); spatiere(ctx, '0px')

  // ── titlu, oaspete, nr. rezervare
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 78); ctx.fillText(ellipsis(ctx, L.titlu, XW), X0, 258)
  const tg = ctx.createLinearGradient(X0, 0, X0 + 760, 0); tg.addColorStop(0, '#7DD3FC'); tg.addColorStop(1, '#C4B5FD')
  ctx.fillStyle = tg; ctx.font = F(700, 50); ctx.fillText(ellipsis(ctx, String(r.nume_client || '').trim(), XW), X0, 326)
  eticheta(L.nr.toUpperCase(), X0, 378)
  ctx.font = M(700, 19); spatiere(ctx, '2px'); const lw = ctx.measureText(L.nr.toUpperCase()).width; spatiere(ctx, '0px')
  ctx.fillStyle = '#E0F2FE'; ctx.font = M(700, 30); ctx.fillText(codRezervare(r), X0 + lw + 20, 380)

  // ── card date: check-in → check-out
  const cy = 414, ch = 270
  ctx.fillStyle = 'rgba(15,30,56,0.78)'; rr(ctx, X0, cy, XW, ch, 30); ctx.fill()
  const bg = ctx.createLinearGradient(X0, cy, X0 + XW, cy + ch); bg.addColorStop(0, 'rgba(56,189,248,0.75)'); bg.addColorStop(1, 'rgba(139,92,246,0.75)')
  ctx.strokeStyle = bg; ctx.lineWidth = 2.5; ctx.stroke()
  const col = (x: number, et: string, iso: string, ora: string, al: CanvasTextAlign) => {
    const d = dataLunga(iso, o.limba)
    eticheta(et, x, cy + 56, '#38BDF8', 21, al)
    ctx.textAlign = al
    ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 112); ctx.fillText(d.zi, x, cy + 166)
    ctx.fillStyle = '#E0F2FE'; ctx.font = F(600, 28); ctx.fillText(d.rest, x, cy + 208)
    ctx.fillStyle = '#FCD34D'; ctx.font = M(700, 25); ctx.fillText(ora, x, cy + 246)
    ctx.textAlign = 'left'
  }
  col(X0 + 44, L.checkin, r.data_checkin, `${L.dela} ${ORA_CHECKIN}`, 'left')
  col(X0 + XW - 44, L.checkout, r.data_checkout, `${L.panala} ${ORA_CHECKOUT}`, 'right')
  const mx = X0 + XW / 2, nN = Math.max(1, Math.round((new Date(r.data_checkout + 'T12:00:00').getTime() - new Date(r.data_checkin + 'T12:00:00').getTime()) / 86400000)) || 0
  ctx.strokeStyle = 'rgba(148,197,255,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(mx - 130, cy + 128); ctx.lineTo(mx + 130, cy + 128); ctx.stroke(); ctx.setLineDash([])
  ctx.font = M(700, 22); const nt = L.nopti(nN); const nw = ctx.measureText(nt).width + 44
  ctx.fillStyle = '#0B1730'; rr(ctx, mx - nw / 2, cy + 105, nw, 46, 23); ctx.fill(); ctx.strokeStyle = 'rgba(56,189,248,0.7)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#7DD3FC'; ctx.textAlign = 'center'; ctx.fillText(nt, mx, cy + 136); ctx.textAlign = 'left'

  // ── apartament + adresa
  let y = cy + ch + 66
  eticheta(L.apt.toUpperCase(), X0, y)
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 42); ctx.fillText(ellipsis(ctx, String(apt?.nume || '').trim() || '—', XW), X0, y + 50)
  y += 50
  if (o.arataAdresa && apt?.adresa) {
    ctx.font = F(500, 27)
    const la = wrap(ctx, String(apt.adresa).trim(), XW - 40).slice(0, 2)
    // pin de locatie
    ctx.fillStyle = '#38BDF8'; ctx.beginPath(); ctx.arc(X0 + 10, y + 30, 8, Math.PI, 0); ctx.lineTo(X0 + 10, y + 46); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#050A14'; ctx.beginPath(); ctx.arc(X0 + 10, y + 30, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(224,242,254,0.85)'; ctx.font = F(500, 27)
    la.forEach((ln, i) => ctx.fillText(ln, X0 + 34, y + 44 + i * 36))
    y += 44 + (la.length - 1) * 36
  }

  // ── casete: oaspeti | total + plata
  y += 34
  const gap = 18, w1 = 270, w2 = XW - w1 - gap
  // plata pe randuri: fiecare parte („avans …” / „rest …”) pe randul ei, max 3 randuri
  const plataTxt = o.plata.trim() || plataText(r, o.limba)
  const cuPret = o.arataPret && Number(r.valoare_bruta) > 0
  ctx.font = F(700, cuPret ? 26 : 30)
  const rPlata = plataTxt.split(/\s*·\s*|\n/).filter(Boolean).flatMap(x => wrap(ctx, x, w2 - 60)).slice(0, 3)
  const th = Math.max(158, cuPret ? 136 + rPlata.length * 34 : 104 + rPlata.length * 40)
  const caseta = (x: number, w: number, accent: string) => {
    ctx.fillStyle = 'rgba(15,30,56,0.7)'; rr(ctx, x, y, w, th, 24); ctx.fill()
    ctx.strokeStyle = 'rgba(148,197,255,0.16)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = accent; rr(ctx, x, y + 26, 5, th - 52, 3); ctx.fill()
  }
  caseta(X0, w1, '#38BDF8')
  eticheta(L.oaspeti.toUpperCase(), X0 + 30, y + 46)
  const nP = Number(r.nr_persoane) || 1
  const yN = y + Math.round(th / 2 + 48)
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 64); ctx.fillText(String(nP), X0 + 30, yN)
  const nwP = ctx.measureText(String(nP)).width
  ctx.fillStyle = 'rgba(224,242,254,0.8)'; ctx.font = F(600, 26); ctx.fillText(L.pers(nP).replace(/^\d+\s*/, ''), X0 + 30 + nwP + 12, yN - 2)
  const x2 = X0 + w1 + gap
  const platit = /achitat integral|paid in full|achitat prin|paid via/i.test(o.plata)
  caseta(x2, w2, platit ? '#4ADE80' : '#FCD34D')
  if (cuPret) {
    eticheta(L.total.toUpperCase(), x2 + 30, y + 46)
    ctx.fillStyle = '#4ADE80'; ctx.font = F(700, 50); ctx.fillText(fmtBani(r.valoare_bruta, r.moneda), x2 + 30, y + 102)
    ctx.fillStyle = platit ? '#86EFAC' : '#FCD34D'; ctx.font = F(700, 26)
    rPlata.forEach((ln, i) => ctx.fillText(ln, x2 + 30, y + 142 + i * 34))
  } else {
    eticheta(L.plata.toUpperCase(), x2 + 30, y + 46)
    ctx.fillStyle = platit ? '#4ADE80' : '#FCD34D'; ctx.font = F(700, 30)
    rPlata.forEach((ln, i) => ctx.fillText(ln, x2 + 30, y + 92 + i * 40))
  }
  y += th + 30

  // ── informatii pentru client - buline; textul lung se micsoreaza (27→18px) inainte sa fie taiat
  const fy = H - 132
  const note = o.note.trim()
  if (note) {
    const parag = note.split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace(/^[•\-–·*]\s*/, ''))
    const top = y, loc = fy - 34 - top - 66
    let fs = 27, lh = 38, linii: { t: string; b: boolean }[] = []
    for (fs = 27; fs >= 18; fs--) {
      lh = Math.round(fs * 1.38); ctx.font = F(500, fs)
      linii = parag.flatMap(pp => wrap(ctx, pp, XW - 96).map((t, i) => ({ t, b: i === 0 })))
      if (linii.length * lh <= loc) break
    }
    const maxL = Math.max(1, Math.floor(loc / lh))
    if (linii.length > maxL) { taiat = true; linii = linii.slice(0, maxL); linii[maxL - 1] = { ...linii[maxL - 1], t: ellipsis(ctx, linii[maxL - 1].t + ' …', XW - 96) } }
    const bh = 66 + linii.length * lh + 14
    ctx.fillStyle = 'rgba(139,92,246,0.12)'; rr(ctx, X0, top, XW, bh, 24); ctx.fill()
    ctx.strokeStyle = 'rgba(167,139,250,0.42)'; ctx.lineWidth = 1.5; ctx.stroke()
    eticheta(L.info, X0 + 34, top + 44, '#C4B5FD', 19)
    ctx.font = F(500, fs)
    linii.forEach((ln, i) => {
      const yy = top + 66 + lh * (i + 1) - Math.round(lh * 0.3)
      if (ln.b) { ctx.fillStyle = '#A78BFA'; ctx.beginPath(); ctx.arc(X0 + 42, yy - fs * 0.33, 5, 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = '#F5F3FF'; ctx.fillText(ln.t, X0 + 62, yy)
    })
  }

  // ── subsol: bara holografica, multumim, emis, cod verificare
  const hg = ctx.createLinearGradient(X0, 0, X0 + XW, 0); hg.addColorStop(0, '#38BDF8'); hg.addColorStop(0.5, '#8B5CF6'); hg.addColorStop(1, '#FCD34D')
  ctx.fillStyle = hg; rr(ctx, X0, fy, XW, 5, 2.5); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.font = F(700, 29); ctx.fillText(L.multumim, X0, fy + 54)
  const azi = new Date(); const emis = `${L.emis} ${String(azi.getDate()).padStart(2, '0')}.${String(azi.getMonth() + 1).padStart(2, '0')}.${azi.getFullYear()}`
  eticheta(`${SITE}  ·  ${emis}`, X0, fy + 90, 'rgba(186,214,255,0.6)', 18)
  eticheta(L.verif.toUpperCase(), X0 + XW, fy + 52, 'rgba(186,214,255,0.6)', 18, 'right')
  ctx.textAlign = 'right'; ctx.fillStyle = '#E0F2FE'; ctx.font = M(700, 28)
  ctx.fillText(codVerificare(codRezervare(r) + r.data_checkin + r.data_checkout + r.nume_client), X0 + XW, fy + 90)
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
    o.arataPret && Number(r.valoare_bruta) > 0 ? `💳 ${L.total}: ${fmtBani(r.valoare_bruta, r.moneda)} · ${o.plata.trim() || plataText(r, o.limba)}` : `💳 ${L.plata}: ${o.plata.trim() || plataText(r, o.limba)}`,
    o.note.trim() ? '\nℹ️ ' + L.info.charAt(0) + L.info.slice(1).toLowerCase() + ':\n' + o.note.trim().split('\n').map(x => x.trim()).filter(Boolean).map(x => '• ' + x.replace(/^[•\-–·*]\s*/, '')).join('\n') : null,
    '', L.multumim, SITE,
  ]
  return linii.filter((x): x is string => x !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// Se deschide fie cu rezervarea deja incarcata (editorul), fie doar cu id-ul ei (ex. fereastra rapida din Calendar)
export default function ConfirmareClient(props: { rezervare?: any; apt?: any; rezervareId?: string; onClose: () => void }) {
  const [incarcat, setIncarcat] = useState<{ r: any; apt: any } | null>(props.rezervare ? { r: props.rezervare, apt: props.apt } : null)
  const [eroare, setEroare] = useState<string | null>(null)
  useEffect(() => {
    if (props.rezervare || !props.rezervareId) return
    Promise.resolve(supabase.from('rezervari').select('*, apartament:apartamente(nume,nota,adresa)').eq('id', props.rezervareId).single())
      .then(({ data, error }) => error || !data ? setEroare(error?.message || 'Rezervarea nu a fost găsită') : setIncarcat({ r: data, apt: (data as any).apartament }))
      .catch((e: any) => setEroare(e.message))
  }, [props.rezervare, props.rezervareId])
  if (incarcat) return <ConfirmareClientPanou rezervare={incarcat.r} apt={incarcat.apt} onClose={props.onClose} />
  return (
    <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(3,7,15,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderRadius: 12, background: '#0B1524', border: '1px solid rgba(159,215,255,0.14)', color: eroare ? '#F87171' : 'rgba(159,215,255,0.7)', fontSize: 13 }}>
        {eroare ? '⚠ ' + eroare : <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă rezervarea…</>}
      </div>
    </div>
  )
}

function ConfirmareClientPanou({ rezervare, apt, onClose }: { rezervare: any; apt: any; onClose: () => void }) {
  const [limba, setLimba] = useState<Limba>('ro')
  const [plata, setPlata] = useState(() => plataDinObservatii(rezervare.observatii) || plataText(rezervare, 'ro'))
  const [note, setNote] = useState(T.ro.note)
  const [arataPret, setArataPret] = useState(true)
  const [arataAdresa, setArataAdresa] = useState(true)
  const [img, setImg] = useState<string | null>(null)
  const [stare, setStare] = useState<string | null>(null)
  const [gata, setGata] = useState(false)
  const [taiat, setTaiat] = useState(false)
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const opt = useMemo(() => ({ limba, note, arataPret, arataAdresa, plata }), [limba, note, arataPret, arataAdresa, plata])

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

  function schimbaLimba(l: Limba) {
    setLimba(l)
    if (note.trim() === T[limba].note.trim()) setNote(T[l].note)
    if (plata.trim() === plataText(rezervare, limba)) setPlata(plataText(rezervare, l))
  }
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(3,7,15,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#FCD34D' }}>
            Plată (apare exact așa)
            <input value={plata} onChange={e => setPlata(e.target.value)} placeholder="ex. 50 RON avans, restul la locație"
              style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(252,211,77,0.35)', color: '#FFFFFF', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, outline: 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(159,215,255,0.45)' }}>Preluat din observațiile rezervării (avans / rest); îl poți modifica.</span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#C4B5FD' }}>
            Observații pentru client
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={5}
              style={{ resize: 'vertical', padding: '10px 12px', borderRadius: 10, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(167,139,250,0.3)', color: '#FFFFFF', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, fontWeight: 400, outline: 'none' }} />
            {taiat && <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#FCD34D' }}>⚠ Textul e prea lung — pe poză încap doar primele rânduri (textul copiat e complet). Scurtează-l.</span>}
            <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(159,215,255,0.45)' }}>Apare pe confirmare. Observațiile interne ale rezervării (CNP etc.) nu apar.</span>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comut(arataPret, setArataPret, 'Arată prețul total')}
            {comut(arataAdresa, setArataAdresa, 'Arată adresa apartamentului')}
          </div>

          {/* actiuni grupate (cerut direct: copiere si pentru imagine, nu doar pentru text) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
            {([
              ['Poză', <>
                <button key="cp" onClick={copiazaPoza} disabled={!img} style={{ ...btn('linear-gradient(135deg,#2563EB,#7C3AED)', '#FFFFFF', 'transparent'), flex: 1.4 }}><Copy size={14} /> Copiază poza</button>
                <button key="png" onClick={descarcaPng} disabled={!img} style={{ ...btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)'), flex: 1 }}><Download size={14} /> PNG</button>
              </>],
              ['Text', <>
                <button key="ct" onClick={copiazaText} style={{ ...btn('rgba(77,163,255,0.1)', '#7BC8FF', 'rgba(77,163,255,0.3)'), flex: 1.4 }}><FileText size={14} /> Copiază text</button>
                {tel.length >= 9
                  ? <a key="wa" href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" style={{ ...btn('rgba(37,211,102,0.12)', '#4ADE80', 'rgba(37,211,102,0.35)'), flex: 1 }}><MessageCircle size={14} /> WhatsApp</a>
                  : <span key="wa" style={{ ...btn('transparent', 'rgba(159,215,255,0.35)', 'rgba(159,215,255,0.1)'), flex: 1, cursor: 'default', fontWeight: 500, fontSize: 11.5 }}>fără telefon</span>}
              </>],
              ['PDF', <>
                <button key="pdf" onClick={descarcaPdf} disabled={!img} style={{ ...btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)'), flex: 1 }}><Download size={14} /> Descarcă PDF</button>
              </>],
            ] as [string, React.ReactNode][]).map(([et, c]) => (
              <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 38, flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.45)' }}>{et}</span>
                {c}
              </div>
            ))}
          </div>
          {stare && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: stare.startsWith('Browserul') || stare.startsWith('Nu') || stare.startsWith('Eroare') ? '#FCD34D' : '#4ADE80' }}><Check size={13} /> {stare}</div>}
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', lineHeight: 1.5 }}>Pas rapid: „Copiază poza” → „WhatsApp” (se deschide chatul cu clientul) → lipește poza.</div>
        </div>
      </div>
      <style>{`@media (max-width: 760px){ .cf-wrap{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
