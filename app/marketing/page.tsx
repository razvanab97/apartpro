'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Sparkles, X, Copy, Loader2, Link2 } from 'lucide-react'

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

const S = { // styles
  card: { background:'rgba(11,18,36,0.75)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:12 } as React.CSSProperties,
  inp:  { background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:7, color:'rgba(214,228,244,0.85)', fontSize:12, padding:'8px 10px', outline:'none' } as React.CSSProperties,
  lbl:  { fontSize:10, fontWeight:700, color:'rgba(159,215,255,0.4)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 } as React.CSSProperties,
}

export default function MarketingPage() {
  const [apts, setApts] = useState<any[]>([])
  const [aptId, setAptId] = useState('')
  const [extra, setExtra] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string,string> | null>(null)
  const [tab, setTab] = useState(CANALE[0].key)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota')
      .then(({data}) => { setApts(data||[]); if (data?.length && !aptId) setAptId(data[0].id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    } catch {
      show('error', 'Conexiune întreruptă - încearcă din nou')
    }
    setLoading(false)
  }

  async function copiaza() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result[tab] || '')
      show('success', 'Copiat!')
    } catch {
      show('error', 'Nu s-a putut copia')
    }
  }

  const aptSel = apts.find(a => a.id === aptId)

  return (
    <>
      <PageHeader title="Generator Marketing" subtitle="Conținut social media pentru apartamentele în regim hotelier, generat cu AI"/>
      <div style={{padding:'12px 20px 40px', overflowY:'auto', flex:1}}>
        <div style={{display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap'}}>

          {/* Panou stânga — sursă */}
          <div style={{...S.card, width:340, flexShrink:0, padding:16, display:'flex', flexDirection:'column', gap:12}}>
            <div>
              <div style={S.lbl}>Apartament</div>
              <select value={aptId} onChange={e=>setAptId(e.target.value)} style={{...S.inp, width:'100%'}}>
                {apts.map(a => <option key={a.id} value={a.id}>{a.nota ? `${a.nota} — ` : ''}{a.nume}</option>)}
              </select>
            </div>

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
                <button onClick={copiaza}
                  style={{marginTop:14, padding:'9px 16px', borderRadius:8, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7}}>
                  <Copy size={13}/>Copiază textul
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
