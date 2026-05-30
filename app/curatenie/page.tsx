'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { MessageCircle, BedDouble, RefreshCw, Minus, Plus } from 'lucide-react'

function nrLen(p:number){ return p<=2?1:p<=4?2:p<=6?3:4 }

export default function CuratenePage() {
  const [co, setCo] = useState<any[]>([])
  const [ci, setCi] = useState<any[]>([])
  const [len, setLen] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [dataAzi, setDataAzi] = useState('')

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    setDataAzi(new Date().toLocaleDateString('ro-RO',{weekday:'long',day:'numeric',month:'long'}))
    const [{data:coData},{data:ciData}] = await Promise.all([
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)')
        .eq('data_checkout', today),
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)')
        .eq('data_checkin', today),
    ])
    setCo(coData||[])
    setCi(ciData||[])
    // Set default lenjerii from CI nr_persoane
    const initLen:Record<string,number> = {}
    ;(ciData||[]).forEach((r:any)=>{
      initLen[r.apartament?.id] = nrLen(Number(r.nr_persoane)||2)
    })
    setLen(initLen)
    setLoading(false)
  }

  // Construieste lista unificata de locatii cu activitate azi
  // Cheia = apartament.id
  const aptMap: Record<string,{apt:any,coRez?:any,ciRez?:any}> = {}
  co.forEach((r:any)=>{
    const id=r.apartament?.id||r.id
    if(!aptMap[id]) aptMap[id]={apt:r.apartament}
    aptMap[id].coRez=r
  })
  ci.forEach((r:any)=>{
    const id=r.apartament?.id||r.id
    if(!aptMap[id]) aptMap[id]={apt:r.apartament}
    aptMap[id].ciRez=r
  })
  const locatii = Object.values(aptMap)

  function waEchipa(){
    const azi = dataAzi
    const linii = locatii.map(({apt,coRez,ciRez})=>{
      const aptStr=(apt?.nota?'['+apt.nota+'] ':'')+apt?.nume
      const l = len[apt?.id] ?? (ciRez?nrLen(Number(ciRez.nr_persoane)||2):1)
      let client=''
      if(coRez&&ciRez) client='CO: '+coRez.nume_client+' → CI: '+ciRez.nume_client
      else if(coRez) client='CO: '+coRez.nume_client
      else if(ciRez) client='CI: '+ciRez.nume_client
      return aptStr+'\n'+client+'\nLenjerii: '+l
    }).join('\n\n')
    const msg='Curatenie '+azi+'\n\n'+linii+'\n\nMultumesc!'
    window.open('https://wa.me/40756942108?text='+encodeURIComponent(msg),'_blank')
  }

  const s = {
    card: {display:'flex',alignItems:'center',gap:12,padding:'13px 14px',background:'rgba(20,35,58,0.6)',border:'0.5px solid rgba(159,215,255,0.1)',borderRadius:10,marginBottom:8} as React.CSSProperties,
    nota: {fontSize:11,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'3px 8px',borderRadius:5,fontFamily:'monospace',flexShrink:0} as React.CSSProperties,
    lenBtn: {width:32,height:32,borderRadius:7,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0} as React.CSSProperties,
  }

  return (
    <>
      <PageHeader title="🧹 Curățenie" subtitle={dataAzi}/>
      <div style={{flex:1,overflowY:'auto',padding:'12px 14px 40px'}}>

        {/* Butoane top */}
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          <button onClick={load} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 16px',borderRadius:9,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(159,215,255,0.7)',fontSize:13,cursor:'pointer',flex:1,justifyContent:'center'}}>
            <RefreshCw size={15}/>Reîncarcă
          </button>
          <button onClick={waEchipa} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 16px',borderRadius:9,border:'0.5px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:13,fontWeight:600,cursor:'pointer',flex:2,justifyContent:'center'}}>
            <MessageCircle size={15}/>Trimite WA echipă ({locatii.length} loc.)
          </button>
        </div>

        {loading&&<div style={{color:'rgba(159,215,255,0.4)',fontSize:14,padding:'30px',textAlign:'center'}}>Se încarcă...</div>}

        {!loading&&locatii.length===0&&(
          <div style={{...s.card,justifyContent:'center',color:'rgba(159,215,255,0.3)',fontSize:13,fontStyle:'italic'}}>
            Nicio activitate programată pentru astăzi
          </div>
        )}

        {!loading&&locatii.map(({apt,coRez,ciRez},idx)=>{
          const aptId = apt?.id||idx
          const lenDef = ciRez ? nrLen(Number(ciRez.nr_persoane)||2) : 1
          const l = len[aptId] ?? lenDef
          const isCOCI = !!(coRez&&ciRez)
          const isCOonly = !!(coRez&&!ciRez)
          const isCIonly = !!(!coRez&&ciRez)
          const borderCol = isCOCI?'rgba(248,113,113,0.3)':isCIonly?'rgba(74,222,128,0.2)':'rgba(252,211,77,0.2)'
          const bgCol = isCOCI?'rgba(248,113,113,0.06)':isCIonly?'rgba(74,222,128,0.05)':'rgba(252,211,77,0.04)'
          const badge = isCOCI?{t:'CO→CI',c:'#F87171',bg:'rgba(248,113,113,0.12)'}:isCIonly?{t:'CI',c:'#4ADE80',bg:'rgba(74,222,128,0.1)'}:{t:'CO',c:'#FCD34D',bg:'rgba(252,211,77,0.1)'}
          return(
            <div key={aptId} style={{...s.card,border:`0.5px solid ${borderCol}`,background:bgCol,flexWrap:'wrap' as const}}>
              {/* Stanga: info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:5,flexWrap:'wrap' as const}}>
                  {apt?.nota&&<span style={s.nota}>{apt.nota}</span>}
                  <span style={{fontSize:14,fontWeight:600,color:'#E8F4FF'}}>{apt?.nume||'—'}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,color:badge.c,background:badge.bg,border:`0.5px solid ${borderCol}`}}>{badge.t}</span>
                </div>
                {apt?.adresa&&<div style={{fontSize:11,color:'rgba(159,215,255,0.35)',marginBottom:4}}>📍 {apt.adresa}</div>}
                {coRez&&<div style={{fontSize:12,color:'#F87171',marginBottom:2}}>↗ iese: {coRez.nume_client}</div>}
                {ciRez&&<div style={{fontSize:12,color:'#4ADE80'}}>↙ intră: {ciRez.nume_client} · {ciRez.nr_persoane||'?'} pers.</div>}
              </div>
              {/* Dreapta: lenjerii */}
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <BedDouble size={14} color="rgba(159,215,255,0.5)"/>
                  <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>lenjerii</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={()=>setLen(v=>({...v,[aptId]:Math.max(1,(v[aptId]??lenDef)-1)}))} style={s.lenBtn}>
                    <Minus size={14}/>
                  </button>
                  <span style={{fontSize:22,fontWeight:700,color:'#FCD34D',minWidth:32,textAlign:'center' as const}}>{l}</span>
                  <button onClick={()=>setLen(v=>({...v,[aptId]:(v[aptId]??lenDef)+1}))} style={s.lenBtn}>
                    <Plus size={14}/>
                  </button>
                </div>
              </div>
            </div>
          )
        })}

      </div>
    </>
  )
}
