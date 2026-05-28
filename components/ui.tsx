'use client'
import {ReactNode,useState} from 'react'
import {X,Loader2,AlertCircle,CheckCircle2,Info} from 'lucide-react'

/* ── BUTTON ── */
type BtnVariant = 'primary'|'secondary'|'ghost'|'danger'|'success'
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement>{
  variant?:BtnVariant;size?:'sm'|'md'|'lg';loading?:boolean;icon?:ReactNode;children?:ReactNode
}
const VS:Record<BtnVariant,React.CSSProperties>={
  primary:{
    background:'rgba(77,163,255,0.88)',
    border:'1px solid rgba(159,215,255,0.45)',
    color:'#FFFFFF',
    backdropFilter:'blur(16px)',
  },
  secondary:{
    background:'rgba(14,27,43,0.55)',
    border:'1px solid rgba(159,215,255,0.2)',
    color:'rgba(214,228,244,0.82)',
    backdropFilter:'blur(16px)',
  },
  ghost:{background:'transparent',border:'1px solid transparent',color:'rgba(159,215,255,0.55)'},
  danger:{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.25)',color:'#F87171'},
  success:{background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.25)',color:'#4ADE80'},
}
const SS:Record<string,React.CSSProperties>={
  sm:{padding:'5px 11px',fontSize:12,gap:5},
  md:{padding:'8px 16px',fontSize:13,gap:7},
  lg:{padding:'10px 20px',fontSize:14,gap:8},
}
export function Button({variant='secondary',size='md',loading,icon,children,style,disabled,...props}:BtnProps){
  return(
    <button {...props} disabled={disabled||loading} style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      borderRadius:10,fontFamily:'inherit',fontWeight:500,
      cursor:disabled||loading?'not-allowed':'pointer',
      opacity:disabled||loading?0.5:1,
      whiteSpace:'nowrap',transition:'all 0.15s',
      ...VS[variant],...SS[size],...style,
    }}>
      {loading?<Loader2 size={14} style={{animation:'spin 1s linear infinite',flexShrink:0}}/>
              :icon&&<span style={{flexShrink:0,display:'flex'}}>{icon}</span>}
      {children}
    </button>
  )
}

/* ── BADGE ── */
type BC='green'|'amber'|'red'|'blue'|'purple'|'gray'|'teal'
const BS:Record<BC,React.CSSProperties>={
  green: {background:'rgba(34,197,94,0.14)', color:'#4ADE80', border:'1px solid rgba(34,197,94,0.22)'},
  amber: {background:'rgba(245,158,11,0.14)',color:'#FCD34D',border:'1px solid rgba(245,158,11,0.22)'},
  red:   {background:'rgba(239,68,68,0.14)', color:'#F87171',border:'1px solid rgba(239,68,68,0.22)'},
  blue:  {background:'rgba(77,163,255,0.14)',color:'#7BC8FF',border:'1px solid rgba(77,163,255,0.22)'},
  purple:{background:'rgba(167,139,250,0.14)',color:'#C4B5FD',border:'1px solid rgba(167,139,250,0.22)'},
  gray:  {background:'rgba(148,163,184,0.1)',color:'#94A3B8',border:'1px solid rgba(148,163,184,0.14)'},
  teal:  {background:'rgba(20,184,166,0.14)',color:'#2DD4BF',border:'1px solid rgba(20,184,166,0.22)'},
}
export function Badge({children,color='gray'}:{children:ReactNode;color?:BC}){
  return(
    <span style={{
      display:'inline-flex',alignItems:'center',gap:4,
      padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:500,
      ...BS[color],
    }}>{children}</span>
  )
}

/* ── CARD ── light glass #D6E4F4 */
export function Card({children,style}:{children:ReactNode;className?:string;style?:React.CSSProperties}){
  return(
    <div style={{
      background:'rgba(214,228,244,0.07)',
      backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',
      border:'1px solid rgba(159,215,255,0.14)',
      borderRadius:16,padding:20,...style,
    }}>{children}</div>
  )
}
export function CardHeader({children}:{children:ReactNode;className?:string}){
  return <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>{children}</div>
}
export function CardTitle({children}:{children:ReactNode}){
  return <h3 style={{fontSize:14,fontWeight:600,color:'#FFFFFF'}}>{children}</h3>
}

