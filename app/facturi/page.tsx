'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Upload, FileText, Check, Trash2, Plus, Loader, AlertCircle } from 'lucide-react'

const FURNIZORI_LIST = [
  'E.ON Curent','E.ON Gaz','Urbica','TermoService','Salubris',
  'Orange','Vodafone','Royal','Internet','Asociatie','Alta',
]

const FURNIZOR_COLORS: Record<string,string> = {
  'E.ON Curent':  '#FCD34D','E.ON Gaz':    '#FB923C',
  'Urbica':       '#60A5FA','TermoService':'#F87171',
  'Salubris':     '#4ADE80','Orange':      '#FB923C',
  'Vodafone':     '#F87171','Royal':       '#C084FC',
  'Internet':     '#38BDF8','Asociatie':   '#A78BFA',
  'Alta':         '#94A3B8',
}

type Factura = {
  id?: string
  filename: string
  furnizor: string
  categorieLabel: string
  suma_totala: number
  moneda: string
  data_scadenta: string | null
  perioada: string
  nr_factura: string
  tip_serviciu: string
  detalii: string
  apartament_id: string | null
  status: 'procesat' | 'salvat' | 'eroare'
  processing?: boolean
  base64Preview?: string
  mimeType?: string
  cheltuiala_id?: string
}

