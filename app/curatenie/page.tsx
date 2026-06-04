'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { MessageCircle, BedDouble, RefreshCw, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react'

function nrLen(p:number){ return Math.ceil(p/2) }
function nrLenSmart(r:any){
  let p = Number(r.nr_persoane)||0
  // daca nr_persoane e 0 sau 1 (default), estimeaza din valoare_bruta/nr_nopti
  if(p<=1 && r.valoare_bruta && r.nr_nopti){
    const pretNoapte = Number(r.valoare_bruta)/Number(r.nr_nopti)
    // ~100 RON/persoana/noapte estimativ
    p = Math.max(2, Math.round(pretNoapte/100))
  }
  if(p<=1) p=2 // minim 2 persoane ca default
  return nrLen(p)
}

function fmtDate(iso:string){
  const d=new Date(iso+'T12:00:00')
  return d.toLocaleDateString('ro-RO',{weekday:'short',day:'numeric',month:'short'})
}

export default function CuratenePage() {
  const todayIso = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [co, setCo] = useState<any[]>([])
  const [ci, setCi] = useState<any[]>([])
  const [len, setLen] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [staffStatus, setStaffStatus] = useState<Record<string,any>>({})
  const [activeTab, setActiveTab] = useState<'curatenie'|'probleme'>('curatenie')
  const [probleme, setProbleme] = useState<any[]>([])
  const [newProblema, setNewProblema] = useState({apartament_id:'',titlu:'',descriere:'',prioritate:'normal'})
  const [showAddProblema, setShowAddProblema] = useState(false)

  useEffect(()=>{ load(selectedDate) }, [selectedDate])

  // Refresh staff status every 30 seconds
  useEffect(()=>{
    loadStaffStatus()
    loadProbleme()
    const i = setInterval(loadStaffStatus, 30000)
    return ()=>clearInterval(i)
  }, [selectedDate])

  async function loadStaffStatus() {
    const { data } = await supabase.from('curatenie_status').select('*').eq('data', selectedDate)
    const m:Record<string,any>={};(data||[]).forEach((s:any)=>{ m[s.apartament_id]=s });setStaffStatus(m)
  }

  async function loadProbleme() {
    const { data } = await supabase.from('probleme_apartamente')
      .select('*,apartament:apartament_id(nota,nume)')
      .neq('status','rezolvat')
      .order('created_at',{ascending:false})
    setProbleme(data||[])
  }

  async function addProblema() {
    if(!newProblema.apartament_id||!newProblema.titlu) return
    await supabase.from('probleme_apartamente').insert({
      ...newProblema, status:'deschis', created_at: new Date().toISOString()
    })
    setNewProblema({apartament_id:'',titlu:'',descriere:'',prioritate:'normal'})
    setShowAddProblema(false)
    loadProbleme()
  }

  async function updateProblemaStatus(id:string, status:string) {
    await supabase.from('probleme_apartamente').update({status, updated_at:new Date().toISOString()}).eq('id',id)
    loadProbleme()
  }

  async function load(date:string){
    setLoading(true)
    setLen({})
    const [{data:coData},{data:ciData}] = await Promise.all([
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,nr_nopti,valoare_bruta,apartament:apartamente!inner(id,nume,nota,adresa,status)')
        .eq('data_checkout', date)
        .eq('apartament.status', 'activ')
        .neq('status_rezervare', 'anulata'),
      supabase.from('rezervari')
        .select('id,nume_client,nr_persoane,nr_nopti,valoare_bruta,apartament:apartamente!inner(id,nume,nota,adresa,status)')
        .eq('data_checkin', date)
        .eq('apartament.status', 'activ')
        .neq('status_rezervare', 'anulata'),
    ])
    setCo(coData||[])
    setCi(ciData||[])
    // init lenjerii din CI
    const init:Record<string,number>={}
    ;(ciData||[]).forEach((r:any)=>{ init[r.apartament?.id]=nrLenSmart(r) })
    setLen(init)
    setLoading(false)
  }

  function changeDate(days:number){
    const d=new Date(selectedDate+'T12:00:00')
    d.setDate(d.getDate()+days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // Locatii unificate
  const aptMap:Record<string,{apt:any,coRez?:any,ciRez?:any}>={}
  co.forEach((r:any)=>{ const id=r.apartament?.id||r.id; if(!aptMap[id]) aptMap[id]={apt:r.apartament}; aptMap[id].coRez=r })
  ci.forEach((r:any)=>{ const id=r.apartament?.id||r.id; if(!aptMap[id]) aptMap[id]={apt:r.apartament}; aptMap[id].ciRez=r })
  const locatii=Object.values(aptMap)

  function waEchipa(){
    const linii=locatii.map(({apt,ciRez})=>{
      const l=len[apt?.id]??(ciRez?nrLenSmart(ciRez):1)
      const aptStr=(apt?.nota?apt.nota+' - ':'')+apt?.nume
      const ciStr=ciRez?` | CI: ${ciRez.nume_client} (${ciRez.nr_persoane||'?'} pers)`:''
      return `${aptStr}${ciStr} → ${l} lenjerii`
    }).join('\n')
    const msg=`Curatenie ${fmtDate(selectedDate)}\n\n${linii}\n\nMultumesc!`
    window.open('https://wa.me/40756942108?text='+encodeURIComponent(msg),'_blank')
  }

  const isToday=selectedDate===todayIso
  const isTomorrow=selectedDate===new Date(Date.now()+86400000).toISOString().split('T')[0]

  const s={
    card:{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',background:'rgba(20,35,58,0.6)',borderRadius:10,marginBottom:8,flexWrap:'wrap' as const} as React.CSSProperties,
    lenBtn:{width:34,height:34,borderRadius:8,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0} as React.CSSProperties,
  }

  return (
    <>
      <PageHeader title="🧹 Curățenie"/>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid rgba(100,160,255,0.1)',background:'rgba(8,15,30,0.8)'}}>
        {[{k:'curatenie',l:'🧹 Curățenie'},{k:'probleme',l:'🔧 Probleme & Reparații'}].map(t=>(
          <button key={t.k} onClick={()=>{ setActiveTab(t.k as any); if(t.k==='probleme') loadProbleme() }}
            style={{flex:1,padding:'11px 8px',border:'none',background:'transparent',color:activeTab===t.k?'#7BC8FF':'rgba(159,215,255,0.4)',fontSize:13,fontWeight:600,cursor:'pointer',borderBottom:`2px solid ${activeTab===t.k?'#7BC8FF':'transparent'}`,transition:'all .15s'}}>
            {t.l}
          </button>
        ))}
      </div>

      {activeTab==='curatenie'&&<div style={{flex:1,overflowY:'auto',padding:'12px 14px 40px'}}>

        {/* Selector data */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,background:'rgba(20,35,58,0.6)',border:'0.5px solid rgba(159,215,255,0.1)',borderRadius:10,padding:'10px 14px'}}>
          <button onClick={()=>changeDate(-1)} style={{...s.lenBtn,width:36,height:36}}>
            <ChevronLeft size={16}/>
          </button>
          <div style={{flex:1,textAlign:'center' as const}}>
            <div style={{fontSize:15,fontWeight:600,color:'#E8F4FF'}}>{fmtDate(selectedDate)}</div>
            <div style={{fontSize:11,color:isToday?'#4ADE80':isTomorrow?'#FCD34D':'rgba(159,215,255,0.4)',marginTop:1}}>
              {isToday?'Astăzi':isTomorrow?'Mâine':selectedDate}
            </div>
          </div>
          <button onClick={()=>changeDate(1)} style={{...s.lenBtn,width:36,height:36}}>
            <ChevronRight size={16}/>
          </button>
          <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
            style={{background:'rgba(77,163,255,0.08)',border:'0.5px solid rgba(77,163,255,0.2)',borderRadius:7,color:'#7BC8FF',fontSize:13,padding:'6px 8px',cursor:'pointer'}}/>
        </div>

        {/* Butoane actiuni */}
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <button onClick={()=>setSelectedDate(todayIso)} style={{flex:1,padding:'10px',borderRadius:9,border:`0.5px solid ${isToday?'rgba(74,222,128,0.4)':'rgba(159,215,255,0.15)'}`,background:isToday?'rgba(74,222,128,0.1)':'transparent',color:isToday?'#4ADE80':'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer',fontWeight:isToday?600:400}}>
            Azi
          </button>
          <button onClick={()=>changeDate(1)} style={{flex:1,padding:'10px',borderRadius:9,border:`0.5px solid ${isTomorrow?'rgba(252,211,77,0.4)':'rgba(159,215,255,0.15)'}`,background:isTomorrow?'rgba(252,211,77,0.08)':'transparent',color:isTomorrow?'#FCD34D':'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer',fontWeight:isTomorrow?600:400}}>
            Mâine
          </button>
          <button onClick={waEchipa} disabled={locatii.length===0} style={{flex:2,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px',borderRadius:9,border:'0.5px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:13,fontWeight:600,cursor:'pointer',opacity:locatii.length===0?0.4:1}}>
            <MessageCircle size={15}/>WA echipă
          </button>
        </div>

        {loading&&<div style={{color:'rgba(159,215,255,0.4)',fontSize:14,padding:'30px',textAlign:'center'}}>Se încarcă...</div>}

        {!loading&&locatii.length===0&&(
          <div style={{...s.card,justifyContent:'center',border:'0.5px solid rgba(159,215,255,0.08)'}}>
            <span style={{color:'rgba(159,215,255,0.3)',fontSize:13,fontStyle:'italic'}}>Nicio activitate pentru {fmtDate(selectedDate)}</span>
          </div>
        )}

        {!loading&&locatii.map(({apt,coRez,ciRez},idx)=>{
          const aptId=apt?.id||String(idx)
          const lenDef=ciRez?nrLenSmart(ciRez):1
          const l=len[aptId]??lenDef
          const isCOCI=!!(coRez&&ciRez), isCIonly=!!(!coRez&&ciRez)
          const col=isCOCI?'#F87171':isCIonly?'#4ADE80':'#FCD34D'
          const badge=isCOCI?'CO→CI':isCIonly?'CI':'CO'
          return(
            <div key={aptId} style={{...s.card,border:`0.5px solid ${col}25`,background:`${col}05`}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:4,flexWrap:'wrap' as const}}>
                  {apt?.nota&&<span style={{fontSize:11,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'2px 8px',borderRadius:4,fontFamily:'monospace'}}>{apt.nota}</span>}
                  {apt?.id&&staffStatus[apt.id]&&(
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:5,fontWeight:600,
                      background:staffStatus[apt.id].status==='gata'?'rgba(74,222,128,0.15)':'rgba(251,146,60,0.15)',
                      border:`1px solid ${staffStatus[apt.id].status==='gata'?'rgba(74,222,128,0.3)':'rgba(251,146,60,0.3)'}`,
                      color:staffStatus[apt.id].status==='gata'?'#4ADE80':'#FB923C'}}>
                      {staffStatus[apt.id].status==='gata'?`✅ Gata ${staffStatus[apt.id].ora_gata||''}`:staffStatus[apt.id].status==='inceput'?`🧹 început ${staffStatus[apt.id].ora_inceput||''}`:'' }
                    </span>
                  )}
                  <span style={{fontSize:14,fontWeight:600,color:'#E8F4FF'}}>{apt?.nume||'—'}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,color:col,background:`${col}15`,border:`0.5px solid ${col}40`}}>{badge}</span>
                </div>
                {ciRez&&(
                  <div>
                    <div style={{fontSize:12,color:'#4ADE80',marginBottom:2}}>
                      ↙ Check-in: <span style={{fontWeight:600}}>{ciRez.nume_client}</span>
                    </div>
                    {(()=>{
                      const pers = Number(ciRez.nr_persoane)||2
                      const lenNecesar = Math.ceil(pers/2)
                      const lenStandard = 1
                      const extra = lenNecesar - lenStandard
                      return extra > 0 ? (
                        <div style={{fontSize:11,padding:'4px 9px',borderRadius:6,background:'rgba(252,211,77,0.12)',border:'1px solid rgba(252,211,77,0.25)',color:'#FCD34D',fontWeight:600,display:'inline-block',marginTop:2}}>
                          🛏 Necesită {extra} {extra===1?'lenjerie':'lenjerii'} în plus ({pers} persoane)
                        </div>
                      ) : (
                        <div style={{fontSize:11,color:'rgba(74,222,128,0.6)',marginTop:2}}>✓ Lenjerie standard ok ({pers} pers.)</div>
                      )
                    })()}
                  </div>
                )}
                {!ciRez&&coRez&&<div style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>Eliberare — fără check-in azi</div>}
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <BedDouble size={13} color="rgba(159,215,255,0.4)"/>
                  <span style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>lenjerii</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button onClick={()=>setLen(v=>({...v,[aptId]:Math.max(1,(v[aptId]??lenDef)-1)}))} style={s.lenBtn}><Minus size={14}/></button>
                  <span style={{fontSize:24,fontWeight:700,color:'#FCD34D',minWidth:32,textAlign:'center' as const}}>{l}</span>
                  <button onClick={()=>setLen(v=>({...v,[aptId]:(v[aptId]??lenDef)+1}))} style={s.lenBtn}><Plus size={14}/></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>}

      {/* ── TAB PROBLEME ── */}
      {activeTab==='probleme'&&<div style={{flex:1,overflowY:'auto',padding:'14px 16px 40px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontSize:13,color:'rgba(159,215,255,0.5)'}}>{probleme.length} probleme deschise</div>
          <button onClick={()=>setShowAddProblema(true)}
            style={{padding:'7px 14px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.2)',color:'#7BC8FF',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Adaugă problemă
          </button>
        </div>

        {showAddProblema&&(
          <div style={{background:'rgba(11,22,42,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:14,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',marginBottom:12}}>🔧 Problemă nouă</div>
            <select value={newProblema.apartament_id} onChange={e=>setNewProblema(p=>({...p,apartament_id:e.target.value}))}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8}}>
              <option value="">— Selectează apartament —</option>
              {coItems.map(({apt}:any)=>apt&&<option key={apt.id} value={apt.id}>[{apt.nota}] {apt.nume}</option>)}
            </select>
            <input value={newProblema.titlu} onChange={e=>setNewProblema(p=>({...p,titlu:e.target.value}))}
              placeholder="Titlu problemă (ex: Robinet defect)"
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8,boxSizing:'border-box' as const}}/>
            <textarea value={newProblema.descriere} onChange={e=>setNewProblema(p=>({...p,descriere:e.target.value}))}
              placeholder="Descriere detaliată..." rows={2}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8,resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const}}/>
            <select value={newProblema.prioritate} onChange={e=>setNewProblema(p=>({...p,prioritate:e.target.value}))}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:10}}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critic">Critic</option>
            </select>
            <div style={{display:'flex',gap:8}}>
              <button onClick={addProblema} style={{flex:1,padding:'9px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.8)',color:'#0E1B2B',fontWeight:700,cursor:'pointer',fontSize:13}}>Salvează</button>
              <button onClick={()=>setShowAddProblema(false)} style={{padding:'9px 14px',borderRadius:9,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',cursor:'pointer',fontSize:13}}>Anulează</button>
            </div>
          </div>
        )}

        {probleme.length===0&&<div style={{textAlign:'center',padding:40,color:'rgba(159,215,255,0.3)',fontSize:13}}>✓ Nicio problemă deschisă</div>}

        {probleme.map(p=>{
          const prioColor = p.prioritate==='critic'?'#F87171':p.prioritate==='urgent'?'#FB923C':'#7BC8FF'
          return(
            <div key={p.id} style={{background:'rgba(11,22,42,0.6)',border:`1px solid ${prioColor}22`,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:`${prioColor}18`,color:prioColor,fontWeight:700,textTransform:'uppercase' as const}}>{p.prioritate}</span>
                    <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>[{p.apartament?.nota}] {p.apartament?.nume}</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'#E8F4FF'}}>{p.titlu}</div>
                  {p.descriere&&<div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:3}}>{p.descriere}</div>}
                </div>
              </div>
              <div style={{display:'flex',gap:6}}>
                {['deschis','in_lucru','rezolvat'].map(st=>(
                  <button key={st} onClick={()=>updateProblemaStatus(p.id,st)}
                    style={{flex:1,padding:'7px',borderRadius:8,border:`1px solid ${p.status===st?prioColor+'60':'rgba(159,215,255,0.1)'}`,background:p.status===st?`${prioColor}15`:'transparent',color:p.status===st?prioColor:'rgba(159,215,255,0.4)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    {st==='deschis'?'🔴 Deschis':st==='in_lucru'?'🟡 Lucru':'✅ Gata'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>}

      <Toast toast={toast}/>
    </>
  )
}
