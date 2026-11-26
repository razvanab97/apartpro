// Rezervare prin link (cerut direct: „să avem și noi rezervare prin link, prin care poți trimite oferta clientului și să
// și completeze el toate detaliile astfel încât să confirme rezervarea” - ca oferta din 5starDesk).
// Fara migrare - totul in setari:
//   oferta_<token> = Oferta (apartament, perioada, persoane, pret, valabilitate, stare)
// Clientul deschide /o/<token> (pe adresa pentru oaspeti), completeaza datele (nume, contact, act, domiciliu, auto,
// GDPR, semnatura optionala) si apasa „Confirmă rezervarea” -> se creeaza rezervarea (confirmata, neplatita, canal
// direct) + domiciliul pentru factura (client_factura_<id>) + semnatura (semnatura_<id>) + notificare.
// Datele personale NU se pastreaza in oferta - doar in rezervare.

export const PREFIX_OFERTA = 'oferta_'
export const cheieOferta = (t: string) => PREFIX_OFERTA + t
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

export type StareOferta = 'trimisa' | 'confirmata' | 'anulata'
export type Oferta = {
  token: string; apartament_id: string; checkin: string; checkout: string
  adulti: number; copii: number; total: number; moneda: string
  expira: string            // ISO datetime - dupa ea oferta nu mai poate fi confirmata
  limba: 'ro' | 'en'; nota: string; titlu_client?: string   // numele clientului (optional, doar pentru salut + lista din admin)
  stare: StareOferta; creat_la: string; confirmat_la?: string | null; rezervare_id?: string | null
}

export type DateClient = {
  nume: string; email: string; telefon: string; tara: string
  tip_act: 'ci' | 'pasaport'; cnp: string; serie_act: string
  judet: string; localitate: string; adresa: string
  auto: string; fara_auto: boolean
  firma: boolean; cui: string; denumire_firma: string
  mentiuni: string; gdpr: boolean; semnatura?: string | null
}

export function tokenNou(): string {
  const a = new Uint8Array(24); globalThis.crypto.getRandomValues(a)
  return Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 58]).join('')
}

export const noptiOferta = (ci: string, co: string) => Math.max(0, Math.round((Date.parse(co + 'T12:00:00Z') - Date.parse(ci + 'T12:00:00Z')) / 86400000))
export const ofertaExpirata = (o: Pick<Oferta, 'expira'>, acum = Date.now()) => !!o.expira && Date.parse(o.expira) < acum
export const stareEfectiva = (o: Oferta, acum = Date.now()): StareOferta | 'expirata' => o.stare === 'trimisa' && ofertaExpirata(o, acum) ? 'expirata' : o.stare

// CNP romanesc: 13 cifre + cifra de control
export function cnpValid(c: string): boolean {
  const s = String(c || '').trim()
  if (!/^[1-9]\d{12}$/.test(s)) return false
  const k = '279146358279', sum = k.split('').reduce((t, x, i) => t + Number(x) * Number(s[i]), 0)
  const r = sum % 11
  return (r === 10 ? 1 : r) === Number(s[12])
}

