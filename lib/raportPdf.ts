// PDF-ul raportului (Rapoarte → PDF), cu identitatea AB HOMES (cerut direct: „PDF-ul vreau să fie mai frumos, mai
// futurist, cu implicații de brand AB HOMES și culori”): antet navy cu logo și linie violet → turcoaz, carduri de
// rezumat, secțiuni marcate, tabele aerisite, subsol cu numărul paginii. Font Lexend (ca la confirmarea pentru client),
// încărcat din /public/fonts, ca diacriticele să apară corect; dacă fontul nu se încarcă, se folosește Helvetica fără diacritice.

type Rgb = [number, number, number]
const NAVY: Rgb = [11, 16, 32], NAVY2: Rgb = [17, 26, 51], INK: Rgb = [24, 28, 44], MUTED: Rgb = [110, 118, 140], LINIE: Rgb = [226, 229, 240]
const VIOLET: Rgb = [124, 111, 214], CYAN: Rgb = [79, 179, 200], AUR: Rgb = [201, 160, 74], VERDE: Rgb = [46, 158, 108], ROSU: Rgb = [200, 84, 96]
const PAGE_W = 297, PAGE_H = 210, M = 14

export type KpiPdf = { label: string; valoare: string; sub?: string; culoare: 'violet' | 'cyan' | 'aur' | 'verde' | 'rosu' | 'navy' }
export type LocatiePdf = { titlu: string; nrRez: number; randuri: { text: string; rez?: string; generat?: string; comision?: string; net: string; tip?: 'canal' | 'subtotal' | 'cost' | 'comision' }[]; net: string; etichetaNet: string }
export type RaportPdf = {
  titlu: string; subtitlu: string; perioada: string; locatii: string; fisier: string
  kpi: KpiPdf[]
  rezervari: { cap: string[]; randuri: string[][]; total: string[]; dreapta: number[] }
  situatie: LocatiePdf[]
  platforme: { cap: string[]; randuri: string[][]; total: string[] }
  decont?: { randuri: [string, string][]; total: [string, string] } | null
  notaCheltuieli?: string
}

const CUL: Record<KpiPdf['culoare'], Rgb> = { violet: VIOLET, cyan: CYAN, aur: AUR, verde: VERDE, rosu: ROSU, navy: NAVY2 }

async function b64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url); if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer()); let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  } catch { return null }
}

