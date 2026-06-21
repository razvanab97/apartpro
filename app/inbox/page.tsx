'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast, ConfirmDialog, ConnectionError } from '@/components/ui'
import { Sparkles, Upload, X, Copy, Check, MessageCircle, ArrowRight, Loader2, ImageIcon, Type, Plus, Trash2, Phone, Mail, Globe } from 'lucide-react'

/* ── TYPES ── */
type Result = {
  nume_client?: string; telefon?: string; email?: string
  data_checkin?: string; data_checkout?: string; nr_persoane?: number
  nr_nopti?: number; buget_per_noapte?: string; preferinte?: string
  canal?: string; limba?: string; urgenta?: boolean
  disponibile?: number; indisponibile?: number; indisponibile_apt?: string[]
  rezumat?: string; observatii?: string; guests_adults?: number; guests_children?: number
  apartamente_recomandate?: { nota: string; nume: string; motiv: string; pret_noapte?: number; pret_total?: number; scor: number }[]
  raspuns_sugerat?: string
}

type Cerere = {
  id: string; nume_client: string; telefon?: string; canal: string
  apartament_id?: string; data_checkin?: string; data_checkout?: string
  nr_persoane?: number; mesaj?: string
  status: 'noua' | 'contactat' | 'confirmat' | 'pierdut'
  prioritate: 'urgenta' | 'normala' | 'scazuta'; created_at: string
  apartament?: { id: string; nume: string; nota: string | null }
}

const STATUS_CFG = {
  noua:      { label:'Nouă',       color:'#F59E0B', bg:'rgba(245,158,11,0.12)',  icon:'🆕' },
  contactat: { label:'Contactat',  color:'#4DA3FF', bg:'rgba(77,163,255,0.12)', icon:'💬' },
  confirmat: { label:'Confirmată', color:'#22C55E', bg:'rgba(34,197,94,0.12)',  icon:'✅' },
  pierdut:   { label:'Pierdută',   color:'#EF4444', bg:'rgba(239,68,68,0.1)',   icon:'❌' },
}
const CANAL_CFG: Record<string,{label:string;color:string;bg:string}> = {
  whatsapp:{ label:'WhatsApp', color:'#4ADE80', bg:'rgba(34,197,94,0.12)' },
  booking: { label:'Booking',  color:'#7BC8FF', bg:'rgba(77,163,255,0.12)' },
  airbnb:  { label:'Airbnb',   color:'#F87171', bg:'rgba(239,68,68,0.12)' },
  telefon: { label:'Telefon',  color:'#FCD34D', bg:'rgba(245,158,11,0.12)' },
  email:   { label:'Email',    color:'#C4B5FD', bg:'rgba(167,139,250,0.12)' },
  direct:  { label:'Direct',   color:'#94A3B8', bg:'rgba(148,163,184,0.1)' },
}

const emptyEdit = { nume_client:'', telefon:'', canal:'whatsapp', apartament_id:'', data_checkin:'', data_checkout:'', nr_persoane:2, mesaj:'', status:'noua' as const, prioritate:'normala' as const }

const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14 }

