import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ── Asistent AB Homes (cerut direct: „un agent personal care să vadă tot ce se întâmplă în platformă,
// cu care să putem vorbi ca într-un chat, să facem / anulăm / mutăm rezervări și să pregătească mesaje”).
// Modelul (OpenAI, cheia doar pe server) primeste UNELTE: cele de citire se executa aici, pe loc, pe baza
// de date reala; cele de scriere NU scriu nimic - intorc o PROPUNERE validata (card cu „Confirmă”), pe care
// o executa browserul doar dupa click-ul tau (vezi components/Agent.tsx). Asa agentul nu poate strica nimic singur.

export const maxDuration = 60

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.OPENAI_AGENT_MODEL || 'gpt-4.1'
const MODEL_REZERVA = 'gpt-4o-mini'

const aziRO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
const plusZile = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const nopti = (ci: string, co: string) => Math.max(0, Math.round((new Date(co + 'T12:00:00Z').getTime() - new Date(ci + 'T12:00:00Z').getTime()) / 86400000))
const ISO = /^\d{4}-\d{2}-\d{2}$/
// rezervarile venite din 5starDesk au ID-ul extern in observatii („camera | 1399390 | status”) - vezi lib/syncFivestar idsDinObs
const din5star = (obs: any) => String(obs || '').split('|').some(s => /^\d{5,9}$/.test(s.trim()))
const curat = (s: any) => String(s ?? '').trim()

type Apt = { id: string; nota: string | null; nume: string; adresa: string | null; zona: string | null; capacitate_max: number | null; pret_standard: number | null; link_site: string | null; instructiuni_checkin: string | null; proprietar_id: string | null; status: string }

async function apartamente(toate = false): Promise<Apt[]> {
  let q = supabase.from('apartamente').select('id,nota,nume,adresa,zona,capacitate_max,pret_standard,link_site,instructiuni_checkin,proprietar_id,status').order('nota')
  if (!toate) q = q.eq('status', 'activ')
  const { data } = await q
  return (data || []) as Apt[]
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
function gasesteApt(apts: Apt[], q: any): Apt | null {
  const t = norm(curat(q)); if (!t) return null
  return apts.find(a => a.id === curat(q)) || apts.find(a => a.nota && norm(a.nota) === t) || apts.find(a => norm(a.nume) === t)
    || apts.find(a => norm(a.nume).includes(t) || (a.nota && t.includes(norm(a.nota)))) || null
}
const etApt = (x: any) => { const a = Array.isArray(x) ? x[0] : x; return a ? `${a.nota ? a.nota + ' · ' : ''}${curat(a.nume)}` : '—' }

const SEL = 'id,apartament_id,nume_client,telefon_client,email_client,data_checkin,data_checkout,nr_persoane,valoare_bruta,suma_incasata,moneda,status_rezervare,status_plata,canal,cod_rezervare_platforma,observatii,camera_semnalata,apartament:apartamente(nota,nume)'
function compact(r: any) {
  return {
    id: r.id, apartament: etApt(r.apartament), client: curat(r.nume_client), telefon: r.telefon_client || null,
    checkin: r.data_checkin, checkout: r.data_checkout, nopti: nopti(r.data_checkin, r.data_checkout), persoane: r.nr_persoane,
    valoare_bruta: Number(r.valoare_bruta) || 0, incasat: Number(r.suma_incasata) || 0, moneda: r.moneda || 'RON',
    status: r.status_rezervare, plata: r.status_plata, canal: r.canal, cod: r.cod_rezervare_platforma || null,
    observatii: curat(r.observatii).slice(0, 220) || null, din_5stardesk: din5star(r.observatii),
    nealocata_5stardesk: r.camera_semnalata === 'NEALOCAT' || undefined,
  }
}
async function suprapuneri(aptId: string, ci: string, co: string, exceptId?: string) {
  let q = supabase.from('rezervari').select('id,nume_client,data_checkin,data_checkout,camera_semnalata').eq('apartament_id', aptId)
    .neq('status_rezervare', 'anulata').lt('data_checkin', co).gt('data_checkout', ci).limit(5)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q
  return (data || []).filter((r: any) => r.camera_semnalata !== 'NEALOCAT')
}

// ───────────────────────── UNELTE ─────────────────────────
const fn = (name: string, description: string, properties: any = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } })
const S = (d: string) => ({ type: 'string', description: d })
const N = (d: string) => ({ type: 'number', description: d })