export async function genereazaRaportPdf(d: RaportPdf) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // font de brand (Lexend) cu diacritice; altfel Helvetica fara diacritice
  const [reg, semi, logo] = await Promise.all([b64('/fonts/Lexend-Regular.ttf'), b64('/fonts/Lexend-SemiBold.ttf'), b64('/logo.jpg')])
  let F = 'helvetica', T = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (reg && semi) {
    doc.addFileToVFS('Lexend-Regular.ttf', reg); doc.addFont('Lexend-Regular.ttf', 'Lexend', 'normal')
    doc.addFileToVFS('Lexend-SemiBold.ttf', semi); doc.addFont('Lexend-SemiBold.ttf', 'Lexend', 'bold')
    F = 'Lexend'; T = (s: string) => String(s)
  }
  // „-0,00” (sumă scăzută zero) apare ca „0,00”
  const T0 = T; T = (s: string) => T0(String(s).replace(/-0,00(?!\d)/g, '0,00'))
  const font = (stil: 'normal' | 'bold', size: number, c: Rgb) => { doc.setFont(F, stil); doc.setFontSize(size); doc.setTextColor(...c) }

  // linie de lumina violet -> turcoaz (gradient din felii)
  const gradient = (x: number, y: number, w: number, h: number) => {
    const n = 60
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), c: Rgb = [0, 1, 2].map(k => Math.round(VIOLET[k] + (CYAN[k] - VIOLET[k]) * t)) as Rgb
      doc.setFillColor(...c); doc.rect(x + (w / n) * i, y, w / n + 0.2, h, 'F')
    }
  }

  // ── antet (pagina 1)
  doc.setFillColor(...NAVY); doc.rect(0, 0, PAGE_W, 34, 'F')
  doc.setFillColor(...NAVY2); doc.circle(PAGE_W - 30, -8, 38, 'F')
  gradient(0, 34, PAGE_W, 1.4)
  if (logo) { try { doc.addImage('data:image/jpeg;base64,' + logo, 'JPEG', M, 8, 18, 18) } catch {} }
  const tx = logo ? M + 23 : M
  font('bold', 17, [255, 255, 255]); doc.text('AB HOMES', tx, 16, { charSpace: 1.2 })
  font('normal', 8.5, [170, 182, 230]); doc.text(T(d.subtitlu).toUpperCase(), tx, 23, { charSpace: 0.6 })
  font('bold', 12, [255, 255, 255]); doc.text(T(d.titlu), PAGE_W - M, 14, { align: 'right' })
  font('normal', 8.5, [190, 200, 235]); doc.text(T(d.perioada), PAGE_W - M, 20.5, { align: 'right' })
  font('normal', 7.5, [140, 152, 196]); doc.text(T(d.locatii), PAGE_W - M, 26, { align: 'right', maxWidth: 150 })

  // ── carduri de rezumat
  let y = 42
  const nK = d.kpi.length, gap = 4, wK = (PAGE_W - 2 * M - gap * (nK - 1)) / nK
  d.kpi.forEach((k, i) => {
    const x = M + i * (wK + gap), c = CUL[k.culoare]
    doc.setFillColor(246, 247, 252); doc.setDrawColor(...LINIE); doc.setLineWidth(0.2); doc.roundedRect(x, y, wK, 23, 2.5, 2.5, 'FD')
    doc.setFillColor(...c); doc.roundedRect(x, y, 1.6, 23, 0.8, 0.8, 'F')
    font('normal', 6.2, MUTED); doc.text(T(k.label).toUpperCase(), x + 5, y + 6.5, { charSpace: 0.2, maxWidth: wK - 7 })
    font('bold', 13, k.culoare === 'rosu' ? ROSU : k.culoare === 'verde' ? VERDE : INK); doc.text(T(k.valoare), x + 5, y + 14.5)
    if (k.sub) { font('normal', 6.3, MUTED); doc.text(T(k.sub), x + 5, y + 19.5, { maxWidth: wK - 8 }) }
  })
  y += 32

  const sectiune = (titlu: string, extra?: string) => {
    if (y > PAGE_H - 40) { doc.addPage(); y = 22 }
    doc.setFillColor(...VIOLET); doc.circle(M + 1.3, y - 1.2, 1.3, 'F')
    font('bold', 10, INK); doc.text(T(titlu).toUpperCase(), M + 5, y, { charSpace: 0.8 })
    if (extra) { font('normal', 7.5, MUTED); doc.text(T(extra), PAGE_W - M, y, { align: 'right' }) }
    doc.setDrawColor(...LINIE); doc.setLineWidth(0.3); doc.line(M, y + 2.5, PAGE_W - M, y + 2.5)
    y += 6
  }
  const stilBaza = {
    styles: { font: F, fontSize: 7.6, cellPadding: { top: 2.1, bottom: 2.1, left: 2.6, right: 2.6 }, textColor: INK, lineColor: LINIE, lineWidth: 0 },
    headStyles: { font: F, fontStyle: 'bold' as const, fillColor: NAVY2, textColor: [205, 214, 255] as Rgb, fontSize: 7.2 },
    alternateRowStyles: { fillColor: [248, 249, 253] as Rgb },
    margin: { left: M, right: M, top: 22, bottom: 16 },
    theme: 'plain' as const,
  }
  const dupa = () => { y = ((doc as any).lastAutoTable?.finalY || y) + 9 }

  // ── 1. rezervari
  sectiune('Rezervări', `${d.rezervari.randuri.length} rezervări`)
  const nrRez = d.rezervari.randuri.length
  autoTable(doc, {
    ...stilBaza, startY: y, head: [d.rezervari.cap.map(T)], body: [...d.rezervari.randuri.map(r => r.map(T)), d.rezervari.total.map(T)],
    columnStyles: Object.fromEntries(d.rezervari.dreapta.map(i => [i, { halign: 'right' as const }])),
    didParseCell: (c: any) => {
      if (c.section === 'head' && d.rezervari.dreapta.includes(c.column.index)) c.cell.styles.halign = 'right'
      if (c.section === 'body' && c.row.index === nrRez) { c.cell.styles.fillColor = NAVY2; c.cell.styles.textColor = [255, 255, 255]; c.cell.styles.fontStyle = 'bold' }
      if (c.section === 'body' && c.row.index < nrRez && /^-/.test(String(c.cell.raw))) c.cell.styles.textColor = ROSU
    },
  })
  dupa()

  // ── 2. situatie fiscala pe locatie
  sectiune('Situație fiscală pe locație', d.notaCheltuieli)
  for (const l of d.situatie) {
    const corp = l.randuri.map(r => [T(r.text), r.rez || '', T(r.generat || ''), T(r.comision || ''), T(r.net)])
    corp.push([T(l.etichetaNet).toUpperCase(), '', '', '', T(l.net)])
    const tipuri = [...l.randuri.map(r => r.tip || 'canal'), 'net']
    // tabelul unei locații nu se rupe între pagini (rândul „Net proprietar” rămânea singur pe pagina următoare)
    const inaltime = 8 + corp.length * 7
    if (y + inaltime > PAGE_H - 18 && inaltime < PAGE_H - 40) { doc.addPage(); y = 22 }
    autoTable(doc, {
      ...stilBaza, startY: y, head: [[T(l.titlu), 'Rez.', 'Generat', 'Comision + TVA', 'Net']], body: corp,
      columnStyles: { 0: { cellWidth: 120 }, 2: { halign: 'right' as const }, 3: { halign: 'right' as const }, 4: { halign: 'right' as const } },
      didParseCell: (c: any) => {
        if (c.section === 'head') { if (c.column.index >= 2) c.cell.styles.halign = 'right'; if (c.column.index === 0) c.cell.styles.textColor = [255, 255, 255]; return }
        const t = tipuri[c.row.index]
        if (t === 'subtotal') { c.cell.styles.fillColor = [238, 236, 252]; c.cell.styles.fontStyle = 'bold' }
        if ((t === 'cost' || t === 'comision') && c.column.index === 4) c.cell.styles.textColor = ROSU
        if (t === 'cost' || t === 'comision') { if (c.column.index === 0) c.cell.styles.textColor = MUTED; c.cell.styles.fillColor = [255, 255, 255] }
        if (t === 'net') { c.cell.styles.fillColor = [20, 62, 48]; c.cell.styles.textColor = [214, 255, 234]; c.cell.styles.fontStyle = 'bold'; c.cell.styles.fontSize = 8.6 }
      },
    })
    dupa()
  }

  // („Comisioane pe platformă” nu mai apare în PDF - cerut direct: „scoate secțiunea asta din PDF, e în plus”;
  //  rămâne doar pe pagină, în Situație Fiscală)

  // ── 3. decont proprietar (calculatorul din pagina)
  if (d.decont && d.decont.randuri.length) {
    sectiune('Decont proprietar')
    autoTable(doc, {
      ...stilBaza, startY: y, head: [['Descriere', 'Sumă']], body: [...d.decont.randuri.map(r => r.map(T)), d.decont.total.map(T)],
      columnStyles: { 0: { cellWidth: 200 }, 1: { halign: 'right' as const } },
      didParseCell: (c: any) => {
        if (c.section === 'head' && c.column.index === 1) c.cell.styles.halign = 'right'
        if (c.section === 'body' && c.row.index === d.decont!.randuri.length) { c.cell.styles.fillColor = [20, 62, 48]; c.cell.styles.textColor = [214, 255, 234]; c.cell.styles.fontStyle = 'bold'; c.cell.styles.fontSize = 9.5 }
      },
    })
    dupa()
  }

  // ── banda subtire pe paginile urmatoare + subsol pe toate paginile
  const n = doc.getNumberOfPages(), azi = new Date().toLocaleDateString('ro-RO')
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    if (i > 1) {
      doc.setFillColor(...NAVY); doc.rect(0, 0, PAGE_W, 13, 'F'); gradient(0, 13, PAGE_W, 0.9)
      font('bold', 9, [255, 255, 255]); doc.text('AB HOMES', M, 8.5, { charSpace: 1 })
      font('normal', 7.5, [170, 182, 230]); doc.text(T(`${d.titlu} · ${d.perioada}`), PAGE_W - M, 8.5, { align: 'right' })
    }
    gradient(M, PAGE_H - 11, PAGE_W - 2 * M, 0.5)
    font('normal', 7, MUTED)
    doc.text(T(`AB HOMES · Apartamente private Iași · abhomesiasi.ro · generat ${azi}`), M, PAGE_H - 6.5)
    doc.text(T(`Pagina ${i} / ${n}`), PAGE_W - M, PAGE_H - 6.5, { align: 'right' })
  }
  doc.save(d.fisier)
}
