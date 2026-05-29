'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { Sparkles, Upload, X, Copy, Check, MessageCircle, ArrowRight, Loader2, Image as ImageIcon, Type } from 'lucide-react'

type Result = {
  nume_client?: string; telefon?: string; email?: string
  data_checkin?: string; data_checkout?: string; nr_persoane?: number
  nr_nopti?: number; buget?: string; buget_per_noapte?: string; preferinte?: string
  canal?: string; limba?: string; urgenta?: boolean
  disponibile?: number; indisponibile?: number; indisponibile_apt?: string[]
  rezumat?: string
  apartamente_recomandate?: { nota: string; nume: string; motiv: string; pret_noapte?: number; pret_total?: number; scor: number }[]
  raspuns_sugerat?: string; observatii?: string
}

export default function SmartBookingPage() {
  const [mode, setMode] = useState<'text'|'image'>('text')
  const [text, setText] = useState('')
  const [image, setImage] = useState<{base64:string;type:string;preview:string}|null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result|null>(null)
  const [apts, setApts] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume,capacitate_max,pret_standard,adresa').order('nota').then(({data}) => setApts(data||[]))
  }, [])

  async function handleImageUpload(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setImage({ base64, type: file.type, preview: dataUrl })
      setMode('image')
    }
    reader.readAsDataURL(file)
  }

  async function analyze() {
    if (!text.trim() && !image) { show('error', 'Adaugă un mesaj sau o imagine'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/smart-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mode === 'text' ? text : undefined,
          imageBase64: image?.base64,
          imageType: image?.type,
          apartamente: apts,
        })
      })
      const data = await res.json()
      if (data.ok) setResult(data.result)
      else { show('error', 'Eroare AI'); console.error(data.raw) }
    } catch(e: any) { show('error', e.message) }
    setLoading(false)
  }

  async function saveCerere() {
    if (!result) return
    setSaving(true)
    const apt = apts.find(a => a.nota === result.apartamente_recomandate?.[0]?.nota)
    const { error } = await supabase.from('cereri_rezervare').insert({
      nume_client: result.nume_client || 'Client necunoscut',
      telefon: result.telefon || null,
      canal: result.canal || 'direct',
      apartament_id: apt?.id || null,
      data_checkin: result.data_checkin || null,
      data_checkout: result.data_checkout || null,
      nr_persoane: result.nr_persoane || null,
      mesaj: text || '[din imagine]',
      status: 'noua',
      prioritate: result.urgenta ? 'urgenta' : 'normala',
    })
    if (error) { show('error', error.message) }
    else { show('success', 'Cerere salvată în Inbox! ✓') }
    setSaving(false)
  }

  function copyRaspuns() {
    if (result?.raspuns_sugerat) {
      navigator.clipboard.writeText(result.raspuns_sugerat)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14 }

  return (
    <>
      <PageHeader title="Smart Booking AI" subtitle="Analizează mesaje și găsește apartamentul potrivit"/>
      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto', flex:1, maxWidth:800 }}>

        {/* Input section */}
        <div style={{ ...panel, padding:20 }}>
          {/* Mode tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:16, background:'rgba(14,27,43,0.4)', borderRadius:8, padding:3, width:'fit-content' }}>
            {[['text','Mesaj text',<Type size={13}/>],['image','Imagine / Screenshot',<ImageIcon size={13}/>]].map(([k,l,icon])=>(
              <button key={k as string} onClick={()=>setMode(k as 'text'|'image')} style={{
                display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,
                background:mode===k?'rgba(77,163,255,0.2)':'transparent',
                color:mode===k?'#FFFFFF':'rgba(159,215,255,0.45)',
                outline:mode===k?'1px solid rgba(77,163,255,0.3)':'none',
              }}>{icon as any}{l as string}</button>
            ))}
          </div>

          {mode === 'text' ? (
            <textarea
              value={text}
              onChange={e=>setText(e.target.value)}
              placeholder={'Lipește mesajul primit:\n\nEx: "Bună ziua! Aș dori o rezervare pentru 2 persoane în perioada 15-18 iunie. Avem un buget de 300 lei/noapte. Preferăm zona Palas sau centru. Puteți confirma disponibilitatea? Mulțumesc, Ana"\n\nSau mesaj în engleză, franceză etc.'}
              style={{
                width:'100%', minHeight:130, padding:'12px 14px',
                background:'rgba(214,228,244,0.07)', border:'1px solid rgba(159,215,255,0.15)',
                borderRadius:10, color:'#FFFFFF', fontSize:13,
                fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6,
              }}
            />
          ) : (
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&handleImageUpload(e.target.files[0])}/>
              {!image ? (
                <div
                  onClick={()=>fileRef.current?.click()}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();e.dataTransfer.files[0]&&handleImageUpload(e.dataTransfer.files[0])}}
                  style={{
                    border:'2px dashed rgba(159,215,255,0.2)', borderRadius:12,
                    padding:'40px 20px', textAlign:'center', cursor:'pointer',
                    background:'rgba(214,228,244,0.03)',
                    transition:'border-color 0.15s',
                  }}
                >
                  <Upload size={28} color="rgba(159,215,255,0.3)" style={{margin:'0 auto 10px'}}/>
                  <div style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:4}}>Click sau drag & drop</div>
                  <div style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>Screenshot WhatsApp, Airbnb, Booking, Email</div>
                </div>
              ) : (
                <div style={{position:'relative',display:'inline-block'}}>
                  <img src={image.preview} alt="preview" style={{maxWidth:'100%',maxHeight:300,borderRadius:10,border:'1px solid rgba(159,215,255,0.15)'}}/>
                  <button onClick={()=>setImage(null)} style={{position:'absolute',top:8,right:8,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:6,width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(159,215,255,0.7)'}}>
                    <X size={13}/>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={analyze}
            disabled={loading||(!text.trim()&&!image)}
            style={{
              marginTop:12, width:'100%', padding:'11px',
              borderRadius:10, cursor:loading?'wait':'pointer',
              background:loading||(!text.trim()&&!image)?'rgba(77,163,255,0.25)':'rgba(77,163,255,0.85)',
              border:'1px solid rgba(159,215,255,0.3)', color:'#FFFFFF',
              fontSize:13, fontWeight:500, display:'flex', alignItems:'center',
              justifyContent:'center', gap:8,
            }}
          >
            {loading
              ? <><Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/> Analizează cu AI...</>
              : <><Sparkles size={15}/> Analizează cererea</>
            }
          </button>
        </div>

        {/* Results */}
        {result && (
          <div style={{display:'flex',flexDirection:'column',gap:12,animation:'fadeIn 0.2s ease'}}>

            {/* Availability strip */}
            {(result.disponibile !== undefined) && (
              <div style={{display:'flex',gap:10}}>
                <div style={{flex:1,padding:'12px 16px',borderRadius:12,background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{result.disponibile}</div>
                  <div style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginTop:2}}>✓ Disponibile în perioadă</div>
                </div>
                <div style={{flex:1,padding:'12px 16px',borderRadius:12,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',textAlign:'center'}}>
                  <div style={{fontSize:24,fontWeight:700,color:'#F87171',fontFamily:'monospace'}}>{result.indisponibile}</div>
                  <div style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginTop:2}}>✗ Ocupate în perioadă</div>
                </div>
                {result.nr_nopti && (
                  <div style={{flex:1,padding:'12px 16px',borderRadius:12,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#7BC8FF',fontFamily:'monospace'}}>{result.nr_nopti}</div>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginTop:2}}>nopți</div>
                  </div>
                )}
              </div>
            )}

            {/* Extracted info */}
            <div style={{...panel,padding:18}}>
              <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.5)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12}}>Date extrase din mesaj</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                {[
                  {l:'Client', v:result.nume_client, c:'#FFFFFF'},
                  {l:'Telefon', v:result.telefon, c:'#4ADE80'},
                  {l:'Email', v:result.email, c:'#7BC8FF'},
                  {l:'Check-in', v:result.data_checkin, c:'#FCD34D'},
                  {l:'Check-out', v:result.data_checkout, c:'#FCD34D'},
                  {l:'Persoane', v:result.nr_persoane ? `${result.nr_persoane} pers.` : null, c:'rgba(214,228,244,0.7)'},
                  {l:'Nopți', v:result.nr_nopti ? `${result.nr_nopti} nopți` : null, c:'rgba(214,228,244,0.7)'},
                  {l:'Buget', v:result.buget, c:'#4ADE80'},
                  {l:'Canal', v:result.canal, c:'rgba(159,215,255,0.7)'},
                  {l:'Urgență', v:result.urgenta?'🔴 Da':null, c:'#F87171'},
                ].filter(i=>i.v).map(i=>(
                  <div key={i.l} style={{background:'rgba(14,27,43,0.4)',borderRadius:8,padding:'8px 10px'}}>
                    <div style={{fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.5px'}}>{i.l}</div>
                    <div style={{fontSize:12,fontWeight:500,color:i.c}}>{i.v}</div>
                  </div>
                ))}
              </div>
              {result.preferinte && (
                <div style={{marginTop:10,padding:'8px 12px',background:'rgba(77,163,255,0.06)',borderRadius:8,fontSize:12,color:'rgba(159,215,255,0.6)',borderLeft:'2px solid rgba(77,163,255,0.3)'}}>
                  <span style={{color:'rgba(159,215,255,0.4)',fontSize:10}}>Preferințe: </span>{result.preferinte}
                </div>
              )}
            </div>

            {/* Recommendations */}
            {result.apartamente_recomandate && result.apartamente_recomandate.length > 0 && (
              <div style={{...panel,padding:18}}>
                <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.5)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12}}>
                  <Sparkles size={12} style={{marginRight:6,display:'inline'}}/>Apartamente recomandate de AI
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {result.apartamente_recomandate.map((apt,i)=>{
                    // price data comes from API result directly
                    const isTop = i === 0
                    return (
                      <div key={apt.nota} style={{
                        display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                        background:isTop?'rgba(77,163,255,0.1)':'rgba(214,228,244,0.04)',
                        border:`1px solid ${isTop?'rgba(77,163,255,0.25)':'rgba(159,215,255,0.08)'}`,
                        borderRadius:10,
                      }}>
                        <div style={{
                          width:32,height:32,borderRadius:8,flexShrink:0,
                          background:isTop?'rgba(77,163,255,0.2)':'rgba(159,215,255,0.08)',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:14,fontWeight:700,color:isTop?'#4DA3FF':'rgba(159,215,255,0.4)',
                          fontFamily:'monospace',
                        }}>#{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                            <span style={{fontSize:13,fontWeight:600,color:'#FFFFFF'}}>{apt.nume}</span>
                            {apt.nota && <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'rgba(77,163,255,0.1)',color:'#7BC8FF',fontFamily:'monospace'}}>{apt.nota}</span>}
                            {apt.pret_noapte && <span style={{fontSize:11,color:'#4ADE80'}}>{apt.pret_noapte} RON/n</span>}{apt.pret_total && <span style={{fontSize:11,color:'#FCD34D',marginLeft:4}}>= {apt.pret_total} RON total</span>}
                          </div>
                          <div style={{fontSize:12,color:'rgba(159,215,255,0.5)'}}>{apt.motiv}</div>
                        </div>
                        {/* Score bar */}
                        <div style={{flexShrink:0,textAlign:'center',minWidth:50}}>
                          <div style={{fontSize:16,fontWeight:700,color:apt.scor>=8?'#4ADE80':apt.scor>=6?'#FCD34D':'#94A3B8',fontFamily:'monospace'}}>{apt.scor}/10</div>
                          <div style={{width:50,height:4,borderRadius:2,background:'rgba(159,215,255,0.1)',marginTop:3}}>
                            <div style={{height:'100%',borderRadius:2,width:`${apt.scor*10}%`,background:apt.scor>=8?'#4ADE80':apt.scor>=6?'#FCD34D':'#94A3B8'}}/>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Suggested reply */}
            {result.raspuns_sugerat && (
              <div style={{...panel,padding:18}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.5)',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                    <MessageCircle size={12} style={{marginRight:6,display:'inline'}}/>Răspuns sugerat
                    {result.limba && result.limba !== 'ro' && <span style={{marginLeft:8,fontSize:10,background:'rgba(245,158,11,0.15)',color:'#FCD34D',padding:'1px 6px',borderRadius:4}}>🌍 {result.limba}</span>}
                  </div>
                  <button onClick={copyRaspuns} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:7,background:copied?'rgba(34,197,94,0.15)':'rgba(77,163,255,0.1)',border:`1px solid ${copied?'rgba(34,197,94,0.3)':'rgba(77,163,255,0.2)'}`,color:copied?'#4ADE80':'#7BC8FF',fontSize:11,cursor:'pointer'}}>
                    {copied?<><Check size={11}/> Copiat!</>:<><Copy size={11}/> Copiază</>}
                  </button>
                </div>
                <div style={{padding:'12px 14px',background:'rgba(14,27,43,0.4)',borderRadius:10,fontSize:13,color:'rgba(214,228,244,0.8)',lineHeight:1.7,whiteSpace:'pre-wrap',borderLeft:'2px solid rgba(77,163,255,0.3)'}}>
                  {result.raspuns_sugerat}
                </div>
              </div>
            )}

            {/* Save button */}
            <div style={{display:'flex',gap:10}}>
              <button onClick={saveCerere} disabled={saving} style={{
                flex:1,padding:'11px',borderRadius:10,cursor:'pointer',
                background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',
                color:'#4ADE80',fontSize:13,fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              }}>
                {saving?<Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>:<ArrowRight size={14}/>}
                Salvează în Inbox Cereri
              </button>
              <button onClick={()=>{setResult(null);setText('');setImage(null)}} style={{padding:'11px 20px',borderRadius:10,background:'transparent',border:'1px solid rgba(159,215,255,0.12)',color:'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer'}}>
                Nou
              </button>
            </div>

          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
