// Documentul de confirmare a rezervarii (A4, PDF cu text real - cerut direct: „ce document de confirmare recomanzi să
// generăm pentru fiecare rezervare … cu buton” + „să putem să ștergem din informații dacă nu vrem să apară”).
// Primeste doar ce trebuie sa apara (randurile ascunse / goale sunt deja scoase de panou) si deseneaza: antet AB HOMES cu
// datele firmei + nr. document, pastila de stare, cardurile Oaspete / Cazare, tabelul Plata, textele (conditii, mentiuni),
// subsolul („nu ține loc de factură fiscală”). Font Lexend (diacritice); daca nu se incarca -> Helvetica fara diacritice.

type Rgb = [number, number, number]
const NAVY: Rgb = [11, 16, 32], NAVY2: Rgb = [17, 26, 51], INK: Rgb = [24, 28, 44], MUTED: Rgb = [112, 120, 142], LINIE: Rgb = [226, 229, 240]
const VIOLET: Rgb = [124, 111, 214], CYAN: Rgb = [79, 179, 200], CARD: Rgb = [247, 248, 252]
const PW = 210, PH = 297, M = 16

export type RandPdf = { et: string; v: string; tare?: boolean }
export type DocPdf = {
  titlu: string; nrEt: string; nrDoc: string; dataEt: string; dataEmitere: string
  firma: { nume: string; linii: string[] }
  stare: { text: string; ton: 'verde' | 'aur' | 'rosu' } | null
  intro: string
  carduri: { titlu: string; randuri: RandPdf[] }[]          // Oaspete / Cazare - cate doua pe rand
  plata: { titlu: string; randuri: RandPdf[]; total?: RandPdf | null; jos: RandPdf[] } | null
  texte: { titlu: string; text: string }[]
  subsol: string[]
  pagina: (i: number, n: number) => string
}

let fonturi: Promise<[string | null, string | null, string | null]> | null = null
async function b64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url); if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer()); let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  } catch { return null }
}

