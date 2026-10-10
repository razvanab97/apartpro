'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Phone, CalendarCheck, Users } from 'lucide-react'
import { TabRezervari, TabClienti } from '../import/page'
import { syncFivestar, fmt5star, fetchOneBookingById, idsDinObs, citesteListaSetari, scrieListaSetari, CHEIE_DE_VERIFICAT, CHEIE_SARITE, type SyncResult, type DeVerificat } from '@/lib/syncFivestar'

// formateaza local (YYYY-MM-DD) - .toISOString() poate muta data cu o zi pentru fuse est de UTC (ex: Romania)
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Rezervari 5starDesk ambigue (acelasi client pe mai multe camere / slot cu o rezervare anulata),
// lasate de sincronizare pentru decizie manuala - cerut direct: "da-mi manual in aplicatie, sa
// editez eu, sa marchez daca bifam sau sarim". Bifam = se importa (sau, daca era deja importata,
// se pastreaza cu modificarile facute aici); sarim = nu se mai importa niciodata automat.
function DeVerificatPanel({ apts, refreshKey, show, panel }: { apts:{id:string;nota:string;nume:string}[]; refreshKey:number; show:(t:any,m:string)=>void; panel:React.CSSProperties }) {
  const [lista, setLista] = useState<DeVerificat[]>([])
  const [edit, setEdit] = useState<Record<string, Partial<DeVerificat>>>({})
  const [busy, setBusy] = useState<string|null>(null)
  const [confirm, setConfirm] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { setLista(await citesteListaSetari(CHEIE_DE_VERIFICAT)) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [refreshKey])

  const val = (x: DeVerificat): DeVerificat => ({ ...x, ...(edit[x.id5sd]||{}) })
  const setCamp = (id: string, k: keyof DeVerificat, v: any) => { setEdit(e => ({ ...e, [id]: { ...(e[id]||{}), [k]: v } })); setConfirm(null) }

  async function scoate(id5sd: string) {
    const l: DeVerificat[] = (await citesteListaSetari(CHEIE_DE_VERIFICAT)).filter((x:DeVerificat) => x.id5sd !== id5sd)
    await scrieListaSetari(CHEIE_DE_VERIFICAT, l)
    setLista(l)
  }

  async function bifeaza(x0: DeVerificat) {
    const x = val(x0)
    if (!x.aptId) { show('error', 'Alege apartamentul'); return }
    if (!x.checkin || !x.checkout || x.checkout <= x.checkin) { show('error', 'Datele nu sunt valide'); return }
    setBusy(x.id5sd)
    try {
      // Suprapunere cu o rezervare activa pe apartamentul ales -> cere a doua apasare
      let q = supabase.from('rezervari').select('id,nume_client').eq('apartament_id', x.aptId).neq('status_rezervare','anulata')
        .lt('data_checkin', x.checkout).gt('data_checkout', x.checkin)
      if (x.rid) q = q.neq('id', x.rid)
      const { data: ov, error: ovErr } = await q
      if (ovErr) { show('error', 'Nu am putut verifica suprapunerile — încearcă din nou'); return }
      if (ov && ov.length && confirm !== x.id5sd+':ov') {
        setConfirm(x.id5sd+':ov')
        show('error', `Se suprapune cu ${ov.map((r:any)=>r.nume_client).join(', ')} pe același apartament — apasă din nou ca să confirmi`)
        return
      }
      const campuri = { apartament_id: x.aptId, nume_client: x.nume, data_checkin: x.checkin, data_checkout: x.checkout,
        suma_incasata: Number(x.pret)||0, valoare_bruta: Number(x.pret)||0, canal: x.canal }
      if (x.rid) {
        const { error } = await supabase.from('rezervari').update(campuri).eq('id', x.rid)
        if (error) { show('error', error.message); return }
      } else {
        const { data: exista } = await supabase.from('rezervari').select('id,observatii').ilike('observatii', `%${x.id5sd}%`).limit(10)
        if (!(exista||[]).some((r:any) => idsDinObs(r.observatii).includes(x.id5sd))) {
          const { error } = await supabase.from('rezervari').insert({ ...campuri, moneda:'RON', telefon_client: x.telefon, nr_persoane: x.nrPersoane,
            status_rezervare: x.statusNou, status_plata: (Number(x.pret)||0) > 0 ? 'achitat' : 'neplatit', status_decont: 'nedecontat', observatii: x.obs || null })
          if (error) { show('error', error.message); return }
        }
      }
      await scoate(x.id5sd)
      show('success', `${x.nume} — ${x.rid ? 'păstrată' : 'importată'}`)
    } finally { setBusy(null) }
  }

  async function sari(x: DeVerificat) {
    if (confirm !== x.id5sd+':sari') { setConfirm(x.id5sd+':sari'); return }
    setBusy(x.id5sd)
    try {
      const sarite = (await citesteListaSetari(CHEIE_SARITE)).map(String)
      if (!sarite.includes(x.id5sd)) await scrieListaSetari(CHEIE_SARITE, [...sarite, x.id5sd])
      // Deja importata -> anulata (nu stearsa: reversibil, iar sincronizarea n-o mai atinge fiind in "sarite")
      if (x.rid) await supabase.from('rezervari').update({ status_rezervare: 'anulata' }).eq('id', x.rid)
      await scoate(x.id5sd)
      show('success', `${x.nume} — sărită`)
    } finally { setBusy(null); setConfirm(null) }
  }

  if (!loading && !lista.length) return null
  const inp: React.CSSProperties = { width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:7, color:'rgba(214,228,244,0.9)', fontSize:12, padding:'6px 8px', outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, color:'rgba(159,215,255,0.45)', marginBottom:3, display:'block' }
  return (
    <div style={{ ...panel, borderColor:'rgba(252,211,77,0.25)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#FCD34D' }}>⏸ Rezervări de verificat {lista.length>0?`(${lista.length})`:''}</div>
        <button onClick={load} disabled={loading}
          style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:11, cursor:'pointer' }}>
          {loading?'Se încarcă...':'↻ Reîmprospătează'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:12 }}>
        Rezervări active în 5starDesk care nu se pot importa singure — de obicei fiindcă 5starDesk nu le-a atribuit încă o cameră. Alege apartamentul și corectează ce e nevoie, apoi bifează sau sari. Dacă între timp 5starDesk le dă o cameră, intră automat la următoarea sincronizare.
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {lista.map(x0 => {
          const x = val(x0)
          const b = busy === x.id5sd
          return (
            <div key={x.id5sd} style={{ padding:'10px 12px', borderRadius:8, background:'rgba(252,211,77,0.05)', border:'1px solid rgba(252,211,77,0.15)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#E8F4FF' }}>{x0.nume}</span>
                <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)', fontFamily:'monospace' }}>ID {x.id5sd} · {x0.cod}</span>
                {x.rid && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'rgba(77,163,255,0.12)', color:'#7BC8FF' }}>importată deja — confirmă</span>}
              </div>
              <div style={{ fontSize:11, color:'rgba(252,211,77,0.75)', marginBottom:10 }}>{x.tip==='fara_camera' ? '⚠ Fără cameră atribuită în 5starDesk — alege apartamentul mai jos' : `Seamănă cu: ${x.motiv}`}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:8, marginBottom:10 }}>
                <div><label style={lbl}>Apartament</label>
                  <select value={x.aptId||''} onChange={e=>setCamp(x.id5sd,'aptId',e.target.value||null)} style={inp}>
                    <option value="">— alege —</option>
                    {x.aptId && !apts.some(a=>a.id===x.aptId) && <option value={x.aptId}>{x0.cod}</option>}
                    {apts.map(a=><option key={a.id} value={a.id}>{a.nota||a.nume}</option>)}
                  </select></div>
                <div><label style={lbl}>Nume client</label><input value={x.nume} onChange={e=>setCamp(x.id5sd,'nume',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Check-in</label><input type="date" value={x.checkin} onChange={e=>setCamp(x.id5sd,'checkin',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Check-out</label><input type="date" value={x.checkout} onChange={e=>setCamp(x.id5sd,'checkout',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Sumă (RON)</label><input type="number" value={String(x.pret ?? '')} onChange={e=>setCamp(x.id5sd,'pret',e.target.value)} style={inp}/></div>
                <div><label style={lbl}>Canal</label>
                  <select value={x.canal} onChange={e=>setCamp(x.id5sd,'canal',e.target.value)} style={inp}>
                    {['booking','airbnb','direct'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select></div>
              </div>
              <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button onClick={()=>sari(x)} disabled={b}
                  style={{ padding:'6px 12px', borderRadius:7, border:'1px solid rgba(248,113,113,0.3)', background: confirm===x.id5sd+':sari'?'#F87171':'transparent', color: confirm===x.id5sd+':sari'?'#fff':'rgba(248,113,113,0.85)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  {confirm===x.id5sd+':sari' ? (x.rid ? 'Sigur? O anulez' : 'Sigur, sari') : 'Sari'}
                </button>
                <button onClick={()=>bifeaza(x0)} disabled={b}
                  style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#4ADE80', color:'#062012', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {b ? 'Se salvează...' : confirm===x.id5sd+':ov' ? '✓ Confirmă oricum' : x.rid ? '✓ Păstrează' : '✓ Importă'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

  // Camere semnalate — rezervari unde sincronizarea a gasit un cod de camera diferit de
  // apartamentul unde rezervarea e stocata deja, dar nu a realocat automat (risc de suprapunere
  // peste o rezervare activa). Cerut direct: "sa functioneze de acum inainte, sa identifice toate
  // miscarile" — lista se reincarca la fiecare vizita a paginii, nu doar dupa un sync proaspat.
  const [semnalate, setSemnalate] = useState<any[]>([])
  const [loadingSemnalate, setLoadingSemnalate] = useState(false)
  // Cautare manuala dupa ID de rezervare 5starDesk — cerut direct, pentru rezervari reale, active pe
  // 5starDesk, care nu au ajuns (inca) la noi prin sincronizarea automata/periodica
  const [idCautat, setIdCautat] = useState('')
  const [cautandId, setCautandId] = useState(false)
  const [rezultatIdCautat, setRezultatIdCautat] = useState<SyncResult|null>(null)
  const [apts, setApts] = useState<{id:string;nota:string;nume:string}[]>([])
  const [actionId, setActionId] = useState<string|null>(null)
  const [confirmMutaId, setConfirmMutaId] = useState<string|null>(null)
  const [refreshDeVerificat, setRefreshDeVerificat] = useState(0)

  async function loadSemnalate() {
    setLoadingSemnalate(true)
    try {
      const [{ data: apartamente }, { data: rez }] = await Promise.all([
        supabase.from('apartamente').select('id,nota,nume').eq('status','activ').order('nota'),
        supabase.from('rezervari').select('id,nume_client,telefon_client,apartament_id,data_checkin,data_checkout,camera_semnalata,camera_semnalata_la,status_rezervare')
          .not('camera_semnalata','is',null).not('camera_semnalata','in','(NEALOCAT,ALOCAT_MANUAL)').neq('status_rezervare','anulata').order('camera_semnalata_la',{ascending:false}),
      ])
      setApts(apartamente||[])
      setSemnalate(rez||[])
    } catch { /* coloana poate sa nu existe inca (migrare neaplicata) - lista ramane goala */ }
    setLoadingSemnalate(false)
  }
  useEffect(() => { loadSemnalate() }, [])

  async function ignoraSemnal(id: string) {
    setActionId(id)
    await supabase.from('rezervari').update({ camera_semnalata: null, camera_semnalata_la: null }).eq('id', id)
    setSemnalate(prev => prev.filter(r => r.id !== id))
    setActionId(null)
  }

  async function mutaLaCameraSemnalata(r: any) {
    setActionId(r.id)
    const aptTinta = apts.find(a => a.nota === r.camera_semnalata)
    if (!aptTinta) { show('error', `Nu găsesc apartamentul ${r.camera_semnalata}`); setActionId(null); return }
    // Nu muta orbeste — verifica intai daca noul apartament are deja o rezervare activa care se
    // suprapune pe aceleasi date (exact riscul gasit manual la primul caz verificat: mutarea ar
    // fi creat o suprapunere noua peste o rezervare deja confirmata). Esec la verificare (eroare
    // de retea etc.) = NU se muta, nu se presupune "e liber" — gasit real prin testare directa:
    // varianta initiala ignora eroarea si proceda oricum cu mutarea.
    const { data: overlap, error: overlapErr } = await supabase.from('rezervari').select('id,nume_client')
      .eq('apartament_id', aptTinta.id).neq('id', r.id).neq('status_rezervare','anulata')
      .lt('data_checkin', r.data_checkout).gt('data_checkout', r.data_checkin)
    if (overlapErr) {
      show('error', `Nu am putut verifica suprapunerile pentru ${r.camera_semnalata} — nu s-a mutat nimic, încearcă din nou`)
      setActionId(null); setConfirmMutaId(null)
      return
    }
    if (overlap && overlap.length > 0) {
      show('error', `${r.camera_semnalata} are deja o rezervare (${overlap[0].nume_client}) pe aceleași date — verifică manual pe 5starDesk, nu s-a mutat nimic`)
      setActionId(null); setConfirmMutaId(null)
      return
    }
    await supabase.from('rezervari').update({ apartament_id: aptTinta.id, camera_semnalata: null, camera_semnalata_la: null }).eq('id', r.id)
    setSemnalate(prev => prev.filter(x => x.id !== r.id))
    show('success', `${r.nume_client} mutat la ${r.camera_semnalata}`)
    setActionId(null); setConfirmMutaId(null)
  }

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
      if (!last) { setNextSyncIn('30m 00s'); return }
      const secs = Math.max(0, Math.round((last + 1800000 - Date.now()) / 1000))
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
      loadSemnalate()
      setRefreshDeVerificat(k => k+1)
    } catch(e:any) {
      show('error', 'Eroare: ' + e.message)
    }
    setLoading(false)
  }

  async function cautaDupaId() {
    if (!idCautat.trim()) { show('error', 'Introdu un ID de rezervare 5starDesk'); return }
    setCautandId(true)
    setRezultatIdCautat(null)
    try {
      const res = await fetchOneBookingById(idCautat)
      setRezultatIdCautat(res)
      setRefreshDeVerificat(k => k+1)
      if (res.inserted > 0) { show('success', 'Rezervare adusă din 5starDesk!'); loadSemnalate() }
      else if (res.updated > 0 || res.skipped > 0 && res.errors === 0) show('success', 'Rezervare găsită și actualizată')
      else if (res.errors > 0) show('error', res.logs[res.logs.length-1]?.msg || 'Eroare la căutare')
    } catch(e:any) {
      show('error', 'Eroare: ' + e.message)
    }
    setCautandId(false)
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
              { l:'Luna trecută', f:()=>{ const d=new Date(); setDateFrom(toYMD(new Date(d.getFullYear(),d.getMonth()-1,1))); setDateTo(toYMD(new Date(d.getFullYear(),d.getMonth(),0))) }},
              { l:'Luna curentă', f:()=>{ const d=new Date(); setDateFrom(toYMD(new Date(d.getFullYear(),d.getMonth(),1))); setDateTo(toYMD(new Date(d.getFullYear(),d.getMonth()+1,0))) }},
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
              {autoSync ? 'Auto-sync activ (30 min)' : 'Activează auto-sync (30 min)'}
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

        {/* Rezultatele sincronizarii - imediat sub butonul de sync (cerut direct), nu in josul paginii */}
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

        {/* Cautare/import manual dupa ID de rezervare 5starDesk — cerut direct, ca sa poti aduce o
            rezervare anume, activa pe 5starDesk, care nu a ajuns la noi prin sincronizarea automata */}
        <div style={panel}>
          <div style={{ fontSize:13, fontWeight:600, color:'#FFF', marginBottom:6 }}>🔎 Adaugă rezervare după ID (5starDesk)</div>
          <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:12 }}>
            Ai o rezervare activă pe 5starDesk care nu apare în calendar aici? Pune ID-ul rezervării (din 5starDesk) și caută/aduce direct de-acolo.
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={idCautat} onChange={e=>setIdCautat(e.target.value)} placeholder="ex: 1384749"
              onKeyDown={e=>{ if(e.key==='Enter') cautaDupaId() }}
              style={{ flex:1, background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8, color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none' }}/>
            <Button variant="primary" icon={cautandId?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<RefreshCw size={14}/>} onClick={cautaDupaId} loading={cautandId}>
              Caută și adaugă
            </Button>
          </div>
          {rezultatIdCautat && (
            <div style={{ marginTop:12, padding:'10px 12px', borderRadius:8, background: rezultatIdCautat.errors>0 ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.06)', border:`1px solid ${rezultatIdCautat.errors>0?'rgba(248,113,113,0.2)':'rgba(74,222,128,0.2)'}` }}>
              {rezultatIdCautat.logs.map((l,i)=>(
                <div key={i} style={{ fontSize:12, color: l.type==='err'?'#F87171':l.type==='ok'?'#4ADE80':'rgba(159,215,255,0.6)', marginBottom:4 }}>{l.msg}</div>
              ))}
            </div>
          )}
        </div>

        <DeVerificatPanel apts={apts} refreshKey={refreshDeVerificat} show={show} panel={panel}/>

        {/* Camere semnalate — discrepante intre codul din 5starDesk si apartamentul unde e stocata rezervarea */}
        {(loadingSemnalate || semnalate.length > 0) && (
          <div style={{ ...panel, borderColor:'rgba(252,211,77,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#FCD34D' }}>⚠ Camere semnalate de verificat {semnalate.length>0?`(${semnalate.length})`:''}</div>
              <button onClick={loadSemnalate} disabled={loadingSemnalate}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:11, cursor:'pointer' }}>
                {loadingSemnalate?'Se încarcă...':'↻ Reîmprospătează'}
              </button>
            </div>
            <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:12 }}>
              Rezervările viitoare mutate în 5starDesk pe altă cameră se mută singure la sincronizare, dacă apartamentul e liber. Aici rămân doar cele care nu s-au putut muta (apartament ocupat pe acele date, rezervare deja încheiată). Rezervările fără cameră în 5starDesk sunt în Calendar → „Nealocate”. Verifică pe 5starDesk, apoi ignoră sau mută.
            </div>
            {semnalate.length===0 && !loadingSemnalate && (
              <div style={{ fontSize:12, color:'rgba(159,215,255,0.35)', textAlign:'center', padding:'10px 0' }}>Nimic de verificat momentan</div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {semnalate.map(r => {
                const aptCurent = apts.find(a => a.id === r.apartament_id)
                const busy = actionId === r.id
                return (
                  <div key={r.id} style={{ padding:'10px 12px', borderRadius:8, background:'rgba(252,211,77,0.05)', border:'1px solid rgba(252,211,77,0.15)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#E8F4FF' }}>{r.nume_client}</div>
                        <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginTop:2 }}>
                          {r.data_checkin} → {r.data_checkout} · stocată la <b style={{color:'#7BC8FF'}}>{aptCurent?.nota||'?'}</b>, {r.camera_semnalata==='NEALOCAT' ? <b style={{color:'#F87171'}}>fără cameră în 5starDesk</b> : <>cod semnalat <b style={{color:'#FCD34D'}}>{r.camera_semnalata}</b></>}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={()=>ignoraSemnal(r.id)} disabled={busy}
                          style={{ padding:'6px 12px', borderRadius:7, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.6)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          Ignoră
                        </button>
                        {r.camera_semnalata==='NEALOCAT' ? null : confirmMutaId===r.id ? (
                          <button onClick={()=>mutaLaCameraSemnalata(r)} disabled={busy}
                            style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#FCD34D', color:'#1A1400', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {busy?'Se mută...':`Sigur, mută la ${r.camera_semnalata}`}
                          </button>
                        ) : (
                          <button onClick={()=>setConfirmMutaId(r.id)} disabled={busy}
                            style={{ padding:'6px 12px', borderRadius:7, border:'1px solid rgba(252,211,77,0.35)', background:'rgba(252,211,77,0.1)', color:'#FCD34D', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Mută la {r.camera_semnalata}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>}
      <Toast toast={toast}/>
    </>
  )
}