const TOOLS = [
  fn('situatia_zilei', 'Ce se întâmplă într-o zi: sosiri, plecări, oaspeți în casă, rezervări fără telefon, cereri noi, nealocate 5starDesk. Folosește pentru „ce am azi / mâine”.', { data: S('YYYY-MM-DD; implicit azi') }),
  fn('cauta_rezervari', 'Caută rezervări după client / telefon / cod / apartament / perioadă / status. Întoarce id-urile necesare pentru acțiuni.', {
    text: S('nume client, telefon sau cod rezervare (opțional)'), apartament: S('cod (ex. N32) sau nume (opțional)'),
    de_la: S('YYYY-MM-DD: rezervări care se termină după această dată (opțional)'), pana_la: S('YYYY-MM-DD: rezervări care încep înainte de această dată (opțional)'),
    status: S('confirmata | anulata | finalizata | cerere | toate (implicit: fără anulate)'), limita: N('max rezultate, implicit 15'),
  }),
  fn('detalii_rezervare', 'Toate detaliile unei rezervări (inclusiv apartament, adresă, instrucțiuni check-in, decont).', { rezervare_id: S('id rezervare') }, ['rezervare_id']),
  fn('disponibilitate', 'Ce apartamente sunt libere / ocupate pe o perioadă (cu capacitate și preț standard).', { checkin: S('YYYY-MM-DD'), checkout: S('YYYY-MM-DD'), persoane: N('nr. oaspeți (opțional)') }, ['checkin', 'checkout']),
  fn('lista_apartamente', 'Lista apartamentelor active: cod, nume, adresă, zonă, capacitate, preț standard, link site, instrucțiuni de check-in.'),
  fn('cereri_inbox', 'Cererile de rezervare din Inbox (Smart Booking).', { status: S('noua | contactat | confirmat | pierdut | toate') }),
  fn('statistici_luna', 'Statistici pe o lună: nr. rezervări, nopți vândute, grad de ocupare, încasări, pe canale.', { an: N('ex. 2026'), luna: N('1-12') }, ['an', 'luna']),
  fn('recomandari', 'Analizează următoarele 14 zile și spune ce ar trebui făcut / îmbunătățit: rezervări fără telefon, neplătite aproape de sosire, nopți libere, cereri neatinse, nealocate.'),
  fn('propune_rezervare_noua', 'PROPUNE o rezervare nouă (utilizatorul confirmă cu un click; nu se scrie nimic până atunci).', {
    apartament: S('cod sau nume apartament'), nume_client: S('nume'), telefon: S('opțional'), checkin: S('YYYY-MM-DD'), checkout: S('YYYY-MM-DD'),
    persoane: N('nr. oaspeți'), pret_total: N('valoare totală RON (opțional)'), canal: S('direct | airbnb | booking | intern (implicit direct)'),
    status_plata: S('neplatit | avans | achitat (implicit neplatit)'), incasat: N('suma încasată deja, ex. avansul (opțional)'), observatii: S('opțional'),
  }, ['apartament', 'nume_client', 'checkin', 'checkout']),
  fn('propune_anulare', 'PROPUNE anularea unei rezervări (după confirmarea utilizatorului).', { rezervare_id: S('id'), motiv: S('opțional') }, ['rezervare_id']),
  fn('propune_mutare', 'PROPUNE mutarea unei rezervări pe alt apartament și/sau alte date. Verifică singur disponibilitatea.', {
    rezervare_id: S('id'), apartament_nou: S('cod/nume apartament nou (opțional)'), checkin_nou: S('YYYY-MM-DD (opțional)'), checkout_nou: S('YYYY-MM-DD (opțional)'),
  }, ['rezervare_id']),
  fn('propune_modificare', 'PROPUNE modificarea unor câmpuri ale unei rezervări (preț, plată, persoane, telefon, nume, email, observații).', {
    rezervare_id: S('id'), nume_client: S('opțional'), telefon: S('opțional'), email: S('opțional'), persoane: N('opțional'),
    pret_total: N('valoare brută totală, opțional'), incasat: N('suma încasată, opțional'), status_plata: S('neplatit | avans | achitat (opțional)'),
    observatii_adauga: S('text de adăugat la observații (opțional)'),
  }, ['rezervare_id']),
  fn('propune_task', 'PROPUNE un task / reminder în lista de Task-uri.', { titlu: S('titlu'), descriere: S('opțional'), prioritate: S('urgenta | normala | scazuta'), data_limita: S('YYYY-MM-DD opțional') }, ['titlu']),
  fn('arata_mesaj', 'Afișează un mesaj gata de trimis clientului / proprietarului, cu butoane Copiază și WhatsApp. Folosește-l ORI de câte ori scrii un mesaj de trimis.', {
    text: S('textul mesajului, exact cum se trimite'), telefon: S('numărul destinatarului (opțional)'), titlu: S('ex. „Date de acces — Ramona”'), rezervare_id: S('opțional'),
  }, ['text']),
  fn('arata_confirmare_client', 'Afișează butonul care deschide confirmarea premium (poză / PDF) pentru o rezervare.', { rezervare_id: S('id') }, ['rezervare_id']),
]

