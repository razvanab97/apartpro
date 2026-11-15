// Sugestii de la oaspeti dupa plecare (cerut direct: „un formular — dacă aveți recomandări, click aici — să se
// «autentifice» cu numărul de telefon, ca să ne dăm seama despre ce e vorba, și toate să se ducă în Supabase, în
// apartpro, să le putem verifica”). Pagina publica: abhomes-checkin.vercel.app/sugestii; lista: /sugestii-oaspeti.
import { GHID_BAZA } from '@/lib/gazdeGhid'

export const LINK_SUGESTII = GHID_BAZA + '/sugestii'

export const CATEGORII_SUGESTII: { k: string; ro: string; en: string }[] = [
  { k: 'curatenie', ro: 'Curățenie', en: 'Cleanliness' },
  { k: 'somn', ro: 'Pat & somn', en: 'Bed & sleep' },
  { k: 'bucatarie', ro: 'Bucătărie & dotări', en: 'Kitchen & amenities' },
  { k: 'baie', ro: 'Baie', en: 'Bathroom' },
  { k: 'wifi_tv', ro: 'Wi-Fi & TV', en: 'Wi-Fi & TV' },
  { k: 'acces', ro: 'Check-in & acces', en: 'Check-in & access' },
  { k: 'liniste', ro: 'Liniște & zonă', en: 'Noise & area' },
  { k: 'altceva', ro: 'Altceva', en: 'Something else' },
]

export const cifreTel = (t: unknown) => String(t ?? '').replace(/[^0-9]/g, '')
// aceeasi persoana indiferent de format: +40 751 305 969 / 0751305969 / 40751305969 -> ultimele 9 cifre
export const telPotrivit = (a: unknown, b: unknown) => { const x = cifreTel(a), y = cifreTel(b); return x.length >= 8 && y.length >= 8 && x.slice(-9) === y.slice(-9) }

export type Sugestie = {
  id: string; created_at: string; telefon: string; rezervare_id: string | null; apartament_id: string | null; nume_client: string | null
  apartament: string | null; data_checkout: string | null; nota: number | null; categorii: string[] | null; text: string; limba: string | null
  status: 'noua' | 'rezolvata'; nota_interna: string | null
}
