'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const CODE = '1111'
const P = (n:number) => String(n).padStart(2,'0')
const fmtDate = (d:string) => { const dt=new Date(d); return `${P(dt.getDate())}.${P(dt.getMonth()+1)}` }
const fmtFull = (d:string) => { const dt=new Date(d+'T12:00:00'); const z=['Dum','Lun','Mar','Mie','Joi','Vin','Sâm']; return `${z[dt.getDay()]} ${P(dt.getDate())}.${P(dt.getMonth()+1)}` }
const addDays = (d:string, n:number) => { const dt=new Date(d+'T12:00:00'); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10) }
const today = () => new Date().toISOString().slice(0,10)

export default function StaffPage() {
  const [auth, setAuth] = useState(false)
  const [cod, setCod] = useState('')
  const [err, setErr] = useState(false)
  const [data, setData] = useState(today())
  const [apts, setApts] = useState<any[]>([])
  const [checkouts, setCheckouts] = useState<any[]>([])
  const [checkins, setCheckins] = useState<any[]>([])
  const [ocupate, setOcupate] = useState<any[]>([])
  const [statusuri, setStatusuri] = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState<string|null>(null)
  const [tab, setTab] = useState<'curatenie'|'disponibile'|'ocupate'>('curatenie')

  useEffect(() => {
    if (localStorage.getItem('staff_v2') === CODE) setAuth(true)
  }, [])

  useEffect(() => { if (auth) load() }, [auth, data])

  async function load() {
    setLoading(true)
    const [a, co, ci, ocp, st] = await Promise.all([
      supabase.from('apartamente').select('id,nota,nume,adresa').eq('status','activ').order('nota'),
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
    setLoading(false)
  }

  async function setStatus(aptId:string, status:'inceput'|'gata') {
    const now = new Date()
    const ora = `${P(now.getHours())}:${P(now.getMinutes())}`
    const update:any = { apartament_id:aptId, data, status }
    if (status==='inceput') update.ora_inceput=ora
    if (status==='gata') { update.ora_gata=ora; if(statusuri[aptId]?.ora_inceput) update.ora_inceput=statusuri[aptId].ora_inceput }
    await supabase.from('curatenie_status').upsert(update, {onConflict:'apartament_id,data'})
    setStatusuri(prev=>({...prev,[aptId]:{...(prev[aptId]||{}),...update}}))
    const apt = apts.find(a=>a.id===aptId)
    const msg = status==='inceput' ? `🧹 Curățenie începută — ${apt?.nota}` : `✅ Gata — ${apt?.nota} (${ora})`
    setFlash(msg)
    setTimeout(()=>setFlash(null), 2500)
    // Trimite notificare push catre admin
    fetch('/api/push-send', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: msg, body: `${fmtFull(data)}`, url:'/curatenie', tag:'staff-'+aptId })
    }).catch(()=>{})
  }

  function login() {
    if (cod===CODE) { localStorage.setItem('staff_v2',CODE); setAuth(true); setErr(false) }
    else { setErr(true); setCod('') }
  }

  // ── LOGIN ──
  if (!auth) return (
    <div style={{minHeight:'100dvh',background:'#060D1A',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <div style={{width:'100%',maxWidth:320,padding:'0 24px'}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontSize:56,marginBottom:12}}>🏠</div>
          <div style={{fontSize:24,fontWeight:700,color:'#F0F8FF',letterSpacing:'-.5px'}}>AB Homes</div>
          <div style={{fontSize:14,color:'rgba(159,215,255,0.4)',marginTop:4}}>Echipa curățenie</div>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:10,marginBottom:28}}>
          {[1,2,3,4].map(i=>(
            <div key={i} style={{width:14,height:14,borderRadius:'50%',background:cod.length>=i?'#4ADE80':'rgba(255,255,255,0.1)',transition:'background .2s'}}/>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
            <button key={i} onClick={()=>{
              if(k==='⌫') setCod(c=>c.slice(0,-1))
              else if(k!=='' && cod.length<4) { const nc=cod+k; setCod(nc); if(nc.length===4) setTimeout(()=>{ if(nc===CODE){localStorage.setItem('staff_v2',CODE);setAuth(true)}else{setErr(true);setCod('')} },100) }
            }}
              style={{padding:'18px',borderRadius:14,border:'none',background:k===''?'transparent':'rgba(255,255,255,0.07)',color:'#F0F8FF',fontSize:22,fontWeight:500,cursor:k===''?'default':'pointer',opacity:k===''?0:1,WebkitTapHighlightColor:'transparent'}}>
              {k}
            </button>
          ))}
        </div>
        {err && <div style={{textAlign:'center',color:'#F87171',marginTop:16,fontSize:14}}>Cod greșit</div>}
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

  const tabs = [
    {k:'curatenie', l:`🧹 Curățenie`, n:deCuratat.length},
    {k:'disponibile', l:`🟢 Libere`, n:disponibile.length},
    {k:'ocupate', l:`🔴 Ocupate`, n:ocupateApts.length},
  ]

  return (
    <div style={{minHeight:'100dvh',background:'#060D1A',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',paddingBottom:80}}>

      {/* Flash */}
      {flash&&<div style={{position:'fixed',top:0,left:0,right:0,zIndex:99,background:'#22C55E',color:'#fff',padding:'14px 16px',fontSize:14,fontWeight:600,textAlign:'center'}}>{flash}</div>}

      {/* Header */}
      <div style={{background:'rgba(6,13,26,0.97)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'14px 16px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:'#F0F8FF'}}>AB Homes Staff</div>
            <div style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginTop:1}}>
              {deCuratat.length>0 ? `${nrGata}/${deCuratat.length} curățate` : 'Nicio curățenie azi'}
            </div>
          </div>
          {/* Navigare zile */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={()=>setData(addDays(data,-1))}
              style={{width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#7BC8FF',fontSize:18,cursor:'pointer'}}>‹</button>
            <div style={{textAlign:'center',minWidth:70}}>
              <div style={{fontSize:13,fontWeight:700,color:data===today()?'#4ADE80':'#F0F8FF'}}>{fmtFull(data)}</div>
              {data===today()&&<div style={{fontSize:10,color:'#4ADE80'}}>Azi</div>}
            </div>
            <button onClick={()=>setData(addDays(data,1))}
              style={{width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#7BC8FF',fontSize:18,cursor:'pointer'}}>›</button>
          </div>
        </div>

        {/* Progress bar */}
        {deCuratat.length>0&&(
          <div style={{marginTop:10,height:4,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
            <div style={{height:'100%',borderRadius:2,background:'linear-gradient(90deg,#22C55E,#4ADE80)',width:`${nrGata/deCuratat.length*100}%`,transition:'width .4s'}}/>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,0.07)',background:'rgba(6,13,26,0.95)',position:'sticky',top:loading?57:57,zIndex:9}}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{flex:1,padding:'12px 4px',border:'none',background:'transparent',color:tab===t.k?'#7BC8FF':'rgba(159,215,255,0.4)',fontSize:12,fontWeight:600,cursor:'pointer',borderBottom:`2px solid ${tab===t.k?'#7BC8FF':'transparent'}`,transition:'all .15s'}}>
            {t.l} <span style={{fontSize:11,opacity:0.7}}>({t.n})</span>
          </button>
        ))}
      </div>

      <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>

        {/* ── CURATENIE ── */}
        {tab==='curatenie'&&(
          deCuratat.length===0
          ? <div style={{textAlign:'center',padding:'48px 0',color:'rgba(159,215,255,0.3)',fontSize:14}}>✓ Niciun checkout azi</div>
          : deCuratat.map(apt=>{
            const st = statusuri[apt.id]
            const isGata = st?.status==='gata'
            const isInceput = st?.status==='inceput'
            const co = checkouts.find((r:any)=>r.apartament_id===apt.id)
            const ci = checkins.find((r:any)=>r.apartament_id===apt.id)
            const urgenta = !!ci // checkin azi = urgent
            return (
              <div key={apt.id} style={{borderRadius:16,overflow:'hidden',border:`1px solid ${isGata?'rgba(34,197,94,0.3)':urgenta?'rgba(252,211,77,0.3)':'rgba(255,255,255,0.08)'}`,background:isGata?'rgba(34,197,94,0.07)':isInceput?'rgba(251,146,60,0.07)':'rgba(255,255,255,0.03)'}}>
                <div style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:18,fontWeight:700,color:'#F0F8FF'}}>{apt.nota}</span>
                        {urgenta&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(252,211,77,0.15)',color:'#FCD34D',fontWeight:700,border:'1px solid rgba(252,211,77,0.3)'}}>⚡ URGENT</span>}
                        {isGata&&<span style={{fontSize:12,color:'#4ADE80'}}>✅ Gata {st.ora_gata}</span>}
                        {isInceput&&!isGata&&<span style={{fontSize:12,color:'#FB923C'}}>🧹 {st.ora_inceput}...</span>}
                      </div>
                      <div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:2}}>{apt.nume}</div>
                    </div>
                    <div style={{fontSize:26}}>{isGata?'✅':isInceput?'🧹':'⏳'}</div>
                  </div>

                  {co&&<div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginBottom:4}}>
                    Checkout: <span style={{color:'rgba(255,255,255,0.7)'}}>{co.nume_client}</span>
                    {co.telefon_client&&<a href={`tel:${co.telefon_client}`} style={{marginLeft:8,color:'#7BC8FF',textDecoration:'none'}}>📞</a>}
                    <span style={{marginLeft:6,color:'rgba(159,215,255,0.4)'}}>· {co.nr_nopti} nopți</span>
                  </div>}
                  {ci&&<div style={{fontSize:12,color:'#FCD34D',marginBottom:4}}>
                    Checkin azi: <span style={{fontWeight:600}}>{ci.nume_client}</span>
                    {ci.telefon_client&&<a href={`tel:${ci.telefon_client}`} style={{marginLeft:8,color:'#FCD34D',textDecoration:'none'}}>📞</a>}
                  </div>}
                </div>

                <div style={{padding:'0 12px 12px',display:'flex',gap:8}}>
                  {!isInceput&&!isGata&&(
                    <button onClick={()=>setStatus(apt.id,'inceput')}
                      style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#FB923C',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                      ▶ Începe
                    </button>
                  )}
                  {isInceput&&!isGata&&(
                    <button onClick={()=>setStatus(apt.id,'gata')}
                      style={{flex:1,padding:'13px',borderRadius:12,border:'none',background:'#22C55E',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                      ✅ Am terminat!
                    </button>
                  )}
                  {isGata&&(
                    <button onClick={()=>setStatus(apt.id,'inceput')}
                      style={{flex:1,padding:'12px',borderRadius:12,border:'1px solid rgba(251,146,60,0.3)',background:'transparent',color:'#FB923C',fontSize:13,cursor:'pointer'}}>
                      ↩ Reîncepe
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* ── DISPONIBILE ── */}
        {tab==='disponibile'&&(
          disponibile.length===0
          ? <div style={{textAlign:'center',padding:'48px 0',color:'rgba(159,215,255,0.3)',fontSize:14}}>Toate ocupate</div>
          : disponibile.map(apt=>(
            <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(74,222,128,0.15)',background:'rgba(74,222,128,0.04)',display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:'#4ADE80',flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:'#F0F8FF'}}>{apt.nota} <span style={{fontSize:12,fontWeight:400,color:'rgba(159,215,255,0.5)'}}>{apt.nume}</span></div>
                {ciSet.has(apt.id)&&<div style={{fontSize:12,color:'#FCD34D',marginTop:2}}>
                  Checkin azi: {checkins.find((r:any)=>r.apartament_id===apt.id)?.nume_client}
                </div>}
              </div>
              <div style={{fontSize:22}}>🟢</div>
            </div>
          ))
        )}

        {/* ── OCUPATE ── */}
        {tab==='ocupate'&&(
          ocupateApts.length===0
          ? <div style={{textAlign:'center',padding:'48px 0',color:'rgba(159,215,255,0.3)',fontSize:14}}>Nicio rezervare activă</div>
          : ocupateApts.map(apt=>{
            const rez = ocupate.find((r:any)=>r.apartament_id===apt.id)
            return (
              <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(248,113,113,0.15)',background:'rgba(248,113,113,0.04)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:'#F87171',flexShrink:0}}/>
                  <div style={{fontSize:15,fontWeight:700,color:'#F0F8FF'}}>{apt.nota} <span style={{fontSize:12,fontWeight:400,color:'rgba(159,215,255,0.5)'}}>{apt.nume}</span></div>
                  <div style={{marginLeft:'auto',fontSize:22}}>🔴</div>
                </div>
                {rez&&(
                  <div style={{fontSize:13,color:'rgba(159,215,255,0.6)',paddingLeft:20}}>
                    <div style={{marginBottom:2}}><span style={{color:'rgba(255,255,255,0.75)',fontWeight:500}}>{rez.nume_client}</span>
                      {rez.telefon_client&&<a href={`tel:${rez.telefon_client}`} style={{marginLeft:10,color:'#7BC8FF',fontSize:14,textDecoration:'none'}}>📞 {rez.telefon_client}</a>}
                    </div>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>
                      {fmtDate(rez.data_checkin)} → {fmtDate(rez.data_checkout)}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Bottom deconectare */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,padding:'10px 16px',background:'rgba(6,13,26,0.97)',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:12,color:'rgba(159,215,255,0.3)'}}>AB Homes Staff · {fmtFull(data)}</span>
        <button onClick={()=>{localStorage.removeItem('staff_v2');setAuth(false)}}
          style={{padding:'6px 14px',borderRadius:8,border:'1px solid rgba(159,215,255,0.1)',background:'transparent',color:'rgba(159,215,255,0.3)',fontSize:11,cursor:'pointer'}}>
          Ieși
        </button>
      </div>
    </div>
  )
}
