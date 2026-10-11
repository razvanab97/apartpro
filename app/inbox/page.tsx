'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, numVal, numInput } from '@/lib/supabase'
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
  apartamente?: AptOferta[]
}
type AptOferta = {
  id: string; nota: string|null; nume: string; zona: string|null; capacitate_max: number|null; link_site: string|null; administrare: boolean
  disponibil: boolean; ocupat_de: string[]; capacitate_ok: boolean; pret_noapte: number; pret_booking: number|null; pret_direct_recent: number|null
  scor: number|null; motiv: string|null
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
  // Locatiile alese de tine pentru oferta (apt_id -> pret/noapte editabil) + raspunsul generat pe baza lor
  const [alese, setAlese] = useState<Record<string, string>>({})
  const [raspuns, setRaspuns] = useState('')
  const [generand, setGenerand] = useState(false)
  const [aratOcupate, setAratOcupate] = useState(false)
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

  // Lipire din clipboard (cerut direct): Ctrl/⌘+V oriunde in pagina - o imagine copiata (screenshot WhatsApp,
  // Booking...) devine direct screenshot-ul de analizat, chiar daca erai pe „Mesaj text”; textul simplu se
  // lipeste normal. Plus buton „Lipește din clipboard” (util pe telefon, unde nu exista Ctrl+V).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || [])
      const img = items.find(it => it.kind === 'file' && it.type.startsWith('image/'))
      if (!img) return
      const f = img.getAsFile()
      if (!f) return
      e.preventDefault()
      handleImageUpload(f)
      show('success', 'Imagine lipită din clipboard')
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function lipesteDinClipboard(e?: React.MouseEvent) {
    e?.stopPropagation()
    try {
      const nav: any = navigator
      if (nav.clipboard?.read) {
        const items = await nav.clipboard.read()
        for (const it of items) {
          const tip = (it.types || []).find((t: string) => t.startsWith('image/'))
          if (tip) {
            const blob = await it.getType(tip)
            handleImageUpload(new File([blob], 'clipboard.' + tip.split('/')[1], { type: tip }))
            show('success', 'Imagine lipită din clipboard')
            return
          }
        }
      }
      const t = nav.clipboard?.readText ? await nav.clipboard.readText() : ''
      if (t && t.trim()) { setText(t); setMode('text'); show('success', 'Text lipit din clipboard'); return }
      show('error', 'Clipboard-ul nu conține o imagine sau text')
    } catch {
      show('error', 'Browserul n-a permis citirea clipboard-ului — folosește Ctrl/⌘+V sau „Lipire” din meniul apăsării lungi')
    }
  }

  async function analyze() {
    if (!text.trim() && !image) { show('error','Adaugă un mesaj sau o imagine'); return }
    setAnalyzing(true); setResult(null); setAlese({}); setRaspuns('')
    try {
      const res = await fetch('/api/smart-booking', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: mode==='text' ? text : undefined, imageBase64: image?.base64, imageType: image?.type })
      })
      const data = await res.json()
      if (data.ok) {
        setResult(data.result)
        // preselectat: cea mai potrivita locatie libera, dupa scorul AI
        const top = (data.result.apartamente || []).find((a: AptOferta) => a.disponibil)
        if (top) setAlese({ [top.id]: String(top.pret_noapte || top.pret_direct_recent || '') })
      }
      else show('error','Eroare AI')
    } catch(e:any) { show('error', e.message) }
    setAnalyzing(false)
  }

  async function genereazaRaspuns() {
    if (!result) return
    const ids = Object.keys(alese)
    if (!ids.length) { show('error', 'Bifează cel puțin o locație'); return }
    setGenerand(true)
    try {
      const res = await fetch('/api/smart-booking', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        mod: 'raspuns', mesaj_original: text,
        date: { nume_client: result.nume_client, data_checkin: result.data_checkin, data_checkout: result.data_checkout, nr_persoane: result.nr_persoane, limba: result.limba },
        oferte: (result.apartamente || []).filter(a => alese[a.id] !== undefined).map(a => ({ apt_id: a.id, pret_noapte: Number(alese[a.id]) || 0 })),
      }) })
      const data = await res.json()
      if (data.ok) setRaspuns(data.raspuns); else show('error', data.error || 'Eroare la generare')
    } catch (e: any) { show('error', e.message) }
    setGenerand(false)
  }

  async function saveFromResult() {
    if (!result) return
    const aleasa = (result.apartamente || []).find(a => alese[a.id] !== undefined)
    const apt = aleasa ? { id: aleasa.id } : apts.find(a => a.nota === result.apartamente_recomandate?.[0]?.nota)
    const payload = {
      nume_client: result.nume_client || 'Client necunoscut',
      telefon: result.telefon || null,
      canal: result.canal || 'direct',
      apartament_id: apt?.id || null,
      data_checkin: result.data_checkin || null,
      data_checkout: result.data_checkout || null,
      nr_persoane: result.nr_persoane || null,
      mesaj: [text || '[din imagine]', raspuns ? '\n--- Răspuns trimis ---\n' + raspuns : ''].join(''),
      status: raspuns ? 'contactat' : 'noua', prioritate: result.urgenta ? 'urgenta' : 'normala',
    }
    const { error } = await supabase.from('cereri_rezervare').insert(payload)
    if (error) { show('error', error.message); return }
    show('success','Cerere salvată în inbox! ✓')
    loadData(); setResult(null); setText(''); setImage(null); setAlese({}); setRaspuns('')
  }

  function copyRaspuns() {
    if (raspuns) {
      navigator.clipboard.writeText(raspuns)
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
        <div style={{padding:'16px 20px 0',display:'flex',flexDirection:'column',gap:12,borderBottom:'1px solid rgba(159,215,255,0.08)',paddingBottom:16,maxHeight:result?'75vh':undefined,overflowY:'auto'}}>

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
                    <div style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>Click, drag & drop sau <b style={{color:'rgba(159,215,255,0.7)'}}>Ctrl/⌘+V</b> pentru screenshot</div>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.25)',marginTop:3}}>WhatsApp · Airbnb · Booking · Email</div>
                    <button onClick={lipesteDinClipboard} style={{marginTop:10,padding:'6px 14px',borderRadius:8,border:'1px solid rgba(77,163,255,0.4)',background:'rgba(77,163,255,0.12)',color:'#7BC8FF',fontSize:12,fontWeight:600,cursor:'pointer'}}>📋 Lipește din clipboard</button>
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

                {/* Right: disponibilitate */}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    <div style={{...panel,padding:'10px',textAlign:'center',borderColor:'rgba(34,197,94,0.2)'}}>
                      <div style={{fontSize:20,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{result.disponibile ?? 0}</div>
                      <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>✓ Libere</div>
                    </div>
                    <div style={{...panel,padding:'10px',textAlign:'center',borderColor:'rgba(239,68,68,0.15)'}}>
                      <div style={{fontSize:20,fontWeight:700,color:'#F87171',fontFamily:'monospace'}}>{result.indisponibile ?? 0}</div>
                      <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>✗ Ocupate</div>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:'rgba(159,215,255,0.45)',lineHeight:1.5}}>
                    Bifează mai jos locațiile pe care vrei să i le propui (poți corecta prețul/noapte), apoi „Generează răspunsul” — textul va avea prețul și link-ul de pe site pentru fiecare.
                  </div>
                </div>
              </div>

              {/* Alegerea locatiilor */}
              {(() => {
                const lista = result.apartamente || []
                const libere = lista.filter(a => a.disponibil)
                const ocupate = lista.filter(a => !a.disponibil)
                const n = result.nr_nopti || 0
                const rand = (a: AptOferta) => {
                  const bifat = alese[a.id] !== undefined
                  const pret = Number(bifat ? alese[a.id] : a.pret_noapte) || 0
                  return (
                    <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'8px 12px',borderRadius:9,border:`1px solid ${bifat?'rgba(77,163,255,0.45)':'rgba(159,215,255,0.1)'}`,background:bifat?'rgba(77,163,255,0.1)':'rgba(214,228,244,0.03)',opacity:a.disponibil?1:0.55}}>
                      <input type="checkbox" checked={bifat} disabled={!a.disponibil} onChange={e=>setAlese(x=>{ const c={...x}; if(e.target.checked) c[a.id]=String(a.pret_noapte||a.pret_direct_recent||''); else delete c[a.id]; return c })} style={{width:16,height:16,cursor:a.disponibil?'pointer':'default'}}/>
                      <div style={{flex:1,minWidth:200}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          {a.nota && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(77,163,255,0.1)',color:'#7BC8FF',fontFamily:'monospace'}}>{a.nota}</span>}
                          <span style={{fontSize:12,fontWeight:600,color:'#FFFFFF'}}>{a.nume}</span>
                          <span style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>max {a.capacitate_max||'?'} pers{a.zona?` · ${a.zona}`:''}</span>
                          {a.administrare && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(167,139,250,0.12)',color:'#C4B5FD'}}>proprietar · comision</span>}
                          {a.link_site ? <a href={a.link_site} target="_blank" rel="noreferrer" style={{fontSize:10,color:'#7BC8FF'}}>🔗 site</a> : <span style={{fontSize:10,color:'#F87171'}}>fără link site</span>}
                        </div>
                        <div style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginTop:2}}>
                          {a.disponibil ? (a.motiv || '') : `Ocupat: ${a.ocupat_de.join(', ')}`}
                          {(a.pret_booking || a.pret_direct_recent) && <span style={{marginLeft:6,color:'rgba(159,215,255,0.35)'}}>{a.pret_booking?`· Booking pe aceste date: ${a.pret_booking} lei/n `:''}{a.pret_direct_recent?`· ultima vânzare directă: ${a.pret_direct_recent} lei/n`:''}</span>}
                        </div>
                      </div>
                      {a.disponibil && (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <input type="number" value={bifat ? alese[a.id] : String(a.pret_noapte||a.pret_direct_recent||'')} disabled={!bifat} onChange={e=>setAlese(x=>({...x,[a.id]:e.target.value}))}
                            title={!a.pret_noapte ? 'Apartamentul n-are preț standard setat în Apartamente — verifică prețul' : undefined}
                            style={{width:80,padding:'5px 7px',background:'rgba(20,38,65,0.8)',border:`1px solid ${!a.pret_noapte||(bifat&&!Number(alese[a.id]))?'rgba(248,113,113,0.6)':'rgba(100,160,255,0.2)'}`,borderRadius:6,color:'#FFFFFF',fontSize:12,outline:'none'}}/>
                          <span style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>lei/n{n?` · ${(pret*n).toLocaleString('ro-RO')} total`:''}</span>
                        </div>
                      )}
                      {a.scor != null && <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:a.scor>=8?'#4ADE80':a.scor>=6?'#FCD34D':'#94A3B8',minWidth:34,textAlign:'right'}}>{a.scor}<span style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>/10</span></div>}
                    </div>
                  )
                }
                return (
                  <div style={{...panel,padding:14,display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:2}}>Alege locațiile de propus ({Object.keys(alese).length} bifate)</div>
                    {libere.length === 0 && <div style={{fontSize:12,color:'#FCD34D'}}>Nicio locație liberă pe aceste date.</div>}
                    {libere.map(rand)}
                    {ocupate.length > 0 && (
                      <button onClick={()=>setAratOcupate(v=>!v)} style={{alignSelf:'flex-start',fontSize:11,background:'none',border:'none',color:'rgba(159,215,255,0.45)',cursor:'pointer',padding:'4px 0'}}>
                        {aratOcupate ? '▲ ascunde' : '▼ arată'} ocupate ({ocupate.length})
                      </button>
                    )}
                    {aratOcupate && ocupate.map(rand)}
                    <div style={{display:'flex',gap:8,marginTop:6}}>
                      <button onClick={genereazaRaspuns} disabled={generand || !Object.keys(alese).length}
                        style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,border:'none',background:Object.keys(alese).length?'rgba(77,163,255,0.85)':'rgba(77,163,255,0.25)',color:'#FFFFFF',fontSize:12,fontWeight:600,cursor:Object.keys(alese).length?'pointer':'default'}}>
                        {generand ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> Generez...</> : <><Sparkles size={13}/> Generează răspunsul ({Object.keys(alese).length})</>}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* Raspunsul generat - editabil */}
              {raspuns && (
                <div style={{...panel,padding:14}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:6}}>
                    <div style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                      <MessageCircle size={11} style={{display:'inline',marginRight:4}}/>Răspuns către client (îl poți edita)
                      {result.limba && result.limba!=='ro' && <span style={{marginLeft:8,fontSize:9,background:'rgba(245,158,11,0.15)',color:'#FCD34D',padding:'1px 5px',borderRadius:3}}>🌍 {result.limba}</span>}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={copyRaspuns} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:copied?'rgba(34,197,94,0.15)':'rgba(77,163,255,0.1)',border:`1px solid ${copied?'rgba(34,197,94,0.3)':'rgba(77,163,255,0.2)'}`,color:copied?'#4ADE80':'#7BC8FF',fontSize:11,cursor:'pointer'}}>
                        {copied?<><Check size={10}/> Copiat!</>:<><Copy size={10}/> Copiază</>}
                      </button>
                      {result.telefon && (
                        <a href={`https://wa.me/${String(result.telefon).replace(/[^0-9]/g,'')}?text=${encodeURIComponent(raspuns)}`} target="_blank" rel="noreferrer"
                          style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'rgba(37,211,102,0.12)',border:'1px solid rgba(37,211,102,0.3)',color:'#4ADE80',fontSize:11,textDecoration:'none'}}>
                          <MessageCircle size={10}/> Trimite pe WhatsApp
                        </a>
                      )}
                      <button onClick={saveFromResult} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.25)',color:'#4ADE80',fontSize:11,cursor:'pointer',fontWeight:500}}>
                        <ArrowRight size={10}/> Salvează în Inbox
                      </button>
                    </div>
                  </div>
                  <textarea value={raspuns} onChange={e=>setRaspuns(e.target.value)} rows={Math.min(22, raspuns.split('\n').length + 2)}
                    style={{width:'100%',padding:'10px 12px',background:'rgba(14,27,43,0.4)',borderRadius:8,fontSize:12,color:'rgba(214,228,244,0.9)',lineHeight:1.6,border:'none',borderLeft:'2px solid rgba(77,163,255,0.3)',fontFamily:'inherit',resize:'vertical',outline:'none'}}/>
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
          <FormGroup><label>Persoane</label><input type="number" value={numVal(editing.nr_persoane,2)} onChange={e=>setEditing({...editing,nr_persoane:numInput(e.target.value,1)})} min={1} max={20}/></FormGroup>
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
