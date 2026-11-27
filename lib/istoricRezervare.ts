// Istoricul modificarilor unei rezervari (cerut direct: „să avem și istoric în caz că apar modificări, de genul: s-a mărit
// cu o zi rezervarea, s-a scăzut cu o zi rezervarea, s-a crescut, scăzut prețul ș.a.m.d.”).
// Sursa: tabela `rezervari_istoric`, scrisa de un trigger in Postgres la ORICE insert/update/delete pe `rezervari`
// (fereastra rezervarii, calendar, asistent, sincronizarea 5starDesk, oferta prin link…) - nu depinde de cine scrie.
// Cine a scris: antetul „x-sursa” pus pe cereri (setHeader) - vezi SURSA_LABEL; lipsa lui -> „aplicatie”/„server”.
// Aici doar: unirea salvarilor automate apropiate (salvarea automata scrie la ~1 s dupa tastare -> „5”, „57”, „574”)
// si textul in romana pentru fiecare schimbare. Functii pure (testate in scratchpad).

export type IntrareIstoric = { id?: number; rezervare_id: string; la: string; tip: 'creata' | 'modificata' | 'stearsa' | string; sursa?: string | null; modificari: Record<string, [any, any]> }
export type Rand = { icon: string; text: string; ton: 'sus' | 'jos' | 'neutru' | 'rau' | 'bun' }
export type Eveniment = { la: string; pana_la: string; tip: string; sursa: string; randuri: Rand[] }

export const SURSA_LABEL: Record<string, string> = {
  manual: 'din fereastra rezervării', calendar: 'din calendar', asistent: 'de Asistent', sync5sd: 'sincronizare 5starDesk',
  oferta: 'ofertă prin link (clientul)', dublare: 'Dublează', aplicatie: 'din aplicație', server: 'automat (server)', sql: 'direct în baza de date',
}
export const sursaText = (s?: string | null) => SURSA_LABEL[String(s || '')] || String(s || 'necunoscut')

const STATUS: Record<string, Record<string, string>> = {
  status_rezervare: { cerere: 'Cerere', confirmata: 'Confirmată', anulata: 'Anulată', finalizata: 'Finalizată' },
  status_plata: { neplatit: 'Neplătit', avans: 'Avans', achitat: 'Achitat' },
  status_decont: { nedecontat: 'Nedecontat', inclus: 'Inclus în decont', decontat: 'Decontat' },
  status_facturare: { nefacturat: 'Nefacturat', de_facturat: 'De facturat', facturata: 'Facturată' },
}
const NUME_STATUS: Record<string, string> = { status_rezervare: 'Status rezervare', status_plata: 'Plată', status_decont: 'Decont', status_facturare: 'Facturare' }
const BANI: Record<string, string> = {
  valoare_bruta: 'Preț total', suma_incasata: 'Încasat efectiv', taxa_curatenie_incasata: 'Taxă curățenie', avans: 'Avans încasat',
  avans_cerut: 'Avans de încasat', comision_platforma_valoare: 'Comision platformă', suma_platita_proprietar: 'Sumă plătită proprietarului',
}
const TEXT: Record<string, string> = {
  nume_client: 'Nume client', telefon_client: 'Telefon', email_client: 'Email', cod_rezervare_platforma: 'Cod rezervare platformă',
  observatii: 'Observații', moneda: 'Monedă', avans_termen: 'Termen avans',
}
const CANAL: Record<string, string> = { booking: 'Booking.com', airbnb: 'Airbnb', direct: 'Direct', telefon: 'Telefon', whatsapp: 'WhatsApp', site: 'Site propriu' }

const gol = (v: any) => v == null || v === ''
const egal = (a: any, b: any) => (gol(a) && gol(b)) || (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : JSON.stringify(a) === JSON.stringify(b))
const ziua = (d: any) => gol(d) ? '—' : new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const nopti = (ci: any, co: any) => gol(ci) || gol(co) ? 0 : Math.round((Date.parse(String(co).slice(0, 10)) - Date.parse(String(ci).slice(0, 10))) / 86400000)
const lei = (v: any, m: string) => `${(Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${m}`
const n = (k: number) => `${k} ${k === 1 ? 'noapte' : 'nopți'}`