export default function InboxPage() {
  /* Smart Booking state */
  const [mode, setMode] = useState<'text'|'image'>('text')
  const [text, setText] = useState('')
  const [image, setImage] = useState<{base64:string;type:string;preview:string}|null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<Result|null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Inbox state */
  const [cereri, setCereri] = useState<Cerere[]>([])
  const [apts, setApts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<any>(emptyEdit)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const { toast, show } = useToast()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from('cereri_rezervare').select('*').order('created_at', { ascending: false }),
        supabase.from('apartamente').select('id,nume,nota').order('nota'),
      ])
      const aptMap = Object.fromEntries((a||[]).map((x:any) => [x.id, x]))
      setCereri(((c||[]) as any).map((r:any) => ({ ...r, apartament: r.apartament_id ? aptMap[r.apartament_id] : null })))
      setApts(a||[])
      clearTimeout(bail)
    }catch(err){console.error('[inbox loadData]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  /* ── SMART BOOKING ── */
  async function handleImageUpload(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setImage({ base64: dataUrl.split(',')[1], type: file.type, preview: dataUrl })
      setMode('image')
    }
    reader.readAsDataURL(file)
  }

  async function analyze() {
    if (!text.trim() && !image) { show('error','Adaugă un mesaj sau o imagine'); return }
    setAnalyzing(true); setResult(null)
    try {
      const res = await fetch('/api/smart-booking', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: mode==='text' ? text : undefined, imageBase64: image?.base64, imageType: image?.type })
      })
      const data = await res.json()
      if (data.ok) setResult(data.result)
      else show('error','Eroare AI')
    } catch(e:any) { show('error', e.message) }
    setAnalyzing(false)
  }

  async function saveFromResult() {
    if (!result) return
    const apt = apts.find(a => a.nota === result.apartamente_recomandate?.[0]?.nota)
    const payload = {
      nume_client: result.nume_client || 'Client necunoscut',
      telefon: result.telefon || null,
      canal: result.canal || 'direct',
      apartament_id: apt?.id || null,
      data_checkin: result.data_checkin || null,
      data_checkout: result.data_checkout || null,
      nr_persoane: result.nr_persoane || null,
      mesaj: text || '[din imagine]',
      status: 'noua', prioritate: result.urgenta ? 'urgenta' : 'normala',
    }
    const { error } = await supabase.from('cereri_rezervare').insert(payload)
    if (error) { show('error', error.message); return }
    show('success','Cerere salvată în inbox! ✓')
    loadData(); setResult(null); setText(''); setImage(null)
  }

  function copyRaspuns() {
    if (result?.raspuns_sugerat) {
      navigator.clipboard.writeText(result.raspuns_sugerat)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ── INBOX ACTIONS ── */
  async function saveCerere() {
    if (!editing.nume_client) { show('error','Adaugă numele clientului'); return }
    setSaving(true)
    const payload = {
      nume_client: editing.nume_client, telefon: editing.telefon || null,
      canal: editing.canal || 'whatsapp', apartament_id: editing.apartament_id || null,
      data_checkin: editing.data_checkin || null, data_checkout: editing.data_checkout || null,
      nr_persoane: editing.nr_persoane || null, mesaj: editing.mesaj || null,
      status: editing.status || 'noua', prioritate: editing.prioritate || 'normala',
    }
    const { error } = editing.id
      ? await supabase.from('cereri_rezervare').update(payload).eq('id', editing.id)
      : await supabase.from('cereri_rezervare').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Actualizat' : 'Cerere adăugată')
    setEditOpen(false); setSaving(false); loadData()
  }

  async function updateStatus(id: string, status: Cerere['status']) {
    await supabase.from('cereri_rezervare').update({ status }).eq('id', id)
    setCereri(prev => prev.map(c => c.id===id ? {...c,status} : c))
  }

  async function convertToRez(c: Cerere) {
    if (!c.data_checkin || !c.data_checkout) { show('error','Adaugă datele check-in/out'); return }
    const { error } = await supabase.from('rezervari').insert({
      apartament_id: c.apartament_id || null, canal: c.canal, nume_client: c.nume_client,
      data_checkin: c.data_checkin, data_checkout: c.data_checkout,
      nr_persoane: c.nr_persoane || 1, telefon_client: c.telefon,
      status_rezervare:'confirmata', status_plata:'neplatit', status_decont:'nedecontat', moneda:'RON',
      observatii: c.mesaj || null,
    })
    if (error) { show('error', error.message); return }
    await supabase.from('cereri_rezervare').update({ status:'confirmat' }).eq('id', c.id)
    show('success','Rezervare creată! ✓'); loadData()
  }

  const filtered = cereri.filter(c => !filterStatus || c.status === filterStatus)
  const stats = { noua:0, contactat:0, confirmat:0, pierdut:0 }
  cereri.forEach(c => { if (stats[c.status] !== undefined) stats[c.status]++ })

  return (
    <>
      <PageHeader
        title="Inbox Cereri"
        subtitle={`${stats.noua} noi · ${stats.contactat} în curs · ${cereri.length} total`}
        actions={
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontSize:12,padding:'6px 10px',width:140}}>
              <option value="">Toate statusurile</option>
              {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={()=>{setEditing(emptyEdit);setEditOpen(true)}}>Cerere nouă</Button>
          </div>
        }
      />

      <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>

        {/* ── TOP: SMART BOOKING ── */}
        <div style={{padding:'16px 20px 0',display:'flex',flexDirection:'column',gap:12,borderBottom:'1px solid rgba(159,215,255,0.08)',paddingBottom:16}}>

          {/* Mode tabs */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:4,background:'rgba(14,27,43,0.4)',borderRadius:8,padding:3}}>
              {([['text','Mesaj text'] ,['image','Screenshot / Poză']] as [string,string][]).map(([k,l])=>(
                <button key={k} onClick={()=>setMode(k as any)} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:mode===k?'rgba(77,163,255,0.2)':'transparent',color:mode===k?'#FFFFFF':'rgba(159,215,255,0.45)',outline:mode===k?'1px solid rgba(77,163,255,0.3)':'none'}}>
                  {k==='text'?<Type size={12}/>:<ImageIcon size={12}/>}{l}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,color:'rgba(159,215,255,0.3)',marginLeft:4}}>
              <Sparkles size={11} style={{display:'inline',marginRight:4}}/>Analizează mesajul și găsește apartamente disponibile
            </div>
          </div>

          {/* Input area */}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'flex-start'}}>
            {mode==='text' ? (
              <textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey)analyze()}}
                placeholder={'Lipește mesajul clientului...\n\nEx: "Bună ziua! Doresc 2 nopți pentru 2 adulți + 2 copii, pe 15-17 iulie, buget 300 lei/noapte. Prefer zona Palas. +40 722 xxx xxx"'}
                style={{width:'100%',minHeight:90,padding:'10px 14px',background:'rgba(214,228,244,0.07)',border:'1px solid rgba(159,215,255,0.15)',borderRadius:10,color:'#FFFFFF',fontSize:13,fontFamily:'inherit',resize:'vertical',outline:'none',lineHeight:1.6}}
              />
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&handleImageUpload(e.target.files[0])}/>
                {!image ? (
                  <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.dataTransfer.files[0]&&handleImageUpload(e.dataTransfer.files[0])}}
                    style={{border:'2px dashed rgba(159,215,255,0.15)',borderRadius:10,padding:'24px',textAlign:'center',cursor:'pointer',background:'rgba(214,228,244,0.03)'}}>
                    <Upload size={22} color="rgba(159,215,255,0.3)" style={{margin:'0 auto 8px'}}/>
                    <div style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>Click sau drag & drop screenshot</div>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.25)',marginTop:3}}>WhatsApp · Airbnb · Booking · Email</div>
                  </div>
                ) : (
                  <div style={{position:'relative',display:'inline-block'}}>
                    <img src={image.preview} alt="preview" style={{maxWidth:'100%',maxHeight:150,borderRadius:8,border:'1px solid rgba(159,215,255,0.15)'}}/>
                    <button onClick={()=>setImage(null)} style={{position:'absolute',top:6,right:6,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:5,width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(159,215,255,0.7)'}}>
                      <X size={11}/>
                    </button>
                  </div>
                )}
              </div>
            )}
            <button onClick={analyze} disabled={analyzing||(!text.trim()&&!image)} style={{padding:'10px 18px',borderRadius:10,cursor:analyzing?'wait':'pointer',background:analyzing||(!text.trim()&&!image)?'rgba(77,163,255,0.25)':'rgba(77,163,255,0.85)',border:'1px solid rgba(159,215,255,0.3)',color:'#FFFFFF',fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:7,whiteSpace:'nowrap',height:44,alignSelf:'flex-start'}}>
              {analyzing?<><Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> Analizez...</>:<><Sparkles size={14}/> Analizează</>}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div style={{display:'flex',flexDirection:'column',gap:10,animation:'fadeIn 0.2s ease'}}>

              {/* Availability + extracted data */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>

                {/* Left: extracted */}
                <div style={{...panel,padding:14}}>
                  <div style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Date extrase</div>
                  <div style={{display:'flex',flexDirection:'column',gap:5}}>
                    {[
                      {l:'Client', v:result.nume_client, c:'#FFFFFF'},
                      {l:'Telefon', v:result.telefon, c:'#4ADE80'},
                      {l:'Check-in', v:result.data_checkin, c:'#FCD34D'},
                      {l:'Check-out', v:result.data_checkout, c:'#FCD34D'},
                      {l:'Nopți', v:result.nr_nopti ? result.nr_nopti+'n' : null, c:'rgba(214,228,244,0.7)'},
                      {l:'Adulți', v:result.guests_adults ? result.guests_adults+' ad.' : null, c:'rgba(214,228,244,0.7)'},
                      {l:'Copii', v:result.guests_children && result.guests_children>0 ? result.guests_children+' cop.' : null, c:'#FCD34D'},
                      {l:'Buget/n', v:result.buget_per_noapte, c:'#4ADE80'},
                      {l:'Canal', v:result.canal, c:'rgba(159,215,255,0.6)'},
                    ].filter(i=>i.v).map(i=>(
                      <div key={i.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 0',borderBottom:'1px solid rgba(159,215,255,0.04)'}}>
                        <span style={{fontSize:10,color:'rgba(159,215,255,0.35)'}}>{i.l}</span>
                        <span style={{fontSize:12,fontWeight:500,color:i.c}}>{i.v as string}</span>
                      </div>
                    ))}
                    {result.preferinte && <div style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:4,fontStyle:'italic'}}>"{result.preferinte}"</div>}
                  </div>
                </div>

                {/* Right: availability + recommendations */}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {result.disponibile !== undefined && (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      <div style={{...panel,padding:'10px',textAlign:'center',borderColor:'rgba(34,197,94,0.2)'}}>
                        <div style={{fontSize:20,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{result.disponibile}</div>
                        <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>✓ Disponibile</div>
                      </div>
                      <div style={{...panel,padding:'10px',textAlign:'center',borderColor:'rgba(239,68,68,0.15)'}}>
                        <div style={{fontSize:20,fontWeight:700,color:'#F87171',fontFamily:'monospace'}}>{result.indisponibile}</div>
                        <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>✗ Ocupate</div>
                      </div>
                    </div>
                  )}
                  {result.apartamente_recomandate?.map((apt,i)=>(
                    <div key={apt.nota} style={{...panel,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,borderColor:i===0?'rgba(77,163,255,0.25)':'rgba(159,215,255,0.08)',background:i===0?'rgba(77,163,255,0.08)':'rgba(214,228,244,0.04)'}}>
                      <div style={{width:28,height:28,borderRadius:6,background:i===0?'rgba(77,163,255,0.2)':'rgba(159,215,255,0.07)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:i===0?'#4DA3FF':'rgba(159,215,255,0.4)',fontFamily:'monospace',flexShrink:0}}>#{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:600,color:'#FFFFFF'}}>{apt.nume}</span>
                          {apt.nota && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(77,163,255,0.1)',color:'#7BC8FF',fontFamily:'monospace'}}>{apt.nota}</span>}
                        </div>
                        <div style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>{apt.motiv}</div>
                        {(apt.pret_noapte || apt.pret_total) && (
                          <div style={{display:'flex',gap:8,marginTop:3}}>
                            {apt.pret_noapte && <span style={{fontSize:10,color:'#4ADE80'}}>{apt.pret_noapte} RON/n</span>}
                            {apt.pret_total && <span style={{fontSize:10,color:'#FCD34D',fontWeight:600}}>{apt.pret_total} RON total</span>}
                          </div>
                        )}
                      </div>
                      <div style={{flexShrink:0,textAlign:'center'}}>
                        <div style={{fontSize:14,fontWeight:700,color:apt.scor>=8?'#4ADE80':apt.scor>=6?'#FCD34D':'#94A3B8',fontFamily:'monospace'}}>{apt.scor}</div>
                        <div style={{fontSize:8,color:'rgba(159,215,255,0.3)'}}>/10</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested reply + actions */}
              {result.raspuns_sugerat && (
                <div style={{...panel,padding:14}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                      <MessageCircle size={11} style={{display:'inline',marginRight:4}}/>Răspuns sugerat
                      {result.limba && result.limba!=='ro' && <span style={{marginLeft:8,fontSize:9,background:'rgba(245,158,11,0.15)',color:'#FCD34D',padding:'1px 5px',borderRadius:3}}>🌍 {result.limba}</span>}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={copyRaspuns} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:copied?'rgba(34,197,94,0.15)':'rgba(77,163,255,0.1)',border:`1px solid ${copied?'rgba(34,197,94,0.3)':'rgba(77,163,255,0.2)'}`,color:copied?'#4ADE80':'#7BC8FF',fontSize:11,cursor:'pointer'}}>
                        {copied?<><Check size={10}/> Copiat!</>:<><Copy size={10}/> Copiază</>}
                      </button>
                      <button onClick={saveFromResult} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.25)',color:'#4ADE80',fontSize:11,cursor:'pointer',fontWeight:500}}>
                        <ArrowRight size={10}/> Salvează în Inbox
                      </button>
                    </div>
                  </div>
                  <div style={{padding:'10px 12px',background:'rgba(14,27,43,0.4)',borderRadius:8,fontSize:12,color:'rgba(214,228,244,0.8)',lineHeight:1.7,whiteSpace:'pre-wrap',borderLeft:'2px solid rgba(77,163,255,0.3)'}}>
                    {result.raspuns_sugerat}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── BOTTOM: INBOX CERERI ── */}
        <div style={{flex:1,overflowY:'auto',padding:'14px 20px',display:'flex',flexDirection:'column',gap:10}}>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {(Object.entries(STATUS_CFG) as [Cerere['status'], typeof STATUS_CFG[keyof typeof STATUS_CFG]][]).map(([k,v])=>(
              <button key={k} onClick={()=>setFilterStatus(filterStatus===k?'':k)} style={{...panel,padding:'10px',textAlign:'center',cursor:'pointer',border:`1px solid ${filterStatus===k?v.color+'50':'rgba(159,215,255,0.1)'}`,background:filterStatus===k?v.bg:'rgba(214,228,244,0.04)'}}>
                <div style={{fontSize:18,fontWeight:700,color:v.color,fontFamily:'monospace'}}>{stats[k]}</div>
                <div style={{fontSize:10,color:'rgba(159,215,255,0.5)',marginTop:2}}>{v.icon} {v.label}</div>
              </button>
            ))}
          </div>

          {/* Cereri list */}
          {loadError ? (
            <ConnectionError onRetry={()=>loadData()}/>
          ) : loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:30}}><Loader2 size={22} style={{animation:'spin 1s linear infinite',color:'#4DA3FF'}}/></div>
          ) : filtered.length === 0 ? (
            <div style={{...panel,padding:'30px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:13}}>
              Nicio cerere. Analizează un mesaj de sus sau adaugă manual.
            </div>
          ) : filtered.map(c => {
            const sc = STATUS_CFG[c.status]
            const cc = CANAL_CFG[c.canal] || CANAL_CFG.direct
            const apt = c.apartament as any
            return (
              <div key={c.id} style={{...panel,padding:'12px 16px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:180}}>
                    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:5,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'#FFFFFF'}}>{c.nume_client}</span>
                      <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,padding:'2px 7px',borderRadius:20,background:cc.bg,color:cc.color,border:`1px solid ${cc.color}30`}}>{cc.label}</span>
                      <span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:sc.bg,color:sc.color,border:`1px solid ${sc.color}30`}}>{sc.icon} {sc.label}</span>
                    </div>
                    <div style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:11,color:'rgba(159,215,255,0.5)'}}>
                      {apt && <span>🏠 {apt.nota?`[${apt.nota}] `:''}{apt.nume}</span>}
                      {c.data_checkin && <span>📅 {c.data_checkin} → {c.data_checkout}</span>}
                      {c.nr_persoane && <span>👥 {c.nr_persoane} pers.</span>}
                      {c.telefon && (
                        <a href={`https://wa.me/${c.telefon.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener" style={{color:'#4ADE80',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3}}>
                          <MessageCircle size={10}/> {c.telefon}
                        </a>
                      )}
                    </div>
                    {c.mesaj && <div style={{marginTop:5,fontSize:11,color:'rgba(159,215,255,0.35)',fontStyle:'italic',borderLeft:'2px solid rgba(159,215,255,0.08)',paddingLeft:7}}>"{c.mesaj.slice(0,120)}{c.mesaj.length>120?'...':''}"</div>}
                  </div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
                    {(Object.keys(STATUS_CFG) as Cerere['status'][]).filter(s=>s!==c.status).map(s=>(
                      <button key={s} onClick={()=>updateStatus(c.id,s)} title={STATUS_CFG[s].label} style={{fontSize:12,padding:'3px 8px',borderRadius:6,background:STATUS_CFG[s].bg,border:`1px solid ${STATUS_CFG[s].color}30`,color:STATUS_CFG[s].color,cursor:'pointer'}}>{STATUS_CFG[s].icon}</button>
                    ))}
                    {c.status!=='confirmat'&&c.status!=='pierdut'&&(
                      <Button variant="secondary" size="sm" icon={<ArrowRight size={11}/>} onClick={()=>convertToRez(c)}>→ Rez.</Button>
                    )}
                    <Button variant="ghost" size="sm" icon={<Plus size={11}/>} onClick={()=>{setEditing({...c});setEditOpen(true)}}/>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={11}/>} onClick={()=>setDeleteId(c.id)}/>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează cerere':'Cerere nouă'} width="540px">
        <FormGroup><label>Nume client *</label><input value={editing.nume_client||''} onChange={e=>setEditing({...editing,nume_client:e.target.value})} placeholder="Numele clientului"/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Telefon / WhatsApp</label><input value={editing.telefon||''} onChange={e=>setEditing({...editing,telefon:e.target.value})} placeholder="+40..."/></FormGroup>
          <FormGroup><label>Canal</label>
            <select value={editing.canal||'whatsapp'} onChange={e=>setEditing({...editing,canal:e.target.value})}>
              {Object.entries(CANAL_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Apartament</label>
          <select value={editing.apartament_id||''} onChange={e=>setEditing({...editing,apartament_id:e.target.value})}>
            <option value="">— Necunoscut —</option>
            {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
          </select>
        </FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Check-in</label><input type="date" value={editing.data_checkin||''} onChange={e=>setEditing({...editing,data_checkin:e.target.value})}/></FormGroup>
          <FormGroup><label>Check-out</label><input type="date" value={editing.data_checkout||''} onChange={e=>setEditing({...editing,data_checkout:e.target.value})}/></FormGroup>
          <FormGroup><label>Persoane</label><input type="number" value={editing.nr_persoane||2} onChange={e=>setEditing({...editing,nr_persoane:parseInt(e.target.value)})} min={1} max={20}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Status</label>
            <select value={editing.status||'noua'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Prioritate</label>
            <select value={editing.prioritate||'normala'} onChange={e=>setEditing({...editing,prioritate:e.target.value})}>
              <option value="urgenta">🔴 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Mesaj / Notă</label><textarea value={editing.mesaj||''} onChange={e=>setEditing({...editing,mesaj:e.target.value})} rows={2} placeholder="Ce a cerut clientul..."/></FormGroup>
        <div style={{display:'flex',gap:10}}>
          <Button variant="primary" onClick={saveCerere} loading={saving} style={{flex:1}}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{flex:1}}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={async()=>{await supabase.from('cereri_rezervare').delete().eq('id',deleteId!);setDeleteId(null);loadData()}} title="Șterge cerere" message="Sigur vrei să ștergi?"/>
      <Toast toast={toast}/>
    </>
  )
}
