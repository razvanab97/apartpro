import { supabase, getStorageUrl, incarcaDirect } from '@/lib/supabase'

// Ghidul de check-in pentru oaspeti (cerut direct: „mesajele de check-in de pe WhatsApp, într-un link, cu poze și
// video, puse în ordinea corectă” + „o modalitate de modificare text și de adăugat alte poze”).
// Un ghid pe apartament, salvat in setari (cheie ghid_apt_<id>) - fara migrare; pozele / videoclipurile in
// storage (bucket-ul Facturi, folderul ghiduri/<cod>/). Pagina publica: /ghid/<COD> (ex. /ghid/GS08).

export type Media = { tip: 'img' | 'video'; url: string; ro: string; en: string }
export type Pas = { titlu_ro: string; titlu_en: string; text_ro: string; text_en: string; nota_ro: string; nota_en: string
  link_url: string; link_ro: string; link_en: string; media: Media[]
  copiaza?: string }  // text cu buton „Copiază” (ex. strada si numarul)
export type Acces = { ro: string; en: string; valoare: string; cod: boolean }
export type Regula = { eticheta_ro: string; eticheta_en: string; text_ro: string; text_en: string }
export type Ghid = {
  titlu: string; sub_ro: string; sub_en: string; checkin: string; checkout: string
  acces: Acces[]; acces_nota_ro: string; acces_nota_en: string
  pasi: Pas[]; reguli: Regula[]; telefon: string; final_ro: string; final_en: string; fundal: string
  actualizat?: string
}

export const pasGol = (): Pas => ({ titlu_ro: '', titlu_en: '', text_ro: '', text_en: '', nota_ro: '', nota_en: '', link_url: '', link_ro: '', link_en: '', media: [], copiaza: '' })

export function ghidNou(nume = ''): Ghid {
  return {
    titlu: nume.toUpperCase(), sub_ro: '', sub_en: '', checkin: '15:00', checkout: '11:00',
    acces: [
      { ro: 'Cod locker cheie', en: 'Key locker code', valoare: '', cod: true },
      { ro: 'Wi-Fi', en: 'Wi-Fi', valoare: '', cod: false },
      { ro: 'Parolă Wi-Fi', en: 'Wi-Fi password', valoare: '', cod: false },
    ],
    acces_nota_ro: 'Codul lockerului se schimbă la fiecare rezervare. Cel valabil pentru șederea dumneavoastră este cel de mai sus.',
    acces_nota_en: 'The locker code changes for every booking. The one above is valid for your stay.',
    pasi: [{ ...pasGol(), titlu_ro: 'Adresa', titlu_en: 'Address', link_ro: 'Deschide în Google Maps', link_en: 'Open in Google Maps' }],
    reguli: [
      { eticheta_ro: '22:30 – 08:00', eticheta_en: '22:30 – 08:00', text_ro: 'Ore de liniște, pentru confortul tuturor locatarilor.', text_en: 'Quiet hours, for the comfort of all residents.' },
      { eticheta_ro: 'balcon', eticheta_en: 'balcony', text_ro: 'Fumatul nu este permis în apartament, doar pe balcon.', text_en: 'No smoking inside the apartment, only on the balcony.' },
      { eticheta_ro: 'curățenie', eticheta_en: 'tidiness', text_ro: 'Lăsați apartamentul în aceeași stare în care l-ați găsit.', text_en: 'Please leave the apartment as you found it.' },
      { eticheta_ro: 'gunoi', eticheta_en: 'trash', text_ro: 'La plecare, aruncați gunoiul sau, cel puțin, strângeți-l corespunzător.', text_en: 'When leaving, take out the trash or at least bag it properly.' },
      { eticheta_ro: '11:00', eticheta_en: '11:00', text_ro: 'Check-out-ul se face până la ora 11:00. Lăsați cheia înapoi în locker.', text_en: 'Check-out is by 11:00. Please put the key back in the locker.' },
    ],
    telefon: '+40 712 290 109', final_ro: 'Echipa AB Homes vă dorește un sejur plăcut!', final_en: 'The AB Homes team wishes you a pleasant stay!', fundal: '',
  }
}

