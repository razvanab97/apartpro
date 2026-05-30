'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { MessageCircle, BedDouble, RefreshCw } from 'lucide-react'

function nrLen(p:number){ return p<=2?1:p<=4?2:p<=6?3:4 }

export default function CuratenePage() {
  const [co, setCo] = useState<any[]>([])
  const [ci, setCi] = useState<any[]>([])
  const [len, setLen] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState('')

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    setData(new Date().toLocaleDateString('ro-RO'))
    const [{ data: coData }, { data: ciData }] = await Promise.all([
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)')
        .eq('data_checkout', today),
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)')
        .eq('data_checkin', today),
    ])
    setCo(coData || [])
    setCi(ciData || [])
    setLoading(false)
  }

  function waEchipa(){
    const linii = co.map((r:any)=>{
      const apt = r.apartament
      const ciM = ci.find((c:any)=>c.apartament?.id===apt?.id)
      const pers = Number(ciM?.nr_persoane||r.nr_persoane||2)
      const l = len[r.id] ?? nrLen(pers)
      const aptStr = (apt?.nota?'['+apt.nota+'] ':'')+apt?.nume
      const clientStr = ciM ? 'CO: '+r.nume_client+' → CI: '+ciM.nume_client : 'CO: '+r.nume_client
      return aptStr+'\n   '+clientStr+'\nLenjerii: '+l
    }).join('\n\n')
    const msg = 'Curatenie '+data+'\n\n'+linii+'\n\nMultumesc!'
    window.open('https://wa.me/40756942108?text='+encodeURIComponent(msg),'_blank')
  }

  const panel:React.CSSProperties = {
    background:'rgba(214,228,244,0.05)',
    border:'0.5px solid rgba(159,215,255,0.1)',
    borderRadius:10, overflow:'hidden', marginBottom:8,
  }
  const hdr:React.CSSProperties = {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'8px 14px', background:'rgba(14,27,43,0.5)',
    borderBottom:'0.5px solid rgba(159,215,255,0.07)',
  }

  // CI fara CO = doar pregatire
  const ciOnly = ci.filter((c:any)=>!co.find((r:any)=>r.apartament?.id===c.apartament?.id))

  return (
    <>
      <PageHeader title="Curățenie" subtitle={`Astăzi · ${data}`}/>
      <div style={{flex:1,overflowY:'auto',padding:'14px 16px 40px'}}>

        {/* Buton refresh + WA */}
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          <button onClick={load} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(159,215,255,0.7)',fontSize:13,cursor:'pointer'}}>
            <RefreshCw size={14}/>Reîncarcă
          </button>
          {co.length>0&&(
            <button onClick={waEchipa} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,border:'0.5px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              <MessageCircle size={14}/>Trimite WA echipă
            </button>
          )}
        </div>

        {loading&&<div style={{color:'rgba(159,215,255,0.4)',fontSize:13,padding:'20px'}}>Se încarcă...</div>}

        {!loading&&co.length===0&&ci.length===0&&(
          <div style={{...panel,borderTop:'2px solid rgba(159,215,255,0.2)'}}>
            <div style={{padding:'24px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:13}}>
              Nicio curățenie programată pentru astăzi
            </div>
          </div>
        )}

        {/* CO azi — curatenie */}
        {co.length>0&&(
          <div style={{...panel,borderTop:'2px solid #F87171'}}>
            <div style={hdr}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:13}}>🧹</span>
                <span style={{fontSize:11,fontWeight:600,color:'#F87171',textTransform:'uppercase',letterSpacing:'0.7px'}}>Check-out — de făcut curat</span>
                <span style={{fontSize:11,fontWeight:600,background:'rgba(248,113,113,0.12)',color:'#F87171',padding:'1px 8px',borderRadius:20}}>{co.length}</span>
              </div>
            </div>
            <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
              {co.map((r:any,idx:number)=>{
                const apt=r.apartament
                const ciM=ci.find((c:any)=>c.apartament?.id===apt?.id)
                const pers=Number(ciM?.nr_persoane||r.nr_persoane||2)
                const lenDef=nrLen(pers)
                const l=len[r.id]??lenDef
                return(
                  <div key={r.id||idx} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:ciM?'rgba(248,113,113,0.06)':'rgba(255,255,255,0.02)',border:`0.5px solid ${ciM?'rgba(248,113,113,0.2)':'rgba(159,215,255,0.1)'}`,borderRadius:9}}>
                    {apt?.nota&&<span style={{fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'2px 8px',borderRadius:4,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{apt?.nume||'—'}</div>
                      <div style={{fontSize:11,marginTop:2}}>
                        <span style={{color:'#F87171'}}>↗ {r.nume_client}</span>
                        {ciM&&<><span style={{color:'rgba(159,215,255,0.3)'}}> → </span><span style={{color:'#4ADE80'}}>↙ {ciM.nume_client}</span></>}
                      </div>
                      {apt?.adresa&&<div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginTop:1}}>{apt.adresa}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                      <BedDouble size={13} color="rgba(159,215,255,0.4)"/>
                      <button onClick={()=>setLen(l=>({...l,[r.id]:Math.max(1,(l[r.id]??lenDef)-1)}))}
                        style={{width:28,height:28,borderRadius:6,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{fontSize:18,fontWeight:700,color:'#FCD34D',minWidth:24,textAlign:'center' as const}}>{l}</span>
                      <button onClick={()=>setLen(l=>({...l,[r.id]:(l[r.id]??lenDef)+1}))}
                        style={{width:28,height:28,borderRadius:6,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:5,color:ciM?'#F87171':'#FCD34D',background:ciM?'rgba(248,113,113,0.12)':'rgba(252,211,77,0.1)',border:`0.5px solid ${ciM?'rgba(248,113,113,0.3)':'rgba(252,211,77,0.3)'}`,flexShrink:0,whiteSpace:'nowrap' as const}}>
                      {ciM?'CO→CI':'CO'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CI fara CO — doar pregatire lenjerii */}
        {ciOnly.length>0&&(
          <div style={{...panel,borderTop:'2px solid #4ADE80'}}>
            <div style={hdr}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:13}}>🛏</span>
                <span style={{fontSize:11,fontWeight:600,color:'#4ADE80',textTransform:'uppercase',letterSpacing:'0.7px'}}>Check-in — pregătire lenjerii</span>
                <span style={{fontSize:11,fontWeight:600,background:'rgba(74,222,128,0.1)',color:'#4ADE80',padding:'1px 8px',borderRadius:20}}>{ciOnly.length}</span>
              </div>
            </div>
            <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
              {ciOnly.map((r:any,idx:number)=>{
                const apt=r.apartament
                const pers=Number(r.nr_persoane||2)
                const lenDef=nrLen(pers)
                const l=len[r.id]??lenDef
                return(
                  <div key={r.id||idx} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(74,222,128,0.04)',border:'0.5px solid rgba(74,222,128,0.15)',borderRadius:9}}>
                    {apt?.nota&&<span style={{fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'2px 8px',borderRadius:4,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{apt?.nume||'—'}</div>
                      <div style={{fontSize:11,color:'#4ADE80',marginTop:2}}>↙ {r.nume_client} · {pers} pers.</div>
                      {apt?.adresa&&<div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginTop:1}}>{apt.adresa}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                      <BedDouble size={13} color="rgba(159,215,255,0.4)"/>
                      <button onClick={()=>setLen(l=>({...l,[r.id]:Math.max(1,(l[r.id]??lenDef)-1)}))}
                        style={{width:28,height:28,borderRadius:6,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{fontSize:18,fontWeight:700,color:'#FCD34D',minWidth:24,textAlign:'center' as const}}>{l}</span>
                      <button onClick={()=>setLen(l=>({...l,[r.id]:(l[r.id]??lenDef)+1}))}
                        style={{width:28,height:28,borderRadius:6,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:5,color:'#4ADE80',background:'rgba(74,222,128,0.1)',border:'0.5px solid rgba(74,222,128,0.3)',flexShrink:0}}>CI</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
