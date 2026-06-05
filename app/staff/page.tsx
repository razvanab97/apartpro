'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CODE = '1111'
const P = (n:number) => String(n).padStart(2,'0')
const fmtDate = (d:string) => { try { const dt=new Date(d+'T12:00:00'); return `${P(dt.getDate())}.${P(dt.getMonth()+1)}` } catch { return d } }
const fmtFull = (d:string) => { try { const dt=new Date(d+'T12:00:00'); const z=['Dum','Lun','Mar','Mie','Joi','Vin','Sâm']; return `${z[dt.getDay()]} ${P(dt.getDate())}.${P(dt.getMonth()+1)}` } catch { return d } }
const addDays = (d:string, n:number) => { const dt=new Date(d+'T12:00:00'); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10) }
const todayStr = () => new Date().toISOString().slice(0,10)
function nrLenSmart(r:any){ const p=Number(r.nr_persoane)||2; return Math.ceil(Math.max(2,p)/2) }

type Tab = 'curatenie' | 'disponibile' | 'ocupate' | 'probleme' | 'calendar'

export default function StaffPage() {
  const [auth, setAuth] = useState(false)
  const [cod, setCod] = useState('')
  const [err, setErr] = useState(false)
  const [data, setData] = useState(todayStr())
  const [apts, setApts] = useState<any[]>([])
  const [checkouts, setCheckouts] = useState<any[]>([])
  const [checkins, setCheckins] = useState<any[]>([])
  const [ocupate, setOcupate] = useState<any[]>([])
  const [statusuri, setStatusuri] = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState<{msg:string,ok:boolean}|null>(null)
  const [tab, setTab] = useState<Tab>('curatenie')
  const [calData, setCalData] = useState<any[]>([])
  const [problemeStaff, setProblemeStaff] = useState<any[]>([])
  const [newProbStaff, setNewProbStaff] = useState({titlu:'',descriere:'',prioritate:'normal',apartament_id:''})
  const [savingProb, setSavingProb] = useState(false)

  useEffect(() => {
    if (document.cookie.includes('staff_auth=1111')) setAuth(true)
  }, [])

  useEffect(() => {
    if (!auth) return
    load()
    if(tab==='calendar') loadCalendar()
    if(tab==='probleme') loadProblemeStaff()
  }, [auth, data, tab])

  async function load() {
    setLoading(true)
    const [a, co, ci, ocp, st] = await Promise.all([
      supabase.from('apartamente').select('id,nota,nume').eq('status','activ').order('nota'),
      supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout,nr_nopti').eq('data_checkout',data).neq('status_rezervare','anulata'),
      supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout').eq('data_checkin',data).neq('status_rezervare','anulata'),
      supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout').lte('data_checkin',data).gt('data_checkout',data).neq('status_rezervare','anulata'),
      supabase.from('curatenie_status').select('*').eq('data',data),
    ])
    setApts(a.data||[])
    setCheckouts(co.data||[])
    setCheckins(ci.data||[])
    setOcupate(ocp.data||[])
    const m:Record<string,any>={}
    ;(st.data||[]).forEach((s:any)=>{ m[s.apartament_id]=s })
    setStatusuri(m)
    // setEliberatIds din curatenie_status
    setLoading(false)
  }

  async function loadCalendar() {
    const from = addDays(data, -1)
    const to = addDays(data, 6)
    const { data: rez } = await supabase.from('rezervari')
      .select('apartament_id,data_checkin,data_checkout,nume_client')
      .lte('data_checkin', to).gt('data_checkout', from)
      .neq('status_rezervare','anulata')
    setCalData(rez||[])
  }

  async function loadProblemeStaff() {
    const { data } = await supabase.from('probleme_apartamente')
      .select('*,apartament:apartament_id(nota,nume)')
      .neq('status','rezolvat')
      .order('created_at',{ascending:false})
    setProblemeStaff(data||[])
  }

  async function addProblemaStaff() {
    if(!newProbStaff.titlu) return
    setSavingProb(true)
    const { error } = await supabase.from('probleme_apartamente').insert({
      apartament_id: newProbStaff.apartament_id || null,
      titlu: newProbStaff.titlu,
      descriere: newProbStaff.descriere,
      prioritate: newProbStaff.prioritate,
      status: 'deschis',
      created_at: new Date().toISOString(),
    })
    if (!error) {
      setNewProbStaff({titlu:'',descriere:'',prioritate:'normal',apartament_id:''})
      loadProblemeStaff()
      setFlash({msg:'✓ Problemă raportată!', ok:true})
      setTimeout(()=>setFlash(null),2000)
    }
    setSavingProb(false)
  }

  async function setStatus(aptId:string, status:'inceput'|'gata') {
    const now = new Date()
    const ora = `${P(now.getHours())}:${P(now.getMinutes())}`
    const prev = statusuri[aptId]||{}
    const update:any = { apartament_id:aptId, data, status }
    if (status==='inceput') update.ora_inceput = ora
    if (status==='gata') { update.ora_gata = ora; update.ora_inceput = prev.ora_inceput||ora }
    await supabase.from('curatenie_status').upsert(update, {onConflict:'apartament_id,data'})
    setStatusuri(prev=>({...prev,[aptId]:{...prev[aptId],...update}}))
    const apt = apts.find(a=>a.id===aptId)
    const msg = status==='inceput' ? `🧹 Curățenie începută — ${apt?.nota}` : `✅ Gata — ${apt?.nota} (${ora})`
    setFlash({msg, ok: status==='gata'})
    setTimeout(()=>setFlash(null), 2500)
    fetch('/api/push-send', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: msg, body: fmtFull(data), url:'/curatenie', tag:'staff-'+aptId })
    }).catch(()=>{})
  }

  const pressKey = useCallback((k: number|string) => {
    if (k==='⌫') { setCod(c=>c.slice(0,-1)); setErr(false); return }
    if (typeof k === 'number' && cod.length < 4) {
      const nc = cod + k
      setCod(nc)
      if (nc.length === 4) {
        setTimeout(() => {
          if (nc === CODE) { document.cookie='staff_auth=1111;path=/;max-age=86400'; setAuth(true); setErr(false) }
          else { setErr(true); setCod('') }
        }, 150)
      }
    }
  }, [cod])

  // ── LOGIN ──
  if (!auth) return (
    <div style={{minHeight:'100dvh',background:'linear-gradient(160deg,#0A1628 0%,#060D1A 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',padding:'0 0 env(safe-area-inset-bottom)'}}>
      <div style={{width:'100%',maxWidth:360,padding:'0 28px'}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:48}}>
          <div style={{width:72,height:72,borderRadius:20,background:'linear-gradient(135deg,#1E40AF,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:32}}>🏠</div>
          <div style={{fontSize:26,fontWeight:700,color:'#F0F8FF',letterSpacing:'-.5px'}}>AB Homes</div>
          <div style={{fontSize:14,color:'rgba(159,215,255,0.4)',marginTop:6}}>Echipa curățenie</div>
        </div>

        {/* Dots */}
        <div style={{display:'flex',justifyContent:'center',gap:12,marginBottom:36}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:16,height:16,borderRadius:'50%',
              background: err ? '#F87171' : cod.length>i ? '#4ADE80' : 'rgba(255,255,255,0.1)',
              transition:'background .15s',
              boxShadow: cod.length>i&&!err ? '0 0 8px rgba(74,222,128,0.5)' : 'none'
            }}/>
          ))}
        </div>

        {/* Keyboard */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
            <button key={i} onClick={()=>k!=='' && pressKey(k as any)}
              disabled={k===''}
              style={{
                padding:'20px 0',borderRadius:16,border:'none',
                background: k==='' ? 'transparent' : 'rgba(255,255,255,0.07)',
                color: k==='⌫' ? 'rgba(159,215,255,0.6)' : '#F0F8FF',
                fontSize: k==='⌫' ? 20 : 24,fontWeight:500,
                cursor:k===''?'default':'pointer',
                opacity:k===''?0:1,
                WebkitTapHighlightColor:'transparent',
                transition:'background .1s',
                touchAction:'manipulation',
              }}>
              {k}
            </button>
          ))}
        </div>

        {err && (
          <div style={{textAlign:'center',color:'#F87171',marginTop:20,fontSize:14,fontWeight:500}}>
            ✕ Cod greșit, încearcă din nou
          </div>
        )}
      </div>
    </div>
  )

  // ── APP ──
  const coSet = new Set(checkouts.map((r:any)=>r.apartament_id))
  const ciSet = new Set(checkins.map((r:any)=>r.apartament_id))
  const ocpSet = new Set(ocupate.map((r:any)=>r.apartament_id))
  const deCuratat = apts.filter(a=>coSet.has(a.id))
  const disponibile = apts.filter(a=>!ocpSet.has(a.id))
  const ocupateApts = apts.filter(a=>ocpSet.has(a.id))
  const nrGata = deCuratat.filter(a=>statusuri[a.id]?.status==='gata').length

  const TABS: {k:Tab,l:string,n?:number}[] = [
    {k:'curatenie', l:'🧹', n:deCuratat.length},
    {k:'disponibile', l:'🟢', n:disponibile.length},
    {k:'ocupate', l:'🔴', n:ocupateApts.length},
    {k:'probleme', l:'🔧'},
    {k:'calendar', l:'📅'},
  ]

  // Calendar 7 zile
  const calDays = Array.from({length:7},(_,i)=>addDays(data,-1+i))

  return (
    <div style={{height:'100dvh',background:'#060D1A',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',display:'flex',flexDirection:'column',overflow:'hidden',position:'fixed',inset:0,touchAction:'pan-y',overscrollBehavior:'none' as const}}>

      {/* Flash */}
      {flash&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:flash.ok?'#22C55E':'#FB923C',color:'#fff',padding:'14px 16px 14px',paddingTop:'calc(14px + env(safe-area-inset-top))',fontSize:14,fontWeight:600,textAlign:'center',transition:'all .3s'}}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{background:'rgba(6,13,26,0.98)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'12px 16px',paddingTop:'calc(12px + env(safe-area-inset-top)',position:'sticky',top:0,zIndex:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#F0F8FF'}}>
              {deCuratat.length>0 ? `${nrGata}/${deCuratat.length} curățate` : '✓ Totul e curat'}
            </div>
            <div style={{fontSize:11,color:'rgba(159,215,255,0.35)',marginTop:1}}>AB Homes Iași</div>
          </div>
          {/* Navigare zile */}
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <button onClick={()=>setData(addDays(data,-1))}
              style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#7BC8FF',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>‹</button>
            <button onClick={()=>setData(todayStr())}
              style={{padding:'0 12px',height:36,borderRadius:10,border:`1px solid ${data===todayStr()?'rgba(74,222,128,0.4)':'rgba(255,255,255,0.1)'}`,background:data===todayStr()?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.05)',color:data===todayStr()?'#4ADE80':'#7BC8FF',fontSize:12,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              {fmtFull(data)}
            </button>
            <button onClick={()=>setData(addDays(data,1))}
              style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#7BC8FF',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>›</button>
          </div>
        </div>

        {/* Progress */}
        {deCuratat.length>0&&(
          <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2}}>
            <div style={{height:'100%',borderRadius:2,background:'linear-gradient(90deg,#22C55E,#4ADE80)',width:`${nrGata/deCuratat.length*100}%`,transition:'width .5s ease'}}/>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'rgba(6,13,26,0.98)',borderBottom:'1px solid rgba(255,255,255,0.06)',position:'sticky',top:72,zIndex:19}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            style={{flex:1,padding:'11px 4px',border:'none',background:'transparent',color:tab===t.k?'#7BC8FF':'rgba(159,215,255,0.35)',fontSize:11,fontWeight:600,cursor:'pointer',borderBottom:`2px solid ${tab===t.k?'#7BC8FF':'transparent'}`,transition:'all .15s',WebkitTapHighlightColor:'transparent'}}>
            {t.l}{t.n!==undefined?` (${t.n})`:''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'12px 14px 20px',WebkitOverflowScrolling:'touch' as any}}>

        {/* ── CURĂȚENIE ── */}
        {tab==='curatenie'&&(
          deCuratat.length===0
          ? <div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>✓ Niciun checkout {data===todayStr()?'azi':'în ziua asta'}</div>
          : deCuratat.map(apt=>{
            const st=statusuri[apt.id]
            const isGata=st?.status==='gata'
            const isInceput=st?.status==='inceput'
            const co=checkouts.find((r:any)=>r.apartament_id===apt.id)
            const ci=checkins.find((r:any)=>r.apartament_id===apt.id)
            return(
              <div key={apt.id} style={{borderRadius:18,overflow:'hidden',border:`1.5px solid ${isGata?'rgba(34,197,94,0.35)':ci?'rgba(252,211,77,0.35)':'rgba(255,255,255,0.08)'}`,background:isGata?'rgba(34,197,94,0.06)':isInceput?'rgba(251,146,60,0.06)':'rgba(255,255,255,0.02)',marginBottom:10}}>
                <div style={{padding:'16px 16px 12px'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:20,fontWeight:800,color:'#F0F8FF'}}>{apt.nota}</span>
                      <span style={{fontSize:12,color:'rgba(159,215,255,0.45)'}}>{apt.nume}</span>
                      {ci&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(252,211,77,0.15)',color:'#FCD34D',fontWeight:700,border:'1px solid rgba(252,211,77,0.25)'}}>⚡ URGENT</span>}
                      {st?.eliberat&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(74,222,128,0.15)',color:'#4ADE80',fontWeight:700,border:'1px solid rgba(74,222,128,0.25)'}}>🚪 Eliberat{st.eliberat_la?' '+st.eliberat_la:''}</span>}
                      {st?.status==='anulat'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(248,113,113,0.15)',color:'#F87171',fontWeight:700,border:'1px solid rgba(248,113,113,0.3)'}}>✕ Curățenie anulată</span>}
                      {st?.status==='doar_lenjerie'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(167,139,250,0.15)',color:'#A78BFA',fontWeight:700,border:'1px solid rgba(167,139,250,0.3)'}}>🛏 Doar lenjerie</span>}
                      {!st?.eliberat&&!isInceput&&!isGata&&st?.status!=='anulat'&&st?.status!=='doar_lenjerie'&&(
                        ci
                          ? <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(248,113,113,0.1)',color:'rgba(248,113,113,0.7)',border:'1px solid rgba(248,113,113,0.2)'}}>⏳ Așteaptă check-out</span>
                          : <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(77,163,255,0.1)',color:'rgba(77,163,255,0.7)',border:'1px solid rgba(77,163,255,0.2)'}}>🔓 Liber după checkout</span>
                      )}
                    </div>
                    <span style={{fontSize:28}}>{isGata?'✅':isInceput?'🧹':'⏳'}</span>
                  </div>
                  {co&&<div style={{fontSize:13,color:'rgba(159,215,255,0.55)',marginBottom:4}}>
                    Checkout: <span style={{color:'rgba(255,255,255,0.75)',fontWeight:500}}>{co.nume_client}</span>
                    {co.telefon_client&&<a href={`tel:${co.telefon_client}`} style={{marginLeft:10,color:'#7BC8FF',textDecoration:'none',fontSize:13}}>📞 Sună</a>}
                    <span style={{marginLeft:8,fontSize:12,color:'rgba(159,215,255,0.35)'}}>· {co.nr_nopti} nopți</span>
                  </div>}
                  {ci&&<div style={{fontSize:13,color:'#FCD34D',marginBottom:4}}>
                    Checkin azi: <span style={{fontWeight:600}}>{ci.nume_client}</span>
                    {ci.telefon_client&&<a href={`tel:${ci.telefon_client}`} style={{marginLeft:10,color:'#FCD34D',textDecoration:'none',fontSize:13}}>📞 Sună</a>}
                  </div>}
                  {ci&&(()=>{
                    const l=nrLenSmart(ci)
                    return(
                      <div style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:4,padding:'4px 10px',borderRadius:8,
                        background:'rgba(252,211,77,0.1)',border:'1px solid rgba(252,211,77,0.25)'}}>
                        <span style={{fontSize:14}}>🛏</span>
                        <span style={{fontSize:13,fontWeight:700,color:'#FCD34D'}}>{l} {l===1?'lenjerie':'lenjerii'}</span>
                        <span style={{fontSize:11,color:'rgba(252,211,77,0.5)'}}>({Number(ci.nr_persoane)||2} pers.)</span>
                      </div>
                    )
                  })()}
                  {st&&<div style={{fontSize:12,color:isGata?'#4ADE80':'#FB923C',marginTop:4}}>
                    {isInceput&&!isGata&&`▶ Început la ${st.ora_inceput}`}
                    {isGata&&`✓ Terminat la ${st.ora_gata}${st.ora_inceput?` (început ${st.ora_inceput})`:''}` }
                  </div>}
                </div>
                <div style={{padding:'0 12px 12px',display:'flex',gap:8}}>
                  {!isInceput&&!isGata&&<button onClick={()=>setStatus(apt.id,'inceput')} style={{flex:1,padding:'15px',borderRadius:14,border:'none',background:'#FB923C',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>▶ Începe curățenia</button>}
                  {isInceput&&!isGata&&<button onClick={()=>setStatus(apt.id,'gata')} style={{flex:1,padding:'15px',borderRadius:14,border:'none',background:'#22C55E',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>✅ Am terminat!</button>}
                  {isGata&&<button onClick={()=>setStatus(apt.id,'inceput')} style={{flex:1,padding:'13px',borderRadius:14,border:'1px solid rgba(251,146,60,0.3)',background:'transparent',color:'#FB923C',fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>↩ Reîncepe</button>}
                </div>
              </div>
            )
          })
        )}

        {/* ── LIBERE ── */}
        {tab==='disponibile'&&(disponibile.length===0
          ?<div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>Toate ocupate</div>
          :disponibile.map(apt=>(
            <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(74,222,128,0.15)',background:'rgba(74,222,128,0.04)',display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:'#4ADE80',flexShrink:0,boxShadow:'0 0 6px rgba(74,222,128,0.5)'}}/>
              <div style={{flex:1}}>
                <span style={{fontSize:16,fontWeight:700,color:'#F0F8FF'}}>{apt.nota}</span>
                <span style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginLeft:8}}>{apt.nume}</span>
                {ciSet.has(apt.id)&&<div style={{fontSize:12,color:'#FCD34D',marginTop:2}}>Checkin azi: {checkins.find((r:any)=>r.apartament_id===apt.id)?.nume_client}</div>}
              </div>
            </div>
          ))
        )}

        {/* ── OCUPATE ── */}
        {tab==='ocupate'&&(ocupateApts.length===0
          ?<div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>Nicio rezervare activă</div>
          :ocupateApts.map(apt=>{
            const rez=ocupate.find((r:any)=>r.apartament_id===apt.id)
            return(
              <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(248,113,113,0.15)',background:'rgba(248,113,113,0.04)',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:'#F87171',flexShrink:0}}/>
                  <span style={{fontSize:16,fontWeight:700,color:'#F0F8FF'}}>{apt.nota}</span>
                  <span style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>{apt.nume}</span>
                </div>
                {rez&&<div style={{paddingLeft:22}}>
                  <div style={{fontSize:13,color:'rgba(255,255,255,0.75)',fontWeight:500,marginBottom:4}}>{rez.nume_client}</div>
                  <div style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginBottom:6}}>{fmtDate(rez.data_checkin)} → {fmtDate(rez.data_checkout)}</div>
                  {rez.telefon_client&&<a href={`tel:${rez.telefon_client}`} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:10,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',color:'#7BC8FF',textDecoration:'none',fontSize:13,fontWeight:600}}>📞 {rez.telefon_client}</a>}
                </div>}
              </div>
            )
          })
        )}

        {/* ── PROBLEME ── */}
        {tab==='probleme'&&(
          <div>
            {/* Form adaugare */}
            <div style={{borderRadius:18,border:'1px solid rgba(251,146,60,0.25)',background:'rgba(251,146,60,0.05)',padding:16,marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:'#FB923C',marginBottom:12}}>🔧 Raportează o problemă</div>
              <select value={newProbStaff.apartament_id} onChange={e=>setNewProbStaff(p=>({...p,apartament_id:e.target.value}))}
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,boxSizing:'border-box' as const}}>
                <option value="">— Apartament (opțional) —</option>
                {apts.map(a=><option key={a.id} value={a.id}>{a.nota} — {a.nume}</option>)}
              </select>
              <input value={newProbStaff.titlu} onChange={e=>setNewProbStaff(p=>({...p,titlu:e.target.value}))}
                placeholder="Ce problemă ai găsit? *"
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,boxSizing:'border-box' as const}}/>
              <textarea value={newProbStaff.descriere} onChange={e=>setNewProbStaff(p=>({...p,descriere:e.target.value}))}
                placeholder="Detalii (opțional)..." rows={3}
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,resize:'none' as const,fontFamily:'inherit',boxSizing:'border-box' as const}}/>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                {['normal','urgent','critic'].map(p=>(
                  <button key={p} onClick={()=>setNewProbStaff(prev=>({...prev,prioritate:p}))}
                    style={{flex:1,padding:'10px',borderRadius:10,border:`1px solid ${newProbStaff.prioritate===p?(p==='critic'?'rgba(248,113,113,0.5)':p==='urgent'?'rgba(251,146,60,0.5)':'rgba(77,163,255,0.5)'):'rgba(255,255,255,0.1)'}`,
                    background:newProbStaff.prioritate===p?(p==='critic'?'rgba(248,113,113,0.15)':p==='urgent'?'rgba(251,146,60,0.15)':'rgba(77,163,255,0.15)'):'transparent',
                    color:newProbStaff.prioritate===p?(p==='critic'?'#F87171':p==='urgent'?'#FB923C':'#7BC8FF'):'rgba(159,215,255,0.4)',
                    fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                    {p==='critic'?'🔴 Critic':p==='urgent'?'🟡 Urgent':'🔵 Normal'}
                  </button>
                ))}
              </div>
              <button onClick={addProblemaStaff} disabled={!newProbStaff.titlu||savingProb}
                style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:newProbStaff.titlu?'#FB923C':'rgba(159,215,255,0.08)',color:newProbStaff.titlu?'#fff':'rgba(159,215,255,0.3)',fontSize:15,fontWeight:700,cursor:newProbStaff.titlu?'pointer':'not-allowed',WebkitTapHighlightColor:'transparent'}}>
                {savingProb?'Se trimite...':'📤 Trimite raportul'}
              </button>
            </div>

            {/* Lista probleme existente */}
            {problemeStaff.length>0&&(
              <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:10}}>
                Probleme deschise ({problemeStaff.length})
              </div>
            )}
            {problemeStaff.map(p=>{
              const c=p.prioritate==='critic'?'#F87171':p.prioritate==='urgent'?'#FB923C':'#7BC8FF'
              return(
                <div key={p.id} style={{borderRadius:14,border:`1px solid ${c}22`,background:'rgba(11,22,42,0.6)',padding:'12px 14px',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:`${c}18`,color:c,fontWeight:700,textTransform:'uppercase' as const}}>{p.prioritate}</span>
                    {p.apartament&&<span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>{p.apartament.nota}</span>}
                    <span style={{fontSize:10,color:'rgba(159,215,255,0.25)',marginLeft:'auto'}}>{p.status==='in_lucru'?'🟡 În lucru':'🔴 Deschis'}</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>{p.titlu}</div>
                  {p.descriere&&<div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:3}}>{p.descriere}</div>}
                </div>
              )
            })}
            {problemeStaff.length===0&&<div style={{textAlign:'center' as const,padding:'24px 0',color:'rgba(159,215,255,0.25)',fontSize:13}}>✓ Nicio problemă deschisă</div>}
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab==='calendar'&&(
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:12}}>7 zile — {fmtFull(addDays(data,-1))} → {fmtFull(addDays(data,5))}</div>
            {apts.map(apt=>(
              <div key={apt.id} style={{marginBottom:8,borderRadius:12,overflow:'hidden',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
                <div style={{padding:'8px 12px',background:'rgba(11,22,42,0.6)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#E8F4FF',minWidth:42}}>{apt.nota}</span>
                  <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>{apt.nume}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                  {calDays.map(zi=>{
                    const rez=calData.find((r:any)=>r.apartament_id===apt.id&&r.data_checkin<=zi&&r.data_checkout>zi)
                    const isCo=checkouts.some((r:any)=>r.apartament_id===apt.id&&zi===data)
                    const isCi=checkins.some((r:any)=>r.apartament_id===apt.id&&zi===data)
                    const isToday=zi===todayStr()
                    const isSelected=zi===data
                    return(
                      <div key={zi} onClick={()=>setData(zi)}
                        style={{padding:'8px 4px',textAlign:'center',cursor:'pointer',background:rez?'rgba(248,113,113,0.2)':'transparent',borderLeft:'1px solid rgba(255,255,255,0.05)',borderBottom: isSelected?`2px solid #7BC8FF`:'2px solid transparent'}}>
                        <div style={{fontSize:9,color:isToday?'#4ADE80':isSelected?'#7BC8FF':'rgba(159,215,255,0.35)',fontWeight:isToday||isSelected?700:400,marginBottom:2}}>{fmtFull(zi).slice(0,3)}</div>
                        <div style={{fontSize:10,color:isToday?'#4ADE80':isSelected?'#7BC8FF':'rgba(159,215,255,0.5)',fontWeight:isToday?700:400}}>{zi.slice(8)}</div>
                        {rez&&<div style={{fontSize:8,color:'rgba(248,113,113,0.8)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',padding:'0 2px'}}>{rez.nume_client?.split(' ')[0]}</div>}
                        {!rez&&<div style={{fontSize:14,marginTop:1}}>🟢</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


    </div>
  )
}