export const cheieGhid = (aptId: string) => 'ghid_apt_' + aptId

export async function citesteGhid(aptId: string): Promise<Ghid | null> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', cheieGhid(aptId)).maybeSingle()
  if (!data?.valoare) return null
  try { return { ...ghidNou(), ...JSON.parse(data.valoare) } } catch { return null }
}

export async function salveazaGhid(aptId: string, g: Ghid): Promise<string | null> {
  const { error } = await supabase.from('setari').upsert({ cheie: cheieGhid(aptId), valoare: JSON.stringify({ ...g, actualizat: new Date().toISOString() }) }, { onConflict: 'cheie' })
  return error ? error.message : null
}

// Apartamentul dupa codul din link (nota, ex. GS08) sau dupa id
export async function aptDupaCod(cod: string) {
  const c = decodeURIComponent(cod).trim()
  const { data } = await supabase.from('apartamente').select('id,nota,nume,adresa')
  const lista = (data || []) as { id: string; nota: string | null; nume: string; adresa: string | null }[]
  return lista.find(a => a.id === c) || lista.find(a => (a.nota || '').toUpperCase() === c.toUpperCase()) || null
}

export const codLink = (a: { id: string; nota: string | null }) => a.nota || a.id
// linkul trimis oaspetilor - pe adresa lor dedicata (fara apartpro.work, care e sistemul intern)
import { GHID_BAZA } from '@/lib/gazdeGhid'
export { GHID_BAZA }
export const linkGhid = (a: { id: string; nota: string | null }) => `${GHID_BAZA}/${codLink(a)}`

// Incarcare poza / video: pozele se micsoreaza in browser (max 1800 px, JPEG) ca pagina sa se deschida repede pe telefon
async function micsoreaza(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 900_000) return file
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
    return await new Promise<Blob>((res) => cv.toBlob(b => res(b || file), 'image/jpeg', 0.86))
  } catch { return file }
}

export const LIMITA_VIDEO_MB = 50

const EXT_VIDEO: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp' }

export async function incarcaMedia(cod: string, file: File, onProgres?: (pct: number) => void): Promise<{ media?: Media; eroare?: string }> {
  // unele browsere (ex. Safari, fisiere din WhatsApp) nu dau tipul fisierului -> il deducem din extensie
  const extFisier = (file.name.split('.').pop() || '').toLowerCase()
  const tipVideo = file.type.startsWith('video/') ? file.type : EXT_VIDEO[extFisier] || ''
  const video = !!tipVideo
  if (!video && !file.type.startsWith('image/') && !/^(jpe?g|png|webp|heic|gif)$/.test(extFisier)) return { eroare: `${file.name}: doar poze sau videoclipuri` }
  if (video && file.size > LIMITA_VIDEO_MB * 1024 * 1024) return { eroare: `${file.name}: videoclipul are ${Math.round(file.size / 1048576)} MB — limita e ${LIMITA_VIDEO_MB} MB (trimite-l din WhatsApp pe calculator sau scurtează-l)` }
  const blob = video ? file : await micsoreaza(file)
  const ext = video ? (EXT_VIDEO[extFisier] ? extFisier : 'mp4') : 'jpg'
  const path = `ghiduri/${cod.toLowerCase().replace(/[^a-z0-9-]/g, '')}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const eroare = await incarcaDirect('Facturi', path, blob, video ? tipVideo : (blob.type || 'image/jpeg'), onProgres)
  if (eroare) return { eroare: `${file.name}: ${eroare}` }
  return { media: { tip: video ? 'video' : 'img', url: getStorageUrl('Facturi', path), ro: '', en: '' } }
}
