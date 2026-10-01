import { supabase } from '@/lib/supabase'

export type SyncResult = {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  logs: { type: 'ok'|'skip'|'err'|'info'; msg: string }[]
}

export function fmt5star(iso: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = new Date(iso)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function parse5star(s: string): string {
  if (!s) return ''
  const months: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    ianuarie:'01',februarie:'02',martie:'03',aprilie:'04',mai:'05',iunie:'06',
    iulie:'07',august:'08',septembrie:'09',octombrie:'10',noiembrie:'11',decembrie:'12'
  }
  const p = s.trim().split(' ')
  if (p.length === 3) {
    const mon = months[p[1].toLowerCase().slice(0,3)] || months[p[1].toLowerCase()] || '01'
    return `${p[2]}-${mon}-${p[0].padStart(2,'0')}`
  }
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10)
  return s
}

export function parseCanal(s: string): string {
  const l = (s||'').toLowerCase()
  if (l.includes('airbnb')) return 'airbnb'
  if (l.includes('booking')) return 'booking'
  if (l.includes('direct')) return 'direct'
  return 'direct'
}

function normCod(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export const ALIAS_MAP: Record<string, string> = {
  'MV07': 'VM07', 'VMV07': 'VM07', 'VILA07': 'VM07', 'VILA 07': 'VM07',
  'VILA PACURARI': 'VM07', 'VM 07': 'VM07',
  'COZY STUDIO': 'EX59', 'APARTAMENT 59': 'EX59', 'APT59': 'EX59',
  'SKYPORT': 'C64', 'SKYPORT RETREAT': 'C64', 'APARTAMENT 64': 'C64', 'APT64': 'C64',
  'PEACEFUL COPOU RETREAT': 'CG40', 'PEACEFUL COPOU': 'CG40', 'APARTAMENT 40': 'CG40',
  'COPOU RETREAT': 'CG40',
  'GREEN STATION': 'GS08', 'GS 08': 'GS08',
  'HIDEOUT': 'HD02', 'HD 02': 'HD02', 'HIDEOUT ROZELOR': 'HD02',
  'LAZAR COMFY': 'L83', 'LAZAR': 'L83', 'L 83': 'L83', 'LAZĂR COMFY': 'L83', 'LAZĂR': 'L83', 'LAZR': 'L83',
  'PALAS SKYNEST': 'L88', 'SKYNEST': 'L88', 'L 88': 'L88',
  'PALAS RETREAT': 'L94', 'L 94': 'L94',
  'AIRY PALAS': 'L99', 'L 99': 'L99',
  'MINT LOFT': 'N32', 'MINT LOFT COPOU': 'N32', 'N 32': 'N32',
  'NEWTON URBAN': 'NT9', 'NEWTON': 'NT9', 'NT 9': 'NT9',
}

// Extrasa separat, testabila independent de fetch/DB — vezi lib/syncFivestar.match.test.ts
// (script de verificare, nu framework de teste) pentru scenariul exact al bug-ului reparat.
export function matchAptFromBooking(b: any, aptByNota: Record<string,string>): { aptId: string|null; codIncredere: string[]; codFallback: string[] } {
  const codIncredere = [b.numar_camera, b.tip_camera, b.cod_camera]
    .filter(Boolean).map((s:any) => normCod(String(s)))
  const codFallback = [b.id_camera, b.camera, b.unitate, b.room, b.denumire_camera, b.name, b.room_name]
    .filter(Boolean).map((s:any) => normCod(String(s)))

  const aptByNotaNorm: Record<string,string> = {}
  for (const [k, v] of Object.entries(aptByNota)) aptByNotaNorm[normCod(k)] = v
  const aliasNorm: Record<string,string> = {}
  for (const [k, v] of Object.entries(ALIAS_MAP)) aliasNorm[normCod(k)] = v

  function matchCod(cod: string): string | null {
    if (aptByNotaNorm[cod]) return aptByNotaNorm[cod]
    if (aliasNorm[cod] && aptByNotaNorm[aliasNorm[cod]]) return aptByNotaNorm[aliasNorm[cod]]
    const matches = cod.match(/\b([A-Z]{1,4}\d{2,3})\b/g)
    if (matches) {
      for (const m of matches) {
        if (aptByNotaNorm[m]) return aptByNotaNorm[m]
        if (aliasNorm[m] && aptByNotaNorm[aliasNorm[m]]) return aptByNotaNorm[aliasNorm[m]]
      }
    }
    for (const [alias, codCorect] of Object.entries(aliasNorm)) {
      if (cod.includes(alias) && aptByNotaNorm[normCod(codCorect)]) return aptByNotaNorm[normCod(codCorect)]
    }
    for (const nota of Object.keys(aptByNotaNorm)) {
      if (cod.includes(nota)) return aptByNotaNorm[nota]
    }
    return null
  }

  let aptId: string | null = null
  for (const cod of codIncredere) { aptId = matchCod(cod); if (aptId) break }
  if (!aptId) for (const cod of codFallback) { aptId = matchCod(cod); if (aptId) break }
  return { aptId, codIncredere, codFallback }
}

// ID-urile 5starDesk dintr-un camp observatii ("L88 | 1386750 | Rezervare noua") - token exact,
// nu substring: ilike '%138674%' prindea si 1386749.
function idsDinObs(obs: any): string[] {
  return String(obs||'').split('|').map(s => s.trim()).filter(s => /^\d{5,9}$/.test(s))
}

// Procesarea unei singure rezervari 5starDesk (potrivire apartament, cautare duplicat, insert/update) -
// extrasa separat din syncFivestar ca sa poata fi refolosita si de fetchOneBookingById (cautare
// manuala dupa ID, cerut direct: "sa luam numar de rezervare in 5 stars, care e pierdut si sistemul
// sa caute si sa aduca de acolo o rezervare"), fara sa duplice toata logica de potrivire/actualizare.
async function processOneBooking(b: any, aptByNota: Record<string,string>, apts: any[], res: SyncResult): Promise<void> {
  try {
    const checkinRaw = b.prima_zi || b.checkin || b.check_in || b.data_checkin || ''
    const checkoutRaw = b.ultima_zi || b.checkout || b.check_out || b.data_checkout || ''
    const checkin = checkinRaw ? parse5star(checkinRaw) : null
    const checkout = checkoutRaw ? parse5star(checkoutRaw) : null
    const numeClient = b.nume || b.name || b.guest_name || '—'
    const canal = parseCanal(b.sursa || b.canal || b.source || '')
    const telefon = b.telefon || b.phone || null
    const nrPersoane = (Number(b.adulti) || 0) + (Number(b.copii) || 0) || null
    const pret = parseFloat(b.pret_camera || b.price || b.total || '0') || 0
    const pretExtra = parseFloat(b.pret_extra || '0') || 0
    const totalPret = pret + pretExtra
    const idExtern = String(b.id || b.id_rezervare || '')

    // Doua niveluri de incredere, cautate SEPARAT (vezi matchAptFromBooking) — bug real gasit
    // prin testare directa: o rezervare cu tip_camera/numar_camera="GS08" (corect, scris si
    // in observatii) a fost atribuita gresit lui N32, fiindca un camp mai devreme in lista
    // amestecata veche (id_camera/camera/unitate/room — text liber, nu neaparat un cod) s-a
    // potrivit din greseala prin alias/substring INAINTE sa ajunga la campul de incredere.
    const { aptId, codIncredere, codFallback } = matchAptFromBooking(b, aptByNota)

    if (!checkin || !checkout) { res.skipped++; res.logs.push({ type:'skip', msg: `${numeClient}: data lipsa` }); return }

    // "Oaspete decazat" (checked-out) trebuie sa devina 'finalizata', nu sa ramana 'confirmata'
    // la nesfarsit — exact aceeasi conventie deja folosita la Import Excel (parseStatus, app/import/page.tsx),
    // gasita inconsistenta aici in timpul verificarii: sincronizarea automata nu distingea deloc
    // starea "finalizata", spre deosebire de fluxul manual de import pentru aceleasi date.
    const statusRaw = (b.status_rezervare || '').toLowerCase()
    const statusNou = statusRaw.includes('anulat') ? 'anulata' : (statusRaw.includes('cazat') ? 'finalizata' : 'confirmata')

    const idExternValid = idExtern && idExtern.length > 2
    // Cautarea prin ID extern se face INAINTE de verificarea aptId (bug real gasit si reparat -
    // o rezervare noua, reala, era ascunsa in calendar de o rezervare veche ramasa "confirmata"):
    // o rezervare ANULATA pe 5starDesk isi pierde camera atribuita (numar_camera/tip_camera devin
    // null), deci aptId iese null pentru ea; daca am sari-o direct aici, ca pe o rezervare noua
    // negasita, statusul ei anulat n-ar mai ajunge NICIODATA la noi — ramane "confirmata" la
    // nesfarsit si se poate suprapune peste o rezervare noua, reala, pentru acelasi apartament.
    // select('*') peste tot mai jos, nu o lista explicita — camera_semnalata/camera_semnalata_la
    // sunt coloane noi, care pot sa nu existe inca (pana la migrare); o lista explicita ar rupe
    // interogarea intreaga cu eroare 42703, la fel ca la disponibil_booking mai demult.
    const { data: candById } = idExternValid ? await supabase.from('rezervari')
      .select('*').ilike('observatii', `%${idExtern}%`).limit(10)
      : { data: [] }
    const existingById = (candById||[]).filter((r:any) => idsDinObs(r.observatii).includes(idExtern)).slice(0,1)

    // Un rand deja legat de ALT ID 5starDesk nu e "aceeasi rezervare", chiar daca numele/datele/camera
    // coincid - bug raportat direct: acelasi client (firma) cu 2-3 camere pe aceleasi date (THINSLICES
    // L99+L88, STANCIU L83+L88+L99) -> a doua camera se lipea prin nume+checkin de randul primei camere,
    // ii suprascria ID-ul si nu se mai importa niciodata. La fel o rezervare noua, reala, pe un slot cu o
    // rezervare ANULATA veche (alt client, acelasi apartament+date) se lipea de cea anulata, iar la
    // urmatoarea trecere cea anulata o "lua inapoi" - rezervarea reala ramanea invizibila in calendar.
    const liber = (r:any) => { const ids = idsDinObs(r.observatii); return !idExternValid || !ids.length || ids.includes(idExtern) }

    if (!aptId && !existingById.length) {
      res.skipped++
      res.logs.push({ type:'skip', msg: `⚠ ${numeClient} (${checkin}): apartament negasit - coduri: ${[...codIncredere,...codFallback].join(',')}` })
      return
    }

    const { data: candByApt } = (!existingById.length && aptId && checkin && checkout)
      ? await supabase.from('rezervari')
        .select('*')
        .eq('apartament_id', aptId)
        .eq('data_checkin', checkin)
        .eq('data_checkout', checkout)
        .limit(10)
      : { data: [] }
    const existingByApt = (candByApt||[]).filter(liber).slice(0,1)
    const { data: candByName } = (!existingById.length && !existingByApt.length)
      ? await supabase.from('rezervari')
        .select('*').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(10)
      : { data: [] }
    // Intre randurile libere cu acelasi nume, cel de pe apartamentul indicat are prioritate
    const libereByName = (candByName||[]).filter(liber)
    const peAptIndicat = libereByName.find((r:any) => r.apartament_id === aptId)
    const existingByName = peAptIndicat ? [peAptIndicat] : libereByName.slice(0,1)

    const existing = existingById.length ? existingById : (existingByApt.length ? existingByApt : existingByName)

    if (existing && existing.length > 0) {
      const updates: any = {}
      const foundById = existingById.length > 0
      // Daca gasim prin date (nu ID) si rezervarea curenta e anulata → NU suprascriem, DECAT
      // daca si checkout-ul coincide exact (nume + checkin + checkout, nu doar nume + checkin) -
      // semnal destul de puternic ca e aceeasi rezervare, nu o coincidenta. Gasit cu un caz real:
      // o rezervare anulata pe 5starDesk nu mai are camera atribuita (numar_camera=null), deci
      // se gaseste DOAR prin nume+data, niciodata prin ID - garda originala o ignora mereu, deci
      // ramanea "confirmata" la nesfarsit si se suprapunea peste o rezervare noua, reala, pentru
      // acelasi apartament/noapte, ascunzand-o efectiv din calendar (gasit si reparat direct).
      const checkoutCoincide = !!(checkout && existing[0].data_checkout === checkout)
      if (!foundById && statusNou === 'anulata' && !checkoutCoincide) {
        res.skipped++
        res.logs.push({ type:'skip', msg: `⊘ ${numeClient} (${checkin}) — anulata gasita prin date, slot poate fi activ cu alt client` })
        return
      }
      if (!foundById) {
        // Gasit prin date/nume: actualizam clientul si ID-ul extern daca difera
        if (numeClient && existing[0].nume_client !== numeClient) updates.nume_client = numeClient
        if (canal && existing[0].canal !== canal) updates.canal = canal
        if (idExternValid) {
          const obsActuala = existing[0].observatii || ''
          if (!obsActuala.includes(idExtern)) {
            updates.observatii = [b.tip_camera || b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ')
          }
        }
      }
      if (telefon && !existing[0].telefon_client) updates.telefon_client = telefon
      if (nrPersoane && Number(existing[0].nr_persoane) !== nrPersoane) updates.nr_persoane = nrPersoane
      // NU realocam automat apartamentul la potrivire prin ID extern - 5starDesk poate
      // redenumi/reatribui o camera (ex: L94 -> M08 dupa inchiderea unui apartament),
      // caz in care rezervari vechi, deja corect asociate, ar aparea brusc cu alt cod de
      // camera si ar fi mutate gresit. O nepotrivire de apartament aici e semnal de
      // verificat manual, nu de aplicat automat.
      if (aptId && existing[0].apartament_id !== aptId) {
        // Semnalul se SALVEAZA acum (nu doar un rand de log care dispare) - cerut direct,
        // ca sa identifice singur toate discrepantele astea, la fiecare sincronizare, nu doar
        // o data, manual. Lista completa apare in Sync 5starDesk -> "Camere semnalate".
        const codDetectat = (apts||[]).find((a:any)=>a.id===aptId)?.nota || null
        if (codDetectat && codDetectat !== existing[0].camera_semnalata) {
          updates.camera_semnalata = codDetectat
          updates.camera_semnalata_la = new Date().toISOString()
        }
        res.logs.push({ type:'info', msg: `⚠ ${numeClient} (${checkin}) — camera indica ${codDetectat||'alt apartament'}, diferit de cel existent, NU s-a realocat automat (verifica manual)` })
      } else if (existing[0].camera_semnalata) {
        // Resincronizare care confirma iar apartamentul curent -> semnalul vechi nu mai e valabil
        updates.camera_semnalata = null
        updates.camera_semnalata_la = null
      }
      if (existing[0].status_rezervare !== statusNou) updates.status_rezervare = statusNou
      if (checkin && existing[0].data_checkin !== checkin) updates.data_checkin = checkin
      if (checkout && existing[0].data_checkout !== checkout) updates.data_checkout = checkout
      if (totalPret > 0 && Number(existing[0].suma_incasata) !== totalPret) {
        updates.suma_incasata = totalPret
        updates.valoare_bruta = totalPret
      }
      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase.from('rezervari').update(updates).eq('id', existing[0].id)
        if (updErr) {
          // Cel mai probabil camera_semnalata/camera_semnalata_la nu exista inca (pana la
          // migrare) - reincearca fara ele, ca actualizarea de baza sa nu se blocheze.
          const { camera_semnalata, camera_semnalata_la, ...fallbackUpdates } = updates
          if (Object.keys(fallbackUpdates).length > 0) {
            await supabase.from('rezervari').update(fallbackUpdates).eq('id', existing[0].id)
          }
        }
      }
      res.skipped++
      res.logs.push({ type:'skip', msg: `↺ ${numeClient} (${checkin}) — există${Object.keys(updates).length?' + actualizat ('+Object.keys(updates).join(',')+')':''}` })
    } else if (statusNou === 'anulata') {
      // Nu inseram rezervari noi care sunt deja anulate pe 5starDesk
      res.skipped++
      res.logs.push({ type:'skip', msg: `⊘ ${numeClient} (${checkin}) — anulată, nu se importă` })
    } else if (!aptId) {
      // Nu se poate ajunge aici in practica (vezi skip-ul de mai sus: !aptId && !existingById.length
      // opreste deja bucla), dar TypeScript nu poate urmari invariantul peste tot fluxul de mai sus.
      res.skipped++
      res.logs.push({ type:'skip', msg: `⚠ ${numeClient} (${checkin}): apartament negasit` })
    } else {
      const { error } = await supabase.from('rezervari').insert({
        apartament_id: aptId,
        canal,
        nume_client: numeClient,
        data_checkin: checkin,
        data_checkout: checkout,
        suma_incasata: totalPret,
        valoare_bruta: totalPret,
        moneda: 'RON',
        telefon_client: telefon,
        nr_persoane: nrPersoane,
        status_rezervare: statusNou,
        status_plata: totalPret > 0 ? 'achitat' : 'neplatit',
        status_decont: 'nedecontat',
        observatii: [b.tip_camera || b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ') || null,
      })
      if (error) { res.errors++; res.logs.push({ type:'err', msg: `${numeClient}: ${error.message}` }) }
      else {
        res.inserted++
        const aptName = (apts||[]).find((a:any)=>a.id===aptId)?.nota || aptId.slice(0,8)
        res.logs.push({ type:'ok', msg: `✓ ${numeClient} | ${checkin}→${checkout} | ${canal} | ${aptName}${telefon?' 📞':''}` })
      }
    }
  } catch(e:any) { res.errors++; res.logs.push({ type:'err', msg: `Eroare procesare: ${e.message}` }) }
}

export async function syncFivestar(dateFrom: string, dateTo: string): Promise<SyncResult> {
  const res: SyncResult = { total:0, inserted:0, updated:0, skipped:0, errors:0, logs:[] }

  try {
    const { data: apts } = await supabase.from('apartamente').select('id,nume,nota')
    const aptByNota: Record<string,string> = {}
    for (const a of apts||[]) {
      if (a.nota) aptByNota[a.nota.toUpperCase()] = a.id
    }

    let data: any = null
    let actiuneUsed = ''
    for (const actiune of ['getrezervari', 'rezervari_lista', 'get_bookings']) {
      const resp = await fetch('/api/fivestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actiune,
          data_de_la: fmt5star(dateFrom),
          data_pana_la: fmt5star(dateTo),
          data_de: dateFrom,
          data_pana: dateTo,
          checkin: fmt5star(dateFrom),
          checkout: fmt5star(dateTo),
        })
      })
      data = await resp.json()
      const hasData = Array.isArray(data) || Array.isArray(data?.rezervari) || Array.isArray(data?.bookings) || Array.isArray(data?.data)
      if (hasData || (data?.ok !== 'false' && data?.ok !== false && !data?.mesaj?.includes('Eroare'))) {
        actiuneUsed = actiune
        break
      }
    }

    const rezervariList: any[] = Array.isArray(data) ? data :
      (Array.isArray(data?.rezervari) ? data.rezervari :
      Array.isArray(data?.bookings) ? data.bookings :
      Array.isArray(data?.data) ? data.data : [])

    res.logs.push({ type:'info', msg: `Actiune: ${actiuneUsed} | ${rezervariList.length} rezervari` })
    if (!rezervariList.length) {
      res.logs.push({ type:'err', msg: `Format nerecunoscut sau fara date. Raspuns: ${JSON.stringify(data).slice(0,300)}` })
      return res
    }

    res.total = rezervariList.length
    res.logs.push({ type:'info', msg: `${rezervariList.length} rezervari primite de la 5starDesk` })

    for (const b of rezervariList) {
      await processOneBooking(b, aptByNota, apts||[], res)
    }
  } catch(e:any) {
    res.errors++; res.logs.push({ type:'err', msg: 'Eroare conexiune: ' + e.message })
  }

  return res
}

