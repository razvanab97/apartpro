// Facturile E.ON au 5 pagini, dar doar prima conteaza (suma, nr. factura, data scadenta, data emitere) - cerut
// direct: „restul foilor nu au sens”. La import pastram in storage doar pagina 1.
export const esteEon = (furnizor?: string | null) => /(^|[^a-z])e[.\s-]?on([^a-z]|$)/i.test(furnizor || '')

// PDF-ul doar cu prima pagina; null daca are deja o singura pagina sau nu se poate citi
export async function doarPrimaPagina(file: Blob): Promise<Blob | null> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
    if (src.getPageCount() <= 1) return null
    const out = await PDFDocument.create()
    const [p] = await out.copyPages(src, [0]); out.addPage(p)
    const bytes = await out.save()
    return new Blob([bytes as BlobPart], { type: 'application/pdf' })
  } catch { return null }
}
