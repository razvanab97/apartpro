// „Sistemul să învețe și să recomande cum să generăm automat facturile” (cerut direct). Se invata din facturile/datele
// de facturare deja completate (setari client_factura_<id>): acelasi telefon sau acelasi nume = acelasi domiciliu.
// Prefixul telefonului da doar un indiciu de tara (nu se trece pe factura fara sa-l confirmi tu).
// Regula de emitere (cerut direct): factura se emite la 2 zile dupa check-out, dar niciodata inaintea ultimei facturi RH.
import type { ClientFactura } from '@/components/RezervareModal'
import { taraOblio } from '@/lib/tariOrase'

export const ZILE_DUPA_CHECKOUT = 2

export const plusZile = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
export const normTel = (t?: string | null) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : '' }
export const normNume = (n?: string | null) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ')

const PREFIX: Record<string, string> = {
  '40': 'Romania', '373': 'Moldova', '380': 'Ucraina', '36': 'Ungaria', '359': 'Bulgaria', '381': 'Serbia', '30': 'Grecia', '90': 'Turcia',
  '48': 'Polonia', '420': 'Cehia', '421': 'Slovacia', '43': 'Austria', '49': 'Germania', '41': 'Elvetia', '39': 'Italia', '34': 'Spania', '351': 'Portugalia',
  '33': 'Franta', '32': 'Belgia', '31': 'Olanda', '352': 'Luxemburg', '44': 'Regatul Unit', '353': 'Irlanda', '45': 'Danemarca', '46': 'Suedia', '47': 'Norvegia',
  '358': 'Finlanda', '385': 'Croatia', '386': 'Slovenia', '370': 'Lituania', '371': 'Letonia', '372': 'Estonia', '357': 'Cipru', '356': 'Malta', '972': 'Israel',
  '1': 'Statele Unite ale Americii', '61': 'Australia', '971': 'Emiratele Arabe Unite', '86': 'China', '81': 'Japonia', '91': 'India', '82': 'Coreea de Sud',
  '55': 'Brazilia', '54': 'Argentina', '52': 'Mexic', '20': 'Egipt', '212': 'Maroc', '216': 'Tunisia', '962': 'Iordania', '961': 'Liban', '995': 'Georgia',
  '374': 'Armenia', '994': 'Azerbaidjan', '355': 'Albania', '389': 'Macedonia de Nord', '387': 'Bosnia si Hertegovina', '382': 'Muntenegru', '354': 'Islanda',
  '27': 'Africa de Sud', '234': 'Nigeria', '92': 'Pakistan', '98': 'Iran', '963': 'Siria', '7': 'Rusia', '375': 'Belarus',
}
// tara dupa prefixul telefonului (07xx... fara prefix = Romania)
export function taraDinTelefon(t?: string | null): string | null {
  const brut = String(t || '').trim()
  let d = brut.replace(/\D/g, '')
  if (!d) return null
  if (/^0[1-9]/.test(d) && d.length === 10 && !brut.startsWith('+')) return 'Romania'
  if (d.startsWith('00')) d = d.slice(2)
  else if (!brut.startsWith('+') && d.length <= 10) return null
  for (const l of [3, 2, 1]) if (PREFIX[d.slice(0, l)]) return PREFIX[d.slice(0, l)]
  return null
}

export const eRomaniaT = (t?: string) => !String(t || '').trim() || /^rom[aâ]nia$/i.test(String(t).trim())
export function clientComplet(c?: Partial<ClientFactura> | null): boolean {
  if (!c) return false
  if (c.pj && (!String(c.cui || '').trim() || !String(c.firma || '').trim())) return false
  if (!String(c.localitate || '').trim()) return false
  return eRomaniaT(c.tara) ? !!String(c.judet || '').trim() : !!String(c.tara || '').trim()
}

export type Invatat = { rezId: string; nume: string; tel: string; checkin: string; client: ClientFactura }
export type Sursa = 'salvat' | 'telefon' | 'nume' | null
export type Propunere = {
  client: ClientFactura | null; sursa: Sursa; din?: Invatat
  taraTelefon: string | null
  suma: number; dataEmitere: string; gataLa: string; mutata: boolean
  probleme: string[]   // ce lipseste -> nu se poate emite din lista (se completeaza in rezervare)
  verifica: string[]   // se poate emite, dar uita-te (nu e bifata implicit)
}

// propunerea pentru o rezervare: domiciliu (salvat / invatat), suma, data emiterii
export function propune(r: any, salvat: ClientFactura | null, invatate: Invatat[], sumaSalvata: number, ultimaRH: string | null, azi: string): Propunere {
  const tel = normTel(r.telefon_client), nume = normNume(r.nume_client)
  let client: ClientFactura | null = null, sursa: Sursa = null, din: Invatat | undefined
  if (clientComplet(salvat)) { client = salvat; sursa = 'salvat' }
  else {
    const altele = invatate.filter(x => x.rezId !== r.id && clientComplet(x.client)).sort((a, b) => b.checkin.localeCompare(a.checkin))
    din = (tel && altele.find(x => x.tel === tel)) || undefined
    if (din) sursa = 'telefon'
    else if (nume.split(' ').length >= 2) { din = altele.find(x => x.nume === nume); if (din) sursa = 'nume' }
    if (din) client = { ...din.client }
  }
  const suma = sumaSalvata > 0 ? sumaSalvata : Number(r.valoare_bruta) || 0
  const gataLa = plusZile(r.data_checkout, ZILE_DUPA_CHECKOUT)
  const dataEmitere = ultimaRH && gataLa < ultimaRH ? ultimaRH : gataLa
  const probleme: string[] = [], verifica: string[] = []
  if (!String(r.cod_rezervare_platforma || '').trim()) probleme.push('lipsește codul Airbnb')
  if (!(suma > 0)) probleme.push('lipsește suma')
  if (!client) probleme.push('lipsește domiciliul clientului')
  if (r.moneda && r.moneda !== 'RON') verifica.push(`suma e în ${r.moneda}`)
  if (sursa === 'nume') verifica.push('domiciliu luat după nume — verifică dacă e aceeași persoană')
  const taraTelefon = taraDinTelefon(r.telefon_client)
  if (client && taraTelefon && !eRomaniaT(client.tara) !== (taraTelefon !== 'Romania') && sursa !== 'salvat') verifica.push(`telefonul e din ${taraTelefon}`)
  if (client) client = { ...client, tara: taraOblio(client.tara || '') }
  return { client, sursa, din, taraTelefon, suma, dataEmitere: dataEmitere > azi ? gataLa : dataEmitere, gataLa, mutata: dataEmitere !== gataLa, probleme, verifica }
}
