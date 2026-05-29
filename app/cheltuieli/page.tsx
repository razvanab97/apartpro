'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Modal, FormGroup, FormRow, Toast, useToast } from '@/components/ui'
import { Plus, Pencil, X, Check, Trash2 } from 'lucide-react'

/* ─── date fixe din CSV ─────────────────────────────────────────────────── */
const UTIL_COLS = [
  { key:'chirie',     label:'Chirie',      due:1  },
  { key:'asociatie',  label:'Asociație',   due:15 },
  { key:'eon_curent', label:'E.ON Curent', due:20 },
  { key:'eon_gaz',    label:'E.ON Gaz',    due:20 },
  { key:'internet',   label:'Internet',    due:10 },
  { key:'salubris',   label:'Salubris',    due:5  },
]
const UTIL_KEYS = UTIL_COLS.map(c=>c.key)

const FISCAL_ROWS = [
  { key:'tva_intracomunitar', label:'TVA Intracomunitar',  due:25 },
  { key:'impozit_profit',     label:'Impozit pe profit',   due:25 },
  { key:'taxa_proprietati',   label:'Taxă pe proprietăți', due:31 },
]

const AB_CODES = ['L99','EX59','GS08','HD02','L83','N32','NT9','L94','L88','CG40','C64','N33','VM07']

// valori implicite — mapare dupa COD sau NUME (ambele)
const DEF: Record<string,Record<string,number>> = {
  // cod
  'L99': {chirie:2000,internet:50},
  'EX59':{chirie:1500,internet:45},
  'L88': {chirie:2800,internet:50},
  'L94': {chirie:2800,internet:50},
  'C64': {chirie:2300,internet:25},
  'VM07':{chirie:2000},
  'N32': {chirie:3080,internet:25},
  'N33': {chirie:3080},
  'GS08':{chirie:2250,internet:70},
  'HD02':{chirie:2500},
  'L83': {chirie:2000},
  'NT9': {chirie:3050,internet:65},
  'CG40':{chirie:0},
  // nume
  'Airy Palas':       {chirie:2000,internet:50},
  'Cozy Studio':      {chirie:1500,internet:45},
  'Palas SkyNest':    {chirie:2800,internet:50},
  'Palas Retreat':    {chirie:2800,internet:50},
  'SkyPort':          {chirie:2300,internet:25},
  'Vila Păcurari':    {chirie:2000},
  'Mint Loft Copou':  {chirie:3080,internet:25},
  'Urban Oasis':      {chirie:3080},
  'Green Station':    {chirie:2250,internet:70},
  'Hideout Rozelor':  {chirie:2500},
  'Lazar Comfy':      {chirie:2000},
  'Newton Urban':     {chirie:3050,internet:65},
  'Peaceful Copou Retreat':{chirie:0},
  // extra fara cod
  'R99':   {chirie:2500,internet:45},
  'Canta': {chirie:1400,internet:25},
  'Mircea':{chirie:1400,internet:25,salubris:83},
}

function getDef(apt:any){ return DEF[apt.nota]||DEF[apt.nume]||null }