// Cautare + import manual dupa ID-ul de rezervare din 5starDesk — cerut direct: "sa facem o sectiune
// aici, in care sa luam numar de rezervare in 5 stars, care e pierdut si sistemul sa caute si sa
// aduca de acolo o rezervare". Refoloseste exact acelasi matching/insert/update ca sincronizarea
// normala (processOneBooking), doar pe un interval foarte larg (nu perioada aleasa in pagina), ca sa
// gaseasca rezervarea indiferent de datele ei - cautam un ID anume, nu totul dintr-o perioada.
export async function fetchOneBookingById(id: string): Promise<SyncResult> {
  const res: SyncResult = { total:0, inserted:0, updated:0, skipped:0, errors:0, logs:[] }
  const idTrim = id.trim()
  if (!idTrim) { res.errors++; res.logs.push({ type:'err', msg: 'Introdu un ID de rezervare' }); return res }

  try {
    const { data: apts } = await supabase.from('apartamente').select('id,nume,nota')
    const aptByNota: Record<string,string> = {}
    for (const a of apts||[]) if (a.nota) aptByNota[a.nota.toUpperCase()] = a.id

    const dateFrom = '2024-01-01'
    const dateTo = `${new Date().getFullYear()+2}-12-31`

    let data: any = null
    for (const actiune of ['getrezervari', 'rezervari_lista', 'get_bookings']) {
      const resp = await fetch('/api/fivestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actiune,
          data_de_la: fmt5star(dateFrom), data_pana_la: fmt5star(dateTo),
          data_de: dateFrom, data_pana: dateTo,
          checkin: fmt5star(dateFrom), checkout: fmt5star(dateTo),
        })
      })
      data = await resp.json()
      const hasData = Array.isArray(data) || Array.isArray(data?.rezervari) || Array.isArray(data?.bookings) || Array.isArray(data?.data)
      if (hasData || (data?.ok !== 'false' && data?.ok !== false && !data?.mesaj?.includes('Eroare'))) break
    }

    const rezervariList: any[] = Array.isArray(data) ? data :
      (Array.isArray(data?.rezervari) ? data.rezervari :
      Array.isArray(data?.bookings) ? data.bookings :
      Array.isArray(data?.data) ? data.data : [])

    if (!rezervariList.length) {
      res.errors++
      res.logs.push({ type:'err', msg: `5starDesk nu a răspuns cu date (${JSON.stringify(data).slice(0,200)})` })
      return res
    }

    const b = rezervariList.find((x:any) => String(x.id || x.id_rezervare || '') === idTrim)
    if (!b) {
      res.errors++
      res.logs.push({ type:'err', msg: `Nu am găsit nicio rezervare cu ID-ul ${idTrim} în 5starDesk (verificat printre ${rezervariList.length} rezervări)` })
      return res
    }

    res.total = 1
    await processOneBooking(b, aptByNota, apts||[], res)
  } catch(e:any) {
    res.errors++; res.logs.push({ type:'err', msg: 'Eroare conexiune: ' + e.message })
  }

  return res
}