type Card = Record<string, any>

async function executa(name: string, a: any, cards: Card[]): Promise<any> {
  const azi = aziRO()
  switch (name) {
    case 'situatia_zilei': {
      const zi = ISO.test(a.data || '') ? a.data : azi
      const [sos, ple, inCasa, fara, cer, neal] = await Promise.all([
        supabase.from('rezervari').select(SEL).eq('data_checkin', zi).neq('status_rezervare', 'anulata').order('data_checkin'),
        supabase.from('rezervari').select(SEL).eq('data_checkout', zi).neq('status_rezervare', 'anulata'),
        supabase.from('rezervari').select(SEL).lt('data_checkin', zi).gt('data_checkout', zi).neq('status_rezervare', 'anulata'),
        supabase.from('rezervari').select(SEL).gte('data_checkin', zi).lte('data_checkin', plusZile(zi, 7)).neq('status_rezervare', 'anulata').is('telefon_client', null),
        supabase.from('cereri_rezervare').select('id,nume_client,telefon,data_checkin,data_checkout,nr_persoane,status,created_at').eq('status', 'noua'),
        supabase.from('rezervari').select(SEL).eq('camera_semnalata', 'NEALOCAT').neq('status_rezervare', 'anulata').gte('data_checkout', zi),
      ])
      return {
        data: zi, sosiri: (sos.data || []).map(compact), plecari: (ple.data || []).map(compact), in_casa: (inCasa.data || []).map(compact),
        fara_telefon_urmatoarele_7_zile: (fara.data || []).map(compact), cereri_noi: cer.data || [], nealocate_5stardesk: (neal.data || []).map(compact),
        ore: { checkin: '15:00', checkout: '11:00' },
      }
    }
    case 'cauta_rezervari': {
      let q = supabase.from('rezervari').select(SEL).order('data_checkin', { ascending: true }).limit(Math.min(Number(a.limita) || 15, 40))
      const st = curat(a.status)
      if (st && st !== 'toate') q = q.eq('status_rezervare', st); else if (!st) q = q.neq('status_rezervare', 'anulata')
      if (ISO.test(a.de_la || '')) q = q.gte('data_checkout', a.de_la)
      if (ISO.test(a.pana_la || '')) q = q.lte('data_checkin', a.pana_la)
      if (a.apartament) {
        const apt = gasesteApt(await apartamente(true), a.apartament)
        if (!apt) return { eroare: `Nu găsesc apartamentul „${a.apartament}”.` }
        q = q.eq('apartament_id', apt.id)
      }
      const t = curat(a.text)
      if (t) {
        const cif = t.replace(/[^0-9]/g, '')
        const sigur = t.replace(/[%,()*]/g, ' ').trim()
        const ors = [`nume_client.ilike.%${sigur}%`, `cod_rezervare_platforma.ilike.%${sigur}%`, `observatii.ilike.%${sigur}%`]
        if (cif.length >= 6) ors.push(`telefon_client.ilike.%${cif.slice(-9)}%`)
        q = q.or(ors.join(','))
      }
      if (!t && !a.apartament && !ISO.test(a.de_la || '') && !ISO.test(a.pana_la || '')) q = q.gte('data_checkout', azi)
      const { data, error } = await q
      if (error) return { eroare: error.message }
      return { rezultate: (data || []).map(compact), nr: (data || []).length }
    }
    case 'detalii_rezervare': {
      const { data, error } = await supabase.from('rezervari').select('*, apartament:apartamente(nota,nume,adresa,zona,capacitate_max,pret_standard,link_site,instructiuni_checkin)').eq('id', a.rezervare_id).maybeSingle()
      if (error || !data) return { eroare: 'Rezervarea nu există' }
      return { ...compact(data), apartament_detalii: data.apartament, decont: { comision_administrator: data.comision_administrator, suma_proprietar: data.suma_proprietar, status_decont: data.status_decont }, observatii_complete: data.observatii }
    }
    case 'disponibilitate': {
      if (!ISO.test(a.checkin || '') || !ISO.test(a.checkout || '') || a.checkout <= a.checkin) return { eroare: 'Date invalide (YYYY-MM-DD, checkout după checkin)' }
      const apts = await apartamente()
      const { data } = await supabase.from('rezervari').select('apartament_id,nume_client,data_checkin,data_checkout,camera_semnalata').neq('status_rezervare', 'anulata').lt('data_checkin', a.checkout).gt('data_checkout', a.checkin)
      const ocup: Record<string, string[]> = {}
      for (const r of data || []) { if (r.camera_semnalata === 'NEALOCAT') continue; (ocup[r.apartament_id] ||= []).push(`${curat(r.nume_client)} ${r.data_checkin}→${r.data_checkout}`) }
      const p = Number(a.persoane) || 0
      return {
        perioada: `${a.checkin} → ${a.checkout} (${nopti(a.checkin, a.checkout)} nopți)`,
        libere: apts.filter(x => !ocup[x.id]).map(x => ({ id: x.id, apartament: etApt(x), capacitate: x.capacitate_max, pret_standard: x.pret_standard, zona: x.zona, capacitate_ok: !p || !x.capacitate_max || x.capacitate_max >= p })),
        ocupate: apts.filter(x => ocup[x.id]).map(x => ({ apartament: etApt(x), ocupat_de: ocup[x.id] })),
      }
    }
    case 'lista_apartamente':
      return (await apartamente()).map(x => ({ id: x.id, cod: x.nota, nume: curat(x.nume), adresa: x.adresa, zona: x.zona, capacitate: x.capacitate_max, pret_standard: x.pret_standard, link_site: x.link_site, instructiuni_checkin: x.instructiuni_checkin }))
    case 'cereri_inbox': {
      let q = supabase.from('cereri_rezervare').select('id,nume_client,telefon,canal,data_checkin,data_checkout,nr_persoane,mesaj,status,created_at').order('created_at', { ascending: false }).limit(25)
      if (a.status && a.status !== 'toate') q = q.eq('status', a.status)
      const { data } = await q
      return (data || []).map((c: any) => ({ ...c, mesaj: curat(c.mesaj).slice(0, 300) }))
    }
    case 'statistici_luna': {
      const an = Number(a.an), luna = Number(a.luna)
      if (!an || !luna) return { eroare: 'an / luna lipsă' }
      const st = `${an}-${String(luna).padStart(2, '0')}-01`, en = luna === 12 ? `${an + 1}-01-01` : `${an}-${String(luna + 1).padStart(2, '0')}-01`
      const [{ data }, apts] = await Promise.all([
        supabase.from('rezervari').select('canal,data_checkin,data_checkout,suma_incasata,valoare_bruta,status_rezervare').neq('status_rezervare', 'anulata').lt('data_checkin', en).gt('data_checkout', st),
        apartamente(),
      ])
      let nop = 0; const canale: Record<string, number> = {}; let inc = 0
      for (const r of data || []) {
        const n = nopti(r.data_checkin > st ? r.data_checkin : st, r.data_checkout < en ? r.data_checkout : en)
        nop += n; canale[r.canal] = (canale[r.canal] || 0) + 1
        if (r.data_checkin >= st && r.data_checkin < en) inc += Number(r.suma_incasata) || 0
      }
      const zileLuna = nopti(st, en)
      return { luna: `${luna}/${an}`, rezervari: (data || []).length, nopti_vandute: nop, grad_ocupare_pct: apts.length ? Math.round(nop / (apts.length * zileLuna) * 100) : null, incasari_cu_checkin_in_luna_ron: Math.round(inc), pe_canale: canale, apartamente_active: apts.length }
    }
    case 'recomandari': {
      const pana = plusZile(azi, 14)
      const [{ data: rz }, apts, { data: cer }] = await Promise.all([
        supabase.from('rezervari').select(SEL).neq('status_rezervare', 'anulata').lt('data_checkin', pana).gt('data_checkout', azi),
        apartamente(),
        supabase.from('cereri_rezervare').select('id,nume_client,telefon,status,created_at,data_checkin').in('status', ['noua', 'contactat']),
      ])
      const libere: Record<string, number> = {}
      for (const ap of apts) {
        let n = 0
        for (let i = 0; i < 14; i++) { const z = plusZile(azi, i); if (!(rz || []).some((r: any) => r.apartament_id === ap.id && r.data_checkin <= z && r.data_checkout > z && r.camera_semnalata !== 'NEALOCAT')) n++ }
        libere[etApt(ap)] = n
      }
      const vechi = Date.now() - 24 * 3600 * 1000
      return {
        fara_telefon: (rz || []).filter((r: any) => !r.telefon_client && r.data_checkin >= azi).map(compact),
        neplatite_sosire_in_3_zile: (rz || []).filter((r: any) => r.status_plata !== 'achitat' && ['direct', 'intern'].includes(r.canal) && r.data_checkin >= azi && r.data_checkin <= plusZile(azi, 3)).map(compact),
        nopti_libere_urmatoarele_14_zile: libere,
        cereri_neatinse_peste_24h: (cer || []).filter((c: any) => c.status === 'noua' && new Date(c.created_at).getTime() < vechi),
        nealocate_5stardesk: (rz || []).filter((r: any) => r.camera_semnalata === 'NEALOCAT').map(compact),
      }
    }

    // ── PROPUNERI (nu scriu nimic; browserul executa dupa „Confirmă”) ──
    case 'propune_rezervare_noua': {
      const apts = await apartamente()
      const apt = gasesteApt(apts, a.apartament)
      if (!apt) return { eroare: `Nu găsesc apartamentul „${a.apartament}”. Cere-i utilizatorului să aleagă din: ${apts.map(etApt).join(', ')}` }
      if (!ISO.test(a.checkin || '') || !ISO.test(a.checkout || '') || a.checkout <= a.checkin) return { eroare: 'Date invalide' }
      if (!curat(a.nume_client)) return { eroare: 'Lipsește numele clientului' }
      const ov = await suprapuneri(apt.id, a.checkin, a.checkout)
      const n = nopti(a.checkin, a.checkout), pers = Number(a.persoane) || 1
      const canal = ['direct', 'airbnb', 'booking', 'intern'].includes(a.canal) ? a.canal : 'direct'
      const plata = ['neplatit', 'avans', 'achitat'].includes(a.status_plata) ? a.status_plata : 'neplatit'
      const total = Number(a.pret_total) || 0
      const incasat = a.incasat != null ? Number(a.incasat) || 0 : plata === 'achitat' ? total : 0
      const av: string[] = []
      if (ov.length) av.push(`Apartamentul e OCUPAT: ${ov.map((o: any) => `${curat(o.nume_client)} (${o.data_checkin}→${o.data_checkout})`).join('; ')}`)
      if (apt.capacitate_max && pers > apt.capacitate_max) av.push(`Capacitate maximă ${apt.capacitate_max} pers.`)
      if (!total) av.push('Fără preț — poți adăuga ulterior')
      const card = {
        tip: 'actiune', actiune: 'creare', titlu: 'Rezervare nouă', blocat: ov.length > 0,
        randuri: [['Client', null, curat(a.nume_client)], ['Telefon', null, curat(a.telefon) || '—'], ['Apartament', null, etApt(apt)],
          ['Perioadă', null, `${a.checkin} → ${a.checkout} · ${n} nopți`], ['Oaspeți', null, String(pers)], ['Total', null, total ? `${total} RON` : '—'],
          ['Plată', null, `${plata}${incasat ? ` · încasat ${incasat} RON` : ''}`], ['Canal', null, canal]],
        avertismente: av,
        payload: { apartament_id: apt.id, proprietar_id: apt.proprietar_id, nume_client: curat(a.nume_client), telefon_client: curat(a.telefon) || null, data_checkin: a.checkin, data_checkout: a.checkout,
          nr_persoane: pers, valoare_bruta: total, suma_incasata: incasat, canal, status_plata: plata, observatii: [curat(a.observatii), 'Creată de Asistent'].filter(Boolean).join(' · ') },
      }
      cards.push(card)
      return { propunere_afisata: true, blocata: card.blocat, avertismente: av }
    }
    case 'propune_anulare': {
      const { data: r } = await supabase.from('rezervari').select(SEL).eq('id', a.rezervare_id).maybeSingle()
      if (!r) return { eroare: 'Rezervarea nu există' }
      if (r.status_rezervare === 'anulata') return { eroare: 'Rezervarea e deja anulată' }
      const av: string[] = []
      if (din5star(r.observatii)) av.push('Vine din 5starDesk — anulează-o și în 5starDesk, altfel sincronizarea o poate reactiva.')
      if (Number(r.suma_incasata) > 0) av.push(`Are ${r.suma_incasata} RON încasați — verifică returnarea / reținerea.`)
      cards.push({ tip: 'actiune', actiune: 'anulare', titlu: 'Anulează rezervarea', rezervare_id: r.id,
        randuri: [['Client', null, curat(r.nume_client)], ['Apartament', null, etApt(r.apartament)], ['Perioadă', null, `${r.data_checkin} → ${r.data_checkout}`], ['Status', r.status_rezervare, 'anulata']],
        avertismente: av, payload: { motiv: curat(a.motiv) || null } })
      return { propunere_afisata: true, avertismente: av }
    }
    case 'propune_mutare': {
      const { data: r } = await supabase.from('rezervari').select(SEL).eq('id', a.rezervare_id).maybeSingle()
      if (!r) return { eroare: 'Rezervarea nu există' }
      const apts = await apartamente()
      const aptNou = a.apartament_nou ? gasesteApt(apts, a.apartament_nou) : null
      if (a.apartament_nou && !aptNou) return { eroare: `Nu găsesc apartamentul „${a.apartament_nou}”` }
      const ci = ISO.test(a.checkin_nou || '') ? a.checkin_nou : r.data_checkin
      const co = ISO.test(a.checkout_nou || '') ? a.checkout_nou : r.data_checkout
      if (co <= ci) return { eroare: 'Checkout-ul trebuie să fie după checkin' }
      const tinta = aptNou?.id || r.apartament_id
      if (tinta === r.apartament_id && ci === r.data_checkin && co === r.data_checkout) return { eroare: 'Nu se schimbă nimic' }
      const ov = await suprapuneri(tinta, ci, co, r.id)
      const av: string[] = []
      if (ov.length) av.push(`Destinația e OCUPATĂ: ${ov.map((o: any) => `${curat(o.nume_client)} (${o.data_checkin}→${o.data_checkout})`).join('; ')}`)
      if (din5star(r.observatii)) av.push('Vine din 5starDesk — mut-o și în 5starDesk, altfel sincronizarea o poate muta înapoi.')
      if (aptNou?.capacitate_max && Number(r.nr_persoane) > aptNou.capacitate_max) av.push(`Capacitate maximă ${aptNou.capacitate_max} pers.`)
      if (nopti(ci, co) !== nopti(r.data_checkin, r.data_checkout)) av.push(`Numărul de nopți se schimbă (${nopti(r.data_checkin, r.data_checkout)} → ${nopti(ci, co)}) — verifică prețul.`)
      cards.push({ tip: 'actiune', actiune: 'mutare', titlu: 'Mută rezervarea', rezervare_id: r.id, blocat: ov.length > 0,
        randuri: [['Client', null, curat(r.nume_client)],
          tinta !== r.apartament_id ? ['Apartament', etApt(r.apartament), etApt(aptNou)] : ['Apartament', null, etApt(r.apartament)],
          ci !== r.data_checkin || co !== r.data_checkout ? ['Perioadă', `${r.data_checkin} → ${r.data_checkout}`, `${ci} → ${co}`] : ['Perioadă', null, `${ci} → ${co}`]],
        avertismente: av, payload: { apartament_id: tinta, data_checkin: ci, data_checkout: co } })
      return { propunere_afisata: true, blocata: ov.length > 0, avertismente: av }
    }
    case 'propune_modificare': {
      const { data: r } = await supabase.from('rezervari').select(SEL).eq('id', a.rezervare_id).maybeSingle()
      if (!r) return { eroare: 'Rezervarea nu există' }
      const p: any = {}, rand: any[] = [['Client', null, curat(r.nume_client)]]
      const set = (k: string, et: string, vechi: any, nou: any) => { if (nou !== undefined && nou !== null && String(nou) !== String(vechi ?? '')) { p[k] = nou; rand.push([et, vechi ?? '—', nou]) } }
      set('nume_client', 'Nume', r.nume_client, a.nume_client ? curat(a.nume_client) : undefined)
      set('telefon_client', 'Telefon', r.telefon_client, a.telefon ? curat(a.telefon) : undefined)
      set('email_client', 'Email', r.email_client, a.email ? curat(a.email) : undefined)
      set('nr_persoane', 'Oaspeți', r.nr_persoane, a.persoane != null ? Number(a.persoane) : undefined)
      set('valoare_bruta', 'Total', r.valoare_bruta, a.pret_total != null ? Number(a.pret_total) : undefined)
      set('suma_incasata', 'Încasat', r.suma_incasata, a.incasat != null ? Number(a.incasat) : undefined)
      if (['neplatit', 'avans', 'achitat'].includes(a.status_plata)) set('status_plata', 'Plată', r.status_plata, a.status_plata)
      if (curat(a.observatii_adauga)) { p.observatii = [curat(r.observatii), curat(a.observatii_adauga)].filter(Boolean).join('\n'); rand.push(['Observații', '…', '+ ' + curat(a.observatii_adauga)]) }
      if (!Object.keys(p).length) return { eroare: 'Nicio modificare față de valorile actuale' }
      cards.push({ tip: 'actiune', actiune: 'modificare', titlu: 'Modifică rezervarea', rezervare_id: r.id, randuri: rand, avertismente: [], payload: p })
      return { propunere_afisata: true }
    }
    case 'propune_task': {
      const prio = ['urgenta', 'normala', 'scazuta'].includes(a.prioritate) ? a.prioritate : 'normala'
      cards.push({ tip: 'actiune', actiune: 'task', titlu: 'Task nou', randuri: [['Titlu', null, curat(a.titlu)], ['Prioritate', null, prio], ['Termen', null, a.data_limita || '—']], avertismente: [],
        payload: { titlu: curat(a.titlu), descriere: curat(a.descriere) || null, prioritate: prio, data_limita: ISO.test(a.data_limita || '') ? a.data_limita : null } })
      return { propunere_afisata: true }
    }
    case 'arata_mesaj':
      cards.push({ tip: 'mesaj', titlu: curat(a.titlu) || 'Mesaj', text: String(a.text || ''), telefon: curat(a.telefon) || null, rezervare_id: a.rezervare_id || null })
      return { afisat: true }
    case 'arata_confirmare_client': {
      const { data: r } = await supabase.from('rezervari').select('id,nume_client').eq('id', a.rezervare_id).maybeSingle()
      if (!r) return { eroare: 'Rezervarea nu există' }
      cards.push({ tip: 'confirmare', rezervare_id: r.id, titlu: curat(r.nume_client) })
      return { afisat: true }
    }
  }
  return { eroare: 'Unealtă necunoscută' }
}

