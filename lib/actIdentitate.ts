// Citirea actelor de identitate: buletin SAU pasaport (cerut direct: „asta e un pașaport, să știe sistemul să le
// citească și pe acestea”). Pe langa ce citeste AI-ul din poza, verificam zona de jos a actului (MRZ, randurile
// cu <<<): are cifre de control, deci numarul actului, numele si CNP-ul de acolo sunt sigure cand controlul iese.

const VAL = (c: string) => c === '<' ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55   // A=10 … Z=35
export function cifraControl(s: string) { let t = 0; const w = [7, 3, 1]; for (let i = 0; i < s.length; i++) t += VAL(s[i]) * w[i % 3]; return t % 10 }
const ok = (camp: string, cifra: string) => /\d/.test(cifra) && cifraControl(camp) === +cifra

// CNP romanesc: 13 cifre + cifra de control (constanta 279146358279), data nasterii plauzibila
export function cnpValid(cnp: unknown): boolean {
  const c = String(cnp ?? '').replace(/\s/g, '')
  if (!/^[1-9]\d{12}$/.test(c)) return false
  const k = '279146358279'; let s = 0
  for (let i = 0; i < 12; i++) s += +c[i] * +k[i]
  const r = s % 11 === 10 ? 1 : s % 11
  const luna = +c.slice(3, 5), zi = +c.slice(5, 7)
  return r === +c[12] && luna >= 1 && luna <= 12 && zi >= 1 && zi <= 31
}

const curata = (l: string) => String(l || '').toUpperCase().replace(/[«‹]/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '')
const nume = (s: string) => s.replace(/<+$/, '').split('<').filter(Boolean).join(' ')
export const majuscule = (s: string) => String(s || '').toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).trim()

export type Mrz = { tip: 'pasaport' | 'buletin'; numar: string | null; tara: string; prenume: string; numeFamilie: string; nrPersonal: string | null }

// TD3 = pasaport (2 x 44), TD1 = carte de identitate noua (3 x 30), TD2 = buletin vechi (2 x 36)
export function citesteMrz(linii: unknown): Mrz | null {
  const L = (Array.isArray(linii) ? linii : String(linii || '').split(/\n/)).map(x => curata(String(x))).filter(x => x.length >= 28)
  if (!L.length) return null
  const numeDin = (s: string) => { const [f, p = ''] = s.split('<<'); return { numeFamilie: nume(f), prenume: nume(p) } }
  // pasaport (exemplul oficial ICAO): P<UTOERIKSSON<<ANNA<MARIA<<… / L898902C36UTO7408122F1204159ZE184226B<<<<<10
  const i1 = L.findIndex(l => /^P[A-Z<]/.test(l) && l.length >= 40)
  if (i1 >= 0 && L[i1 + 1]?.length >= 42) {
    const a = L[i1].padEnd(44, '<'), b = L[i1 + 1].padEnd(44, '<')
    const nr = b.slice(0, 9), pers = b.slice(28, 42)
    return { tip: 'pasaport', tara: a.slice(2, 5).replace(/</g, ''), ...numeDin(a.slice(5)),
      numar: ok(nr, b[9]) ? nr.replace(/<+$/, '') : null,
      nrPersonal: pers.replace(/</g, '') && (ok(pers, b[42]) || b[42] === '<') ? pers.replace(/<+$/, '') : null }
  }
  // carte de identitate noua (TD1): IDROU<numar><c>… / data nasterii… / NUME<<PRENUME
  const t1 = L.findIndex(l => /^[IAC][A-Z<]/.test(l) && l.length >= 28 && l.length <= 32)
  if (t1 >= 0 && L[t1 + 2]) {
    const a = L[t1].padEnd(30, '<'), nr = a.slice(5, 14)
    return { tip: 'buletin', tara: a.slice(2, 5).replace(/</g, ''), ...numeDin(L[t1 + 2]), numar: ok(nr, a[14]) ? nr.replace(/<+$/, '') : null, nrPersonal: null }
  }
  // buletin vechi romanesc (TD2): IDROUNUME<<PRENUME / XZ123456<4ROU…<CNP-ul in campul optional
  const t2 = L.findIndex(l => /^I[DA<]/.test(l) && l.length >= 34)
  if (t2 >= 0 && L[t2 + 1]?.length >= 34) {
    const a = L[t2].padEnd(36, '<'), b = L[t2 + 1].padEnd(36, '<'), nr = b.slice(0, 9)
    const cnp = /\d{13}/.exec(b.slice(20))?.[0] || null
    return { tip: 'buletin', tara: a.slice(2, 5).replace(/</g, ''), ...numeDin(a.slice(5)), numar: ok(nr, b[9]) ? nr.replace(/<+$/, '') : null, nrPersonal: cnp }
  }
  return null
}
