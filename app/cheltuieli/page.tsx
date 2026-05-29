'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Modal, FormGroup, FormRow, Toast, useToast } from '@/components/ui'
import { Plus, Pencil, X, Check, Trash2, ChevronDown } from 'lucide-react'

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
const AB_EXTRA_NAMES = ['R99','Canta','Mircea']

const DEF: Record<string,Record<string,number>> = {
  'L99':{chirie:2000,internet:50},'EX59':{chirie:1500,internet:45},
  'L88':{chirie:2800,internet:50},'L94':{chirie:2800,internet:50},
  'C64':{chirie:2300,internet:25},'VM07':{chirie:2000},
  'N32':{chirie:3080,internet:25},'N33':{chirie:3080},
  'GS08':{chirie:2250,internet:70},'HD02':{chirie:2500},
  'L83':{chirie:2000},'NT9':{chirie:3050,internet:65},'CG40':{chirie:0},
  'Airy Palas':{chirie:2000,internet:50},'Cozy Studio':{chirie:1500,internet:45},
  'Palas SkyNest':{chirie:2800,internet:50},'Palas Retreat':{chirie:2800,internet:50},
  'SkyPort':{chirie:2300,internet:25},'Vila Păcurari':{chirie:2000},
  'Mint Loft Copou':{chirie:3080,internet:25},'Urban Oasis':{chirie:3080},
  'Green Station':{chirie:2250,internet:70},'Hideout Rozelor':{chirie:2500},
  'Lazar Comfy':{chirie:2000},'Newton Urban':{chirie:3050,internet:65},
  'Peaceful Copou Retreat':{chirie:0},
  'R99':{chirie:2624,internet:45},'Canta':{chirie:1400,internet:25},
  'Mircea':{chirie:1522,internet:25,salubris:83},
}
function getDef(apt:any){ return DEF[apt.nota]||DEF[apt.nume]||null }