function sistem(ctx: any) {
  const azi = aziRO()
  const zile = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă']
  return `Ești „Asistentul AB Homes” — agentul intern al lui Răzvan (AB Homes Iași, apartamente în regim hotelier, administrate și ale proprietarilor). Vorbești în română, direct, concis și cald, ca un coleg foarte organizat.
AZI: ${azi} (${zile[new Date(azi + 'T12:00:00Z').getUTCDay()]}). Check-in 15:00, check-out 11:00. Site: abhomesiasi.ro.
${ctx?.pagina ? `Utilizatorul e acum pe pagina: ${ctx.pagina}.` : ''}${ctx?.rezervare_id ? `\nRezervarea deschisă acum pe ecran: id=${ctx.rezervare_id}${ctx.rezervare_nume ? ` (${ctx.rezervare_nume})` : ''} — când spune „asta / rezervarea asta / clientul ăsta” se referă la ea.` : ''}

REGULI:
1. Nu ghici date din sistem — folosește întotdeauna uneltele (rezervări, disponibilitate, apartamente, statistici). Poți chema mai multe unelte la rând.
2. Pentru orice schimbare (rezervare nouă, anulare, mutare, modificare, task) folosești uneltele propune_* — ele afișează un card pe care utilizatorul îl CONFIRMĂ. Nu spune niciodată că ai făcut o schimbare; spune „Ți-am pregătit … — confirmă mai jos”.
3. Dacă o căutare găsește mai multe rezervări potrivite, întreabă care (dă variantele scurt) înainte de a propune ceva. Dacă lipsesc date esențiale (apartament, perioadă, nume), întreabă.
4. Când trimitem ceva clientului / proprietarului, scrii mesajul și îl afișezi cu arata_mesaj (telefonul din rezervare). Mesajele: profesionale, empatice, plăcute, cu emoji-uri moderate, semnate „Echipa AB Homes Iași”; în limba clientului dacă e străin. Pentru datele de acces folosește instrucțiunile de check-in ale apartamentului (detalii_rezervare), nu inventa coduri.
5. Pentru confirmarea oficială (poză / PDF) folosește arata_confirmare_client.
6. Rezervările „din_5stardesk” se modifică și în 5starDesk — amintește asta când le muți / anulezi.
7. Când pomenești o rezervare, scrie-o ca [[rez:ID|Nume client · cod apt · date]] — devine buton care o deschide.
8. Răspunsuri scurte, cu liste când ajută. Sume în RON cu separator de mii. Datele în format „16 oct.”.
9. Când ești întrebat ce se poate îmbunătăți, folosește recomandari + situatia_zilei și dă pași concreți, ordonați după impact.`
}