/* ── STAT CARD ── */
export function StatCard({label,value,sub,color,icon}:{label:string;value:string|number;sub?:string;color?:string;icon?:ReactNode}){
  return(
    <div style={{
      background:'rgba(214,228,244,0.06)',
      backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',
      border:'1px solid rgba(159,215,255,0.12)',
      borderRadius:14,padding:'16px 18px',
      transition:'all 0.15s',cursor:'pointer',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <p style={{fontSize:11,color:'rgba(159,215,255,0.45)',marginBottom:7}}>{label}</p>
          <p style={{fontSize:26,fontWeight:700,color:color||'#FFFFFF',letterSpacing:-0.8,lineHeight:1}}>{value}</p>
          {sub&&<p style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:5}}>{sub}</p>}
        </div>
        {icon&&<div>{icon}</div>}
      </div>
    </div>
  )
}

/* ── MODAL ── */
export function Modal({open,onClose,title,subtitle,children,width='520px'}:{
  open:boolean;onClose:()=>void;title:string;subtitle?:string;children:ReactNode;width?:string
}){
  if(!open) return null
  return(
    <div onClick={(e)=>{if(e.target===e.currentTarget)onClose()}} style={{
      position:'fixed',inset:0,zIndex:50,
      display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(7,18,32,0.72)',
      backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',
    }}>
      <div style={{
        background:'rgba(14,27,43,0.9)',
        backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',
        border:'1px solid rgba(159,215,255,0.18)',
        borderRadius:20,padding:28,
        width,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',
        position:'relative',animation:'fadeIn 0.18s ease',
      }}>
        {/* glow line top */}
        <div style={{
          position:'absolute',top:0,left:'25%',right:'25%',height:'1px',
          background:'linear-gradient(90deg,transparent,rgba(159,215,255,0.4),transparent)',
        }}/>
        <button onClick={onClose} style={{
          position:'absolute',top:18,right:18,
          width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(14,27,43,0.6)',border:'1px solid rgba(159,215,255,0.14)',
          borderRadius:7,cursor:'pointer',color:'rgba(159,215,255,0.55)',
        }}><X size={13}/></button>
        <h2 style={{fontSize:17,fontWeight:600,color:'#FFFFFF',marginBottom:4}}>{title}</h2>
        {subtitle&&<p style={{fontSize:13,color:'rgba(159,215,255,0.45)',marginBottom:24}}>{subtitle}</p>}
        {!subtitle&&<div style={{marginBottom:24}}/>}
        {children}
      </div>
    </div>
  )
}

/* ── FORM HELPERS ── */
export function FormGroup({children}:{children:ReactNode;className?:string}){
  return <div style={{marginBottom:16}}>{children}</div>
}
export function FormRow({children,cols=2}:{children:ReactNode;cols?:2|3|4}){
  const g:Record<number,string>={2:'repeat(2,1fr)',3:'repeat(3,1fr)',4:'repeat(4,1fr)'}
  return <div style={{display:'grid',gridTemplateColumns:g[cols],gap:16}}>{children}</div>
}

/* ── EMPTY / LOADING ── */
export function EmptyState({icon,title,desc,action}:{icon?:ReactNode;title:string;desc?:string;action?:ReactNode}){
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'48px 24px',textAlign:'center'}}>
      {icon&&<div style={{marginBottom:16,opacity:0.2,color:'rgba(159,215,255,0.6)'}}>{icon}</div>}
      <p style={{fontSize:14,fontWeight:500,color:'rgba(255,255,255,0.75)',marginBottom:6}}>{title}</p>
      {desc&&<p style={{fontSize:12,color:'rgba(159,215,255,0.38)',marginBottom:16}}>{desc}</p>}
      {action}
    </div>
  )
}
export function LoadingSpinner({size=20}:{size?:number}){
  return <Loader2 size={size} style={{animation:'spin 1s linear infinite',color:'#4DA3FF'}}/>
}
export function PageLoading(){
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0'}}><LoadingSpinner size={28}/></div>
}

