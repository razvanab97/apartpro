// 5starDesk PMS Connect - MOD TEST, in paralel cu sincronizarea actuala (cerut direct: „creează sistemul doar de test pentru
// a integra token-ul în sistemul nostru, în paralel cu sistemul pe care îl avem acum, astfel încât să nu stricăm toată
// funcționalitatea”). Documentatia: „Documentatie integrare 5stardesk - PMS Connect” v1.0.
// - apartpro = „PMS extern”: fiecare apartament = un RoomType (Id = id-ul apartamentului) cu un singur RatePlan „STD”
// - IN TEST: rezervarile primite de la 5starDesk NU intra in `rezervari` - doar in jurnalul de test (setari
//   „pms5sd_test_rezervari”), comparate cu ce exista deja (adus de sincronizarea actuala); set_disp / set_prices NU se
//   trimit - doar se calculeaza si se afiseaza (previzualizare).

export const RATE_PLAN = { RatePlanId: 'STD', RatePlanName: 'Standard' }
export const CHEIE_JURNAL = 'pms5sd_test_rezervari'
export const MAX_JURNAL = 200

type Apt = { id: string; nume: string; status?: string | null; pret_standard?: number | null; capacitate_max?: number | null }
type Rez = { id?: string; apartament_id: string | null; data_checkin: string; data_checkout: string; status_rezervare?: string | null; camera_semnalata?: string | null; observatii?: string | null; nume_client?: string | null }
type Blocare = { apt: string; de_la: string; pana_la: string }

export const scurt = (n: string) => String(n || '').replace(/\s*by AB HOMES\s*/i, '').trim()
export const plusZile = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const apartamenteActive = (apts: Apt[]) => apts.filter(a => !a.status || a.status === 'activ')

// raspunsul la GetRooms
export function roomTypes(apts: Apt[]) {
  return apartamenteActive(apts).map(a => ({ Id: a.id, Name: scurt(a.nume), RatePlans: [RATE_PLAN], ...(a.capacitate_max ? { GuestMax: Number(a.capacitate_max) } : {}) }))
}

// noaptea `zi` e ocupata? (rezervare: check-in <= zi < check-out; blocare proprietar: de_la <= zi <= pana_la)
const rezActiva = (r: Rez) => r.status_rezervare !== 'anulata' && r.camera_semnalata !== 'NEALOCAT'

// Body.Allocation pentru set_disp: 1 = liber, 0 = ocupat, pentru `zile` nopti incepand cu `de`
export function allocation(apts: Apt[], rez: Rez[], blocari: Blocare[], de: string, zile: number) {
  const out: Record<string, Record<string, { AvailableRooms: number }>> = {}
  for (const a of apartamenteActive(apts)) {
    const r = rez.filter(x => x.apartament_id === a.id && rezActiva(x)), b = blocari.filter(x => x.apt === a.id)
    const m: Record<string, { AvailableRooms: number }> = {}
    for (let i = 0; i < zile; i++) {
      const z = plusZile(de, i)
      const ocupat = r.some(x => x.data_checkin <= z && z < x.data_checkout) || b.some(x => x.de_la <= z && z <= x.pana_la)
      m[z] = { AvailableRooms: ocupat ? 0 : 1 }
    }
    out[a.id] = m
  }
  return out
}

// Body.Rates pentru set_prices (deocamdata: pretul standard al apartamentului, RON/noapte; fara pret -> nimic)
export function rates(apts: Apt[], de: string, zile: number) {
  return apartamenteActive(apts).filter(a => Number(a.pret_standard) > 0).map(a => ({
    RoomTypeId: a.id, RatePlanId: RATE_PLAN.RatePlanId,
    Entry: Array.from({ length: zile }, (_, i) => ({ Date: plusZile(de, i), Rate: String(Number(a.pret_standard)) })),
  }))
}

export const cerere = (method: 'set_disp' | 'set_prices' | 'set_restrictions', token: string, body: any) => ({ Method: method, Token: token, Body: body })

// rezervarea primita (Method: reservation) -> forma normalizata; null daca lipseste ceva esential
export type Rezervare5sd = { reservationId: string; hotelId: string; submit: string; checkin: string; checkout: string; nume: string; email: string; telefon: string
  comentariu: string; total: number; moneda: string; status: 'Confirmed' | 'Cancelled' | string; roomTypeId: string; ratePlanId: string; oaspeti: number; copii: number }