async function apelOpenAI(body: any) {
  const trimite = (model: string) => fetch(OPENAI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` }, body: JSON.stringify({ ...body, model }) })
  let res = await trimite(MODEL)
  if (!res.ok && MODEL !== MODEL_REZERVA && [400, 403, 404].includes(res.status)) {
    const t = await res.text()
    if (/model/i.test(t)) res = await trimite(MODEL_REZERVA)
    else return { error: t }
  }
  if (!res.ok) return { error: await res.text() }
  return res.json()
}

export async function POST(req: NextRequest) {
  if (!OPENAI_KEY) return NextResponse.json({ ok: false, error: 'Lipsește OPENAI_API_KEY pe server' })
  const { mesaje, context } = await req.json()
  const istoric = (Array.isArray(mesaje) ? mesaje : []).slice(-24)
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && curat(m.content))
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 6000) }))
  const msgs: any[] = [{ role: 'system', content: sistem(context) }, ...istoric]
  const cards: Card[] = []
  const unelte: string[] = []
  try {
    for (let pas = 0; pas < 8; pas++) {
      const j: any = await apelOpenAI({ messages: msgs, tools: TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 1400 })
      if (j.error) return NextResponse.json({ ok: false, error: typeof j.error === 'string' ? j.error.slice(0, 300) : (j.error.message || 'Eroare AI') })
      const m = j.choices?.[0]?.message
      if (!m) return NextResponse.json({ ok: false, error: 'Răspuns gol de la AI' })
      msgs.push(m)
      if (!m.tool_calls?.length) return NextResponse.json({ ok: true, reply: curat(m.content), cards, unelte })
      for (const tc of m.tool_calls) {
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        unelte.push(tc.function.name)
        let rez: any
        try { rez = await executa(tc.function.name, args, cards) } catch (e: any) { rez = { eroare: e.message } }
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(rez).slice(0, 14000) })
      }
    }
    return NextResponse.json({ ok: true, reply: 'Am făcut mai mulți pași decât e normal — reformulează te rog mai precis.', cards, unelte })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