const curat = (v: any, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
export const eRomania = (t: string) => /^rom[aâ]nia$/i.test(String(t || '').trim())

// verifica datele trimise de client; intoarce { ok, date } sau { ok:false, camp, mesaj } (mesajele in limba ofertei)
export function valideazaClient(x: any, limba: 'ro' | 'en' = 'ro'): { ok: true; date: DateClient } | { ok: false; camp: string; mesaj: string } {
  const en = limba === 'en'
  const e = (camp: string, ro: string, eng: string) => ({ ok: false as const, camp, mesaj: en ? eng : ro })
  const d: DateClient = {
    nume: curat(x?.nume, 100), email: curat(x?.email, 120).toLowerCase(), telefon: curat(x?.telefon, 30), tara: curat(x?.tara, 60) || 'Romania',
    tip_act: x?.tip_act === 'pasaport' ? 'pasaport' : 'ci', cnp: curat(x?.cnp, 20).replace(/\s/g, ''), serie_act: curat(x?.serie_act, 30).toUpperCase(),
    judet: curat(x?.judet, 60), localitate: curat(x?.localitate, 80), adresa: curat(x?.adresa, 160),
    auto: curat(x?.auto, 15).toUpperCase(), fara_auto: !!x?.fara_auto,
    firma: !!x?.firma, cui: curat(x?.cui, 20).toUpperCase(), denumire_firma: curat(x?.denumire_firma, 120),
    mentiuni: String(x?.mentiuni ?? '').trim().slice(0, 500), gdpr: x?.gdpr === true,
    semnatura: typeof x?.semnatura === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(x.semnatura) && x.semnatura.length < 300000 ? x.semnatura : null,
  }
  if (d.nume.split(' ').filter(Boolean).length < 2) return e('nume', 'Scrieți numele complet (nume și prenume).', 'Please enter your full name (first and last name).')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return e('email', 'Adresa de email nu pare corectă.', 'The email address does not look right.')
  if (d.telefon.replace(/\D/g, '').length < 8) return e('telefon', 'Numărul de telefon nu pare corect.', 'The phone number does not look right.')
  const ro = eRomania(d.tara)
  if (ro && d.tip_act === 'ci' && !cnpValid(d.cnp)) return e('cnp', 'CNP-ul nu este valid (13 cifre).', 'The personal number (CNP) is not valid (13 digits).')
  if (d.serie_act.replace(/[^A-Z0-9]/g, '').length < 5) return e('serie_act', ro && d.tip_act === 'ci' ? 'Completați seria și numărul buletinului.' : 'Completați seria și numărul pașaportului / actului.', 'Please enter your ID / passport number.')
  if (ro && !d.judet) return e('judet', 'Alegeți județul.', 'Please choose the county.')
  if (!d.localitate) return e('localitate', 'Completați localitatea.', 'Please enter your city.')
  if (d.adresa.length < 3) return e('adresa', 'Completați adresa (stradă, număr).', 'Please enter your street address.')
  if (!d.fara_auto && d.auto.replace(/[^A-Z0-9]/g, '').length < 4) return e('auto', 'Scrieți numărul de înmatriculare sau bifați „Nu vin cu mașina”.', 'Enter the plate number or tick “I am not coming by car”.')
  if (d.fara_auto) d.auto = ''
  if (d.firma && (d.cui.replace(/\D/g, '').length < 2 || d.denumire_firma.length < 2)) return e('cui', 'Pentru factura pe firmă completați CUI-ul și denumirea.', 'For a company invoice enter the VAT/registration number and company name.')
  if (!d.gdpr) return e('gdpr', 'Bifați acordul pentru prelucrarea datelor.', 'Please accept the data processing notice.')
  return { ok: true, date: d }
}

// observatiile rezervarii: actul de identitate in formatul pastrat si de Dubleaza (CNP / Pașaport / Buletin), auto, persoane
export function observatiiOferta(o: Oferta, d: DateClient): string {
  const pers = `${o.adulti} ${o.adulti === 1 ? 'adult' : 'adulți'}${o.copii ? `, ${o.copii} ${o.copii === 1 ? 'copil' : 'copii'}` : ''}`
  return [
    'Rezervare prin link (ofertă confirmată de client)',
    d.cnp && d.tip_act === 'ci' ? `CNP: ${d.cnp}` : '',
    d.tip_act === 'pasaport' ? `Pașaport: ${d.serie_act}` : `Buletin: ${d.serie_act}`,
    d.auto ? `Auto: ${d.auto}` : 'Fără mașină',
    pers,
    d.mentiuni ? `Mențiuni client: ${d.mentiuni.replace(/\s+/g, ' ')}` : '',
    o.nota ? `Notă ofertă: ${o.nota}` : '',
  ].filter(Boolean).join(' · ')
}

// randul rezervarii (inainte de payloadRezervare, care calculeaza decontul)
export function rezervareDinOferta(o: Oferta, d: DateClient, apt: { id: string; proprietar_id?: string | null }) {
  return {
    apartament_id: apt.id, proprietar_id: apt.proprietar_id || null,
    nume_client: d.nume, telefon_client: d.telefon, email_client: d.email,
    nr_persoane: Math.max(1, (Number(o.adulti) || 0) + (Number(o.copii) || 0)),
    canal: 'direct', ...(o.moneda && o.moneda !== 'RON' ? { moneda: o.moneda } : {}),
    data_checkin: o.checkin, data_checkout: o.checkout,
    valoare_bruta: Number(o.total) || 0, suma_incasata: Number(o.total) || 0, taxa_curatenie_incasata: 0,
    status_rezervare: 'confirmata', status_plata: 'neplatit', status_decont: 'nedecontat', status_facturare: 'nefacturat',
    observatii: observatiiOferta(o, d),
  }
}

// domiciliul pentru factura (aceeasi forma ca ClientFactura din fereastra rezervarii)
export function clientFacturaDinOferta(d: DateClient) {
  return { tara: d.tara || 'Romania', judet: eRomania(d.tara) ? d.judet : (d.judet || ''), localitate: d.localitate, adresa: d.adresa,
    pj: d.firma, cui: d.firma ? d.cui : '', firma: d.firma ? d.denumire_firma : '', regCom: '', platitorTva: false }
}

// perioada [ci, co) se suprapune cu rezervarile (fara anulate / NEALOCAT) sau cu blocarile proprietarilor (nopti inclusiv)
export function conflicte(ci: string, co: string, rez: { data_checkin: string; data_checkout: string; status_rezervare?: string; camera_semnalata?: string | null }[],
  blocari: { de_la: string; pana_la: string }[] = []) {
  const r = rez.filter(x => x.status_rezervare !== 'anulata' && x.camera_semnalata !== 'NEALOCAT' && x.data_checkin < co && x.data_checkout > ci)
  const b = blocari.filter(x => x.de_la < co && x.pana_la >= ci)
  return { rezervari: r.length, blocari: b.length, liber: !r.length && !b.length }
}
