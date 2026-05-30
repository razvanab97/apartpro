'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink, Copy, MapPin, Check, Calculator, ChevronDown, ChevronUp, X, ChevronRight } from 'lucide-react'

const SC: Record<string,string> = { activ:'#22C55E', inactiv:'#EF4444', mentenanta:'#F59E0B' }
const CTL: Record<string,string> = { procent_brut:'% brut', procent_net_platforme:'% net platf.', procent_net_dupa_costuri:'% net costuri', fix_lunar:'Fix lunar', mixt:'Fix+%' }
const empty: Partial<Apartament> = { nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0, proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0, link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'' }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <button onClick={e=>{ e.stopPropagation(); navigator.clipboard.writeText(text).catch(()=>{}); setC(true); setTimeout(()=>setC(false),1400) }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:'1px 4px', color:c?'#4ADE80':'rgba(159,215,255,0.35)', display:'inline-flex', alignItems:'center', borderRadius:3, flexShrink:0 }}>
      {c?<Check size={10}/>:<Copy size={10}/>}
    </button>
  )
}

function Calc({ apt }: { apt: any }) {
  const [open, setOpen] = useState(false)
  const [ch, setCh] = useState(apt.pret_standard||0)
  const [ut, setUt] = useState(300)
  const [al, setAl] = useState(100)
  const [zl, setZl] = useState(new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate())
  const tot = Number(ch)+Number(ut)+Number(al)
  const pz = Math.round(tot/zl)
  const min = Math.round(pz*1.2)
  return (
    <div style={{ borderTop:'1px solid rgba(159,215,255,0.07)', marginTop:12, paddingTop:10 }}>
      <button onClick={()=>setOpen(!open)} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(159,215,255,0.45)', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%' }}>
        <Calculator size={11}/><span>Calculator preț minim</span>
        <span style={{ marginLeft:'auto' }}>{open?<ChevronUp size={10}/>:<ChevronDown size={10}/>}</span>
      </button>
      {open && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
            {([['Chirie',ch,setCh],['Utilități',ut,setUt],['Altele',al,setAl],['Zile',zl,setZl]] as [string,number,any][]).map(([l,v,s])=>(
              <div key={l}>
                <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', marginBottom:2 }}>{l} (RON)</div>
                <input type="number" value={v} onChange={e=>s(Number(e.target.value))} style={{ fontSize:11, padding:'4px 7px', background:'rgba(14,27,43,0.7)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:5, color:'#fff', width:'100%' }}/>
              </div>
            ))}
          </div>
          <div style={{ background:'rgba(77,163,255,0.07)', border:'1px solid rgba(77,163,255,0.14)', borderRadius:7, padding:'8px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:10, color:'rgba(159,215,255,0.45)' }}>{tot.toLocaleString('ro-RO')} RON/lună · {pz} RON/zi</div>
              <div style={{ fontSize:11, color:'#4DA3FF', marginTop:2 }}>Preț minim recomandat</div>
            </div>
            <div style={{ fontSize:18, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>{min} RON</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ApartamentePage() {
  const [loading, setLoading] = useState(true)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [editing, setEditing] = useState<Partial<Apartament>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const { toast, show } = useToast()

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    const [{ data:apt },{ data:prop }] = await Promise.all([
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nota').order('nume'),
      supabase.from('proprietari').select('id,nume').order('nume'),
    ])
    setApartamente((apt as Apartament[])||[])
    setProprietari((prop as Proprietar[])||[])
    setLoading(false)
  }

  function openNew(){ setEditing(empty); setEditOpen(true) }
  function openEdit(a:Apartament){ setEditing({...a}); setEditOpen(true) }

  async function toggleAptStatus(id:string, newStatus:string){
    await supabase.from('apartamente').update({status:newStatus}).eq('id',id)
    setApts((list:any[])=>list.map(a=>a.id===id?{...a,status:newStatus}:a))
  }

  async function save(){
    if(!editing.nume||!editing.adresa){ show('error','Completează numele și adresa'); return }
    setSaving(true)
    const p={ nume:editing.nume, adresa:editing.adresa, zona:editing.zona||null, nr_camere:editing.nr_camere, capacitate_max:editing.capacitate_max, pret_standard:editing.pret_standard, proprietar_id:editing.proprietar_id||null, comision_tip:editing.comision_tip, comision_procent:editing.comision_procent, comision_fix:editing.comision_fix, link_airbnb:editing.link_airbnb||null, link_booking:editing.link_booking||null, link_site:editing.link_site||null, instructiuni_checkin:editing.instructiuni_checkin||null, reguli:editing.reguli||null, status:editing.status, nota:editing.nota||null }
    const { error } = editing.id ? await supabase.from('apartamente').update(p).eq('id',editing.id) : await supabase.from('apartamente').insert(p)
    if(error){ show('error',error.message); setSaving(false); return }
    show('success',editing.id?'Actualizat':'Adăugat')
    setEditOpen(false); setSaving(false); load()
  }

  async function del(){
    if(!deleteId) return
    setDeleting(true)
    await supabase.from('apartamente').delete().eq('id',deleteId)
    show('success','Șters')
    if(selectedId===deleteId) setSelectedId(null)
    setDeleteId(null); setDeleting(false); load()
  }

  const filtered = apartamente.filter(a=> !search || a.nume.toLowerCase().includes(search.toLowerCase()) || (a.nota||'').toLowerCase().includes(search.toLowerCase()) || a.adresa.toLowerCase().includes(search.toLowerCase()))
  const myApts = filtered.filter(a=>a.nota)
  const otherApts = filtered.filter(a=>!a.nota)
  const selected = apartamente.find(a=>a.id===selectedId) as any

  if(loading) return (<><PageHeader title="Apartamente"/><PageLoading/></>)

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caută..." style={{ width:180, padding:'6px 12px', fontSize:12 }}/>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Nou</Button>
          </div>
        }
      />

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', flex:1, minHeight:0 }}>

        {/* LEFT — list */}
        <div style={{ overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {apartamente.length===0 ? (
            <EmptyState icon={<Building2 size={40}/>} title="Niciun apartament" action={<Button variant="primary" icon={<Plus size={13}/>} onClick={openNew}>Adaugă</Button>}/>
          ) : (
            <>
              {myApts.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.25)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, paddingLeft:2 }}>AB Homes · {myApts.length}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {myApts.map(a=><MiniCard key={a.id} a={a} selected={selectedId===a.id} onClick={()=>setSelectedId(selectedId===a.id?null:a.id)} onToggle={toggleAptStatus}/>)}
                  </div>
                </div>
              )}
              {otherApts.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.25)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, paddingLeft:2 }}>Alte locații · {otherApts.length}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {otherApts.map(a=><MiniCard key={a.id} a={a} selected={selectedId===a.id} onClick={()=>setSelectedId(selectedId===a.id?null:a.id)} onToggle={toggleAptStatus}/>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT — detail panel */}
        {selected && (
          <div style={{ borderLeft:'1px solid rgba(159,215,255,0.1)', background:'rgba(14,27,43,0.5)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', overflowY:'auto', padding:'18px 18px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                  {selected.nota && <span style={{ background:'rgba(77,163,255,0.18)', border:'1px solid rgba(77,163,255,0.3)', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace' }}>{selected.nota}</span>}
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:`${SC[selected.status]||'#94A3B8'}18`, color:SC[selected.status]||'#94A3B8', border:`1px solid ${SC[selected.status]||'#94A3B8'}28` }}>{selected.status}</span>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:'#FFFFFF', letterSpacing:-0.2, marginBottom:4 }}>{selected.nume}</div>
                <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'rgba(159,215,255,0.45)' }}>
                  <MapPin size={10}/><span>{selected.adresa}</span><CopyBtn text={selected.adresa}/>
                </div>
              </div>
              <button onClick={()=>setSelectedId(null)} style={{ background:'rgba(159,215,255,0.07)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:6, width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(159,215,255,0.5)', flexShrink:0 }}>
                <X size={12}/>
              </button>
            </div>

            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
              {[{l:'Camere',v:selected.nr_camere,c:'#FFFFFF'},{l:'Pers.',v:selected.capacitate_max,c:'#FFFFFF'},{l:'RON/n',v:selected.pret_standard,c:'#4DA3FF'}].map(s=>(
                <div key={s.l} style={{ background:'rgba(14,27,43,0.6)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:s.c, lineHeight:1 }}>{s.v}</div>
                  <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Links */}
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {selected.link_site && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={selected.link_site} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(77,163,255,0.1)', color:'#7BC8FF', border:'1px solid rgba(77,163,255,0.18)', textDecoration:'none', flex:1 }}>
                    <ExternalLink size={10}/> Site AB Homes
                  </a>
                  <CopyBtn text={selected.link_site}/>
                </div>
              )}
              {selected.link_booking && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={selected.link_booking} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(34,197,94,0.1)', color:'#4ADE80', border:'1px solid rgba(34,197,94,0.18)', textDecoration:'none', flex:1 }}>
                    <MapPin size={10}/> Google Maps
                  </a>
                  <CopyBtn text={selected.link_booking}/>
                </div>
              )}
              {selected.link_airbnb && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={selected.link_airbnb} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'#F87171', border:'1px solid rgba(239,68,68,0.18)', textDecoration:'none', flex:1 }}>
                    <ExternalLink size={10}/> Airbnb
                  </a>
                  <CopyBtn text={selected.link_airbnb}/>
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12 }}>
              {selected.proprietar?.nume && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'rgba(159,215,255,0.4)' }}>Proprietar</span>
                  <span style={{ color:'#FFFFFF', fontWeight:500 }}>{selected.proprietar.nume}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'rgba(159,215,255,0.4)' }}>Comision</span>
                <span style={{ color:'#4ADE80', fontFamily:'monospace' }}>{selected.comision_procent}% · {CTL[selected.comision_tip]||selected.comision_tip}</span>
              </div>
              {selected.dotari?.length>0 && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Dotări</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{Array.isArray(selected.dotari)?selected.dotari.join(', '):selected.dotari}</div>
                </div>
              )}
              {selected.instructiuni_checkin && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Check-in</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{selected.instructiuni_checkin}</div>
                </div>
              )}
              {selected.reguli && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Reguli</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{selected.reguli}</div>
                </div>
              )}
            </div>

            <Calc apt={selected}/>

            {/* Actions */}
            <div style={{ display:'flex', gap:7, marginTop:'auto', paddingTop:8 }}>
              <Button variant="primary" size="sm" icon={<Edit2 size={12}/>} onClick={()=>openEdit(selected as Apartament)} style={{ flex:1 }}>Editează</Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={12}/>} onClick={()=>setDeleteId(selected.id)}>Șterge</Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează apartament':'Apartament nou'} width="620px">
        <FormRow cols={2}>
          <FormGroup><label>Cod intern</label><input value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} placeholder="L99, HD02..."/></FormGroup>
          <FormGroup><label>Status</label>
            <select value={editing.status||'activ'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              <option value="activ">Activ</option><option value="inactiv">Inactiv</option><option value="mentenanta">Mentenanță</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Nume *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Ex: Airy Palas"/></FormGroup>
          <FormGroup><label>Zonă</label><input value={editing.zona||''} onChange={e=>setEditing({...editing,zona:e.target.value})} placeholder="Palas, Copou..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Adresă *</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Stradă, complex..."/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Camere</label><input type="number" value={editing.nr_camere||2} onChange={e=>setEditing({...editing,nr_camere:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Max pers.</label><input type="number" value={editing.capacitate_max||4} onChange={e=>setEditing({...editing,capacitate_max:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Preț (RON/n)</label><input type="number" value={editing.pret_standard||0} onChange={e=>setEditing({...editing,pret_standard:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Proprietar</label>
            <select value={editing.proprietar_id||''} onChange={e=>setEditing({...editing,proprietar_id:e.target.value||undefined})}>
              <option value="">— Fără —</option>
              {proprietari.map(p=><option key={p.id} value={p.id}>{p.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Tip comision</label>
            <select value={editing.comision_tip||'procent_net_dupa_costuri'} onChange={e=>setEditing({...editing,comision_tip:e.target.value})}>
              <option value="procent_brut">% din brut</option>
              <option value="procent_net_platforme">% net platforme</option>
              <option value="procent_net_dupa_costuri">% net după costuri</option>
              <option value="fix_lunar">Fix lunar</option>
              <option value="mixt">Mixt</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Procent (%)</label><input type="number" value={editing.comision_procent||20} onChange={e=>setEditing({...editing,comision_procent:parseFloat(e.target.value)||0})} min={0} max={100}/></FormGroup>
          <FormGroup><label>Fix (RON)</label><input type="number" value={editing.comision_fix||0} onChange={e=>setEditing({...editing,comision_fix:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Link Site</label><input value={editing.link_site||''} onChange={e=>setEditing({...editing,link_site:e.target.value})} placeholder="https://abhomesiasi.ro/..."/></FormGroup>
          <FormGroup><label>Link Maps</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Link Airbnb</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="airbnb.com/rooms/..."/></FormGroup>
        <FormGroup><label>Instrucțiuni check-in</label><textarea value={editing.instructiuni_checkin||''} onChange={e=>setEditing({...editing,instructiuni_checkin:e.target.value})} rows={2}/></FormGroup>
        <FormGroup><label>Reguli</label><textarea value={editing.reguli||''} onChange={e=>setEditing({...editing,reguli:e.target.value})} rows={2}/></FormGroup>
        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex:1 }}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{ flex:1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={del} loading={deleting} title="Șterge apartament" message="Sigur vrei să ștergi?"/>
      <Toast toast={toast}/>
    </>
  )
}

function MiniCard({ a, selected, onClick, onToggle }: { a:any; selected:boolean; onClick:()=>void; onToggle?:(id:string,s:string)=>void }) {
  const sc = SC[a.status]||'#94A3B8'
  const isActiv = a.status === 'activ'
  return (
    <div style={{ padding:'10px 12px', background: selected?'rgba(77,163,255,0.12)':'rgba(214,228,244,0.04)', border: selected?'1px solid rgba(77,163,255,0.35)':'1px solid rgba(159,215,255,0.08)', borderRadius:9, transition:'all 0.12s', borderLeft:`3px solid ${selected?'#4DA3FF':sc+'50'}`, opacity:isActiv?1:0.5 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
        <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:6, flex:1, cursor:'pointer', minWidth:0 }}>
          {a.nota && <span style={{ fontSize:10, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace', background:'rgba(77,163,255,0.12)', padding:'1px 6px', borderRadius:4, flexShrink:0 }}>{a.nota}</span>}
          <span style={{ fontSize:7, padding:'1px 5px', borderRadius:10, background:`${sc}15`, color:sc, border:`1px solid ${sc}20`, flexShrink:0 }}>{a.status}</span>
        </div>
        <button onClick={e=>{e.stopPropagation();onToggle?.(a.id,isActiv?'inactiv':'activ')}} title={isActiv?'Dezactivează':'Activează'} style={{ flexShrink:0, width:32, height:18, borderRadius:9, background:isActiv?'rgba(74,222,128,0.2)':'rgba(159,215,255,0.07)', border:`1px solid ${isActiv?'rgba(74,222,128,0.4)':'rgba(159,215,255,0.15)'}`, cursor:'pointer', position:'relative', padding:0, transition:'all .2s' }}>
          <div style={{ position:'absolute', top:2, left:isActiv?14:2, width:12, height:12, borderRadius:'50%', background:isActiv?'#4ADE80':'rgba(159,215,255,0.3)', transition:'all .2s', boxShadow:isActiv?'0 0 4px rgba(74,222,128,0.6)':'none' }}/>
        </button>
      </div>
      <div onClick={onClick} style={{ cursor:'pointer' }}>
        <div style={{ fontSize:12, fontWeight:500, color:'#FFFFFF', lineHeight:1.3, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nume}</div>
        <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.zona || a.adresa}</div>
      </div>
    </div>
  )
}