// salvarile automate ale aceleiasi surse, la mai putin de `fereastraMin` minute una de alta, devin un singur eveniment
// (valoarea veche = prima, cea noua = ultima; campurile ajunse inapoi la valoarea initiala dispar)
export function uneste(intrari: IntrareIstoric[], fereastraMin = 3): { la: string; pana_la: string; tip: string; sursa: string; modificari: Record<string, [any, any]> }[] {
  const ord = [...intrari].sort((a, b) => a.la.localeCompare(b.la) || (a.id || 0) - (b.id || 0))
  const out: { la: string; pana_la: string; tip: string; sursa: string; modificari: Record<string, [any, any]> }[] = []
  for (const e of ord) {
    const ult = out[out.length - 1], sursa = String(e.sursa || '')
    if (ult && e.tip === 'modificata' && ult.tip === 'modificata' && ult.sursa === sursa && Date.parse(e.la) - Date.parse(ult.pana_la) <= fereastraMin * 60000) {
      for (const [k, [v, nou]] of Object.entries(e.modificari || {})) ult.modificari[k] = k in ult.modificari ? [ult.modificari[k][0], nou] : [v, nou]
      ult.pana_la = e.la
    } else out.push({ la: e.la, pana_la: e.la, tip: e.tip, sursa, modificari: { ...(e.modificari || {}) } })
  }
  for (const ev of out) if (ev.tip === 'modificata') for (const k of Object.keys(ev.modificari)) if (egal(ev.modificari[k][0], ev.modificari[k][1])) delete ev.modificari[k]
  return out.filter(ev => ev.tip !== 'modificata' || Object.keys(ev.modificari).length > 0)
}

// textele pentru o modificare (`apt` = id apartament -> nume scurt)
export function descrie(m: Record<string, [any, any]>, apt: (id: any) => string = id => String(id || '—'), monedaImplicita = 'RON'): Rand[] {
  const r: Rand[] = []
  const val = (k: string, i: 0 | 1, implicit?: any) => (k in m ? m[k][i] : implicit)
  const moneda = String(val('moneda', 1) || monedaImplicita || 'RON')
  // perioada: prelungita / scurtata / mutata
  if ('data_checkin' in m || 'data_checkout' in m) {
    const ci0 = val('data_checkin', 0), co0 = val('data_checkout', 0), ci1 = val('data_checkin', 1), co1 = val('data_checkout', 1)
    // un singur capat schimbat: celalalt ramane la fel -> diferenta de nopti vine doar din capatul mutat
    if ('data_checkin' in m && 'data_checkout' in m) {
      const a = nopti(ci0, co0), b = nopti(ci1, co1), d = b - a
      const per = `${ziua(ci0)} → ${ziua(co0)} devine ${ziua(ci1)} → ${ziua(co1)}`
      r.push(d > 0 ? { icon: '↔', text: `Prelungită cu ${n(d)} (${per}, ${n(b)})`, ton: 'sus' }
        : d < 0 ? { icon: '↔', text: `Scurtată cu ${n(-d)} (${per}, ${n(b)})`, ton: 'jos' }
        : { icon: '⇄', text: `Mutată pe alte date (${per}, tot ${n(b)})`, ton: 'neutru' })
    } else if ('data_checkout' in m) {
      const d = nopti(co0, co1)
      r.push({ icon: '↔', text: d > 0 ? `Prelungită cu ${n(d)} — check-out ${ziua(co0)} → ${ziua(co1)}` : d < 0 ? `Scurtată cu ${n(-d)} — check-out ${ziua(co0)} → ${ziua(co1)}` : `Check-out ${ziua(co0)} → ${ziua(co1)}`, ton: d > 0 ? 'sus' : d < 0 ? 'jos' : 'neutru' })
    } else {
      const d = nopti(ci1, ci0)   // check-in mai devreme = mai multe nopti
      r.push({ icon: '↔', text: d > 0 ? `Prelungită cu ${n(d)} — check-in ${ziua(ci0)} → ${ziua(ci1)}` : d < 0 ? `Scurtată cu ${n(-d)} — check-in ${ziua(ci0)} → ${ziua(ci1)}` : `Check-in ${ziua(ci0)} → ${ziua(ci1)}`, ton: d > 0 ? 'sus' : d < 0 ? 'jos' : 'neutru' })
    }
  }
  if ('apartament_id' in m) r.push({ icon: '🏠', text: `Mutată în alt apartament: ${apt(m.apartament_id[0])} → ${apt(m.apartament_id[1])}`, ton: 'neutru' })
  for (const [k, et] of Object.entries(BANI)) if (k in m) {
    const [a, b] = m[k], d = Math.round(((Number(b) || 0) - (Number(a) || 0)) * 100) / 100
    if (k === 'valoare_bruta') r.push(d > 0 ? { icon: '▲', text: `Preț crescut: ${lei(a, moneda)} → ${lei(b, moneda)} (+${lei(d, moneda)})`, ton: 'sus' }
      : { icon: '▼', text: `Preț scăzut: ${lei(a, moneda)} → ${lei(b, moneda)} (−${lei(-d, moneda)})`, ton: 'jos' })
    else r.push({ icon: d > 0 ? '▲' : '▼', text: `${et}: ${gol(a) ? '—' : lei(a, moneda)} → ${gol(b) ? '—' : lei(b, moneda)}`, ton: 'neutru' })
  }
  if ('nr_persoane' in m) r.push({ icon: '👤', text: `Persoane: ${m.nr_persoane[0] ?? '—'} → ${m.nr_persoane[1] ?? '—'}`, ton: 'neutru' })
  if ('canal' in m) r.push({ icon: '⇄', text: `Canal: ${CANAL[m.canal[0]] || m.canal[0] || '—'} → ${CANAL[m.canal[1]] || m.canal[1] || '—'}`, ton: 'neutru' })
  for (const k of Object.keys(STATUS)) if (k in m) {
    const [a, b] = m[k]
    r.push({ icon: '●', text: `${NUME_STATUS[k]}: ${STATUS[k][a] || a || '—'} → ${STATUS[k][b] || b || '—'}`, ton: k === 'status_rezervare' && b === 'anulata' ? 'rau' : (b === 'confirmata' || b === 'achitat' || b === 'decontat' || b === 'facturata') ? 'bun' : 'neutru' })
  }
  if ('platit_proprietar' in m) r.push({ icon: '●', text: m.platit_proprietar[1] ? 'Marcată plătită către proprietar' : 'Debifat „plătit către proprietar”', ton: m.platit_proprietar[1] ? 'bun' : 'neutru' })
  if ('factura_numar' in m) r.push(gol(m.factura_numar[1]) ? { icon: '↩', text: `Factura ${m.factura_numar[0]} scoasă de pe rezervare (stornare)`, ton: 'rau' } : { icon: '🧾', text: `Factură emisă: ${m.factura_numar[1]}`, ton: 'bun' })
  for (const [k, et] of Object.entries(TEXT)) if (k in m) {
    const [a, b] = m[k]
    r.push({ icon: '✎', text: k === 'observatii' ? (gol(a) ? 'Observații adăugate' : gol(b) ? 'Observații șterse' : 'Observații modificate')
      : k === 'avans_termen' ? `${et}: ${ziua(a)} → ${ziua(b)}`
      : gol(a) ? `${et} adăugat: ${b}` : gol(b) ? `${et} șters (era ${a})` : `${et}: ${a} → ${b}`, ton: 'neutru' })
  }
  return r
}

