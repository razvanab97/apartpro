'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, X, Users, CalendarCheck, Phone, Mail, Globe } from 'lucide-react'
import * as XLSX from 'xlsx'

/* ── helpers ── */
function parseDate(s: string): string {
  const months: Record<string,string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const p = s.trim().split(' ')
  return p.length === 3 ? `${p[2]}-${months[p[1]]||'01'}-${p[0].padStart(2,'0')}` : s
}
function parseCanal(s: string): string {
  const l = (s||'').toLowerCase()
  if (l.includes('airbnb')) return 'airbnb'
  if (l.includes('booking')) return 'booking'
  return 'direct'
}
function parseStatus(s: string): string {
  const l = (s||'').toLowerCase()
  if (l.includes('anulat')) return 'anulata'
  if (l.includes('cazat') || l.includes('decazat')) return 'finalizata'
  return 'confirmata'
}
function parsePrice(s: string): number { return parseFloat(s.replace(/[^0-9.]/g,''))||0 }
function cleanPhone(s: string): string {
  return s.replace(/\u202a|\u202c|\xa0/g,' ').replace(/\s+/g,' ').trim()
}

type RezRow = { nume_client:string; nr_persoane:number; data_checkin:string; data_checkout:string; nr_nopti:number; camera:string; tip_camera:string; suma_incasata:number; valoare_bruta:number; status_rezervare:string; canal:string; observatii:string; valid:boolean; apartament_id?:string; apartament_nume?:string; apartament_match:'exact'|'partial'|'none' }
type ClientRow = { nume:string; email:string|null; telefon:string|null; tara:string|null; judet:string|null; localitate:string|null; valid:boolean; exists?:boolean }
type Apartament = { id:string; nume:string; nota:string|null }

function matchApt(camera:string, tip:string, apts:Apartament[]): {id?:string;nume?:string;match:'exact'|'partial'|'none'} {
  const c = camera.toLowerCase().trim()
  const t = tip.toLowerCase().trim()
  for (const a of apts) { if (a.nota && c===a.nota.toLowerCase()) return {id:a.id,nume:a.nume,match:'exact'} }
  for (const a of apts) { if (a.nume.toLowerCase()===c || a.nume.toLowerCase()===t) return {id:a.id,nume:a.nume,match:'exact'} }
  const map: Record<string,string> = { comfylazar:'Lazar Comfy', skynest:'Palas SkyNest', hideout:'Hideout Rozelor', airy:'Airy Palas', newton:'Newton Urban', oasis:'Urban Oasis', mint:'Mint Loft Copou', retreat:'Palas Retreat', green:'Green Station', cozy:'Cozy Studio', vila:'Vila Păcurari', cherry:'Cherry by AB Homes', skyport:'SkyPort', lazar:'Lazar Comfy', peaceful:'Peaceful Copou Retreat', copou:'Peaceful Copou Retreat' }
  for (const [k,n] of Object.entries(map)) {
    if (c.includes(k)||t.includes(k)) {
      const a = apts.find(x=>x.nume.toLowerCase()===n.toLowerCase())
      if (a) return {id:a.id,nume:a.nume,match:'partial'}
    }
  }
  for (const a of apts) {
    const words = c.split(/[\s\-_]+/).filter(w=>w.length>2)
    if (words.some(w=>a.nume.toLowerCase().includes(w))) return {id:a.id,nume:a.nume,match:'partial'}
  }
  return {match:'none'}
}

const MC = { exact:{bg:'rgba(34,197,94,0.12)',border:'rgba(34,197,94,0.25)',color:'#4ADE80',label:'✓ Exact'}, partial:{bg:'rgba(245,158,11,0.12)',border:'rgba(245,158,11,0.25)',color:'#FCD34D',label:'~ Parțial'}, none:{bg:'rgba(239,68,68,0.1)',border:'rgba(239,68,68,0.2)',color:'#F87171',label:'✗ Negăsit'} }

const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14 }