export default function FacturiPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [facturi, setFacturi] = useState<Factura[]>([])
  const [apts, setApts] = useState<any[]>([])
  const [savedFacturi, setSavedFacturi] = useState<any[]>([])
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<Factura | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    loadApts()
    loadSaved()
  }, [])

  async function loadApts() {
    const { data } = await supabase.from('apartamente').select('id,nume,nota,adresa').eq('status','activ').order('nume')
    setApts(data || [])
  }

  // Auto-potrivire apartament dupa adresa din factura
  function matchApartament(adresaFactura: string | null, aptList: any[]): string | null {
    if (!adresaFactura || !aptList.length) return null
    const af = adresaFactura.toLowerCase().replace(/[,.\-]/g,' ').replace(/\s+/g,' ').trim()
    const keywords = af.split(' ').filter((w:string) => w.length > 3)
    let bestMatch: {id:string; score:number} | null = null
    for (const apt of aptList) {
      const aptAddr = (apt.adresa || '').toLowerCase().replace(/[,.\-]/g,' ')
      if (!aptAddr) continue
      let score = 0
      for (const kw of keywords) {
        if (aptAddr.includes(kw)) score++
      }
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: apt.id, score }
      }
    }
    return bestMatch && bestMatch.score >= 2 ? bestMatch.id : null
  }

  async function loadSaved() {
    const now = new Date()
    const luna = now.getMonth() + 1
    const an = now.getFullYear()
    const pad = (n: number) => String(n).padStart(2,'0')
    const { data } = await supabase.from('cheltuieli')
      .select('id,descriere,valoare,data,nota,categorie,status,apartament_id')
      .gte('data', `${an}-${pad(luna)}-01`)
      .lte('data', `${an}-${pad(luna)}-31`)
      .not('nota', 'is', null)
      .order('created_at', { ascending: false })
    setSavedFacturi(data || [])
  }

  async function processFile(file: File) {
    const id = Math.random().toString(36).slice(2)
    const mimeType = file.type || 'application/pdf'

    // add placeholder
    setFacturi(f => [...f, {
      id, filename: file.name, furnizor: '...', categorieLabel: '...', suma_totala: 0,
      moneda: 'RON', data_scadenta: null, perioada: '', nr_factura: '', tip_serviciu: '',
      detalii: '', apartament_id: null, status: 'procesat', processing: true,
    }])

    // convert to base64
    const base64Data = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })

    // preview URL
    const previewUrl = URL.createObjectURL(file)

    try {
      const resp = await fetch('/api/facturi-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType, filename: file.name })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      const autoAptId = matchApartament(data.adresa_consum, apts)
      setFacturi(f => f.map(x => x.id === id ? {
        ...x, ...data, id, processing: false,
        base64Preview: previewUrl, mimeType, status: 'procesat' as const,
        apartament_id: autoAptId,
      } : x))
      if (autoAptId) {
        const aptNume = apts.find(a => a.id === autoAptId)?.nume || ''
        show('info', `Asociat automat cu ${aptNume} (dupa adresa)`)
      }
    } catch (e: any) {
      setFacturi(f => f.map(x => x.id === id ? { ...x, processing: false, status: 'eroare' as const, furnizor: 'Eroare extragere' } : x))
      show('error', 'Eroare la procesare: ' + e.message)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(f => {
      if (f.type === 'application/pdf' || f.type.startsWith('image/')) processFile(f)
      else show('error', `${f.name}: doar PDF sau imagine`)
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  async function saveToSupabase(f: Factura) {
    if (!f.id) return
    setSaving(f.id)
    const now = new Date()
    const pad = (n:number) => String(n).padStart(2,'0')
    const dataScadenta = f.data_scadenta || `${now.getFullYear()}-${pad(now.getMonth()+1)}-25`
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: f.apartament_id || null,
      categorie: f.categorieLabel?.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z_]/g,'') || 'alta',
      descriere: `${f.categorieLabel} — ${f.furnizor}`,
      valoare: f.suma_totala,
      data: dataScadenta,
      status: 'nevalidat',
      suportat_de: 'administrator',
      tva: 0,
      nota: `Factură ${f.nr_factura || f.filename} | ${f.perioada || ''}`.trim(),
    }).select().single()

    if (error) { show('error', error.message) }
    else {
      setFacturi(list => list.map(x => x.id === f.id ? { ...x, status: 'salvat' as const, cheltuiala_id: data.id } : x))
      show('success', `${f.categorieLabel} ${f.suma_totala} RON salvat în cheltuieli`)
      loadSaved()
    }
    setSaving(null)
  }

  function removeFactura(id: string) {
    setFacturi(f => f.filter(x => x.id !== id))
  }

  const glassCard: React.CSSProperties = {
    background: 'rgba(20,38,65,0.6)',
    border: '1px solid rgba(100,160,255,0.15)',
    borderRadius: 14,
    backdropFilter: 'blur(12px)',
  }

  return (
    <>
      <PageHeader title="Facturi & Documente" subtitle="Încarcă și extrage automat datele din facturi"/>

      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 40px' }}>

        {/* ── Drop zone ── */}
        <div
          ref={dropRef}
          onDragOver={e=>{e.preventDefault();setDragging(true)}}
          onDragLeave={()=>setDragging(false)}
          onDrop={onDrop}
          onClick={()=>fileRef.current?.click()}
          style={{
            ...glassCard,
            marginBottom: 24,
            padding: '40px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            cursor: 'pointer', transition: 'all .2s',
            border: `2px dashed ${dragging ? 'rgba(77,163,255,0.6)' : 'rgba(100,160,255,0.2)'}`,
            background: dragging ? 'rgba(77,163,255,0.08)' : 'rgba(20,38,65,0.4)',
          }}
        >
          <div style={{ width:52, height:52, borderRadius:14, background:'rgba(77,163,255,0.12)', border:'1px solid rgba(77,163,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Upload size={24} color="var(--accent-blue)"/>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:4 }}>Trage facturile aici sau click pentru a selecta</div>
            <div style={{ fontSize:12, color:'rgba(159,215,255,0.45)' }}>PDF, JPG, PNG — E.ON, Urbica, TermoService, Salubris, Orange, Vodafone, Royal și altele</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,image/*" multiple onChange={e=>handleFiles(e.target.files)} style={{display:'none'}}/>
        </div>

        {/* ── Facturi procesate ── */}
        {facturi.length > 0 && (
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>
              Facturi procesate — {facturi.length}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {facturi.map(f => {
                const color = FURNIZOR_COLORS[f.categorieLabel] || '#94A3B8'
                const isSaving = saving === f.id
                return (
                  <div key={f.id} style={{ ...glassCard, overflow:'hidden', borderLeft:`3px solid ${f.status==='salvat'?'#4ADE80':f.status==='eroare'?'#F87171':color}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px' }}>
                      {/* icon */}
                      <div style={{ width:40, height:40, borderRadius:10, background:`${color}18`, border:`1px solid ${color}33`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {f.processing
                          ? <Loader size={18} color={color} style={{ animation:'spin 1s linear infinite' }}/>
                          : f.status==='eroare'
                          ? <AlertCircle size={18} color="#F87171"/>
                          : <FileText size={18} color={color}/>
                        }
                      </div>

                      {/* info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        {f.processing ? (
                          <div style={{ fontSize:13, color:'rgba(159,215,255,0.5)' }}>Se procesează {f.filename}...</div>
                        ) : (
                          <>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                              <span style={{ fontSize:11, fontWeight:600, color, background:`${color}18`, padding:'2px 8px', borderRadius:5, textTransform:'uppercase', letterSpacing:'.04em' }}>{f.categorieLabel}</span>
                              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{f.furnizor}</span>
                              {f.nr_factura && <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>#{f.nr_factura}</span>}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                              <span style={{ fontSize:18, fontWeight:700, color: f.status==='salvat'?'#4ADE80': color, letterSpacing:'-.5px' }}>
                                {f.suma_totala?.toLocaleString('ro-RO',{minimumFractionDigits:2})} <span style={{ fontSize:11, fontWeight:400 }}>RON</span>
                              </span>
                              {f.data_scadenta && <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>scad. {f.data_scadenta}</span>}
                              {f.perioada && <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>{f.perioada}</span>}
                            </div>
                          </>
                        )}
                      </div>

                      {/* apartament selector */}
                      {!f.processing && f.status !== 'eroare' && (
                        <div style={{ flexShrink:0 }}>
                          <select
                            value={f.apartament_id || ''}
                            onChange={e => setFacturi(list => list.map(x => x.id===f.id ? {...x, apartament_id: e.target.value||null} : x))}
                            style={{ background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:7, color:'rgba(159,215,255,0.7)', fontSize:12, padding:'6px 10px', outline:'none', maxWidth:160 }}
                          >
                            <option value="">— Apartament —</option>
                            {apts.map(a => <option key={a.id} value={a.id}>{a.nota ? `${a.nota} ` : ''}{a.nume}</option>)}
                          </select>
                        </div>
                      )}

                      {/* actiuni */}
                      {!f.processing && (
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {f.status !== 'salvat' && f.status !== 'eroare' && (
                            <button
                              onClick={() => saveToSupabase(f)}
                              disabled={!!isSaving}
                              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background: isSaving?'rgba(77,163,255,0.3)':'var(--accent-blue)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s' }}
                            >
                              {isSaving ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : <Check size={12}/>}
                              {isSaving ? 'Se salvează...' : 'Salvează'}
                            </button>
                          )}
                          {f.status === 'salvat' && (
                            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.25)', color:'#4ADE80', fontSize:12, fontWeight:600 }}>
                              <Check size={12}/>Salvat
                            </div>
                          )}
                          <button onClick={() => removeFactura(f.id!)}
                            style={{ padding:'7px 9px', borderRadius:8, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer', display:'flex', alignItems:'center' }}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* detalii expandate */}
                    {!f.processing && f.detalii && (
                      <div style={{ padding:'8px 18px 12px', borderTop:'1px solid rgba(100,160,255,0.08)', fontSize:11, color:'rgba(159,215,255,0.35)' }}>
                        {f.detalii}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Facturi salvate luna curentă ── */}
        {savedFacturi.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>
              Facturi salvate luna aceasta — {savedFacturi.length}
            </div>
            <div style={{ ...glassCard, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 90px', background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(100,160,255,0.1)', padding:'8px 16px' }}>
                {['Descriere','Data','Valoare','Status'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:500, color:'rgba(159,215,255,0.4)', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</div>
                ))}
              </div>
              {savedFacturi.map((f,i) => (
                <div key={f.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 90px', padding:'10px 16px', borderBottom: i<savedFacturi.length-1?'1px solid rgba(100,160,255,0.06)':'none', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{f.descriere}</div>
                    {f.nota && <div style={{ fontSize:11, color:'rgba(159,215,255,0.35)', marginTop:2 }}>{f.nota}</div>}
                  </div>
                  <div style={{ fontSize:12, color:'rgba(159,215,255,0.5)', fontFamily:'monospace' }}>{f.data}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'monospace' }}>{Number(f.valoare).toLocaleString('ro-RO')} RON</div>
                  <div>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:5, background: f.status==='validat'?'rgba(74,222,128,0.12)':'rgba(252,211,77,0.1)', color: f.status==='validat'?'#4ADE80':'#FCD34D', fontWeight:500 }}>
                      {f.status==='validat'?'Plătit':'Neachitat'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <Toast toast={toast}/>
    </>
  )
}
