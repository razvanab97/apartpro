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

export const ALIAS_MAP: Record<string, string> = {
  'MV07': 'VM07', 'VMV07': 'VM07', 'VILA07': 'VM07', 'VILA 07': 'VM07',
  'VILA PACURARI': 'VM07', 'VM 07': 'VM07',
  'COZY STUDIO': 'EX59', 'APARTAMENT 59': 'EX59', 'APT59': 'EX59',
  'SKYPORT': 'C64', 'SKYPORT RETREAT': 'C64', 'APARTAMENT 64': 'C64', 'APT64': 'C64',
  'PEACEFUL COPOU RETREAT': 'CG40', 'PEACEFUL COPOU': 'CG40', 'APARTAMENT 40': 'CG40',
  'COPOU RETREAT': 'CG40',
  'GREEN STATION': 'GS08', 'GS 08': 'GS08',
  'HIDEOUT': 'HD02', 'HD 02': 'HD02',
  'LAZAR COMFY': 'L83', 'LAZAR': 'L83',
  'PALAS SKYNEST': 'L88', 'SKYNEST': 'L88',
  'PALAS RETREAT': 'L94',
  'AIRY PALAS': 'L99',
  'MINT LOFT': 'N32', 'MINT LOFT COPOU': 'N32',
  'NEWTON URBAN': 'NT9', 'NEWTON': 'NT9', 'NT 9': 'NT9',
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
      try {
        const checkinRaw = b.prima_zi || b.checkin || b.check_in || b.data_checkin || ''
        const checkoutRaw = b.ultima_zi || b.checkout || b.check_out || b.data_checkout || ''
        const checkin = checkinRaw ? parse5star(checkinRaw) : null
        const checkout = checkoutRaw ? parse5star(checkoutRaw) : null
        const numeClient = b.nume || b.name || b.guest_name || '—'
        const canal = parseCanal(b.sursa || b.canal || b.source || '')
        const telefon = b.telefon || b.phone || null
        const pret = parseFloat(b.pret_camera || b.price || b.total || '0') || 0
        const pretExtra = parseFloat(b.pret_extra || '0') || 0
        const totalPret = pret + pretExtra
        const idExtern = String(b.id || b.id_rezervare || '')

        let aptId: string | null = null
        const codCandidati = [
          b.id_camera, b.camera, b.unitate, b.room,
          b.numar_camera, b.tip_camera, b.cod_camera,
          b.denumire_camera, b.name, b.room_name
        ].filter(Boolean).map((s:any) => String(s).toUpperCase().trim())

        for (const cod of codCandidati) {
          if (aptByNota[cod]) { aptId = aptByNota[cod]; break }
          if (ALIAS_MAP[cod] && aptByNota[ALIAS_MAP[cod]]) { aptId = aptByNota[ALIAS_MAP[cod]]; break }
          const matches = cod.match(/\b([A-Z]{1,4}\d{2,3})\b/g)
          if (matches) {
            for (const m of matches) {
              if (aptByNota[m]) { aptId = aptByNota[m]; break }
              if (ALIAS_MAP[m] && aptByNota[ALIAS_MAP[m]]) { aptId = aptByNota[ALIAS_MAP[m]]; break }
            }
            if (aptId) break
          }
          for (const [alias, codCorect] of Object.entries(ALIAS_MAP)) {
            if (cod.includes(alias) && aptByNota[codCorect]) { aptId = aptByNota[codCorect]; break }
          }
          if (aptId) break
          for (const nota of Object.keys(aptByNota)) {
            if (cod.includes(nota)) { aptId = aptByNota[nota]; break }
          }
          if (aptId) break
        }

        if (!checkin || !checkout) { res.skipped++; res.logs.push({ type:'skip', msg: `${numeClient}: data lipsa` }); continue }
        if (!aptId) {
          res.skipped++
          res.logs.push({ type:'skip', msg: `⚠ ${numeClient} (${checkin}): apartament negasit - coduri: ${codCandidati.join(',')}` })
          continue
        }

        const statusNou = b.status_rezervare?.toLowerCase().includes('anulat') ? 'anulata' : 'confirmata'

        const idExternValid = idExtern && idExtern.length > 2
        const { data: existingById } = idExternValid ? await supabase.from('rezervari')
          .select('id,telefon_client,apartament_id,status_rezervare,data_checkin,data_checkout,suma_incasata').ilike('observatii', `%${idExtern}%`).limit(1)
          : { data: [] }
        const { data: existingByApt } = (!existingById?.length && aptId && checkin && checkout)
          ? await supabase.from('rezervari')
            .select('id,telefon_client,apartament_id,status_rezervare,data_checkin,data_checkout,suma_incasata')
            .eq('apartament_id', aptId)
            .eq('data_checkin', checkin)
            .eq('data_checkout', checkout)
            .limit(1)
          : { data: [] }
        const { data: existingByName } = (!existingById?.length && !existingByApt?.length)
          ? await supabase.from('rezervari')
            .select('id,telefon_client,apartament_id,status_rezervare,data_checkin,data_checkout,suma_incasata').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(1)
          : { data: [] }

        const existing = existingById?.length ? existingById : (existingByApt?.length ? existingByApt : existingByName)

        if (existing && existing.length > 0) {
          const updates: any = {}
          if (telefon && !existing[0].telefon_client) updates.telefon_client = telefon
          if (aptId && !existing[0].apartament_id) updates.apartament_id = aptId
          // Propaga schimbari reale din 5starDesk: anulare, mutare date, suma - altfel rezervarea
          // ramane "confirmata"/cu datele vechi la nesfarsit chiar daca s-a anulat/modificat pe 5SD
          if (existing[0].status_rezervare !== statusNou) updates.status_rezervare = statusNou
          if (checkin && existing[0].data_checkin !== checkin) updates.data_checkin = checkin
          if (checkout && existing[0].data_checkout !== checkout) updates.data_checkout = checkout
          if (totalPret > 0 && Number(existing[0].suma_incasata) !== totalPret) {
            updates.suma_incasata = totalPret
            updates.valoare_bruta = totalPret
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from('rezervari').update(updates).eq('id', existing[0].id)
          }
          res.skipped++
          res.logs.push({ type:'skip', msg: `↺ ${numeClient} (${checkin}) — există${Object.keys(updates).length?' + actualizat ('+Object.keys(updates).join(',')+')':''}` })
        } else if (statusNou === 'anulata') {
          // Nu inseram rezervari noi care sunt deja anulate pe 5starDesk
          res.skipped++
          res.logs.push({ type:'skip', msg: `⊘ ${numeClient} (${checkin}) — anulată, nu se importă` })
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
  } catch(e:any) {
    res.errors++; res.logs.push({ type:'err', msg: 'Eroare conexiune: ' + e.message })
  }

  return res
}
