'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Upload, Trash2, Plus, Send } from 'lucide-react'

const TIPURI = [
  { k: 'checkin', l: '📥 Check-in', color: '#4ADE80' },
  { k: 'checkout', l: '📤 Check-out', color: '#7BC8FF' },
  { k: 'acces', l: '🔑 Acces & Parcare', color: '#FCD34D' },
  { k: 'reguli', l: '📋 Reguli casă', color: '#FB923C' },
  { k: 'altele', l: '💬 Altele', color: '#A78BFA' },
]

export default function SabloanePage() {
  const [apts, setApts] = useState<any[]>([])
  const [selApt, setSelApt] = useState<any>(null)
  const [sabloane, setSabloane] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume').eq('status','activ').order('nota')
      .then(({data}) => { setApts(data||[]); if(data?.length) { setSelApt(data[0]); loadSabloane(data[0].id) } })
  }, [])

  async function loadSabloane(aptId: string) {
    setLoading(true)
    const { data } = await supabase.from('sabloane_mesaje')
      .select('*').eq('apartament_id', aptId).order('tip')
    setSabloane(data||[])
    setLoading(false)
  }

  async function saveSablon() {
    if (!editing || !selApt) return
    if (editing.id) {
      await supabase.from('sabloane_mesaje').update({
        tip: editing.tip, titlu: editing.titlu,
        text: editing.text, poze: editing.poze,
      }).eq('id', editing.id)
    } else {
      await supabase.from('sabloane_mesaje').insert({
        apartament_id: selApt.id,
        tip: editing.tip, titlu: editing.titlu,
        text: editing.text, poze: editing.poze||[],
      })
    }
    show('success', '✓ Salvat')
    setEditing(null)
    loadSabloane(selApt.id)
  }

  async function deleteSablon(id: string) {
    await supabase.from('sabloane_mesaje').delete().eq('id', id)
    loadSabloane(selApt.id)
  }

  async function uploadPoza(file: File) {
    setUploading(true)
    const path = `sabloane/${selApt.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('Facturi').upload(path, file, { upsert: true })
    if (error) { show('error', error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('Facturi').getPublicUrl(path)
    setEditing((prev:any) => ({ ...prev, poze: [...(prev.poze||[]), urlData.publicUrl] }))
    setUploading(false)
  }

  function waMessage(s: any, client: string = '') {
    let msg = s.text || ''
    if (client) msg = msg.replace(/{nume}/g, client)
    if (s.poze?.length) msg += '\n\n' + s.poze.join('\n')
    return msg
  }

  const glassCard = { background:'rgba(11,18,36,0.7)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:14 }

  return (
    <>
      <PageHeader title="Șabloane Mesaje" subtitle="Mesaje prestabilite cu text și poze per apartament"/>
      <div style={{flex:1, overflowY:'auto', padding:'0 20px 40px'}}>

        {/* Selector apartament */}
        <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' as const}}>
          {apts.map(a => (
            <button key={a.id} onClick={() => { setSelApt(a); loadSabloane(a.id); setEditing(null) }}
              style={{padding:'6px 14px', borderRadius:9, border:`1px solid ${selApt?.id===a.id?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.12)'}`,
                background:selApt?.id===a.id?'rgba(77,163,255,0.15)':'transparent',
                color:selApt?.id===a.id?'#7BC8FF':'rgba(159,215,255,0.5)', fontSize:12, fontWeight:600, cursor:'pointer'}}>
              {a.nota}
            </button>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 400px', gap:16, alignItems:'start'}}>

          {/* Lista sabloane */}
          <div style={{display:'flex', flexDirection:'column' as const, gap:10}}>
            <button onClick={() => setEditing({tip:'checkin', titlu:'', text:'', poze:[]})}
              style={{display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:10,
                border:'1px dashed rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.06)',
                color:'#7BC8FF', fontSize:13, fontWeight:600, cursor:'pointer'}}>
              <Plus size={16}/> Adaugă șablon nou
            </button>

            {loading && <div style={{padding:24, textAlign:'center' as const, color:'rgba(159,215,255,0.3)'}}>Se încarcă...</div>}

            {sabloane.map(s => {
              const tip = TIPURI.find(t => t.k === s.tip)
              return (
                <div key={s.id} style={{...glassCard, padding:16}}>
                  <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10}}>
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                        <span style={{fontSize:11, padding:'2px 8px', borderRadius:5, background:`${tip?.color||'#7BC8FF'}18`,
                          border:`1px solid ${tip?.color||'#7BC8FF'}30`, color:tip?.color||'#7BC8FF', fontWeight:700}}>
                          {tip?.l || s.tip}
                        </span>
                        <span style={{fontSize:14, fontWeight:600, color:'#E8F4FF'}}>{s.titlu}</span>
                      </div>
                      <div style={{fontSize:12, color:'rgba(159,215,255,0.5)', whiteSpace:'pre-wrap' as const, lineHeight:1.5, maxHeight:80, overflow:'hidden'}}>
                        {s.text}
                      </div>
                      {s.poze?.length > 0 && (
                        <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap' as const}}>
                          {s.poze.map((url:string, i:number) => (
                            <a key={i} href={url} target="_blank" rel="noopener">
                              <img src={url} alt="" style={{width:60, height:60, borderRadius:7, objectFit:'cover' as const, border:'1px solid rgba(100,160,255,0.2)'}}/>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex', gap:6, flexShrink:0}}>
                      <button onClick={() => setEditing({...s})}
                        style={{padding:'5px 10px', borderRadius:7, border:'1px solid rgba(252,211,77,0.3)', background:'rgba(252,211,77,0.08)', color:'#FCD34D', fontSize:11, cursor:'pointer'}}>
                        ✏️
                      </button>
                      <button onClick={() => deleteSablon(s.id)}
                        style={{padding:'5px 10px', borderRadius:7, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer'}}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                  {/* Preview WhatsApp */}
                  <a href={`https://wa.me/?text=${encodeURIComponent(waMessage(s))}`} target="_blank" rel="noopener"
                    style={{display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8,
                      border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)',
                      color:'#4ADE80', fontSize:12, fontWeight:600, textDecoration:'none', marginTop:4}}>
                    <Send size={12}/> Test WhatsApp
                  </a>
                </div>
              )
            })}

            {!loading && sabloane.length === 0 && (
              <div style={{padding:32, textAlign:'center' as const, color:'rgba(159,215,255,0.3)', fontSize:13}}>
                Niciun șablon pentru {selApt?.nota}. Adaugă primul!
              </div>
            )}
          </div>

          {/* Editor */}
          {editing && (
            <div style={{...glassCard, padding:18, position:'sticky' as const, top:16}}>
              <div style={{fontSize:14, fontWeight:700, color:'#E8F4FF', marginBottom:14}}>
                {editing.id ? '✏️ Editează șablon' : '➕ Șablon nou'}
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Tip</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap' as const}}>
                  {TIPURI.map(t => (
                    <button key={t.k} onClick={() => setEditing((p:any) => ({...p, tip:t.k}))}
                      style={{padding:'4px 10px', borderRadius:7, border:`1px solid ${editing.tip===t.k?t.color+'60':'rgba(159,215,255,0.1)'}`,
                        background:editing.tip===t.k?t.color+'18':'transparent',
                        color:editing.tip===t.k?t.color:'rgba(159,215,255,0.45)', fontSize:11, cursor:'pointer'}}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Titlu</div>
                <input value={editing.titlu} onChange={e => setEditing((p:any) => ({...p, titlu:e.target.value}))}
                  placeholder="ex: Detalii check-in L99"
                  style={{width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8,
                    color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none', boxSizing:'border-box' as const}}/>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>
                  Text mesaj &nbsp;<span style={{color:'rgba(159,215,255,0.3)'}}>— folosește {'{nume}'} pentru prenumele clientului</span>
                </div>
                <textarea value={editing.text} onChange={e => setEditing((p:any) => ({...p, text:e.target.value}))}
                  rows={8} placeholder="Bună ziua, {nume}!&#10;&#10;Detalii check-in..."
                  style={{width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8,
                    color:'rgba(214,228,244,0.9)', fontSize:12, padding:'8px 10px', outline:'none',
                    resize:'vertical' as const, fontFamily:'inherit', boxSizing:'border-box' as const, lineHeight:1.6}}/>
              </div>

              {/* Upload poze */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:8, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Poze / Imagini</div>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={async e => {
                  const files = Array.from(e.target.files||[])
                  for (const f of files) await uploadPoza(f)
                  e.target.value = ''
                }} style={{display:'none'}}/>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9,
                    border:'1px dashed rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.06)',
                    color:'#7BC8FF', fontSize:12, cursor:'pointer', marginBottom:8, opacity:uploading?0.6:1}}>
                  <Upload size={13}/> {uploading ? 'Se încarcă...' : 'Adaugă poze'}
                </button>
                {editing.poze?.length > 0 && (
                  <div style={{display:'flex', gap:6, flexWrap:'wrap' as const}}>
                    {editing.poze.map((url:string, i:number) => (
                      <div key={i} style={{position:'relative' as const}}>
                        <img src={url} alt="" style={{width:70, height:70, borderRadius:8, objectFit:'cover' as const, border:'1px solid rgba(100,160,255,0.2)'}}/>
                        <button onClick={() => setEditing((p:any) => ({...p, poze:p.poze.filter((_:any,j:number)=>j!==i)}))}
                          style={{position:'absolute' as const, top:-4, right:-4, width:18, height:18, borderRadius:'50%',
                            border:'none', background:'#F87171', color:'#fff', fontSize:10, cursor:'pointer',
                            display:'flex', alignItems:'center', justifyContent:'center'}}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display:'flex', gap:8}}>
                <button onClick={saveSablon}
                  style={{flex:1, padding:'10px', borderRadius:9, border:'none', background:'rgba(77,163,255,0.8)',
                    color:'#0E1B2B', fontSize:13, fontWeight:700, cursor:'pointer'}}>
                  💾 Salvează
                </button>
                <button onClick={() => setEditing(null)}
                  style={{padding:'10px 14px', borderRadius:9, border:'1px solid rgba(159,215,255,0.15)',
                    background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:13, cursor:'pointer'}}>
                  Anulează
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Toast toast={toast}/>
    </>
  )
}