export function evenimente(intrari: IntrareIstoric[], apt?: (id: any) => string, moneda?: string): Eveniment[] {
  return uneste(intrari).map(e => {
    const v = (k: string) => e.modificari[k]?.[e.tip === 'stearsa' ? 0 : 1]
    const rez = `${ziua(v('data_checkin'))} → ${ziua(v('data_checkout'))}${gol(v('valoare_bruta')) ? '' : `, ${lei(v('valoare_bruta'), String(v('moneda') || moneda || 'RON'))}`}${v('canal') ? `, ${CANAL[v('canal')] || v('canal')}` : ''}`
    const randuri: Rand[] = e.tip === 'creata' ? [{ icon: '✚', text: `Rezervare creată (${rez})`, ton: 'bun' }]
      : e.tip === 'stearsa' ? [{ icon: '✕', text: `Rezervare ștearsă (${rez})`, ton: 'rau' }]
      : descrie(e.modificari, apt, moneda)
    return { la: e.la, pana_la: e.pana_la, tip: e.tip, sursa: e.sursa, randuri }
  }).reverse()   // cele mai noi primele
}

// SQL-ul (dat in chat, rulat manual in Supabase) - pastrat aici ca referinta pentru lista de campuri urmarite
export const CAMPURI_URMARITE = ['apartament_id', 'data_checkin', 'data_checkout', 'nr_persoane', 'canal', 'moneda', 'valoare_bruta', 'suma_incasata',
  'taxa_curatenie_incasata', 'avans', 'avans_cerut', 'avans_termen', 'comision_platforma_valoare', 'status_rezervare', 'status_plata', 'status_decont',
  'status_facturare', 'platit_proprietar', 'suma_platita_proprietar', 'factura_numar', 'nume_client', 'telefon_client', 'email_client', 'cod_rezervare_platforma', 'observatii']