const pad=(n:number)=>String(n).padStart(2,'0')
const LUNI=['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

/* ─── componenta principala ─────────────────────────────────────────────── */
export default function CheltuieliPage(){
  const now=new Date()
  const luna=now.getMonth()+1
  const an=now.getFullYear()

  const [loading,setLoading]=useState(true)
  const [seeding,setSeeding]=useState(false)
  const [apts,setApts]=useState<any[]>([])
  const [util,setUtil]=useState<Record<string,Record<string,any>>>({})
  const [consumabile,setCons]=useState<any[]>([])
  const [contab,setContab]=useState<any[]>([])
  const [fiscal,setFiscal]=useState<Record<string,any>>({})
  const [toggling,setToggling]=useState<string|null>(null)

  // edit inline
  const [editCell,setEditCell]=useState<{aptId:string;col:string}|null>(null)
  const [editVal,setEditVal]=useState('')
  const cellRef=useRef<HTMLInputElement>(null)
  const [editFisc,setEditFisc]=useState<string|null>(null)
  const [editFiscVal,setEditFiscVal]=useState('')
  const fiscRef=useRef<HTMLInputElement>(null)
  const [saving,setSaving]=useState(false)

  // modals
  const [modalCons,setModalCons]=useState(false)
  const [modalContab,setModalContab]=useState(false)
  const [fCons,setFCons]=useState({descriere:'',furnizor:'',valoare:'',data:''})
  const [fContab,setFContab]=useState({descriere:'',furnizor:'',valoare:'',data:''})

  const {toast,show}=useToast()

  useEffect(()=>{load()},[])
  useEffect(()=>{if(editCell)setTimeout(()=>cellRef.current?.focus(),50)},[editCell])
  useEffect(()=>{if(editFisc)setTimeout(()=>fiscRef.current?.focus(),50)},[editFisc])

  async function load(){
    setLoading(true)
    const [{data:aptData},{data:chData}]=await Promise.all([
      supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nume'),
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,descriere,valoare,status,data,nota')
        .gte('data',`${an}-${pad(luna)}-01`)
        .lte('data',`${an}-${pad(luna)}-31`),
    ])
    setApts(aptData||[])
    const u:Record<string,Record<string,any>>={},cons:any[]=[],cont:any[]=[],fisc:Record<string,any>={}
    ;(chData||[]).forEach((c:any)=>{
      if(UTIL_KEYS.includes(c.categorie)&&c.apartament_id){
        if(!u[c.apartament_id])u[c.apartament_id]={}
        u[c.apartament_id][c.categorie]=c
      } else if(c.categorie==='consumabile') cons.push(c)
      else if(c.categorie==='contabilitate') cont.push(c)
      else if(FISCAL_ROWS.find(f=>f.key===c.categorie)) fisc[c.categorie]=c
    })
    setUtil(u);setCons(cons);setContab(cont);setFiscal(fisc)
    setLoading(false)
  }

  async function seedDefaults(){
    setSeeding(true)
    const ins:any[]=[]
    ;(apts||[]).forEach(apt=>{
      const defs=getDef(apt)
      if(!defs)return
      UTIL_COLS.forEach(col=>{
        const v=defs[col.key]
        if(!v||v===0)return
        if(util[apt.id]?.[col.key])return
        ins.push({apartament_id:apt.id,categorie:col.key,descriere:col.label,valoare:v,
          data:`${an}-${pad(luna)}-${pad(col.due)}`,status:'nevalidat',suportat_de:'proprietar',tva:0})
      })
    })
    if(!ins.length){show('info','Toate valorile există deja');setSeeding(false);return}
    const {error}=await supabase.from('cheltuieli').insert(ins)
    if(error)show('error',error.message)
    else{show('success',`${ins.length} valori importate`);await load()}
    setSeeding(false)
  }

  async function toggleUtil(aptId:string,col:string){
    const item=util[aptId]?.[col]
    if(!item){show('error','Introdu mai întâi valoarea');return}
    const tid=aptId+col
    setToggling(tid)
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setUtil(u=>({...u,[aptId]:{...u[aptId],[col]:{...item,status:ns}}}))
    setToggling(null)
  }

  async function commitCell(){
    if(!editCell)return
    const {aptId,col}=editCell
    const val=parseFloat(editVal)||0
    const colDef=UTIL_COLS.find(c=>c.key===col)!
    const dateStr=`${an}-${pad(luna)}-${pad(colDef.due)}`
    const existing=util[aptId]?.[col]
    setSaving(true)
    if(existing){
      await supabase.from('cheltuieli').update({valoare:val,data:dateStr}).eq('id',existing.id)
      setUtil(u=>({...u,[aptId]:{...u[aptId],[col]:{...existing,valoare:val}}}))
    } else {
      const {data,error}=await supabase.from('cheltuieli').insert({
        apartament_id:aptId,categorie:col,descriere:colDef.label,valoare:val,
        data:dateStr,status:'nevalidat',suportat_de:'proprietar',tva:0,
      }).select().single()
      if(!error&&data)setUtil(u=>({...u,[aptId]:{...(u[aptId]||{}),[col]:data}}))
    }
    setSaving(false);setEditCell(null);setEditVal('')
  }

  async function toggleFlat(item:any,setter:React.Dispatch<React.SetStateAction<any[]>>){
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setter((l:any[])=>l.map(i=>i.id===item.id?{...i,status:ns}:i))
  }
  async function deleteFlat(item:any,setter:React.Dispatch<React.SetStateAction<any[]>>){
    await supabase.from('cheltuieli').delete().eq('id',item.id)
    setter((l:any[])=>l.filter(i=>i.id!==item.id))
  }

  async function saveCons(){
    if(!fCons.descriere||!fCons.valoare){show('error','Completează descrierea și valoarea');return}
    setSaving(true)
    const {data,error}=await supabase.from('cheltuieli').insert({
      apartament_id:null,categorie:'consumabile',descriere:fCons.descriere,
      valoare:parseFloat(fCons.valoare)||0,data:fCons.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat',suportat_de:'administrator',tva:0,nota:fCons.furnizor||null,
    }).select().single()
    if(error)show('error',error.message)
    else{setCons(c=>[...c,data]);show('success','Adăugat');setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}
    setSaving(false)
  }
  async function saveContab(){
    if(!fContab.descriere||!fContab.valoare){show('error','Completează descrierea și valoarea');return}
    setSaving(true)
    const {data,error}=await supabase.from('cheltuieli').insert({
      apartament_id:null,categorie:'contabilitate',descriere:fContab.descriere,
      valoare:parseFloat(fContab.valoare)||0,data:fContab.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat',suportat_de:'administrator',tva:0,nota:fContab.furnizor||null,
    }).select().single()
    if(error)show('error',error.message)
    else{setContab(c=>[...c,data]);show('success','Adăugat');setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}
    setSaving(false)
  }

  async function commitFisc(){
    if(!editFisc)return
    const val=parseFloat(editFiscVal)||0
    const ft=FISCAL_ROWS.find(f=>f.key===editFisc)!
    const existing=fiscal[editFisc]
    setSaving(true)
    if(existing){
      await supabase.from('cheltuieli').update({valoare:val}).eq('id',existing.id)
      setFiscal(f=>({...f,[editFisc]:{...existing,valoare:val}}))
    } else {
      const {data,error}=await supabase.from('cheltuieli').insert({
        apartament_id:null,categorie:editFisc,descriere:ft.label,valoare:val,
        data:`${an}-${pad(luna)}-${pad(ft.due)}`,status:'nevalidat',suportat_de:'administrator',tva:0,
      }).select().single()
      if(!error&&data)setFiscal(f=>({...f,[editFisc]:data}))
    }
    setSaving(false);setEditFisc(null);setEditFiscVal('')
  }
  async function toggleFisc(key:string){
    const item=fiscal[key]
    if(!item){show('error','Introdu mai întâi valoarea');return}
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setFiscal(f=>({...f,[key]:{...item,status:ns}}))
  }

  /* ─── calcule ─────────────────────────────────────────────────────────── */
  const rowTotal=(id:string)=>UTIL_COLS.reduce((s,c)=>s+Number(util[id]?.[c.key]?.valoare||0),0)
  const rowPaid =(id:string)=>UTIL_COLS.reduce((s,c)=>{const it=util[id]?.[c.key];return s+(it?.status==='validat'?Number(it.valoare):0)},0)

  const abApts   =apts.filter(a=>AB_CODES.includes(a.nota))
  const extraApts=apts.filter(a=>!AB_CODES.includes(a.nota))

  /* ─── progress bar global ─────────────────────────────────────────────── */
  const allItems=[
    ...apts.flatMap(a=>UTIL_COLS.map(c=>util[a.id]?.[c.key]).filter(Boolean)),
    ...consumabile,...contab,
    ...FISCAL_ROWS.map(f=>fiscal[f.key]).filter(Boolean),
  ]
  const totalVal =allItems.reduce((s,i)=>s+Number(i.valoare),0)
  const paidVal  =allItems.filter(i=>i.status==='validat').reduce((s,i)=>s+Number(i.valoare),0)
  const paidCount=allItems.filter(i=>i.status==='validat').length
  const pct      =totalVal>0?Math.round(paidVal/totalVal*100):0

  /* ─── pill component ──────────────────────────────────────────────────── */
  function Pill({aptId,col}:{aptId:string;col:typeof UTIL_COLS[0]}){
    const item  =util[aptId]?.[col.key]
    const isPaid=item?.status==='validat'
    const val   =item?Number(item.valoare):0
    const isEdit=editCell?.aptId===aptId&&editCell?.col===col.key
    const isBusy=toggling===aptId+col.key

    return (
      <div style={{
        display:'flex',alignItems:'stretch',
        border:`1px solid ${isPaid?'rgba(74,222,128,0.35)':'rgba(159,215,255,0.1)'}`,
        borderRadius:12,
        background:isPaid?'rgba(74,222,128,0.08)':'rgba(214,228,244,0.05)',
        transition:'all .2s',
        overflow:'hidden',
        flexShrink:0,
      }}>
        {/* info */}
        <div style={{padding:'10px 12px',lineHeight:1.3}}>
          <div style={{fontSize:11,color:isPaid?'rgba(74,222,128,0.7)':'rgba(159,215,255,0.5)',marginBottom:2}}>{col.label}</div>
          {isEdit?(
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:2}}>
              <input ref={cellRef} type="number" value={editVal}
                onChange={e=>setEditVal(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')commitCell();if(e.key==='Escape'){setEditCell(null);setEditVal('')}}}
                style={{background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.5)',borderRadius:5,color:'#fff',fontSize:13,padding:'2px 6px',width:80,outline:'none'}}
                min={0}/>
              <button onClick={commitCell} disabled={saving} style={{background:'none',border:'none',cursor:'pointer',color:'#4ADE80',padding:2,display:'flex'}}><Check size={13}/></button>
              <button onClick={()=>{setEditCell(null);setEditVal('')}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',padding:2,display:'flex'}}><X size={13}/></button>
            </div>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:15,fontWeight:600,color:isPaid?'#4ADE80':'var(--text)',letterSpacing:-.3}}>
                {val>0?val.toLocaleString('ro-RO'):'—'} <span style={{fontSize:11,fontWeight:400}}>RON</span>
              </span>
              <button onClick={()=>{setEditVal(val>0?String(val):'');setEditCell({aptId,col:col.key})}}
                style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.3)',padding:'1px 3px',display:'flex',borderRadius:4,flexShrink:0}}>
                <Pencil size={10}/>
              </button>
            </div>
          )}
          <div style={{fontSize:10,color:isPaid?'rgba(74,222,128,0.5)':'rgba(159,215,255,0.3)',marginTop:1}}>scad. {pad(col.due)}/{pad(luna)}</div>
        </div>
        {/* toggle buton */}
        <button
          onClick={()=>toggleUtil(aptId,col.key)}
          disabled={isBusy||!item}
          title={isPaid?'Marchează neplătit':'Marchează plătit'}
          style={{
            width:40,display:'flex',alignItems:'center',justifyContent:'center',
            background:isPaid?'rgba(74,222,128,0.12)':'rgba(159,215,255,0.04)',
            borderTop:'none',borderRight:'none',borderBottom:'none',
            borderLeft:`1px solid ${isPaid?'rgba(74,222,128,0.25)':'rgba(159,215,255,0.08)'}`,
            cursor:item?'pointer':'not-allowed',
            transition:'all .2s',
            flexShrink:0,
          }}>
          <div style={{
            width:22,height:22,borderRadius:'50%',
            border:`2px solid ${isPaid?'#4ADE80':'rgba(159,215,255,0.25)'}`,
            background:isPaid?'#4ADE80':'transparent',
            display:'flex',alignItems:'center',justifyContent:'center',
            transition:'all .2s',
            opacity:isBusy?0.5:1,
          }}>
            {isPaid&&<Check size={12} color="#0E1B2B" strokeWidth={3}/>}
          </div>
        </button>
      </div>
    )
  }

  /* ─── render apartament ───────────────────────────────────────────────── */
  function AptRow({apt,last}:{apt:any;last:boolean}){
    const total  =rowTotal(apt.id)
    const paid   =rowPaid(apt.id)
    const rest   =total-paid
    const allPaid=total>0&&rest===0

    return(
      <div style={{paddingBottom:20,marginBottom:20,borderBottom:last?'none':'1px solid rgba(159,215,255,0.07)'}}>
        {/* header */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
          {apt.nota&&<span style={{fontSize:12,fontWeight:500,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'2px 9px',borderRadius:6}}>{apt.nota}</span>}
          <span style={{fontSize:15,fontWeight:500,color:'var(--text)'}}>{apt.nume}</span>
          <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:4}}>
            <span style={{color:'rgba(159,215,255,0.2)'}}>·</span>
            <span style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>{total.toLocaleString('ro-RO')} RON</span>
            {paid>0&&<><span style={{color:'rgba(159,215,255,0.2)'}}>·</span><span style={{fontSize:12,color:'#4ADE80'}}>{paid.toLocaleString('ro-RO')} plătit</span></>}
            {rest>0&&<><span style={{color:'rgba(159,215,255,0.2)'}}>·</span><span style={{fontSize:12,color:'#F87171'}}>{rest.toLocaleString('ro-RO')} rest</span></>}
            {allPaid&&<><span style={{color:'rgba(159,215,255,0.2)'}}>·</span><span style={{fontSize:12,color:'#4ADE80'}}>✓ achitat integral</span></>}
          </div>
        </div>
        {/* pills */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {UTIL_COLS.map(col=><Pill key={col.key} aptId={apt.id} col={col}/>)}
        </div>
      </div>
    )
  }

  /* ─── sectiune plata flat (consumabile/contab) ────────────────────────── */
  function FlatPill({item,setter}:{item:any;setter:React.Dispatch<React.SetStateAction<any[]>>}){
    const isPaid=item.status==='validat'
    return(
      <div style={{display:'flex',alignItems:'stretch',border:`1px solid ${isPaid?'rgba(74,222,128,0.35)':'rgba(159,215,255,0.1)'}`,borderRadius:12,background:isPaid?'rgba(74,222,128,0.08)':'rgba(214,228,244,0.05)',overflow:'hidden',flexShrink:0,transition:'all .2s'}}>
        <div style={{padding:'10px 12px',lineHeight:1.3}}>
          <div style={{fontSize:11,color:isPaid?'rgba(74,222,128,0.7)':'rgba(159,215,255,0.5)',marginBottom:2,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.descriere}</div>
          {item.nota&&<div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginBottom:2}}>{item.nota}</div>}
          <div style={{fontSize:15,fontWeight:600,color:isPaid?'#4ADE80':'var(--text)',letterSpacing:-.3}}>
            {Number(item.valoare).toLocaleString('ro-RO')} <span style={{fontSize:11,fontWeight:400}}>RON</span>
          </div>
          <div style={{fontSize:10,color:'rgba(159,215,255,0.3)',marginTop:1}}>{item.data||'—'}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'0 10px',borderLeft:`1px solid ${isPaid?'rgba(74,222,128,0.25)':'rgba(159,215,255,0.08)'}`,background:isPaid?'rgba(74,222,128,0.08)':'transparent'}}>
          <button onClick={()=>toggleFlat(item,setter)} title={isPaid?'Neplătit':'Plătit'}
            style={{background:'none',border:'none',cursor:'pointer',padding:2,display:'flex'}}>
            <div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${isPaid?'#4ADE80':'rgba(159,215,255,0.25)'}`,background:isPaid?'#4ADE80':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
              {isPaid&&<Check size={12} color="#0E1B2B" strokeWidth={3}/>}
            </div>
          </button>
          <button onClick={()=>deleteFlat(item,setter)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(248,113,113,0.4)',padding:2,display:'flex'}}><Trash2 size={11}/></button>
        </div>
      </div>
    )
  }

  /* ─── fiscal pill ─────────────────────────────────────────────────────── */
  function FiscalPill({ft}:{ft:typeof FISCAL_ROWS[0]}){
    const item  =fiscal[ft.key]
    const isPaid=item?.status==='validat'
    const val   =item?Number(item.valoare):0
    const isEdit=editFisc===ft.key
    return(
      <div style={{display:'flex',alignItems:'stretch',border:`1px solid ${isPaid?'rgba(74,222,128,0.35)':'rgba(159,215,255,0.1)'}`,borderRadius:12,background:isPaid?'rgba(74,222,128,0.08)':'rgba(214,228,244,0.05)',overflow:'hidden',flexShrink:0,transition:'all .2s'}}>
        <div style={{padding:'10px 12px',lineHeight:1.3}}>
          <div style={{fontSize:11,color:isPaid?'rgba(74,222,128,0.7)':'rgba(159,215,255,0.5)',marginBottom:2}}>{ft.label}</div>
          {isEdit?(
            <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:2}}>
              <input ref={fiscRef} type="number" value={editFiscVal}
                onChange={e=>setEditFiscVal(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')commitFisc();if(e.key==='Escape'){setEditFisc(null);setEditFiscVal('')}}}
                style={{background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.5)',borderRadius:5,color:'#fff',fontSize:13,padding:'2px 6px',width:80,outline:'none'}}
                min={0}/>
              <button onClick={commitFisc} style={{background:'none',border:'none',cursor:'pointer',color:'#4ADE80',padding:2,display:'flex'}}><Check size={13}/></button>
              <button onClick={()=>{setEditFisc(null);setEditFiscVal('')}} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',padding:2,display:'flex'}}><X size={13}/></button>
            </div>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:15,fontWeight:600,color:isPaid?'#4ADE80':'var(--text)',letterSpacing:-.3}}>
                {val>0?val.toLocaleString('ro-RO'):'—'} <span style={{fontSize:11,fontWeight:400}}>RON</span>
              </span>
              <button onClick={()=>{setEditFiscVal(val>0?String(val):'');setEditFisc(ft.key)}}
                style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.3)',padding:'1px 3px',display:'flex',borderRadius:4}}>
                <Pencil size={10}/>
              </button>
            </div>
          )}
          <div style={{fontSize:10,color:'rgba(159,215,255,0.3)',marginTop:1}}>scad. {ft.due} {LUNI[luna]}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'0 12px',borderLeft:`1px solid ${isPaid?'rgba(74,222,128,0.25)':'rgba(159,215,255,0.08)'}`,background:isPaid?'rgba(74,222,128,0.08)':'transparent'}}>
          <button onClick={()=>toggleFisc(ft.key)} disabled={!item}
            style={{background:'none',border:'none',cursor:item?'pointer':'not-allowed',padding:2,display:'flex'}}>
            <div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${isPaid?'#4ADE80':'rgba(159,215,255,0.25)'}`,background:isPaid?'#4ADE80':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .2s'}}>
              {isPaid&&<Check size={12} color="#0E1B2B" strokeWidth={3}/>}
            </div>
          </button>
        </div>
      </div>
    )
  }

  const secLabel={fontSize:11,fontWeight:500,color:'rgba(159,215,255,0.4)',letterSpacing:'.08em',textTransform:'uppercase' as const}

  return(
    <>
      <PageHeader title="Cheltuieli & Utilități" subtitle={`${LUNI[luna]} ${an}`}
        actions={
          <button onClick={seedDefaults} disabled={seeding||loading} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:500,border:'1px solid rgba(77,163,255,0.3)',background:'rgba(77,163,255,0.08)',color:'var(--accent-blue)',cursor:'pointer',opacity:seeding?0.6:1}}>
            <Plus size={13}/>{seeding?'Se importă...':'Import valori fixe'}
          </button>
        }
      />

      {/* ── progress bar global ── */}
      <div style={{padding:'0 24px 20px'}}>
        <div style={{background:'rgba(214,228,244,0.04)',border:'1px solid rgba(159,215,255,0.09)',borderRadius:14,padding:'16px 20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>Progres plăți {LUNI[luna]}</span>
              <span style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>{paidCount} / {allItems.length} plăți</span>
            </div>
            <div style={{display:'flex',alignItems:'baseline',gap:4}}>
              <span style={{fontSize:22,fontWeight:600,color:pct===100?'#4ADE80':pct>50?'var(--accent-blue)':'var(--text)'}}>{pct}%</span>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>achitat</span>
            </div>
          </div>
          {/* bara */}
          <div style={{height:10,background:'rgba(159,215,255,0.08)',borderRadius:999,overflow:'hidden',position:'relative'}}>
            <div style={{
              position:'absolute',left:0,top:0,height:'100%',
              width:`${pct}%`,
              background:pct===100?'#4ADE80':pct>50?'var(--accent-blue)':'#FCD34D',
              borderRadius:999,
              transition:'width .4s cubic-bezier(.4,0,.2,1)',
            }}/>
          </div>
          {/* sume */}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
            <span style={{fontSize:11,color:'#4ADE80'}}>{paidVal.toLocaleString('ro-RO')} RON plătit</span>
            <span style={{fontSize:11,color:'#F87171'}}>{(totalVal-paidVal).toLocaleString('ro-RO')} RON rest</span>
          </div>
        </div>
      </div>

      <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`}</style>

      <div style={{padding:'0 24px 40px'}}>
        {loading
          ? <div style={{color:'rgba(159,215,255,0.35)',fontSize:13,padding:'40px 0'}}>Se încarcă...</div>
          : <>
              {/* AB Homes */}
              {abApts.length>0&&<>
                <div style={{...secLabel,marginBottom:14}}>AB Homes — apartamente proprii</div>
                {abApts.map((apt,i)=><AptRow key={apt.id} apt={apt} last={i===abApts.length-1}/>)}
              </>}

              {/* Extra */}
              {extraApts.length>0&&<>
                <div style={{...secLabel,marginTop:8,marginBottom:14}}>Extra — alte locații</div>
                {extraApts.map((apt,i)=><AptRow key={apt.id} apt={apt} last={i===extraApts.length-1}/>)}
              </>}

              {/* separator */}
              <div style={{borderTop:'1px solid rgba(159,215,255,0.07)',margin:'8px 0 24px'}}/>

              {/* Consumabile */}
              <div style={{marginBottom:24}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  <span style={secLabel}>Consumabile & Aprovizionare</span>
                  <button onClick={()=>setModalCons(true)} style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:7,fontSize:12,fontWeight:500,border:'1px dashed rgba(77,163,255,0.3)',background:'transparent',color:'rgba(77,163,255,0.65)',cursor:'pointer'}}>
                    <Plus size={12}/>Adaugă factură
                  </button>
                </div>
                {consumabile.length===0
                  ? <div style={{fontSize:12,color:'rgba(159,215,255,0.2)',fontStyle:'italic'}}>Nicio factură luna aceasta</div>
                  : <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{consumabile.map(it=><FlatPill key={it.id} item={it} setter={setCons}/>)}</div>
                }
              </div>

              {/* Contabilitate */}
              <div style={{marginBottom:24}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  <span style={secLabel}>Contabilitate</span>
                  <button onClick={()=>setModalContab(true)} style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:7,fontSize:12,fontWeight:500,border:'1px dashed rgba(77,163,255,0.3)',background:'transparent',color:'rgba(77,163,255,0.65)',cursor:'pointer'}}>
                    <Plus size={12}/>Adaugă cost
                  </button>
                </div>
                {contab.length===0
                  ? <div style={{fontSize:12,color:'rgba(159,215,255,0.2)',fontStyle:'italic'}}>Nicio înregistrare luna aceasta</div>
                  : <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{contab.map(it=><FlatPill key={it.id} item={it} setter={setContab}/>)}</div>
                }
              </div>

              {/* Fiscal */}
              <div>
                <div style={{...secLabel,marginBottom:12}}>Obligații fiscale</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {FISCAL_ROWS.map(ft=><FiscalPill key={ft.key} ft={ft}/>)}
                </div>
              </div>
            </>
        }
      </div>

      {/* Modal consumabile */}
      <Modal open={modalCons} onClose={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă factură consumabile" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fCons.descriere} onChange={e=>setFCons({...fCons,descriere:e.target.value})} placeholder="ex. Produse curățenie Metro..."/></FormGroup>
        <FormGroup><label>Furnizor</label><input value={fCons.furnizor} onChange={e=>setFCons({...fCons,furnizor:e.target.value})} placeholder="ex. Metro, Jumbo, Dedeman..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={fCons.valoare} onChange={e=>setFCons({...fCons,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fCons.data} onChange={e=>setFCons({...fCons,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={saveCons} disabled={saving} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-blue)',color:'#fff',fontWeight:500,fontSize:13,cursor:'pointer'}}>Înregistrează</button>
          <button onClick={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} style={{padding:'9px 16px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
        </div>
      </Modal>

      {/* Modal contabilitate */}
      <Modal open={modalContab} onClose={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă cost contabilitate" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fContab.descriere} onChange={e=>setFContab({...fContab,descriere:e.target.value})} placeholder="ex. Servicii contabilitate..."/></FormGroup>
        <FormGroup><label>Furnizor / Cabinet</label><input value={fContab.furnizor} onChange={e=>setFContab({...fContab,furnizor:e.target.value})} placeholder="ex. Cabinet Contabil..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={fContab.valoare} onChange={e=>setFContab({...fContab,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fContab.data} onChange={e=>setFContab({...fContab,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={saveContab} disabled={saving} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-blue)',color:'#fff',fontWeight:500,fontSize:13,cursor:'pointer'}}>Salvează</button>
          <button onClick={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} style={{padding:'9px 16px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
        </div>
      </Modal>

      <Toast toast={toast}/>
    </>
  )
}
