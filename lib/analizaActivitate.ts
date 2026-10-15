// Rezumatul jurnalului de activitate (observatorul ERP) pentru Asistent - functie pura, testabila separat.
export function agregaActivitate(ev: any[], zile: number) {
  const num = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] || 0) + n }
  const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => ({ [k]: v }))
  const peTip: Record<string, number> = {}, pagini: Record<string, number> = {}, minute: Record<string, number> = {}, clickuri: Record<string, number> = {}
  const scrieri: Record<string, number> = {}, statusuri: Record<string, number> = {}, wa: Record<string, number> = {}, ore: Record<string, number> = {}, peZi: Record<string, number> = {}
  const secv: Record<string, number> = {}, erori: Record<string, number> = {}, dispozitive: Record<string, number> = {}
  const intrebari: string[] = [], sync: any[] = []
  const ultimPeSesiune: Record<string, string> = {}
  const oraRO = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(iso))
  const ziRO = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso))
  for (const e of ev) {
    num(peTip, e.tip); num(peZi, ziRO(e.created_at)); if (e.tip !== 'sync') num(ore, oraRO(e.created_at) + ':00')
    if (e.dispozitiv) num(dispozitive, e.dispozitiv)
    const pag = String(e.pagina || '').split('?')[0]
    let pas = ''
    if (e.tip === 'pagina') { num(pagini, pag); num(minute, pag, Math.round((Number(e.detalii?.secunde_vizibil) || 0) / 6) / 10) }
    else if (e.tip === 'click' || e.tip === 'alegere') { num(clickuri, `${e.tinta} @ ${pag}`); pas = `${e.tip === 'alegere' ? 'alege ' : ''}${e.tinta} @ ${pag}` }
    else if (e.tip === 'scriere') {
      num(scrieri, String(e.tinta)); pas = `scrie ${e.tinta}`
      for (const [k, v] of Object.entries(e.detalii?.valori || {})) num(statusuri, `${e.detalii?.tabel}.${k}=${v}`)
    }
    else if (e.tip === 'whatsapp') { num(wa, `${e.tinta} @ ${pag}`); pas = `WhatsApp ${e.tinta} @ ${pag}` }
    else if (e.tip === 'agent') intrebari.push(String(e.tinta))
    else if (e.tip === 'eroare') num(erori, String(e.tinta).slice(0, 120))
    else if (e.tip === 'sync') sync.push(e.tinta)
    if (pas && e.sesiune) { const ant = ultimPeSesiune[e.sesiune]; if (ant && ant !== pas) num(secv, `${ant}  →  ${pas}`); ultimPeSesiune[e.sesiune] = pas }
  }
  return {
    perioada: `${zile} zile (${ziRO(ev[0].created_at)} → ${ziRO(ev[ev.length - 1].created_at)})`, evenimente: ev.length, pe_tip: peTip, pe_zi: peZi, dispozitive,
    pagini_vizite: top(pagini, 15), pagini_minute_vizibile: top(minute, 15), butoane_top: top(clickuri, 40), scrieri_top: top(scrieri, 25), statusuri_setate: top(statusuri, 25),
    whatsapp: top(wa, 15), ore_active: ore, secvente_repetate: top(secv, 25).filter(x => Object.values(x)[0] >= 2),
    intrebari_asistent: intrebari.slice(-20), erori: top(erori, 10), sincronizari_5stardesk: sync.length,
  }
}
