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
  const months: Record<string,string> = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'}
  const p = s.trim().split(' ')
  if (p.length === 3) return `${p[2]}-${months[p[1]]||'01'}-${p[0].padStart(2,'0')}`
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
      const res = await fetch('/api/fivestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actiune: 'get_bookings',
          checkin: fmt5star(dateFrom),
          checkout: fmt5star(dateTo),
        })
      })
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
      for (const a of apts||[]) { if (a.nota) aptMap[a.nota.toLowerCase()] = a.id; aptMap[a.nume.toLowerCase()] = a.id }

      // 2. Call get_bookings
      const resp = await fetch('/api/fivestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actiune: 'get_bookings',
          checkin: fmt5star(dateFrom),
          checkout: fmt5star(dateTo),
        })
      })
      const data = await resp.json()
      res.logs.push({ type:'info', msg: `Răspuns 5starDesk: ${JSON.stringify(data).slice(0,200)}` })

      // 3. Find bookings array in response
      const bookings = data.rezervari || data.bookings || data.camere || data.data || (Array.isArray(data) ? data : null)

      if (!bookings || !Array.isArray(bookings)) {
        res.logs.push({ type:'err', msg: `Format nerecunoscut. Răspuns complet: ${JSON.stringify(data).slice(0,500)}` })
        setResult(res)
        setLoading(false)
        return
      }

      res.total = bookings.length
      res.logs.push({ type:'info', msg: `${bookings.length} rezervări primite` })

      // 4. Process each booking
      for (const b of bookings) {
        try {
          const checkin = b.checkin ? parse5star(b.checkin) : b.data_checkin || b.check_in
          const checkout = b.checkout ? parse5star(b.checkout) : b.data_checkout || b.check_out
          const numeClient = b.name || b.nume || b.client || b.guest_name || '—'
          const canal = parseCanal(b.canal || b.source || b.channel || '')
          const telefon = b.phone || b.telefon || null
          const email = b.email || null
          const pret = parseFloat(b.price || b.pret || b.total || '0') || 0
          const idExtern = String(b.id || b.id_rezervare || b.booking_id || '')

          // Find apartment
          const numeCamera = (b.room || b.camera || b.room_name || b.nume_camera || '').toLowerCase()
          let aptId = null
          for (const [key, id] of Object.entries(aptMap)) {
            if (numeCamera.includes(key) || key.includes(numeCamera)) { aptId = id; break }
          }

          if (!checkin || !checkout) { res.skipped++; res.logs.push({ type:'skip', msg: `${numeClient}: dată lipsă` }); continue }

          // Check if exists
          const { data: existing } = await supabase.from('rezervari')
            .select('id').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(1)

          if (existing && existing.length > 0) {
            // Update phone if missing
            if (telefon) {
              await supabase.from('rezervari').update({ telefon_client: telefon, apartament_id: aptId||undefined })
                .eq('id', existing[0].id).is('telefon_client', null)
            }
            res.skipped++
            res.logs.push({ type:'skip', msg: `${numeClient} (${checkin}) — deja există` })
          } else {
            const { error } = await supabase.from('rezervari').insert({
              apartament_id: aptId,
              canal, nume_client: numeClient,
              data_checkin: checkin, data_checkout: checkout,
              suma_incasata: pret, valoare_bruta: pret, moneda: 'RON',
              telefon_client: telefon,
              status_rezervare: 'confirmata', status_plata: pret>0?'achitat':'neplatit',
              status_decont: 'nedecontat',
              observatii: [numeCamera, idExtern].filter(Boolean).join(' | ') || null,
            })
            if (error) { res.errors++; res.logs.push({ type:'err', msg: `${numeClient}: ${error.message}` }) }
            else { res.inserted++; res.logs.push({ type:'ok', msg: `✓ ${numeClient} (${checkin}→${checkout})${telefon?' 📞':''}${aptId?'':' ⚠️ apt necunoscut'}` }) }
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
