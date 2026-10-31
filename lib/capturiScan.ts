// Capturi de ecran pentru citirea rezervarilor cu AI (cerut direct: „la Airbnb să putem pune mai multe screen-uri
// pentru o rezervare, astfel încât să se preia toată informația, fiind în mai multe secțiuni”). Toate capturile
// unei rezervari se trimit IMPREUNA la /api/scan-rezervare, care combina informatia.
// Capturile de telefon (ex. 1206×2622 PNG) se micsoreaza in browser - mai multe odata ar depasi limita Vercel
// de 4,5 MB pe cerere; 1800 px pe latura lunga pastreaza textul perfect lizibil.

export type Captura = { base64Data: string; mimeType: string; url: string }
export const MAX_CAPTURI = 6

export async function pregatesteCaptura(file: File | Blob): Promise<Captura> {
  const url = URL.createObjectURL(file)
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
    const dataUrl = cv.toDataURL('image/jpeg', 0.85)
    return { base64Data: dataUrl.split(',')[1] || '', mimeType: 'image/jpeg', url }
  } catch {
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file) })
    return { base64Data: b64, mimeType: (file as File).type || 'image/jpeg', url }
  }
}

export async function citesteRezervare(capturi: Captura[]): Promise<{ result?: any; error?: string }> {
  const res = await fetch('/api/scan-rezervare', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: capturi.slice(0, MAX_CAPTURI).map(c => ({ base64Data: c.base64Data, mimeType: c.mimeType })) }) })
  const data = await res.json().catch(() => ({ error: `Eroare ${res.status}` }))
  return data
}
