'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Sparkles, X, Copy, Loader2, Link2, Wand2, Download, Clock } from 'lucide-react'

const CANALE = [
  { key: 'facebook_post',    label: 'Facebook' },
  { key: 'instagram_post',   label: 'Instagram' },
  { key: 'instagram_story',  label: 'Instagram Story' },
  { key: 'reel_script',      label: 'Reel script' },
  { key: 'tiktok_script',    label: 'TikTok script' },
  { key: 'newsletter',       label: 'Newsletter lunar' },
  { key: 'email_marketing',  label: 'Email marketing' },
  { key: 'google_business',  label: 'Google Business' },
]

const PROMPT_SUGESTII = [
  'Fă lumina mai caldă și mai primitoare',
  'Elimină dezordinea/obiectele personale din cadru',
  'Adaugă text „Disponibil acum" în colțul din dreapta sus',
  'Crop pătrat, potrivit pentru Instagram, cer mai luminos',
]

const S = { // styles
  card: { background:'rgba(11,18,36,0.75)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:12 } as React.CSSProperties,
  inp:  { background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:7, color:'rgba(214,228,244,0.85)', fontSize:12, padding:'8px 10px', outline:'none' } as React.CSSProperties,
  lbl:  { fontSize:10, fontWeight:700, color:'rgba(159,215,255,0.4)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 } as React.CSSProperties,
}

function fmtData(iso:string){ try{ const d=new Date(iso); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }catch{ return iso } }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MarketingPage() {
  const [tabMain, setTabMain] = useState<'texte'|'imagini'>('texte')
  const [apts, setApts] = useState<any[]>([])
  const [aptId, setAptId] = useState('')
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota')
      .then(({data}) => { setApts(data||[]); if (data?.length) setAptId(prev => prev || data[0].id) })
  }, [])

  const aptSel = apts.find(a => a.id === aptId)

  return (
    <>
      <PageHeader title="Generator Marketing" subtitle="Texte și imagini pentru rețele sociale, generate cu AI, pentru apartamentele în regim hotelier"/>
      <div style={{padding:'12px 20px 40px', overflowY:'auto', flex:1}}>

        <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:14, flexWrap:'wrap'}}>
          <div style={{display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid rgba(77,163,255,0.25)'}}>
            {(['texte','imagini'] as const).map(t => (
              <button key={t} onClick={()=>setTabMain(t)}
                style={{padding:'8px 16px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer',
                  background: tabMain===t ? 'rgba(77,163,255,0.35)' : 'transparent',
                  color: tabMain===t ? '#7BC8FF' : 'rgba(159,215,255,0.45)'}}>
                {t==='texte' ? '✍️ Texte' : '🖼️ Imagini'}
              </button>
            ))}
          </div>
          <div style={{flex:1, minWidth:200}}>
            <select value={aptId} onChange={e=>setAptId(e.target.value)} style={{...S.inp, width:'100%', maxWidth:340}}>
              {apts.map(a => <option key={a.id} value={a.id}>{a.nota ? `${a.nota} — ` : ''}{a.nume}</option>)}
            </select>
          </div>
        </div>

        {tabMain==='texte'
          ? <TabTexte aptId={aptId} aptSel={aptSel} show={show}/>
          : <TabImagini aptId={aptId} aptSel={aptSel} show={show}/>}
      </div>
      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

/* ══════════════════════════ TAB TEXTE ══════════════════════════ */
function TabTexte({ aptId, aptSel, show }: { aptId:string; aptSel:any; show:(t:'success'|'error',m:string)=>void }) {
  const [extra, setExtra] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string,string> | null>(null)
  const [tab, setTab] = useState(CANALE[0].key)
  const [istoric, setIstoric] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setResult(null); setImages([]); setExtra('')
    if (aptId) loadIstoric()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptId])

  async function loadIstoric() {
    try {
      const res = await fetch(`/api/marketing-generator?apartamentId=${aptId}`)
      const data = await res.json()
      setIstoric(data.istoric || [])
    } catch { /* istoricul e un bonus, nu blocam pagina daca esueaza */ }
  }

  function onFiles(files: FileList | null) {
    if (!files) return
    const slots = 6 - images.length
    Array.from(files).slice(0, slots).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => setImages(prev => prev.length < 6 ? [...prev, String(reader.result)] : prev)
      reader.readAsDataURL(file)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  function addLink() {
    const url = linkInput.trim()
    if (!url || images.length >= 6) return
    setImages(prev => [...prev, url])
    setLinkInput('')
  }

  async function genereaza() {
    if (!aptId) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/marketing-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apartamentId: aptId, extra: extra.trim() || undefined, images }),
      })
      const data = await res.json()
      if (data.error) { show('error', data.error); setLoading(false); return }
      setResult(data.result)
      setTab(CANALE[0].key)
      loadIstoric()
    } catch {
      show('error', 'Conexiune întreruptă - încearcă din nou')
    }
    setLoading(false)
  }

  async function copiaza(text: string) {
    try { await navigator.clipboard.writeText(text || ''); show('success', 'Copiat!') }
    catch { show('error', 'Nu s-a putut copia') }
  }

  return (
    <div style={{display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap'}}>

      {/* Panou stânga — sursă */}
      <div style={{...S.card, width:340, flexShrink:0, padding:16, display:'flex', flexDirection:'column', gap:12}}>
        <div>
          <div style={S.lbl}>Text sursă suplimentar (opțional) — ex. detalii, notițe</div>
          <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={6}
            placeholder="Orice vrei să știe AI-ul: puncte forte, evenimente din zonă, promoții..."
            style={{...S.inp, width:'100%', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.5}}/>
        </div>

        <div>
          <div style={S.lbl}>Fotografii (opțional, max 6) — folosite doar pentru această generare, nu se salvează</div>
          <input ref={fileRef} type="file" accept="image/*" multiple disabled={images.length>=6}
            onChange={e=>onFiles(e.target.files)} style={{...S.inp, width:'100%', boxSizing:'border-box'}}/>
          <div style={{display:'flex', gap:6, marginTop:6}}>
            <input value={linkInput} onChange={e=>setLinkInput(e.target.value)} placeholder="...sau lipește un link către o fotografie (https://...)"
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addLink()}}}
              style={{...S.inp, flex:1}} disabled={images.length>=6}/>
            <button onClick={addLink} disabled={!linkInput.trim()||images.length>=6}
              style={{padding:'0 12px', borderRadius:7, border:'1px solid rgba(100,160,255,0.25)', background:'rgba(77,163,255,0.1)', color:'#7BC8FF', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5}}>
              <Link2 size={12}/>Adaugă
            </button>
          </div>
          {images.length>0 && (
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
              {images.map((img,i)=>(
                <div key={i} style={{position:'relative', width:56, height:56, borderRadius:7, overflow:'hidden', border:'1px solid rgba(100,160,255,0.2)'}}>
                  <img src={img} alt="" style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}}/>
                  <button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))}
                    style={{position:'absolute', top:2, right:2, width:16, height:16, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.7)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0}}>
                    <X size={10}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={genereaza} disabled={!aptId||loading}
          style={{padding:'12px', borderRadius:10, border:'none', width:'100%', fontSize:13, fontWeight:700, cursor:!aptId||loading?'not-allowed':'pointer',
            background:!aptId||loading?'rgba(159,215,255,0.08)':'linear-gradient(135deg,#4DA3FF,#7C3AED)',
            color:!aptId||loading?'rgba(159,215,255,0.25)':'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
          {loading ? <><Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/>Se generează...</> : <><Sparkles size={15}/>{result ? 'Regenerează' : 'Generează'}</>}
        </button>

        {istoric.length>0 && (
          <div>
            <div style={{...S.lbl, display:'flex', alignItems:'center', gap:5}}><Clock size={11}/>Istoric ({istoric.length})</div>
            <div style={{display:'flex', flexDirection:'column', gap:4, maxHeight:220, overflowY:'auto'}}>
              {istoric.map(h => (
                <button key={h.id} onClick={()=>{setResult(h.continut); setTab(CANALE[0].key)}}
                  style={{textAlign:'left', padding:'7px 9px', borderRadius:7, border:'1px solid rgba(159,215,255,0.08)', background:'transparent', cursor:'pointer'}}>
                  <div style={{fontSize:10, color:'rgba(159,215,255,0.35)'}}>{fmtData(h.created_at)}</div>
                  <div style={{fontSize:11, color:'rgba(214,228,244,0.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {(h.continut?.facebook_post || '').slice(0,60)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panou dreapta — rezultat */}
      <div style={{...S.card, flex:'1 1 420px', minWidth:0, padding:16}}>
        {!result ? (
          <div style={{padding:'60px 20px', textAlign:'center', color:'rgba(159,215,255,0.3)', fontSize:13}}>
            {aptSel ? `Alege sursele și apasă „Generează" pentru ${aptSel.nume}` : 'Alege un apartament'}
          </div>
        ) : (
          <>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14, borderBottom:'1px solid rgba(100,160,255,0.1)', paddingBottom:12}}>
              {CANALE.map(c => (
                <button key={c.key} onClick={()=>setTab(c.key)}
                  style={{padding:'6px 12px', borderRadius:7, border:`1px solid ${tab===c.key?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.1)'}`, background:tab===c.key?'rgba(77,163,255,0.15)':'transparent', color:tab===c.key?'#7BC8FF':'rgba(159,215,255,0.45)', fontSize:11, fontWeight:600, cursor:'pointer'}}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{fontSize:13, color:'rgba(214,228,244,0.85)', whiteSpace:'pre-wrap', lineHeight:1.7, minHeight:120}}>
              {result[tab] || '—'}
            </div>
            <button onClick={()=>copiaza(result[tab])}
              style={{marginTop:14, padding:'9px 16px', borderRadius:8, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7}}>
              <Copy size={13}/>Copiază textul
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════ TAB IMAGINI ══════════════════════════ */
function TabImagini({ aptId, aptSel, show }: { aptId:string; aptSel:any; show:(t:'success'|'error',m:string)=>void }) {
  const [source, setSource] = useState<string|null>(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [istoric, setIstoric] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSource(null); setResult(null); setPrompt('')
    if (aptId) loadIstoric()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptId])

  async function loadIstoric() {
    try {
      const res = await fetch(`/api/marketing-imagine?apartamentId=${aptId}`)
      const data = await res.json()
      setIstoric(data.istoric || [])
    } catch { /* istoricul e un bonus, nu blocam pagina daca esueaza */ }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setSource(await fileToDataUrl(file))
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function editeaza() {
    if (!aptId || !source || !prompt.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/marketing-imagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apartamentId: aptId, prompt: prompt.trim(), sourceImage: source }),
      })
      const data = await res.json()
      if (data.error) { show('error', data.error); setLoading(false); return }
      setResult(data.result)
      loadIstoric()
    } catch {
      show('error', 'Conexiune întreruptă - încearcă din nou')
    }
    setLoading(false)
  }

  return (
    <div style={{display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap'}}>

      {/* Panou stânga — sursă + prompt */}
      <div style={{...S.card, width:340, flexShrink:0, padding:16, display:'flex', flexDirection:'column', gap:12}}>
        <div>
          <div style={S.lbl}>Poză de editat</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={e=>onFile(e.target.files?.[0])}
            style={{...S.inp, width:'100%', boxSizing:'border-box'}}/>
          {source && (
            <img src={source} alt="" style={{width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8, marginTop:8, border:'1px solid rgba(100,160,255,0.2)'}}/>
          )}
        </div>

        <div>
          <div style={S.lbl}>Ce vrei să modifici — descrie în cuvinte</div>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={4}
            placeholder="ex. Fă lumina mai caldă, adaugă text «Disponibil acum» în colț..."
            style={{...S.inp, width:'100%', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.5}}/>
          <div style={{display:'flex', flexWrap:'wrap', gap:5, marginTop:7}}>
            {PROMPT_SUGESTII.map(s => (
              <button key={s} onClick={()=>setPrompt(s)}
                style={{padding:'4px 9px', borderRadius:6, border:'1px solid rgba(159,215,255,0.12)', background:'transparent', color:'rgba(159,215,255,0.4)', fontSize:10, cursor:'pointer'}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <button onClick={editeaza} disabled={!aptId||!source||!prompt.trim()||loading}
          style={{padding:'12px', borderRadius:10, border:'none', width:'100%', fontSize:13, fontWeight:700, cursor:(!aptId||!source||!prompt.trim()||loading)?'not-allowed':'pointer',
            background:(!aptId||!source||!prompt.trim()||loading)?'rgba(159,215,255,0.08)':'linear-gradient(135deg,#4DA3FF,#7C3AED)',
            color:(!aptId||!source||!prompt.trim()||loading)?'rgba(159,215,255,0.25)':'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
          {loading ? <><Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/>Se editează... (poate dura ~30s)</> : <><Wand2 size={15}/>Editează</>}
        </button>

        {istoric.length>0 && (
          <div>
            <div style={{...S.lbl, display:'flex', alignItems:'center', gap:5}}><Clock size={11}/>Istoric ({istoric.length})</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', maxHeight:180, overflowY:'auto'}}>
              {istoric.map(h => (
                <button key={h.id} onClick={()=>setResult(h)} title={h.prompt}
                  style={{width:52, height:52, borderRadius:7, overflow:'hidden', border:'1px solid rgba(100,160,255,0.2)', padding:0, cursor:'pointer'}}>
                  <img src={h.imagine_rezultat_url} alt="" style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}}/>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panou dreapta — rezultat */}
      <div style={{...S.card, flex:'1 1 420px', minWidth:0, padding:16}}>
        {!result ? (
          <div style={{padding:'60px 20px', textAlign:'center', color:'rgba(159,215,255,0.3)', fontSize:13}}>
            {aptSel ? `Încarcă o poză, scrie ce vrei modificat și apasă „Editează" pentru ${aptSel.nume}` : 'Alege un apartament'}
          </div>
        ) : (
          <>
            <div style={{fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:12}}>{result.prompt}</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div>
                <div style={{...S.lbl, marginBottom:8}}>Înainte</div>
                {result.imagine_sursa_url && <img src={result.imagine_sursa_url} alt="" style={{width:'100%', borderRadius:8, border:'1px solid rgba(100,160,255,0.15)'}}/>}
              </div>
              <div>
                <div style={{...S.lbl, marginBottom:8, color:'rgba(74,222,128,0.6)'}}>După</div>
                <img src={result.imagine_rezultat_url} alt="" style={{width:'100%', borderRadius:8, border:'1px solid rgba(74,222,128,0.25)'}}/>
              </div>
            </div>
            <a href={result.imagine_rezultat_url} download target="_blank" rel="noreferrer"
              style={{marginTop:14, padding:'9px 16px', borderRadius:8, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', fontSize:12, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, textDecoration:'none'}}>
              <Download size={13}/>Descarcă rezultatul
            </a>
          </>
        )}
      </div>
    </div>
  )
}