/* ── TAB: REZERVARI ── */
function TabRezervari() {
  const [file, setFile] = useState<File|null>(null)
  const [rows, setRows] = useState<RezRow[]>([])
  const [apts, setApts] = useState<Apartament[]>([])
  const [step, setStep] = useState<'upload'|'preview'|'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  async function handleFile(f: File) {
    setFile(f)
    const { data } = await supabase.from('apartamente').select('id,nume,nota')
    const aptList = (data||[]) as Apartament[]
    setApts(aptList)
    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target?.result, {type:'binary'})
      const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1})
      const parsed: RezRow[] = []
      for (let i=1; i<raw.length; i++) {
        const r = raw[i]; if(!r||!r[0]) continue
        const checkin = parseDate(String(r[3]||'')); const checkout = parseDate(String(r[4]||''))
        const am = matchApt(String(r[7]||''), String(r[6]||''), aptList)
        parsed.push({ nume_client:String(r[0]||'').trim(), nr_persoane:parseInt(String(r[1]||'1'))+parseInt(String(r[2]||'0')), data_checkin:checkin, data_checkout:checkout, nr_nopti:parseInt(String(r[5]||'1'))||1, tip_camera:String(r[6]||'').trim(), camera:String(r[7]||'').trim(), valoare_bruta:parsePrice(String(r[9]||'')), suma_incasata:parsePrice(String(r[10]||'')), status_rezervare:parseStatus(String(r[11]||'')), canal:parseCanal(String(r[12]||'')), observatii:String(r[13]||'').trim(), valid:!!String(r[0]).trim()&&!!checkin&&!!checkout&&checkin<checkout, apartament_id:am.id, apartament_nume:am.nume, apartament_match:am.match })
      }
      setRows(parsed); setStep('preview')
    }
    reader.readAsBinaryString(f)
  }

  function updateApt(i:number, aptId:string) {
    const a = apts.find(x=>x.id===aptId)
    setRows(prev=>prev.map((r,idx)=>idx===i?{...r,apartament_id:aptId,apartament_nume:a?.nume,apartament_match:'exact' as const}:r))
  }

  async function doImport() {
    setImporting(true); let ok=0,err=0
    for (const r of rows.filter(x=>x.valid && x.status_rezervare!=='anulata')) {
      const {error} = await supabase.from('rezervari').insert({ apartament_id:r.apartament_id||null, canal:r.canal, nume_client:r.nume_client, data_checkin:r.data_checkin, data_checkout:r.data_checkout, nr_persoane:r.nr_persoane||1, valoare_bruta:r.valoare_bruta, suma_incasata:r.suma_incasata, moneda:'RON', status_plata:r.suma_incasata>0?'achitat':'neplatit', status_rezervare:r.status_rezervare, status_decont:'nedecontat', observatii:[r.tip_camera,r.camera,r.observatii].filter(Boolean).join(' | ')||null })
      error?err++:ok++
    }
    setImported(ok); setErrors(err); setImporting(false); setStep('done')
  }

  const valid = rows.filter(r=>r.valid).length
  const exact = rows.filter(r=>r.apartament_match==='exact').length
  const partial = rows.filter(r=>r.apartament_match==='partial').length
  const none = rows.filter(r=>r.valid&&r.apartament_match==='none').length

  if (step==='done') return (
    <div style={{...panel,padding:48,textAlign:'center'}}>
      <CheckCircle2 size={40} color="#4ADE80" style={{margin:'0 auto 16px'}}/>
      <h2 style={{fontSize:18,fontWeight:700,color:'#FFFFFF',marginBottom:8}}>Import finalizat!</h2>
      <p style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:24}}>{imported} rezervări importate{errors>0?`, ${errors} erori`:''}</p>
      <div style={{display:'flex',gap:10,justifyContent:'center'}}>
        <Button variant="primary" onClick={()=>window.location.href='/rezervari'}>Vezi rezervările</Button>
        <Button variant="secondary" onClick={()=>{setStep('upload');setRows([]);setFile(null)}}>Import nou</Button>
      </div>
    </div>
  )

  if (step==='upload') return (
    <div style={{...panel,padding:48,textAlign:'center'}}>
      <FileSpreadsheet size={36} color="#4DA3FF" style={{margin:'0 auto 16px'}}/>
      <h2 style={{fontSize:16,fontWeight:600,color:'#FFFFFF',marginBottom:8}}>Import rezervări din 5starDesk</h2>
      <p style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginBottom:24,maxWidth:380,margin:'0 auto 24px'}}>Exportă rezervările din 5starDesk ca Excel și încarcă-le aici. Se asociază automat cu apartamentele.</p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
      <Button variant="primary" icon={<Upload size={14}/>} onClick={()=>inputRef.current?.click()}>Selectează fișier Excel</Button>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{...panel,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <FileSpreadsheet size={18} color="#4DA3FF"/>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'#FFFFFF'}}>{file?.name}</div>
            <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>{rows.length} rânduri · {valid} valide</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {[{v:exact,c:MC.exact,l:'Exact'},{v:partial,c:MC.partial,l:'Parțial'},{v:none,c:MC.none,l:'Negăsit'}].map(({v,c,l})=>v>0&&(
            <div key={l} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:7,padding:'4px 10px',textAlign:'center'}}>
              <div style={{fontSize:14,fontWeight:700,color:c.color,fontFamily:'monospace'}}>{v}</div>
              <div style={{fontSize:9,color:'rgba(159,215,255,0.4)'}}>{l}</div>
            </div>
          ))}
          <Button variant="primary" size="sm" icon={<ArrowRight size={13}/>} onClick={doImport} loading={importing}>Importă {valid}</Button>
          <Button variant="ghost" size="sm" icon={<X size={12}/>} onClick={()=>{setStep('upload');setRows([]);setFile(null)}}/>
        </div>
      </div>
      <div style={{...panel,overflow:'hidden'}}>
        <div style={{overflowX:'auto',maxHeight:460,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead style={{position:'sticky',top:0,background:'rgba(14,27,43,0.95)'}}>
              <tr>{['','Client','Apartament','Check-in','Check-out','N','Sumă','Canal'].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:9,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(159,215,255,0.08)',whiteSpace:'nowrap'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.slice(0,100).map((r,i)=>{
                const mc = MC[r.apartament_match||'none']
                return (
                  <tr key={i} style={{opacity:r.valid?1:0.35}}>
                    <td style={{padding:'7px 10px',borderBottom:'1px solid rgba(159,215,255,0.04)'}}>{r.valid?<CheckCircle2 size={12} color="#4ADE80"/>:<AlertCircle size={12} color="#F87171"/>}</td>
                    <td style={{padding:'7px 10px',fontSize:12,fontWeight:500,color:'#FFFFFF',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{r.nume_client}</td>
                    <td style={{padding:'7px 10px',borderBottom:'1px solid rgba(159,215,255,0.04)',minWidth:160}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:mc.bg,color:mc.color,border:`1px solid ${mc.border}`,flexShrink:0}}>{mc.label}</span>
                        <select value={r.apartament_id||''} onChange={e=>updateApt(i,e.target.value)} onClick={e=>e.stopPropagation()} style={{fontSize:10,padding:'2px 5px',background:'rgba(14,27,43,0.6)',border:'1px solid rgba(159,215,255,0.12)',borderRadius:4,color:r.apartament_id?'#FFFFFF':'rgba(159,215,255,0.4)',flex:1}}>
                          <option value="">— {r.camera} —</option>
                          {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{padding:'7px 10px',fontSize:10,color:'rgba(159,215,255,0.6)',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{r.data_checkin}</td>
                    <td style={{padding:'7px 10px',fontSize:10,color:'rgba(159,215,255,0.6)',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{r.data_checkout}</td>
                    <td style={{padding:'7px 10px',fontSize:11,color:'rgba(214,228,244,0.6)',borderBottom:'1px solid rgba(159,215,255,0.04)',textAlign:'center'}}>{r.nr_nopti}</td>
                    <td style={{padding:'7px 10px',fontSize:11,fontWeight:600,color:'#4ADE80',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{r.suma_incasata.toLocaleString('ro-RO')}</td>
                    <td style={{padding:'7px 10px',borderBottom:'1px solid rgba(159,215,255,0.04)'}}>
                      <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:600,fontFamily:'monospace',background:r.canal==='airbnb'?'rgba(239,68,68,0.14)':r.canal==='booking'?'rgba(77,163,255,0.14)':'rgba(34,197,94,0.14)',color:r.canal==='airbnb'?'#F87171':r.canal==='booking'?'#7BC8FF':'#4ADE80'}}>{r.canal}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length>100&&<div style={{padding:'8px',textAlign:'center',fontSize:11,color:'rgba(159,215,255,0.3)'}}>+{rows.length-100} rânduri suplimentare</div>}
        </div>
      </div>
    </div>
  )
}

/* ── TAB: CLIENTI ── */
function TabClienti() {
  const [file, setFile] = useState<File|null>(null)
  const [rows, setRows] = useState<ClientRow[]>([])
  const [step, setStep] = useState<'upload'|'preview'|'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  async function handleFile(f: File) {
    setFile(f)
    // Check existing clients in rezervari for name matching
    const { data: rezervari } = await supabase.from('rezervari').select('nume_client,telefon_client')

    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target?.result, {type:'binary'})
      const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1})
      const parsed: ClientRow[] = []
      for (let i=1; i<raw.length; i++) {
        const r = raw[i]; if(!r||!r[0]) continue
        const telefon = r[2] ? cleanPhone(String(r[2])) : null
        parsed.push({
          nume: String(r[0]||'').trim(),
          email: r[1]?String(r[1]).trim():null,
          telefon,
          tara: r[5]?String(r[5]).trim():null,
          judet: r[6]?String(r[6]).trim():null,
          localitate: r[7]?String(r[7]).trim():null,
          valid: !!String(r[0]).trim() && !!telefon,
        })
      }
      setRows(parsed); setStep('preview')
    }
    reader.readAsBinaryString(f)
  }

  async function doImport() {
    setImporting(true); let ok=0, err=0
    const valid = rows.filter(r=>r.valid)

    for (const c of valid) {
      // 1. Upsert in clienti table
      const { error: clientErr } = await supabase.from('clienti').upsert({
        nume: c.nume, email: c.email, telefon: c.telefon,
        tara: c.tara, judet: c.judet, localitate: c.localitate,
      }, { onConflict: 'nume' })

      // 2. Update rezervari with phone by matching name
      if (!clientErr && c.telefon) {
        await supabase.from('rezervari')
          .update({ telefon_client: c.telefon })
          .ilike('nume_client', `%${c.nume.split(' ')[0]}%`)
          .is('telefon_client', null)
      }

      clientErr ? err++ : ok++
    }

    setImported(ok); setErrors(err); setImporting(false); setStep('done')
  }

  const valid = rows.filter(r=>r.valid).length
  const noPhone = rows.filter(r=>!r.valid).length

  if (step==='done') return (
    <div style={{...panel,padding:48,textAlign:'center'}}>
      <CheckCircle2 size={40} color="#4ADE80" style={{margin:'0 auto 16px'}}/>
      <h2 style={{fontSize:18,fontWeight:700,color:'#FFFFFF',marginBottom:8}}>Clienți importați!</h2>
      <p style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:8}}>{imported} clienți adăugați/actualizați</p>
      <p style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginBottom:24}}>Numerele de telefon au fost asociate automat la rezervările existente.</p>
      <Button variant="secondary" onClick={()=>{setStep('upload');setRows([]);setFile(null)}}>Import nou</Button>
    </div>
  )

  if (step==='upload') return (
    <div style={{...panel,padding:48,textAlign:'center'}}>
      <Users size={36} color="#4DA3FF" style={{margin:'0 auto 16px'}}/>
      <h2 style={{fontSize:16,fontWeight:600,color:'#FFFFFF',marginBottom:8}}>Import Lista Clienți din 5starDesk</h2>
      <p style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginBottom:8,maxWidth:420,margin:'0 auto 8px'}}>Din 5starDesk → Rapoarte → Lista Clienți → Excel</p>
      <p style={{fontSize:11,color:'rgba(159,215,255,0.35)',marginBottom:24,maxWidth:380,margin:'0 auto 24px'}}>Importul asociază automat numărul de telefon la clienții din rezervări după numele clientului.</p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
      <Button variant="primary" icon={<Upload size={14}/>} onClick={()=>inputRef.current?.click()}>Selectează Lista Clienți</Button>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{...panel,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Users size={18} color="#4DA3FF"/>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'#FFFFFF'}}>{file?.name}</div>
            <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>{rows.length} clienți · {valid} cu telefon</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:7,padding:'4px 10px',textAlign:'center'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{valid}</div>
            <div style={{fontSize:9,color:'rgba(159,215,255,0.4)'}}>cu telefon</div>
          </div>
          {noPhone>0&&<div style={{background:'rgba(148,163,184,0.1)',border:'1px solid rgba(148,163,184,0.15)',borderRadius:7,padding:'4px 10px',textAlign:'center'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#94A3B8',fontFamily:'monospace'}}>{noPhone}</div>
            <div style={{fontSize:9,color:'rgba(159,215,255,0.4)'}}>fără telefon</div>
          </div>}
          <Button variant="primary" size="sm" icon={<ArrowRight size={13}/>} onClick={doImport} loading={importing}>Importă + Sincronizează</Button>
          <Button variant="ghost" size="sm" icon={<X size={12}/>} onClick={()=>{setStep('upload');setRows([]);setFile(null)}}/>
        </div>
      </div>
      <div style={{...panel,overflow:'hidden'}}>
        <div style={{overflowX:'auto',maxHeight:460,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead style={{position:'sticky',top:0,background:'rgba(14,27,43,0.95)'}}>
              <tr>{['','Nume','Telefon','Email','Țară','Localitate'].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:9,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(159,215,255,0.08)',whiteSpace:'nowrap'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.slice(0,150).map((r,i)=>(
                <tr key={i} style={{opacity:r.valid?1:0.4}}>
                  <td style={{padding:'7px 10px',borderBottom:'1px solid rgba(159,215,255,0.04)'}}>{r.valid?<CheckCircle2 size={12} color="#4ADE80"/>:<AlertCircle size={12} color="#94A3B8"/>}</td>
                  <td style={{padding:'7px 10px',fontSize:12,fontWeight:500,color:'#FFFFFF',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis'}}>{r.nume}</td>
                  <td style={{padding:'7px 10px',fontSize:11,color:'#4ADE80',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>
                    {r.telefon ? (
                      <a href={`https://wa.me/${r.telefon.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:'#4ADE80',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}>
                        <Phone size={10}/>{r.telefon}
                      </a>
                    ) : <span style={{color:'rgba(159,215,255,0.3)'}}>—</span>}
                  </td>
                  <td style={{padding:'7px 10px',fontSize:11,color:'rgba(159,215,255,0.5)',borderBottom:'1px solid rgba(159,215,255,0.04)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {r.email ? <a href={`mailto:${r.email}`} style={{color:'rgba(159,215,255,0.5)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3}}><Mail size={9}/>{r.email}</a> : '—'}
                  </td>
                  <td style={{padding:'7px 10px',fontSize:11,color:'rgba(214,228,244,0.5)',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap'}}>{r.tara||'—'}</td>
                  <td style={{padding:'7px 10px',fontSize:11,color:'rgba(214,228,244,0.5)',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap'}}>{r.localitate||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length>150&&<div style={{padding:'8px',textAlign:'center',fontSize:11,color:'rgba(159,215,255,0.3)'}}>+{rows.length-150} clienți suplimentari</div>}
        </div>
      </div>
    </div>
  )
}

/* ── MAIN PAGE ── */
export default function ImportPage() {
  const [tab, setTab] = useState<'rezervari'|'clienti'>('rezervari')

  return (
    <>
      <PageHeader title="Import date" subtitle="Import din 5starDesk Excel"/>
      <div style={{padding:'16px 24px',display:'flex',flexDirection:'column',gap:14}}>
        {/* Tabs */}
        <div style={{display:'flex',gap:4,background:'rgba(14,27,43,0.4)',borderRadius:10,padding:4,width:'fit-content'}}>
          {([['rezervari','Rezervări',<CalendarCheck size={13}/>],['clienti','Clienți + Telefoane',<Users size={13}/>]] as [string,string,React.ReactNode][]).map(([key,label,icon])=>(
            <button key={key} onClick={()=>setTab(key as any)} style={{
              display:'flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:7,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,transition:'all 0.12s',
              background:tab===key?'rgba(77,163,255,0.2)':'transparent',
              color:tab===key?'#FFFFFF':'rgba(159,215,255,0.5)',
              outline:tab===key?'1px solid rgba(77,163,255,0.3)':'none',
            }}>{icon}{label}</button>
          ))}
        </div>
        {tab==='rezervari' ? <TabRezervari/> : <TabClienti/>}
      </div>
    </>
  )
}
