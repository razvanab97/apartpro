// Adresele pentru oaspeti: pe ele se servesc DOAR ghidurile de check-in (vezi middleware.ts), fara aplicatia interna.
// abhomes-checkin.vercel.app merge imediat (fara DNS); ghid.abhomesiasi.ro devine activ daca se adauga rândul DNS.
export const GAZDE_GHID = ['abhomes-checkin.vercel.app', 'ghid.abhomesiasi.ro']
export const GHID_BAZA = 'https://abhomes-checkin.vercel.app'
export const eGazdaGhid = (host: string | null | undefined) => GAZDE_GHID.includes(String(host || '').split(':')[0].toLowerCase())