/* ── ALERT / TOAST ── */
export function Alert({type,message}:{type:'error'|'success'|'info';message:string}){
  const S:Record<string,React.CSSProperties>={
    error:  {background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.24)', color:'#F87171'},
    success:{background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.24)', color:'#4ADE80'},
    info:   {background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.24)',color:'#7BC8FF'},
  }
  const I={error:<AlertCircle size={15}/>,success:<CheckCircle2 size={15}/>,info:<Info size={15}/>}
  return(
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,fontSize:13,backdropFilter:'blur(12px)',...S[type]}}>
      {I[type]}{message}
    </div>
  )
}
export function useToast(){
  const [toast,setToast]=useState<{type:'error'|'success'|'info';message:string}|null>(null)
  const show=(type:'error'|'success'|'info',message:string)=>{
    setToast({type,message})
    setTimeout(()=>setToast(null),3500)
  }
  return {toast,show}
}
export function Toast({toast}:{toast:{type:'error'|'success'|'info';message:string}|null}){
  if(!toast) return null
  return <div style={{position:'fixed',bottom:24,right:24,zIndex:100,animation:'fadeIn 0.18s ease'}}><Alert type={toast.type} message={toast.message}/></div>
}

/* ── CANAL BADGE ── */
export function CanalBadge({canal}:{canal:string}){
  const S:Record<string,React.CSSProperties>={
    booking: {background:'rgba(77,163,255,0.14)', color:'#7BC8FF', border:'1px solid rgba(77,163,255,0.2)'},
    airbnb:  {background:'rgba(239,68,68,0.14)',  color:'#F87171', border:'1px solid rgba(239,68,68,0.2)'},
    direct:  {background:'rgba(34,197,94,0.14)',  color:'#4ADE80', border:'1px solid rgba(34,197,94,0.2)'},
    whatsapp:{background:'rgba(34,197,94,0.12)',  color:'#4ADE80', border:'1px solid rgba(34,197,94,0.18)'},
    telefon: {background:'rgba(167,139,250,0.14)',color:'#C4B5FD', border:'1px solid rgba(167,139,250,0.2)'},
    site:    {background:'rgba(245,158,11,0.14)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.2)'},
  }
  const L:Record<string,string>={booking:'Booking',airbnb:'Airbnb',direct:'Direct',whatsapp:'WhatsApp',telefon:'Telefon',site:'Site'}
  return(
    <span style={{
      display:'inline-block',padding:'2px 8px',borderRadius:5,
      fontSize:10.5,fontWeight:600,fontFamily:'monospace',
      ...(S[canal]||{background:'rgba(148,163,184,0.1)',color:'#94A3B8',border:'1px solid rgba(148,163,184,0.14)'}),
    }}>{L[canal]||canal}</span>
  )
}

/* ── STATUS DECONT ── */
export function StatusDecont({status}:{status:string}){
  const m:Record<string,{label:string;color:BC}>={
    nedecontat:{label:'Nedecontat',color:'gray'},
    inclus:{label:'Inclus',color:'amber'},
    decontat:{label:'Decontat',color:'green'},
  }
  const s=m[status]||{label:status,color:'gray' as BC}
  return <Badge color={s.color}>{s.label}</Badge>
}

/* ── CONFIRM DIALOG ── */
export function ConfirmDialog({open,onClose,onConfirm,title,message,confirmLabel='Șterge',loading}:{
  open:boolean;onClose:()=>void;onConfirm:()=>void;title:string;message:string;confirmLabel?:string;loading?:boolean
}){
  return(
    <Modal open={open} onClose={onClose} title={title} width="400px">
      <p style={{fontSize:13,color:'rgba(159,215,255,0.55)',marginBottom:24}}>{message}</p>
      <div style={{display:'flex',gap:10}}>
        <Button variant="danger" onClick={onConfirm} loading={loading} style={{flex:1}}>{confirmLabel}</Button>
        <Button variant="secondary" onClick={onClose} style={{flex:1}}>Anulează</Button>
      </div>
    </Modal>
  )
}
