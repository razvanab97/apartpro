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

// Mesajul de multumire dupa plecare (textul utilizatorului) - acelasi in „Mesaje de azi” (fila Mulțumiri) si in Asistent
export const MSG_MULTUMIRE = 'Ne-a făcut plăcere să fim, pentru o vreme, adresa dumneavoastră din Iași.\n\nSperăm că plecați cu bateriile puțin mai încărcate și măcar cu o amintire frumoasă din acest oraș.\n\nIar dacă vă întoarceți, acum aveți pe cineva aici. Scrieți-ne direct pe WhatsApp și găsim din nou un loc potrivit.\n\nDrum bun și toate cele bune! Data viitoare, să aveți mai mult timp de stat.\n\nP.S. Lucrăm la câteva îmbunătățiri ale locației. Dacă aveți sugestii, ne-ar ajuta mult să ni le lăsați aici (durează un minut): '+LINK_SUGESTII

// Starea mesajelor de azi (aceeasi inregistrare ca in Dashboard: setari „mesaje_zi_AAAA-LL-ZZ”, {idMesaj: {s:'t'|'s', la}}).
// Folosita de Asistent: o multumire trimisa de acolo nu mai apare de trimis in „Mesaje de azi”.
export async function marcheazaMesajZi(id: string, s: 't' | 's' | null) {
  const { supabase } = await import('@/lib/supabase')
  const d = new Date(), cheie = `mesaje_zi_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase.from('setari').select('valoare').eq('cheie', cheie).maybeSingle()
  if (error) throw new Error(error.message)
  let st: Record<string, any> = {}
  try { st = JSON.parse(data?.valoare || '{}') || {} } catch {}
  if (s) st[id] = { s, la: new Date().toISOString() }; else delete st[id]
  const { error: e2 } = await supabase.from('setari').upsert({ cheie, valoare: JSON.stringify(st) }, { onConflict: 'cheie' })
  if (e2) throw new Error(e2.message)
}

// Cererea de recenzie pe Facebook (textul utilizatorului) - OPTIONALA: o trimitem doar oaspetilor alesi de noi,
// dupa cum reactioneaza (fila „Recenzii” din Mesaje de azi + butonul din Asistent dupa multumire)
export const LINK_RECENZII_FB = 'https://www.facebook.com/abhomesro/reviews/'
export const MSG_RECENZIE_FB = 'Părerea dumneavoastră despre ședere ne ajută atât pe noi, cât și pe viitorii oaspeți. Vă rugăm să ne lăsați o recenzie pe pagina noastră de Facebook.\n\nDeschideți linkul de mai jos și urmați pașii:\n\n„Recenzii” sau „96% recomandat”\n→ „Recomandați AB Homes IASI?”\n→ Alegeți „Da” sau „Nu”\n→ Scrieți părerea dumneavoastră\n→ Apăsați „Distribuie”\n\n' + LINK_RECENZII_FB + '\n\nVă mulțumim!'
