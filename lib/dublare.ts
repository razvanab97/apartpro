// Dublarea unei rezervari (cerut direct: „să putem dubla o comandă … un buton pe rezervare prin care să se genereze o
// nouă rezervare pentru persoană, selectăm doar apartament și data”; și din Asistent: „dublează comanda lui X”).
// Se copiaza DOAR clientul (nume, telefon, email, persoane, canal) + pretul pe noapte; plata, avansul, factura, decontul,
// codul de platforma si legatura cu 5starDesk NU se copiaza (rezervarea noua porneste curata: neplatita, nefacturata).

export const noptiIntre = (ci: string, co: string) => Math.max(0, Math.round((new Date(co + 'T12:00:00Z').getTime() - new Date(ci + 'T12:00:00Z').getTime()) / 86400000))
export const plusZile = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const scurt = (iso: string) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : ''

// pretul pe noapte al rezervarii originale (0 daca nu are pret)
export function pretPeNoapte(r: any): number {
  const n = noptiIntre(r?.data_checkin || '', r?.data_checkout || '')
  const total = Number(r?.valoare_bruta) || Number(r?.suma_incasata) || 0
  return n > 0 && total > 0 ? Math.round(total / n * 100) / 100 : 0
}

// din observatii pastram doar actele de identitate (CNP / pasaport / buletin - pentru inregistrarea oaspetelui);
// NU id-urile 5starDesk (altfel sincronizarea ar lega dublura de rezervarea veche), coduri de platforma, payout etc.
export function observatiiDublura(r: any): string {
  const acte = String(r?.observatii || '').split(/\s*(?:·|\||\n)\s*/).map(s => s.trim())
    .filter(s => /\b(CNP|pa[sș]aport|passport|buletin)\b/i.test(s))
  return [...Array.from(new Set(acte)), `Dublată după rezervarea din ${scurt(r?.data_checkin)}–${scurt(r?.data_checkout)}`].join(' · ')
}

// randul rezervarii noi (trecut apoi prin payloadRezervare la salvare)
export function rezervareDublata(r: any, o: { apartament_id: string; proprietar_id?: string | null; checkin: string; checkout: string; total?: number | null; moneda?: string | null }) {
  const n = noptiIntre(o.checkin, o.checkout)
  const total = o.total != null && Number.isFinite(Number(o.total)) ? Math.max(0, Math.round(Number(o.total) * 100) / 100) : Math.round(pretPeNoapte(r) * n * 100) / 100
  return {
    apartament_id: o.apartament_id, proprietar_id: o.proprietar_id || null,
    nume_client: String(r?.nume_client || '').trim(), telefon_client: r?.telefon_client || null, email_client: r?.email_client || null,
    nr_persoane: Number(r?.nr_persoane) || 1,
    // pe Airbnb / Booking oaspetele n-a facut a doua rezervare acolo -> dublura e directa (fara comision de platforma)
    canal: ['airbnb', 'booking'].includes(r?.canal) ? 'direct' : (r?.canal || 'direct'),
    moneda: o.moneda || r?.moneda || 'RON', data_checkin: o.checkin, data_checkout: o.checkout,
    valoare_bruta: total, suma_incasata: total, taxa_curatenie_incasata: 0,
    status_rezervare: 'confirmata', status_plata: 'neplatit', status_decont: 'nedecontat', status_facturare: 'nefacturat',
    observatii: observatiiDublura(r),
  }
}