const pad=(n:number)=>String(n).padStart(2,'0')
function dueDanger(due:string,paid:boolean):{color:string;glow?:string}{
  if(paid)return{color:'rgba(74,222,128,0.45)'}
  // due format: "dd/mm"
  const parts=due.split('/')
  if(parts.length!==2)return{color:'rgba(100,160,255,0.35)'}
  const now=new Date()
  const d=new Date(now.getFullYear(),parseInt(parts[1])-1,parseInt(parts[0]))
  const diff=Math.ceil((d.getTime()-now.getTime())/(1000*60*60*24))
  if(diff<=0)return{color:'#F87171',glow:'0 0 6px rgba(248,113,113,0.5)'}
  if(diff<=3)return{color:'#F87171',glow:'0 0 6px rgba(248,113,113,0.4)'}
  if(diff<=7)return{color:'#FCD34D',glow:'0 0 6px rgba(252,211,77,0.35)'}
  return{color:'rgba(100,160,255,0.35)'}
}
const LUNI=['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

/* ── stiluri shared ───────────────────────────────────────────────────── */
const glassCard: React.CSSProperties = {
  background:'rgba(30,45,70,0.55)',
  border:'1px solid rgba(100,160,255,0.18)',
  borderRadius:16,
  backdropFilter:'blur(12px)',
}
const pillBase = (paid:boolean): React.CSSProperties => ({
  display:'flex', flexDirection:'column', justifyContent:'space-between',
  padding:'14px 16px',
  background: paid ? 'rgba(74,222,128,0.1)' : 'rgba(30,50,80,0.7)',
  border: `1px solid ${paid?'rgba(74,222,128,0.3)':'rgba(100,160,255,0.15)'}`,
  borderRadius:12,
  minWidth:130, flex:'1 1 130px',
  transition:'all .2s',
  cursor:'default',
})
const checkBtn = (paid:boolean): React.CSSProperties => ({
  width:28, height:28, borderRadius:'50%', flexShrink:0,
  border:`2px solid ${paid?'#4ADE80':'rgba(100,160,255,0.35)'}`,
  background: paid ? '#4ADE80' : 'rgba(100,160,255,0.08)',
  display:'flex', alignItems:'center', justifyContent:'center',
  cursor:'pointer', transition:'all .18s',
  outline:'none',
})
const inpStyle: React.CSSProperties = {
  background:'rgba(77,163,255,0.12)',
  border:'1px solid rgba(77,163,255,0.4)',
  borderRadius:7, color:'#fff', fontSize:13,
  padding:'5px 8px', width:'100%', outline:'none',
}

export default function CheltuieliPage(){
  const now=new Date()
  const luna=now.getMonth()+1
  const an=now.getFullYear()

  const [loading,setLoading]=useState(true)
  const [seeding,setSeeding]=useState(false)
  const [apts,setApts]=useState<any[]>([])
  const [util,setUtil]=useState<Record<string,Record<string,any>>>({})
  const [extras,setExtras]=useState<Record<string,any[]>>({})
  const [consumabile,setCons]=useState<any[]>([])
  const [contab,setContab]=useState<any[]>([])
  const [fiscal,setFiscal]=useState<Record<string,any>>({})
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  const [saving,setSaving]=useState<string|null>(null)

  // edit inline util
  const [editCell,setEditCell]=useState<{aptId:string;col:string}|null>(null)
  const [editVal,setEditVal]=useState('')
  const cellRef=useRef<HTMLInputElement>(null)

  // edit fiscal
  const [editFisc,setEditFisc]=useState<string|null>(null)
  const [editFiscVal,setEditFiscVal]=useState('')
  const fiscRef=useRef<HTMLInputElement>(null)

  // modal adauga cost extra pe apt
  const [modalExtra,setModalExtra]=useState<any>(null)
  const [fExtra,setFExtra]=useState({descriere:'',valoare:'',data:''})

  // modal consumabile / contab
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
    const u:Record<string,Record<string,any>>={},ex:Record<string,any[]>={},cons:any[]=[],cont:any[]=[],fisc:Record<string,any>={}
    ;(chData||[]).forEach((c:any)=>{
      if(c.apartament_id){
        if(UTIL_KEYS.includes(c.categorie)){
          if(!u[c.apartament_id])u[c.apartament_id]={}
          u[c.apartament_id][c.categorie]=c
        } else if(c.categorie==='alte'){
          if(!ex[c.apartament_id])ex[c.apartament_id]=[]
          ex[c.apartament_id].push(c)
        }
      } else if(c.categorie==='consumabile') cons.push(c)
      else if(c.categorie==='contabilitate') cont.push(c)
      else if(FISCAL_ROWS.find(f=>f.key===c.categorie)) fisc[c.categorie]=c
    })
    setUtil(u);setExtras(ex);setCons(cons);setContab(cont);setFiscal(fisc)
    setLoading(false)
  }

  function toggleExpand(id:string){
    setExpanded(e=>({...e,[id]:!e[id]}))
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
    const k=aptId+col; setSaving(k)
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setUtil(u=>({...u,[aptId]:{...u[aptId],[col]:{...item,status:ns}}}))
    setSaving(null)
  }

  async function commitCell(){
    if(!editCell)return
    const {aptId,col}=editCell
    const val=parseFloat(editVal)||0
    const colDef=UTIL_COLS.find(c=>c.key===col)!
    const dateStr=`${an}-${pad(luna)}-${pad(colDef.due)}`
    const existing=util[aptId]?.[col]
    setSaving('cell')
    if(existing){
      await supabase.from('cheltuieli').update({valoare:val,data:dateStr}).eq('id',existing.id)
      setUtil(u=>({...u,[aptId]:{...u[aptId],[col]:{...existing,valoare:val}}}))
    } else {
      const {data,error}=await supabase.from('cheltuieli').insert({
        apartament_id:aptId,categorie:col,descriere:colDef.label,valoare:val,
        data:dateStr,status:'nevalidat',suportat_de:'proprietar',tva:0,
      }).select().single()
      if(!error&&data)setUtil(u=>({...u,[aptId]:{...(u[aptId]||{}),[col]:data}}))
      if(error)show('error',error.message)
    }
    setSaving(null);setEditCell(null);setEditVal('')
  }

  async function saveExtra(){
    if(!modalExtra||!fExtra.descriere||!fExtra.valoare){show('error','Completează descrierea și valoarea');return}
    setSaving('extra')
    const {data,error}=await supabase.from('cheltuieli').insert({
      apartament_id:modalExtra.id,categorie:'alte',descriere:fExtra.descriere,
      valoare:parseFloat(fExtra.valoare)||0,
      data:fExtra.data||`${an}-${pad(luna)}-${pad(25)}`,
      status:'nevalidat',suportat_de:'proprietar',tva:0,
    }).select().single()
    if(error){show('error',error.message)}
    else{
      setExtras(e=>({...e,[modalExtra.id]:[...(e[modalExtra.id]||[]),data]}))
      show('success','Cost adăugat')
      setModalExtra(null);setFExtra({descriere:'',valoare:'',data:''})
    }
    setSaving(null)
  }

  async function toggleExtra(aptId:string,item:any){
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setExtras(e=>({...e,[aptId]:e[aptId].map(i=>i.id===item.id?{...i,status:ns}:i)}))
  }

  async function deleteExtra(aptId:string,item:any){
    await supabase.from('cheltuieli').delete().eq('id',item.id)
    setExtras(e=>({...e,[aptId]:e[aptId].filter(i=>i.id!==item.id)}))
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
    if(!fCons.descriere||!fCons.valoare){show('error','Completează câmpurile obligatorii');return}
    setSaving('cons')
    const {data,error}=await supabase.from('cheltuieli').insert({
      apartament_id:null,categorie:'consumabile',descriere:fCons.descriere,
      valoare:parseFloat(fCons.valoare)||0,data:fCons.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat',suportat_de:'administrator',tva:0,nota:fCons.furnizor||null,
    }).select().single()
    if(error)show('error',error.message)
    else{setCons(c=>[...c,data]);show('success','Adăugat');setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}
    setSaving(null)
  }

  async function saveContab(){
    if(!fContab.descriere||!fContab.valoare){show('error','Completează câmpurile obligatorii');return}
    setSaving('contab')
    const {data,error}=await supabase.from('cheltuieli').insert({
      apartament_id:null,categorie:'contabilitate',descriere:fContab.descriere,
      valoare:parseFloat(fContab.valoare)||0,data:fContab.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat',suportat_de:'administrator',tva:0,nota:fContab.furnizor||null,
    }).select().single()
    if(error)show('error',error.message)
    else{setContab(c=>[...c,data]);show('success','Adăugat');setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}
    setSaving(null)
  }

  async function commitFisc(){
    if(!editFisc)return
    const val=parseFloat(editFiscVal)||0
    const ft=FISCAL_ROWS.find(f=>f.key===editFisc)!
    const existing=fiscal[editFisc]
    setSaving('fisc')
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
    setSaving(null);setEditFisc(null);setEditFiscVal('')
  }
  async function toggleFisc(key:string){
    const item=fiscal[key]
    if(!item){show('error','Introdu mai întâi valoarea');return}
    const ns=item.status==='validat'?'nevalidat':'validat'
    await supabase.from('cheltuieli').update({status:ns}).eq('id',item.id)
    setFiscal(f=>({...f,[key]:{...item,status:ns}}))
  }

  /* ── calcule ─────────────────────────────────────────────────────────── */
  const aptTotal=(id:string)=>{
    const u=UTIL_COLS.reduce((s,c)=>s+Number(util[id]?.[c.key]?.valoare||0),0)
    const e=(extras[id]||[]).reduce((s,i)=>s+Number(i.valoare),0)
    return u+e
  }
  const aptPaid=(id:string)=>{
    const u=UTIL_COLS.reduce((s,c)=>{const it=util[id]?.[c.key];return s+(it?.status==='validat'?Number(it.valoare):0)},0)
    const e=(extras[id]||[]).filter(i=>i.status==='validat').reduce((s,i)=>s+Number(i.valoare),0)
    return u+e
  }
  const allCheltuieli=[
    ...apts.flatMap(a=>[...UTIL_COLS.map(c=>util[a.id]?.[c.key]),...(extras[a.id]||[])].filter(Boolean)),
    ...consumabile,...contab,
    ...FISCAL_ROWS.map(f=>fiscal[f.key]).filter(Boolean),
  ]
  const totalVal=allCheltuieli.reduce((s,i)=>s+Number(i.valoare),0)
  const paidVal=allCheltuieli.filter(i=>i.status==='validat').reduce((s,i)=>s+Number(i.valoare),0)
  const pct=totalVal>0?Math.round(paidVal/totalVal*100):0

  const abApts     =apts.filter(a=>AB_CODES.includes(a.nota))
  const abExtraApts=apts.filter(a=>!AB_CODES.includes(a.nota)&&AB_EXTRA_NAMES.some(n=>a.nota===n||a.nume?.includes(n)))
  const extraApts  =apts.filter(a=>!AB_CODES.includes(a.nota)&&!AB_EXTRA_NAMES.some(n=>a.nota===n||a.nume?.includes(n)))

  /* ── Pill cheltuiala ─────────────────────────────────────────────────── */
  function CostPill({label,val,due,paid,onToggle,onEdit,onDelete,busy}:{
    label:string;val:number;due:string;paid:boolean;
    onToggle:()=>void;onEdit?:()=>void;onDelete?:()=>void;busy?:boolean
  }){
    return(
      <div style={{...pillBase(paid),position:'relative'}}>
        <div>
          <div style={{fontSize:11,fontWeight:500,color:paid?'rgba(74,222,128,0.65)':'rgba(100,160,255,0.6)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</div>
          <div style={{fontSize:18,fontWeight:600,color:paid?'#4ADE80':'#E8F4FF',letterSpacing:'-.3px',lineHeight:1}}>
            {val>0?val.toLocaleString('ro-RO'):'—'}
            <span style={{fontSize:11,fontWeight:400,marginLeft:4,color:paid?'rgba(74,222,128,0.7)':'rgba(159,215,255,0.5)'}}>RON</span>
          </div>
          {(()=>{const ds=dueDanger(due,paid);return(
            <div style={{fontSize:10,marginTop:4,color:ds.color,fontWeight:ds.glow?600:400,...(ds.glow?{textShadow:ds.glow}:{})}}>
              scad. {due}{!paid&&ds.color==='#F87171'?' ⚠':!paid&&ds.color==='#FCD34D'?' ●':''}
            </div>
          )})()}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12}}>
          <div style={{display:'flex',gap:4}}>
            {onEdit&&(
              <button onClick={onEdit} style={{background:'rgba(100,160,255,0.08)',border:'1px solid rgba(100,160,255,0.15)',borderRadius:6,cursor:'pointer',padding:'4px 6px',display:'flex',color:'rgba(100,160,255,0.6)'}}>
                <Pencil size={11}/>
              </button>
            )}
            {onDelete&&(
              <button onClick={onDelete} style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:6,cursor:'pointer',padding:'4px 6px',display:'flex',color:'rgba(248,113,113,0.6)'}}>
                <Trash2 size={11}/>
              </button>
            )}
          </div>
          <button
            onClick={onToggle}
            disabled={busy}
            style={{...checkBtn(paid),opacity:busy?0.5:1}}
          >
            {paid&&<Check size={13} color="#0E1B2B" strokeWidth={3}/>}
          </button>
        </div>
      </div>
    )
  }

  /* ── Inline edit pill ────────────────────────────────────────────────── */
  function EditPill({label,due,onSave,onCancel}:{label:string;due:string;onSave:(v:string)=>void;onCancel:()=>void}){
    const [v,setV]=useState('')
    const ref=useRef<HTMLInputElement>(null)
    useEffect(()=>{setTimeout(()=>ref.current?.focus(),30)},[])
    return(
      <div style={{...pillBase(false),minWidth:130,flex:'1 1 130px'}}>
        <div style={{fontSize:11,fontWeight:500,color:'rgba(100,160,255,0.6)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</div>
        <input ref={ref} type="number" value={v} onChange={e=>setV(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')onSave(v);if(e.key==='Escape')onCancel()}}
          placeholder="0 RON" style={{...inpStyle,marginBottom:8}} min={0}/>
        <div style={{fontSize:10,color:'rgba(100,160,255,0.35)',marginBottom:10}}>scad. {due}</div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>onSave(v)} disabled={saving==='cell'} style={{flex:1,background:'rgba(77,163,255,0.2)',border:'1px solid rgba(77,163,255,0.4)',borderRadius:7,color:'#7BC8FF',fontSize:12,padding:'5px',cursor:'pointer',fontWeight:500}}>
            {saving==='cell'?'...':'Salvează'}
          </button>
          <button onClick={onCancel} style={{background:'rgba(159,215,255,0.05)',border:'1px solid rgba(159,215,255,0.12)',borderRadius:7,color:'rgba(159,215,255,0.4)',fontSize:12,padding:'5px 8px',cursor:'pointer'}}>
            <X size={12}/>
          </button>
        </div>
      </div>
    )
  }

  /* ── Rand apartament (acordeon) ──────────────────────────────────────── */
  function AptAccordion({apt,last}:{apt:any;last:boolean}){
    const isOpen=!!expanded[apt.id]
    const total=aptTotal(apt.id)
    const paid=aptPaid(apt.id)
    const rest=total-paid
    const allPaid=total>0&&rest===0
    const pctApt=total>0?Math.round(paid/total*100):0
    const aptExtras=extras[apt.id]||[]

    return(
      <div style={{marginBottom:10}}>
        {/* Header acordeon */}
        <button
          onClick={()=>toggleExpand(apt.id)}
          style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'14px 18px',...glassCard,cursor:'pointer',textAlign:'left'}}
        >
          {/* cod + nume */}
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
            {apt.nota&&<span style={{fontSize:11,fontWeight:600,color:'var(--accent-blue)',background:'rgba(77,163,255,0.15)',padding:'3px 8px',borderRadius:5,flexShrink:0}}>{apt.nota}</span>}
            <span style={{fontSize:14,fontWeight:500,color:'#E8F4FF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{apt.nume}</span>
          </div>
          {/* mini progress */}
          <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            {total>0&&(
              <>
                <div style={{width:80,height:5,background:'rgba(100,160,255,0.12)',borderRadius:999,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${pctApt}%`,background:allPaid?'#4ADE80':'var(--accent-blue)',borderRadius:999,transition:'width .3s'}}/>
                </div>
                <span style={{fontSize:11,fontWeight:500,color:allPaid?'#4ADE80':'rgba(159,215,255,0.6)',minWidth:30}}>{pctApt}%</span>
              </>
            )}
            {rest>0&&<span style={{fontSize:11,color:'#F87171'}}>{rest.toLocaleString('ro-RO')} RON rest</span>}
            {allPaid&&<span style={{fontSize:11,color:'#4ADE80'}}>✓ achitat</span>}
            <ChevronDown size={15} style={{color:'rgba(159,215,255,0.4)',transform:isOpen?'rotate(180deg)':'rotate(0)',transition:'transform .2s'}}/>
          </div>
        </button>

        {/* Body acordeon */}
        {isOpen&&(
          <div style={{padding:'16px 4px 4px'}}>
            {/* pills utilități */}
            <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:aptExtras.length>0?12:0}}>
              {UTIL_COLS.map(col=>{
                const item=util[apt.id]?.[col.key]
                const isPaid=item?.status==='validat'
                const val=item?Number(item.valoare):0
                const isEdit=editCell?.aptId===apt.id&&editCell?.col===col.key
                const due=`${pad(col.due)}/${pad(luna)}`

                if(isEdit) return(
                  <EditPill key={col.key} label={col.label} due={due}
                    onSave={v=>{setEditVal(v);setTimeout(commitCell,0)}}
                    onCancel={()=>{setEditCell(null);setEditVal('')}}
                  />
                )
                return(
                  <CostPill key={col.key}
                    label={col.label} val={val} due={due} paid={isPaid}
                    busy={saving===apt.id+col.key}
                    onToggle={()=>toggleUtil(apt.id,col.key)}
                    onEdit={()=>{setEditVal(val>0?String(val):'');setEditCell({aptId:apt.id,col:col.key})}}
                  />
                )
              })}

              {/* Extra costuri ale apartamentului */}
              {aptExtras.map(item=>{
                const isPaid=item.status==='validat'
                return(
                  <CostPill key={item.id}
                    label={item.descriere} val={Number(item.valoare)}
                    due={item.data?.slice(8,10)+'/'+item.data?.slice(5,7)} paid={isPaid}
                    onToggle={()=>toggleExtra(apt.id,item)}
                    onDelete={()=>deleteExtra(apt.id,item)}
                  />
                )
              })}

              {/* Buton adauga cost extra */}
              <button
                onClick={()=>setModalExtra(apt)}
                style={{
                  minWidth:120,flex:'1 1 120px',padding:'14px 16px',
                  background:'rgba(77,163,255,0.04)',
                  border:'1px dashed rgba(77,163,255,0.25)',
                  borderRadius:12,cursor:'pointer',
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  gap:6,color:'rgba(77,163,255,0.5)',
                  transition:'all .15s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(77,163,255,0.1)';(e.currentTarget as HTMLElement).style.borderColor='rgba(77,163,255,0.4)';(e.currentTarget as HTMLElement).style.color='rgba(77,163,255,0.9)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(77,163,255,0.04)';(e.currentTarget as HTMLElement).style.borderColor='rgba(77,163,255,0.25)';(e.currentTarget as HTMLElement).style.color='rgba(77,163,255,0.5)'}}
              >
                <Plus size={18}/>
                <span style={{fontSize:11,fontWeight:500}}>Cost extra</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── sectiuni globale (fiscal, cons, contab) ─────────────────────────── */
  function GlobalPill({item,setter}:{item:any;setter:React.Dispatch<React.SetStateAction<any[]>>}){
    const paid=item.status==='validat'
    return(
      <div style={{...pillBase(paid),minWidth:150,flex:'1 1 150px'}}>
        <div>
          <div style={{fontSize:11,fontWeight:500,color:paid?'rgba(74,222,128,0.65)':'rgba(100,160,255,0.6)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.04em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.descriere}</div>
          {item.nota&&<div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginBottom:4}}>{item.nota}</div>}
          <div style={{fontSize:18,fontWeight:600,color:paid?'#4ADE80':'#E8F4FF',letterSpacing:'-.3px'}}>
            {Number(item.valoare).toLocaleString('ro-RO')}<span style={{fontSize:11,fontWeight:400,marginLeft:4,color:'rgba(159,215,255,0.4)'}}>RON</span>
          </div>
          <div style={{fontSize:10,color:'rgba(100,160,255,0.35)',marginTop:4}}>{item.data||'—'}</div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <button onClick={()=>deleteFlat(item,setter)} style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:6,cursor:'pointer',padding:'4px 6px',display:'flex',color:'rgba(248,113,113,0.5)'}}>
            <Trash2 size={11}/>
          </button>
          <button onClick={()=>toggleFlat(item,setter)} style={checkBtn(paid)}>
            {paid&&<Check size={13} color="#0E1B2B" strokeWidth={3}/>}
          </button>
        </div>
      </div>
    )
  }

  const secLbl:React.CSSProperties={fontSize:11,fontWeight:500,color:'rgba(100,160,255,0.55)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:14,display:'block'}
  const addBtnStyle:React.CSSProperties={display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:500,border:'1px dashed rgba(77,163,255,0.3)',background:'transparent',color:'rgba(77,163,255,0.6)',cursor:'pointer'}

  return(
    <>
      <PageHeader title="Cheltuieli & Utilități" subtitle={`${LUNI[luna]} ${an}`}
        actions={
          <button onClick={seedDefaults} disabled={seeding||loading}
            style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:500,border:'1px solid rgba(77,163,255,0.3)',background:'rgba(77,163,255,0.08)',color:'var(--accent-blue)',cursor:'pointer',opacity:seeding?0.6:1}}>
            <Plus size={13}/>{seeding?'Se importă...':'Import valori fixe'}
          </button>
        }
      />

      <div style={{flex:1,overflowY:'auto',padding:'0 24px 40px'}}>
        {/* ── progress bar ── */}
        <div style={{...glassCard,padding:'16px 20px',marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:500,color:'#E8F4FF'}}>Progres plăți — {LUNI[luna]} {an}</span>
            <span style={{fontSize:22,fontWeight:700,color:pct===100?'#4ADE80':pct>60?'var(--accent-blue)':'#FCD34D'}}>{pct}%</span>
          </div>
          <div style={{height:10,background:'rgba(100,160,255,0.1)',borderRadius:999,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${pct}%`,borderRadius:999,transition:'width .4s cubic-bezier(.4,0,.2,1)',background:pct===100?'#4ADE80':pct>60?'var(--accent-blue)':'#FCD34D'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
            <span style={{fontSize:11,color:'#4ADE80'}}>{paidVal.toLocaleString('ro-RO')} RON plătit</span>
            <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>{totalVal.toLocaleString('ro-RO')} RON total</span>
            <span style={{fontSize:11,color:'#F87171'}}>{(totalVal-paidVal).toLocaleString('ro-RO')} RON rest</span>
          </div>
        </div>

        {loading?<div style={{color:'rgba(159,215,255,0.35)',fontSize:13,padding:'40px 0'}}>Se încarcă...</div>:<>

          {/* AB Homes */}
          {abApts.length>0&&<>
            <span style={secLbl}>AB Homes — apartamente proprii</span>
            {abApts.map((apt,i)=><AptAccordion key={apt.id} apt={apt} last={i===abApts.length-1}/>)}
          </>}

          {/* AB fara cod */}
          {abExtraApts.length>0&&<>
            <span style={{...secLbl,marginTop:8}}>AB Homes — în curs de autorizare</span>
            {abExtraApts.map((apt,i)=><AptAccordion key={apt.id} apt={apt} last={i===abExtraApts.length-1}/>)}
          </>}

          {/* Extra */}
          {extraApts.length>0&&<>
            <span style={{...secLbl,marginTop:8}}>Extra — alte locații</span>
            {extraApts.map((apt,i)=><AptAccordion key={apt.id} apt={apt} last={i===extraApts.length-1}/>)}
          </>}

          {/* separator */}
          <div style={{borderTop:'1px solid rgba(100,160,255,0.1)',margin:'20px 0'}}/>

          {/* Consumabile */}
          <div style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <span style={secLbl}>Consumabile & Aprovizionare</span>
              <button onClick={()=>setModalCons(true)} style={addBtnStyle}><Plus size={12}/>Adaugă factură</button>
            </div>
            {consumabile.length===0
              ?<div style={{fontSize:12,color:'rgba(159,215,255,0.2)',fontStyle:'italic',paddingBottom:8}}>Nicio factură luna aceasta</div>
              :<div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{consumabile.map(it=><GlobalPill key={it.id} item={it} setter={setCons}/>)}</div>
            }
          </div>

          {/* Contabilitate */}
          <div style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <span style={secLbl}>Contabilitate</span>
              <button onClick={()=>setModalContab(true)} style={addBtnStyle}><Plus size={12}/>Adaugă cost</button>
            </div>
            {contab.length===0
              ?<div style={{fontSize:12,color:'rgba(159,215,255,0.2)',fontStyle:'italic',paddingBottom:8}}>Nicio înregistrare luna aceasta</div>
              :<div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{contab.map(it=><GlobalPill key={it.id} item={it} setter={setContab}/>)}</div>
            }
          </div>

          {/* Fiscal */}
          <div>
            <span style={secLbl}>Obligații fiscale</span>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {FISCAL_ROWS.map(ft=>{
                const item=fiscal[ft.key]
                const isPaid=item?.status==='validat'
                const val=item?Number(item.valoare):0
                const isEdit=editFisc===ft.key
                if(isEdit) return(
                  <EditPill key={ft.key} label={ft.label} due={`${ft.due}/${pad(luna)}`}
                    onSave={v=>{setEditFiscVal(v);setTimeout(commitFisc,0)}}
                    onCancel={()=>{setEditFisc(null);setEditFiscVal('')}}
                  />
                )
                return(
                  <CostPill key={ft.key}
                    label={ft.label} val={val} due={`${ft.due}/${pad(luna)}`} paid={isPaid}
                    onToggle={()=>toggleFisc(ft.key)}
                    onEdit={()=>{setEditFiscVal(val>0?String(val):'');setEditFisc(ft.key)}}
                  />
                )
              })}
            </div>
          </div>
        </>}
      </div>

      {/* Modal cost extra pe apartament */}
      <Modal open={!!modalExtra} onClose={()=>{setModalExtra(null);setFExtra({descriere:'',valoare:'',data:''})}}
        title={`Cost extra — ${modalExtra?.nume||''}`} width="max-w-sm">
        <FormGroup><label>Descriere *</label>
          <input value={fExtra.descriere} onChange={e=>setFExtra({...fExtra,descriere:e.target.value})} placeholder="ex. Reparație, Curățenie extra..."/>
        </FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label>
            <input type="number" value={fExtra.valoare} onChange={e=>setFExtra({...fExtra,valoare:e.target.value})} min={0} placeholder="0"/>
          </FormGroup>
          <FormGroup><label>Data</label>
            <input type="date" value={fExtra.data} onChange={e=>setFExtra({...fExtra,data:e.target.value})}/>
          </FormGroup>
        </FormRow>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={saveExtra} disabled={saving==='extra'} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-blue)',color:'#fff',fontWeight:500,fontSize:13,cursor:'pointer'}}>
            {saving==='extra'?'Se salvează...':'Adaugă'}
          </button>
          <button onClick={()=>{setModalExtra(null);setFExtra({descriere:'',valoare:'',data:''})}} style={{padding:'9px 16px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
        </div>
      </Modal>

      {/* Modal consumabile */}
      <Modal open={modalCons} onClose={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă factură consumabile" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fCons.descriere} onChange={e=>setFCons({...fCons,descriere:e.target.value})} placeholder="ex. Produse curățenie Metro..."/></FormGroup>
        <FormGroup><label>Furnizor</label><input value={fCons.furnizor} onChange={e=>setFCons({...fCons,furnizor:e.target.value})} placeholder="ex. Metro, Jumbo, Dedeman..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare *</label><input type="number" value={fCons.valoare} onChange={e=>setFCons({...fCons,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fCons.data} onChange={e=>setFCons({...fCons,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={saveCons} disabled={saving==='cons'} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-blue)',color:'#fff',fontWeight:500,fontSize:13,cursor:'pointer'}}>{saving==='cons'?'...':'Înregistrează'}</button>
          <button onClick={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} style={{padding:'9px 16px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
        </div>
      </Modal>

      {/* Modal contabilitate */}
      <Modal open={modalContab} onClose={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă cost contabilitate" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fContab.descriere} onChange={e=>setFContab({...fContab,descriere:e.target.value})} placeholder="ex. Servicii contabilitate..."/></FormGroup>
        <FormGroup><label>Furnizor / Cabinet</label><input value={fContab.furnizor} onChange={e=>setFContab({...fContab,furnizor:e.target.value})} placeholder="ex. Cabinet Contabil..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare *</label><input type="number" value={fContab.valoare} onChange={e=>setFContab({...fContab,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fContab.data} onChange={e=>setFContab({...fContab,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={saveContab} disabled={saving==='contab'} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-blue)',color:'#fff',fontWeight:500,fontSize:13,cursor:'pointer'}}>{saving==='contab'?'...':'Salvează'}</button>
          <button onClick={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} style={{padding:'9px 16px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
        </div>
      </Modal>

      <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`}</style>
      <Toast toast={toast}/>
    </>
  )
}
