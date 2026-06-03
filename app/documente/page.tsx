'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'
import { Upload, Search, Trash2, Download, FileText, X } from 'lucide-react'

const CATEGORII = ['Contract', 'Autorizatie', 'Certificat', 'Asigurare', 'Fiscal', 'Juridic', 'Tehnic', 'Altele']

export default function DocumentePage() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documente, setDocumente] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [editDoc, setEditDoc] = useState<any>(null)
  const [editForm, setEditForm] = useState({ descriere:'', categorie:'', apartament_id:'', nota:'' })
  const [apts, setApts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    loadDocumente()
    supabase.from('apartamente').select('id,nota,nume').order('nota').then(({data}) => setApts(data||[]))
  }, [])

  async function loadDocumente() {
    const { data } = await supabase.from('cheltuieli')
      .select('id,descriere,categorie,valoare,data,nota,fisier_url,apartament_id,status,created_at')
      .ilike('nota', '%[DOC]%')
      .not('fisier_url', 'is', null)
      .order('created_at', { ascending: false })
    setDocumente(data||[])
  }

  async function uploadDoc(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `documente/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('facturi').upload(path, file, { upsert: true })
      if (upErr) { show('error', upErr.message); return }
      const { data: urlData } = supabase.storage.from('facturi').getPublicUrl(path)
      const url = urlData.publicUrl

      // Auto-detect category from filename
      const numeFisier = file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      const autoCateg = 
        numeFisier.includes('certif') ? 'certificat' :
        numeFisier.includes('contract') ? 'contract' :
        numeFisier.includes('autorizat') ? 'autorizatie' :
        numeFisier.includes('asigur') ? 'asigurare' :
        numeFisier.includes('fiscal') || numeFisier.includes('declaratie') ? 'fiscal' :
        numeFisier.includes('juridic') || numeFisier.includes('notari') ? 'juridic' :
        numeFisier.includes('tehnic') || numeFisier.includes('constatator') ? 'tehnic' :
        'document'
      const descriereAuto = file.name.replace(/\.[^/.]+$/, '')

      const { error } = await supabase.from('cheltuieli').insert({
        descriere: descriereAuto,
        categorie: autoCateg,
        valoare: 0,
        data: new Date().toISOString().slice(0,10),
        status: 'nevalidat',
        suportat_de: 'administrator',
        tva: 0,
        fisier_url: url,
        nota: '[DOC]',
      })
      if (error) show('error', error.message)
      else { show('success', '✓ Document salvat'); loadDocumente() }
    } finally {
      setUploading(false)
    }
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    for (const f of files) await uploadDoc(f)
  }, [])

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files||[])
    for (const f of files) await uploadDoc(f)
    e.target.value = ''
  }

  async function saveEdit() {
    if (!editDoc) return
    setSaving(true)
    const apt = apts.find(a => a.id === editForm.apartament_id)
    const { error } = await supabase.from('cheltuieli').update({
      descriere: editForm.descriere,
      categorie: (editForm.categorie||'document').toLowerCase(),
      apartament_id: editForm.apartament_id || null,
      nota: `[DOC]${editForm.nota ? ' ' + editForm.nota : ''}`,
    }).eq('id', editDoc.id)
    if (error) show('error', error.message)
    else { show('success', 'Salvat'); setEditDoc(null); loadDocumente() }
    setSaving(false)
  }

  async function deleteDoc(id: string) {
    const { error } = await supabase.from('cheltuieli').delete().eq('id', id)
    if (error) show('error', error.message)
    else { show('success', 'Șters'); loadDocumente() }
  }

  const filtered = documente.filter(d => {
    if (catFilter && !(d.categorie||'').toLowerCase().includes(catFilter.toLowerCase())) return false
    if (!search) return true
    return (d.descriere||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.nota||'').toLowerCase().includes(search.toLowerCase())
  })

  const getAptLabel = (id: string) => {
    const a = apts.find(x => x.id === id)
    return a ? (a.nota ? `[${a.nota}]` : a.nume) : null
  }

  const glassCard = { background:'rgba(11,18,36,0.7)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:14, backdropFilter:'blur(12px)' as const }

  return (
    <>
      <PageHeader title="Documente" subtitle="Contracte, autorizații, certificate și alte documente"/>
      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 40px' }}>

        {/* Drop zone */}
        <div ref={dropRef} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}
          onClick={()=>fileRef.current?.click()}
          style={{ ...glassCard, padding:'28px', textAlign:'center', cursor:'pointer', marginBottom:20,
            borderColor: dragging?'rgba(77,163,255,0.5)':'rgba(100,160,255,0.12)',
            background: dragging?'rgba(77,163,255,0.08)':'rgba(11,18,36,0.7)' }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" multiple onChange={onFileChange} style={{display:'none'}}/>
          {uploading ? (
            <div style={{ color:'#7BC8FF', fontSize:14 }}>⏳ Se încarcă...</div>
          ) : (
            <>
              <Upload size={28} color="rgba(77,163,255,0.5)" style={{ margin:'0 auto 10px' }}/>
              <div style={{ fontSize:14, fontWeight:600, color:'rgba(159,215,255,0.7)' }}>
                {dragging ? 'Eliberează pentru a încărca' : 'Trage documentele aici sau apasă pentru a selecta'}
              </div>
              <div style={{ fontSize:11, color:'rgba(159,215,255,0.3)', marginTop:6 }}>
                PDF, Word, Excel, imagini — orice format
              </div>
            </>
          )}
        </div>

        {/* Filters + search */}
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' as const }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Caută document..."
            style={{ background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:9, color:'rgba(214,228,244,0.8)', fontSize:12, padding:'7px 14px', outline:'none', width:220 }}/>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
            style={{ background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:9, color:'rgba(214,228,244,0.7)', fontSize:12, padding:'7px 12px', outline:'none' }}>
            <option value="">Toate categoriile</option>
            {CATEGORII.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ marginLeft:'auto', fontSize:11, color:'rgba(159,215,255,0.4)', alignSelf:'center' }}>
            {filtered.length} documente
          </span>
        </div>

        {/* Document list */}
        <div style={{ ...glassCard, overflow:'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'rgba(159,215,255,0.3)', fontSize:13 }}>
              {documente.length === 0 ? 'Niciun document încărcat. Trage un fișier în zona de sus.' : 'Niciun document găsit.'}
            </div>
          ) : filtered.map((d, i) => {
            const catColors: Record<string,string> = { contract:'#4ADE80', autorizatie:'#FCD34D', asigurare:'#FB923C', fiscal:'#F87171', juridic:'#A78BFA' }
            const catColor = catColors[d.categorie?.toLowerCase()||''] || '#7BC8FF'
            const aptLabel = getAptLabel(d.apartament_id)
            const ext = (d.fisier_url||'').split('.').pop()?.split('?')[0]?.toUpperCase() || 'DOC'
            return (
              <div key={d.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid rgba(100,160,255,0.05)':'none' }}>
                {/* Icon */}
                <div style={{ width:38, height:38, borderRadius:9, background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:10, fontWeight:700, color:'#7BC8FF' }}>
                  {ext==='PDF'?'📄':ext==='DOC'||ext==='DOCX'?'📝':ext==='XLS'||ext==='XLSX'?'📊':'🖼'}
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#E8F4FF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {d.descriere || 'Document'}
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:3, flexWrap:'wrap' as const }}>
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:4, background:`${catColor}18`, border:`1px solid ${catColor}30`, color:catColor, fontWeight:600, textTransform:'uppercase' as const }}>
                      {d.categorie || 'document'}
                    </span>
                    {aptLabel && <span style={{ fontSize:10, color:'rgba(159,215,255,0.5)' }}>{aptLabel}</span>}
                    {d.data && <span style={{ fontSize:10, color:'rgba(159,215,255,0.35)' }}>{d.data}</span>}
                    {d.nota && d.nota.replace('[DOC]','').trim() && (
                      <span style={{ fontSize:10, color:'rgba(159,215,255,0.4)' }}>{d.nota.replace('[DOC]','').trim()}</span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {d.fisier_url && (
                    <a href={d.fisier_url} target="_blank" rel="noopener"
                      style={{ width:30, height:30, borderRadius:7, border:'1px solid rgba(77,163,255,0.25)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
                      <FileText size={13}/>
                    </a>
                  )}
                  {d.fisier_url && (
                    <a href={d.fisier_url} download
                      style={{ width:30, height:30, borderRadius:7, border:'1px solid rgba(74,222,128,0.25)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
                      <Download size={13}/>
                    </a>
                  )}
                  <button onClick={()=>{ setEditDoc(d); setEditForm({ descriere:d.descriere||'', categorie:d.categorie||'document', apartament_id:d.apartament_id||'', nota:(d.nota||'').replace('[DOC]','').trim() }) }}
                    style={{ width:30, height:30, borderRadius:7, border:'1px solid rgba(252,211,77,0.25)', background:'rgba(252,211,77,0.08)', color:'#FCD34D', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    ✏️
                  </button>
                  <button onClick={()=>deleteDoc(d.id)}
                    style={{ width:30, height:30, borderRadius:7, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit modal */}
      {editDoc && (
        <div onClick={()=>setEditDoc(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:380, background:'rgba(8,18,36,0.99)', border:'1px solid rgba(100,160,255,0.25)', borderRadius:14, padding:22 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:18 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#FCD34D' }}>✏️ Editează document</div>
              <button onClick={()=>setEditDoc(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(159,215,255,0.4)', fontSize:18 }}>✕</button>
            </div>
            {[['Denumire', 'descriere', 'text'], ['Note', 'nota', 'text']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.45)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
                <input type={type} value={(editForm as any)[key]} onChange={e=>setEditForm(f=>({...f, [key]:e.target.value}))}
                  style={{ width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8, color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none', boxSizing:'border-box' }}/>
              </div>
            ))}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:'rgba(159,215,255,0.45)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Categorie</div>
              <select value={editForm.categorie} onChange={e=>setEditForm(f=>({...f, categorie:e.target.value}))}
                style={{ width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8, color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none' }}>
                {CATEGORII.map(c=><option key={c} value={c.toLowerCase()}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, color:'rgba(159,215,255,0.45)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Apartament</div>
              <select value={editForm.apartament_id} onChange={e=>setEditForm(f=>({...f, apartament_id:e.target.value}))}
                style={{ width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8, color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none' }}>
                <option value="">— General —</option>
                {apts.map(a=><option key={a.id} value={a.id}>{a.nota ? `[${a.nota}] ` : ''}{a.nume}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveEdit} disabled={saving}
                style={{ flex:1, padding:'10px', borderRadius:9, border:'none', background:'rgba(252,211,77,0.8)', color:'#0E1B2B', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {saving ? 'Se salvează...' : '💾 Salvează'}
              </button>
              <button onClick={()=>setEditDoc(null)}
                style={{ padding:'10px 16px', borderRadius:9, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:13, cursor:'pointer' }}>
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast}/>
    </>
  )
}
