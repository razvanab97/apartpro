'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Phone } from 'lucide-react'

type SyncResult = {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  logs: { type: 'ok'|'skip'|'err'|'info'; msg: string }[]
}

function fmt5star(iso: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = new Date(iso)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function parse5star(s: string): string {
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
  // Already ISO format
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10)
  return s
}

function parseCanal(s: string): string {
  const l = (s||'').toLowerCase()
  if (l.includes('airbnb')) return 'airbnb'
  if (l.includes('booking')) return 'booking'
  if (l.includes('direct')) return 'direct'
  return 'direct'
}

export default function SyncPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult|null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()+3); return d.toISOString().split('T')[0]
  })
  const [rawData, setRawData] = useState<any>(null)
  const { toast, show } = useToast()

  async function testApi() {
    setLoading(true)
    setRawData(null)
    try {
      // Incearca mai multe actiuni - 5starDesk poate folosi diferite nume
      let testData = null
      for (const actiune of ['getrezervari', 'rezervari_lista', 'get_bookings']) {
        const res = await fetch('/api/fivestar', {
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
        testData = await res.json()
        if (testData?.ok !== 'false' && testData?.ok !== false && !testData?.mesaj?.includes('Eroare')) break
      }
      const data = testData
      const data = await res.json()
      setRawData(data)
    } catch(e: any) {
      setRawData({ error: e.message })
    }
    setLoading(false)
  }

  async function syncRezervari() {
    setLoading(true)
    setResult(null)

    const res: SyncResult = { total:0, inserted:0, updated:0, skipped:0, errors:0, logs:[] }

    try {
      // 1. Get apartments
      const { data: apts } = await supabase.from('apartamente').select('id,nume,nota')
      const aptMap: Record<string,string> = {}
      for (const a of apts||[]) {
        if (a.nota) aptMap[a.nota.toLowerCase()] = a.id
        aptMap[a.nume.toLowerCase()] = a.id
        // Also map without spaces/special chars
        aptMap[a.nume.toLowerCase().replace(/\s+/g,'')] = a.id
      }

      // 2. Incearca mai multe actiuni pana gasim una care functioneaza
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
        // Daca nu e eroare si are date, folosim aceasta actiune
        const hasData = Array.isArray(data) || Array.isArray(data?.rezervari) || Array.isArray(data?.bookings) || Array.isArray(data?.data)
        if (hasData || (data?.ok !== 'false' && data?.ok !== false && !data?.mesaj?.includes('Eroare'))) {
          actiuneUsed = actiune
          break
        }
      }
      res.logs.push({ type:'info', msg: `Actiune: ${actiuneUsed} | Răspuns: ${JSON.stringify(data).slice(0,200)}` })

      // 3. Parse response - format 5starDesk: array direct sau obiect cu rezervari
      const bookings = Array.isArray(data) ? data : 
        (Array.isArray(data?.rezervari) ? data.rezervari :
        Array.isArray(data?.bookings) ? data.bookings :
        Array.isArray(data?.data) ? data.data : null)

      if (!bookings || !Array.isArray(bookings)) {
        res.logs.push({ type:'err', msg: `Format nerecunoscut. Răspuns: ${JSON.stringify(data).slice(0,300)}` })
        setResult(res)
        setLoading(false)
        return
      }

      res.total = bookings.length
      res.logs.push({ type:'info', msg: `${bookings.length} rezervări primite de la 5starDesk` })

      // 4. Process each booking - format real 5starDesk
      for (const b of bookings) {
        try {
          // Date format: "29 Apr 2026"
          const checkinRaw = b.prima_zi || b.checkin || b.check_in || b.data_checkin || ''
          const checkoutRaw = b.ultima_zi || b.checkout || b.check_out || b.data_checkout || ''
          const checkin = checkinRaw ? parse5star(checkinRaw) : null
          const checkout = checkoutRaw ? parse5star(checkoutRaw) : null
          const numeClient = b.nume || b.name || b.guest_name || '—'
          const canal = parseCanal(b.sursa || b.canal || b.source || '')
          const telefon = b.telefon || b.phone || null
          const email = b.email || null
          const pret = parseFloat(b.pret_camera || b.price || b.total || '0') || 0
          const pretExtra = parseFloat(b.pret_extra || '0') || 0
          const totalPret = pret + pretExtra
          const idExtern = String(b.id || b.id_rezervare || '')
          const numeCamera = (b.camera || b.room || b.room_name || b.nume_camera || b.id_camera || '').toLowerCase()

          // Find apartment by id_camera or name
          let aptId: string | null = null
          // First try exact id_camera match in observatii
          if (b.id_camera) {
            const { data: aptByCamera } = await supabase.from('apartamente').select('id').eq('nota', b.id_camera).single()
            if (aptByCamera) aptId = aptByCamera.id
          }
          // Fallback: fuzzy name match
          if (!aptId) {
            for (const [key, id] of Object.entries(aptMap)) {
              if (numeCamera && (numeCamera.includes(key) || key.includes(numeCamera))) { aptId = id as string; break }
            }
          }

          if (!checkin || !checkout) { res.skipped++; res.logs.push({ type:'skip', msg: `${numeClient}: dată lipsă` }); continue }

          // Check if exists - use 5starDesk ID (stored in observatii) OR nume+checkin
          const { data: existingById } = await supabase.from('rezervari')
            .select('id,telefon_client,apartament_id').ilike('observatii', `%${idExtern}%`).limit(1)
          
          const { data: existingByName } = !existingById?.length ? await supabase.from('rezervari')
            .select('id,telefon_client,apartament_id').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(1)
            : { data: null }

          const existing = existingById?.length ? existingById : existingByName

          if (existing && existing.length > 0) {
            // Update phone + apartment if missing
            const updates: any = {}
            if (telefon && !existing[0].telefon_client) updates.telefon_client = telefon
            if (aptId && !existing[0].apartament_id) updates.apartament_id = aptId
            if (Object.keys(updates).length > 0) {
              await supabase.from('rezervari').update(updates).eq('id', existing[0].id)
            }
            res.skipped++
            res.logs.push({ type:'skip', msg: `↺ ${numeClient} (${checkin}) — există${Object.keys(updates).length?' + actualizat':''}` })
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
              status_rezervare: b.status_rezervare?.toLowerCase().includes('anulat') ? 'anulata' : 'confirmata',
              status_plata: totalPret > 0 ? 'achitat' : 'neplatit',
              status_decont: 'nedecontat',
              observatii: [b.tip_camera || b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ') || null,
            })
            if (error) { res.errors++; res.logs.push({ type:'err', msg: `${numeClient}: ${error.message}` }) }
            else {
            res.inserted++
            const aptName = aptId ? ((apts||[]).find((a:any)=>a.id===aptId)?.nota || aptId.slice(0,8)) : '⚠️ NECUNOSCUT'
            res.logs.push({ type: aptId?'ok':'skip', msg: `${aptId?'✓':'⚠'} ${numeClient} | ${checkin}→${checkout} | ${canal} | ${aptName}${telefon?' 📞':''}` })
          }
          }
        } catch(e:any) { res.errors++; res.logs.push({ type:'err', msg: `Eroare procesare: ${e.message}` }) }
      }
    } catch(e:any) {
      res.errors++; res.logs.push({ type:'err', msg: 'Eroare conexiune: ' + e.message })
    }

    setResult({...res})
    setLoading(false)
    if (res.inserted > 0) show('success', `${res.inserted} rezervări importate!`)
  }

  const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14, padding:20 }

  return (
    <>
      <PageHeader title="Sync 5starDesk" subtitle="Import automat rezervări din PMS"/>
      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14, maxWidth:720, overflowY:'auto' }}>

        {/* Period selector */}
        <div style={panel}>
          <div style={{ fontSize:13, fontWeight:600, color:'#FFF', marginBottom:14 }}>Perioadă sincronizare</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:5, display:'block' }}>De la</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:5, display:'block' }}>Până la</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
            {[
              { l:'Luna trecută', f:()=>{ const d=new Date(); setDateFrom(new Date(d.getFullYear(),d.getMonth()-1,1).toISOString().split('T')[0]); setDateTo(new Date(d.getFullYear(),d.getMonth(),0).toISOString().split('T')[0]) }},
              { l:'Luna curentă', f:()=>{ const d=new Date(); setDateFrom(new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0]); setDateTo(new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().split('T')[0]) }},
              { l:'Urmă 3 luni', f:()=>{ const d=new Date(); const t=new Date(d); t.setMonth(t.getMonth()+3); setDateFrom(d.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]) }},
              { l:'Tot 2026', f:()=>{ setDateFrom('2026-01-01'); setDateTo('2026-12-31') }},
            ].map(p=>(
              <button key={p.l} onClick={p.f} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.2)', color:'#7BC8FF', cursor:'pointer' }}>{p.l}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="primary" icon={loading?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<RefreshCw size={14}/>} onClick={syncRezervari} loading={loading} style={{ flex:1 }}>
              Sincronizează rezervările
            </Button>
            <Button variant="secondary" onClick={testApi} loading={loading}>
              Test API
            </Button>
          </div>
        </div>

        {/* Raw API response (for debugging) */}
        {rawData && (
          <div style={{ ...panel, borderColor:'rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#FCD34D', marginBottom:8 }}>Răspuns brut API 5starDesk</div>
            <pre style={{ fontSize:11, color:'rgba(159,215,255,0.6)', overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:300, overflowY:'auto' }}>
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={panel}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
              {[
                { l:'Total', v:result.total, c:'#FFFFFF' },
                { l:'Importate', v:result.inserted, c:'#4ADE80' },
                { l:'Existente', v:result.skipped, c:'#94A3B8' },
                { l:'Erori', v:result.errors, c:result.errors>0?'#F87171':'#94A3B8' },
              ].map(s=>(
                <div key={s.l} style={{ background:'rgba(14,27,43,0.5)', borderRadius:8, padding:'10px', textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:s.c, fontFamily:'monospace' }}>{s.v}</div>
                  <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)' }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:300, overflowY:'auto' }}>
              {result.logs.map((log,i)=>(
                <div key={i} style={{ display:'flex', gap:8, padding:'5px 10px', borderRadius:6, background:log.type==='ok'?'rgba(34,197,94,0.06)':log.type==='err'?'rgba(239,68,68,0.06)':'rgba(214,228,244,0.03)', fontSize:11, color:log.type==='ok'?'#4ADE80':log.type==='err'?'#F87171':log.type==='info'?'#7BC8FF':'rgba(159,215,255,0.5)' }}>
                  {log.msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