export async function documentConfirmarePdf(d: DocPdf): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  if (!fonturi) fonturi = Promise.all([b64('/fonts/Lexend-Regular.ttf'), b64('/fonts/Lexend-SemiBold.ttf'), b64('/logo.jpg')])
  const [reg, semi, logo] = await fonturi
  let F = 'helvetica', T = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\xFF]/g, '')
  if (reg && semi) {
    doc.addFileToVFS('Lexend-Regular.ttf', reg); doc.addFont('Lexend-Regular.ttf', 'Lexend', 'normal')
    doc.addFileToVFS('Lexend-SemiBold.ttf', semi); doc.addFont('Lexend-SemiBold.ttf', 'Lexend', 'bold')
    F = 'Lexend'; T = (s: string) => String(s)
  }
  doc.setProperties({ title: `${d.titlu} ${d.nrDoc}`, creator: 'AB HOMES' })
  const font = (stil: 'normal' | 'bold', size: number, c: Rgb) => { doc.setFont(F, stil); doc.setFontSize(size); doc.setTextColor(...c) }
  const rupe = (s: string, w: number): string[] => doc.splitTextToSize(T(s), w) as string[]
  const gradient = (x: number, y: number, w: number, h: number) => {
    const n = 60
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), c = [0, 1, 2].map(k => Math.round(VIOLET[k] + (CYAN[k] - VIOLET[k]) * t)) as Rgb
      doc.setFillColor(...c); doc.rect(x + (w / n) * i, y, w / n + 0.2, h, 'F')
    }
  }
  const JOS = PH - 22
  let y = 0
  const loc = (h: number) => { if (y + h > JOS) { doc.addPage(); y = 18 } }

  // ── antet: firma (stanga) + titlu, nr. si data documentului (dreapta)
  const liniiFirma = d.firma.linii.slice(0, 5)
  const hAntet = Math.max(38, 22 + liniiFirma.length * 4.2)
  doc.setFillColor(...NAVY); doc.rect(0, 0, PW, hAntet, 'F')
  doc.setFillColor(...NAVY2); doc.circle(PW - 18, -10, 40, 'F')
  gradient(0, hAntet, PW, 1.3)
  let tx = M
  if (logo) { try { doc.addImage('data:image/jpeg;base64,' + logo, 'JPEG', M, 9, 17, 17); tx = M + 22 } catch {} }
  if (d.firma.nume) { font('bold', 14.5, [255, 255, 255]); doc.text(T(d.firma.nume), tx, 15.5, { charSpace: 0.8, maxWidth: 100 }) }
  font('normal', 7.3, [176, 188, 232])
  liniiFirma.forEach((l, i) => doc.text(T(l), tx, (d.firma.nume ? 21.5 : 15.5) + i * 4.2, { maxWidth: 108 }))
  font('bold', 12.5, [255, 255, 255]); doc.text(T(d.titlu).toUpperCase(), PW - M, 15.5, { align: 'right', charSpace: 0.5 })
  font('normal', 8.6, [205, 214, 255]); doc.text(T(`${d.nrEt} ${d.nrDoc}`), PW - M, 22, { align: 'right' })
  font('normal', 7.8, [150, 162, 204]); doc.text(T(`${d.dataEt}: ${d.dataEmitere}`), PW - M, 27, { align: 'right' })
  y = hAntet + 11

  // ── stare + introducere
  if (d.stare) {
    const fond: Rgb = d.stare.ton === 'verde' ? [226, 246, 236] : d.stare.ton === 'aur' ? [251, 242, 222] : [252, 230, 232]
    const cul: Rgb = d.stare.ton === 'verde' ? [30, 130, 86] : d.stare.ton === 'aur' ? [160, 112, 26] : [190, 64, 78]
    font('bold', 8.6, cul); const w = doc.getTextWidth(T(d.stare.text).toUpperCase()) + 13
    doc.setFillColor(...fond); doc.roundedRect(M, y - 5, w, 8, 4, 4, 'F')
    doc.setFillColor(...cul); doc.circle(M + 4.4, y - 1, 1.3, 'F')
    doc.text(T(d.stare.text).toUpperCase(), M + 8, y + 0.1, { charSpace: 0.4 })
    y += 10
  }
  if (d.intro) {
    font('normal', 9.6, INK)
    const l = rupe(d.intro, PW - 2 * M); loc(l.length * 4.8); doc.text(l, M, y, { lineHeightFactor: 1.45 }); y += l.length * 4.8 + 4
  }

  const titluSectiune = (t: string, x: number, yy: number) => {
    doc.setFillColor(...VIOLET); doc.circle(x + 1.1, yy - 1.05, 1.1, 'F')
    font('bold', 7.6, VIOLET); doc.text(T(t).toUpperCase(), x + 4, yy, { charSpace: 0.9 })
  }

  // ── cardurile (Oaspete / Cazare), cate doua pe rand; un card singur ia toata latimea
  const gap = 6
  for (let i = 0; i < d.carduri.length; i += 2) {
    const per = d.carduri.slice(i, i + 2), w = per.length === 2 ? (PW - 2 * M - gap) / 2 : PW - 2 * M
    const masurat = per.map(c => {
      const r = c.randuri.map(x => { font(x.tare ? 'bold' : 'normal', 9.4, INK); return { ...x, l: rupe(x.v, w - 12) } })
      return { c, r, h: 14 + r.reduce((s, x) => s + 4.6 + x.l.length * 4.4 + 2.6, 0) }
    })
    const h = Math.max(...masurat.map(m => m.h))
    loc(h)
    masurat.forEach((m, j) => {
      const x = M + j * (w + gap)
      doc.setFillColor(...CARD); doc.setDrawColor(...LINIE); doc.setLineWidth(0.25); doc.roundedRect(x, y, w, h, 3, 3, 'FD')
      titluSectiune(m.c.titlu, x + 6, y + 8)
      let yy = y + 14.5
      m.r.forEach(r => {
        font('normal', 6.8, MUTED); doc.text(T(r.et).toUpperCase(), x + 6, yy, { charSpace: 0.3 }); yy += 4.3
        font(r.tare ? 'bold' : 'normal', 9.4, INK); doc.text(r.l, x + 6, yy, { lineHeightFactor: 1.35 }); yy += r.l.length * 4.4 + 2.9
      })
    })
    y += h + gap
  }

  // ── plata: randuri eticheta / suma, totalul evidentiat, dedesubt contul (IBAN etc.)
  if (d.plata && (d.plata.randuri.length || d.plata.total || d.plata.jos.length)) {
    const W = PW - 2 * M, colV = W * 0.55
    const rows = d.plata.randuri.map(r => { font(r.tare ? 'bold' : 'normal', 9.4, INK); return { ...r, l: rupe(r.v, colV) } })
    const jos = d.plata.jos.map(r => { font('normal', 8.8, INK); return { ...r, l: rupe(r.v, colV) } })
    const h = 13 + rows.reduce((s, r) => s + Math.max(7.4, r.l.length * 4.4 + 3), 0) + (d.plata.total ? 12 : 0) + (jos.length ? 5 + jos.reduce((s, r) => s + r.l.length * 4.2 + 2.6, 0) : 0) + 2
    loc(h)
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINIE); doc.setLineWidth(0.25); doc.roundedRect(M, y, W, h, 3, 3, 'FD')
    titluSectiune(d.plata.titlu, M + 6, y + 8)
    let yy = y + 13
    rows.forEach((r, i) => {
      const rh = Math.max(7.4, r.l.length * 4.4 + 3)
      if (i > 0) { doc.setDrawColor(...LINIE); doc.setLineWidth(0.2); doc.line(M + 6, yy, M + W - 6, yy) }
      font('normal', 8.8, MUTED); doc.text(T(r.et), M + 6, yy + 5)
      font(r.tare ? 'bold' : 'normal', 9.4, INK); doc.text(r.l, M + W - 6, yy + 5, { align: 'right', lineHeightFactor: 1.35 })
      yy += rh
    })
    if (d.plata.total) {
      doc.setFillColor(...NAVY2); doc.roundedRect(M + 3, yy + 1, W - 6, 10, 2.2, 2.2, 'F')
      font('bold', 9.2, [205, 214, 255]); doc.text(T(d.plata.total.et).toUpperCase(), M + 8, yy + 7.4, { charSpace: 0.5 })
      font('bold', 11.5, [255, 255, 255]); doc.text(T(d.plata.total.v), M + W - 8, yy + 7.6, { align: 'right' })
      yy += 12
    }
    if (jos.length) {
      yy += 3
      jos.forEach(r => {
        font('normal', 7.8, MUTED); doc.text(T(r.et), M + 6, yy + 3.6)
        font('normal', 8.8, INK); doc.text(r.l, M + 44, yy + 3.6, { lineHeightFactor: 1.35 })
        yy += r.l.length * 4.2 + 2.6
      })
    }
    y += h + gap
  }

  // ── texte (conditii, mentiuni) - se pot rupe pe pagina urmatoare, linie cu linie
  for (const t of d.texte) {
    font('normal', 8.6, INK)
    const linii = String(t.text).split('\n').flatMap(p => p.trim() ? rupe(p.trim(), PW - 2 * M) : [''])
    loc(14)
    titluSectiune(t.titlu, M, y + 2); y += 8
    font('normal', 8.6, INK)
    for (const l of linii) { loc(4.4); doc.text(l, M, y); y += 4.4 }
    y += 5
  }

  // ── subsol pe fiecare pagina
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINIE); doc.setLineWidth(0.3); doc.line(M, PH - 17, PW - M, PH - 17)
    font('normal', 7, MUTED)
    d.subsol.slice(0, 2).forEach((s, k) => doc.text(T(s), M, PH - 12.2 + k * 3.8, { maxWidth: PW - 2 * M - 22 }))
    doc.text(T(d.pagina(i, n)), PW - M, PH - 12.2, { align: 'right' })
  }
  return doc.output('blob')
}