const ISO = /^\d{4}-\d{2}-\d{2}$/
export function citesteRezervare(body: any): { ok: true; r: Rezervare5sd } | { ok: false; eroare: string } {
  const b = body?.Body
  if (!b || typeof b !== 'object') return { ok: false, eroare: 'lipseste Body' }
  const room = Array.isArray(b.Rooms) ? b.Rooms[0] || {} : {}
  const r: Rezervare5sd = {
    reservationId: String(b.ReservationID ?? '').trim(), hotelId: String(b.HotelId ?? ''), submit: String(b.SubmitDate || ''),
    checkin: String(b.Arrival || '').slice(0, 10), checkout: String(b.Departure || '').slice(0, 10),
    nume: String(b.GuestFullName || '').trim().slice(0, 120), email: String(b.GuestEmail || '').trim().slice(0, 120), telefon: String(b.GuestPhone || '').trim().slice(0, 40),
    comentariu: String(b.GuestComment || '').replace(/<br\s*\/?>/gi, '\n').slice(0, 1000), total: Number(b.TotalPrice) || 0, moneda: String(b.Currency || 'RON').toUpperCase(),
    status: String(b.Status || ''), roomTypeId: String(room.RoomTypeId || ''), ratePlanId: String(room.RatePlanId || ''),
    oaspeti: Number(room.GuestCount) || 0, copii: Array.isArray(room.ChildAges) ? room.ChildAges.length : 0,
  }
  if (!r.reservationId) return { ok: false, eroare: 'lipseste ReservationID' }
  if (!ISO.test(r.checkin) || !ISO.test(r.checkout) || r.checkout <= r.checkin) return { ok: false, eroare: 'date Arrival/Departure invalide' }
  if (!['Confirmed', 'Cancelled'].includes(r.status)) return { ok: false, eroare: 'Status necunoscut: ' + r.status }
  return { ok: true, r }
}

// ce ar face sistemul nou cu rezervarea, fata de ce exista deja in apartpro (adus de sincronizarea actuala)
// - dupa ID-ul 5starDesk din observatii (asa le leaga sincronizarea actuala) sau dupa apartament + aceleasi date
export type Comparatie = { stare: 'exista' | 'exista_diferit' | 'lipseste' | 'anulata_ok' | 'anulata_dar_activa' | 'camera_necunoscuta'; detaliu: string; rezervare_id?: string }
export function compara(r: Rezervare5sd, rez: Rez[], apts: Apt[]): Comparatie {
  const apt = apts.find(a => a.id === r.roomTypeId)
  if (!apt) return { stare: 'camera_necunoscuta', detaliu: `RoomTypeId „${r.roomTypeId}” nu e un apartament din apartpro (maparea din 5starDesk e greșită?)` }
  const idRe = new RegExp(`(^|[^0-9])${r.reservationId.replace(/\D/g, '')}([^0-9]|$)`)
  const dupaId = r.reservationId.replace(/\D/g, '').length >= 4 ? rez.find(x => idRe.test(String(x.observatii || ''))) : undefined
  const dupaDate = rez.find(x => x.apartament_id === apt.id && x.data_checkin === r.checkin && x.data_checkout === r.checkout && x.status_rezervare !== 'anulata')
  const g = dupaId || dupaDate
  if (r.status === 'Cancelled') return g && g.status_rezervare !== 'anulata'
    ? { stare: 'anulata_dar_activa', detaliu: 'Anulată în 5starDesk, dar în apartpro rezervarea e încă activă', rezervare_id: g.id }
    : { stare: 'anulata_ok', detaliu: g ? 'Anulată și în apartpro' : 'Anulată — nu există în apartpro', rezervare_id: g?.id }
  if (!g) return { stare: 'lipseste', detaliu: `Nu există în apartpro — sistemul nou ar crea-o (${scurt(apt.nume)})` }
  const dif: string[] = []
  if (g.apartament_id !== apt.id) dif.push('alt apartament')
  if (g.data_checkin !== r.checkin || g.data_checkout !== r.checkout) dif.push(`alte date (${g.data_checkin} → ${g.data_checkout})`)
  if (g.status_rezervare === 'anulata') dif.push('anulată în apartpro')
  return dif.length ? { stare: 'exista_diferit', detaliu: 'Există, dar diferă: ' + dif.join(', '), rezervare_id: g.id } : { stare: 'exista', detaliu: dupaId ? 'Există deja (legată după ID-ul 5starDesk)' : 'Există deja (același apartament și aceleași date)', rezervare_id: g.id }
}

// token comparat in timp constant
export function tokenEgal(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
