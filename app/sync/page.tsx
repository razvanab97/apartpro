'use client'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Phone, CalendarCheck, Users } from 'lucide-react'
import { TabRezervari, TabClienti } from '../import/page'
import { syncFivestar, fmt5star, type SyncResult } from '@/lib/syncFivestar'

function ImportContent() {
  const [tab, setTab] = useState<'rezervari'|'clienti'>('rezervari')
  const tabStyle = (a: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:7, border:'none',
    cursor:'pointer', fontSize:12, fontWeight:500,
    background: a ? 'rgba(77,163,255,0.2)' : 'transparent',
    color: a ? '#FFFFFF' : 'rgba(159,215,255,0.5)',
    outline: a ? '1px solid rgba(77,163,255,0.3)' : 'none',
  })
  return (
    <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto'}}>
      <div style={{display:'flex', gap:4, background:'rgba(14,27,43,0.4)', borderRadius:10, padding:4, width:'fit-content'}}>
        <button style={tabStyle(tab==='rezervari')} onClick={()=>setTab('rezervari')}><CalendarCheck size={13}/>Rezervări</button>
        <button style={tabStyle(tab==='clienti')} onClick={()=>setTab('clienti')}><Users size={13}/>Clienți + Telefoane</button>
      </div>
      {tab==='rezervari' ? <TabRezervari/> : <TabClienti/>}
    </div>
  )
}

export default function SyncPage() {
  const [mainTab, setMainTab] = useState<'sync'|'import'>('sync')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [result, setResult] = useState<SyncResult|null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()+3); return d.toISOString().split('T')[0]
  })
  const [rawData, setRawData] = useState<any>(null)
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    try { return localStorage.getItem('sync_auto') === '1' } catch { return false }
  })
  const [nextSyncIn, setNextSyncIn] = useState('')
  const { toast, show } = useToast()

  useEffect(() => {
    try { localStorage.setItem('sync_auto', autoSync ? '1' : '0') } catch {}
    if (!autoSync) { setNextSyncIn(''); return }
    // Trigger immediate sync when enabled
    syncRezervari()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync])

  // Countdown display — reads sync_last written by Layout background runner
  useEffect(() => {
    if (!autoSync) { setNextSyncIn(''); return }
    const tick = () => {
      const last = parseInt(localStorage.getItem('sync_last') || '0')
      if (!last) { setNextSyncIn('60m 00s'); return }
      const secs = Math.max(0, Math.round((last + 3600000 - Date.now()) / 1000))
      const m = Math.floor(secs / 60), s = secs % 60
      setNextSyncIn(`${m}m ${String(s).padStart(2,'0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [autoSync])

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
      setRawData(testData)
    } catch(e: any) {
      setRawData({ error: e.message })
    }
    setLoading(false)
  }

  async function syncRezervari() {
    setLoading(true)
    setResult(null)
    try {
      const res = await syncFivestar(dateFrom, dateTo)
      setResult({...res})
      try { localStorage.setItem('sync_last', Date.now().toString()) } catch {}
      if (res.inserted > 0) show('success', `${res.inserted} rezervări importate!`)
    } catch(e:any) {
      show('error', 'Eroare: ' + e.message)
    }
    setLoading(false)
  }

  async function deleteAndResync() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setConfirmDelete(false)
    setResult(null)
    try {
      // Sterge toate rezervarile
      const delRes = await fetch('/api/delete-rezervari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'delete-all-rez-2026' })
      })
      const delData = await delRes.json()
      if (!delData.ok) throw new Error(delData.error || 'Eroare stergere')
      show('success', 'Toate rezervarile au fost sterse. Se reincarca...')
      // Resincronizeaza
      await syncRezervari()
    } catch (e: any) {
      show('error', 'Eroare: ' + e.message)
    }
    setDeleting(false)
  }

  const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14, padding:20 }

  const mainTabStyle = (a: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none',
    background: a ? 'rgba(77,163,255,0.15)' : 'transparent',
    color: a ? '#4DA3FF' : 'rgba(159,215,255,0.5)',
    borderBottom: a ? '2px solid #4DA3FF' : '2px solid transparent',
  })

  return (
    <>
      <PageHeader title="Sync 5starDesk" subtitle={mainTab==='sync' ? 'Import automat rezervări din PMS' : 'Import date din Excel'}/>
      <div style={{display:'flex', gap:4, padding:'0 20px', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <button style={mainTabStyle(mainTab==='sync')} onClick={()=>setMainTab('sync')}>🔄 Sync 5starDesk</button>
        <button style={mainTabStyle(mainTab==='import')} onClick={()=>setMainTab('import')}>📥 Import Excel</button>
      </div>
      {mainTab==='import' && <ImportContent/>}
      {mainTab==='sync' && <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14, maxWidth:720, overflowY:'auto' }}>

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
          {/* Auto-sync toggle */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(77,163,255,0.12)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <button onClick={() => setAutoSync(a => !a)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:9,
                border:`1px solid ${autoSync?'rgba(74,222,128,0.4)':'rgba(159,215,255,0.15)'}`,
                background:autoSync?'rgba(74,222,128,0.1)':'transparent',
                color:autoSync?'#4ADE80':'rgba(159,215,255,0.5)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              <span style={{ fontSize:14 }}>{autoSync ? '🔄' : '⏸'}</span>
              {autoSync ? 'Auto-sync activ (1h)' : 'Activează auto-sync (1h)'}
            </button>
            {autoSync && nextSyncIn && (
              <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)', fontFamily:'monospace' }}>
                Următor sync: <span style={{ color:'#4ADE80', fontWeight:700 }}>{nextSyncIn}</span>
              </span>
            )}
          </div>
          {/* Buton stergere + resync */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(248,113,113,0.15)' }}>
            {!confirmDelete ? (
              <button onClick={deleteAndResync} disabled={deleting || loading}
                style={{ width:'100%', padding:'9px', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)',
                  background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.8)',
                  cursor:'pointer', fontSize:12, fontWeight:600 }}>
                {deleting ? '⏳ Se șterg și resincronizează...' : '🗑️ Șterge toate și reimportă din 5starDesk'}
              </button>
            ) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#F87171', flex:1 }}>
                  ⚠️ Sigur ștergi TOATE rezervările? Acțiunea nu poate fi anulată!
                </span>
                <button onClick={deleteAndResync}
                  style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'#F87171',
                    color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                  DA, ȘTERGE TOT
                </button>
                <button onClick={()=>setConfirmDelete(false)}
                  style={{ padding:'7px 12px', borderRadius:8, border:'1px solid rgba(159,215,255,0.2)',
                    background:'transparent', color:'rgba(159,215,255,0.6)', cursor:'pointer', fontSize:12 }}>
                  Anulează
                </button>
              </div>
            )}
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
      </div>}
      <Toast toast={toast}/>
    </>
  )
}
