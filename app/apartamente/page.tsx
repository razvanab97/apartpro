'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink, Copy, MapPin, Check, Calculator, ChevronDown, ChevronUp, X } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = { activ:'#22C55E', inactiv:'#EF4444', mentenanta:'#F59E0B' }
const COMISION_TIP_LABEL: Record<string, string> = {
  procent_brut:'% din brut', procent_net_platforme:'% net platforme',
  procent_net_dupa_costuri:'% net după costuri', fix_lunar:'Fix lunar', mixt:'Fix + %',
}
const empty: Partial<Apartament> = {
  nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0,
  proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0,
  link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'',
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={e=>{ e.stopPropagation(); navigator.clipboard.writeText(text).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500) }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 5px', color:copied?'#4ADE80':'rgba(159,215,255,0.4)', display:'inline-flex', alignItems:'center', borderRadius:4, transition:'color 0.15s', flexShrink:0 }}>
      {copied?<Check size={11}/>:<Copy size={11}/>}
    </button>
  )
}

function CostCalculator({ apt }: { apt: any }) {
  const [open, setOpen] = useState(false)
  const [chirie, setChirie] = useState(apt.pret_standard || 0)
  const [utilitati, setUtilitati] = useState(300)
  const [altele, setAltele] = useState(100)
  const [zile, setZile] = useState(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate())
  const total = Number(chirie)+Number(utilitati)+Number(altele)
  const perZi = Math.round(total/zile)
  const minim = Math.round(perZi*1.2)
  return (
    <div style={{ borderTop:'1px solid rgba(159,215,255,0.08)', marginTop:16, paddingTop:12 }}>
      <button onClick={()=>setOpen(!open)} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(159,215,255,0.5)', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%' }}>
        <Calculator size={12}/><span>Calculator cost lunar</span>
        <span style={{ marginLeft:'auto' }}>{open?<ChevronUp size={11}/>:<ChevronDown size={11}/>}</span>
      </button>
      {open && (
        <div style={{ marginTop:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            {([['Chirie (RON/lună)', chirie, setChirie],['Utilități (RON/lună)', utilitati, setUtilitati],['Alte cheltuieli', altele, setAltele],['Zile lună', zile, setZile]] as [string,number,any][]).map(([label,val,setter])=>(
              <div key={label}>
                <label style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:3, display:'block' }}>{label}</label>
                <input type="number" value={val} onChange={e=>setter(Number(e.target.value))}
                  style={{ fontSize:12, padding:'5px 8px', background:'rgba(14,27,43,0.6)', border:'1px solid rgba(159,215,255,0.15)', borderRadius:6, color:'#fff', width:'100%' }}/>
              </div>
            ))}
          </div>
          <div style={{ background:'rgba(77,163,255,0.08)', border:'1px solid rgba(77,163,255,0.15)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
              <span style={{ color:'rgba(159,215,255,0.5)' }}>Total costuri/lună</span>
              <span style={{ color:'#FFFFFF', fontFamily:'monospace', fontWeight:600 }}>{total.toLocaleString('ro-RO')} RON</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:6 }}>
              <span style={{ color:'rgba(159,215,255,0.5)' }}>Cost/zi</span>
              <span style={{ color:'#FFFFFF', fontFamily:'monospace', fontWeight:600 }}>{perZi.toLocaleString('ro-RO')} RON</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, borderTop:'1px solid rgba(159,215,255,0.1)', paddingTop:8 }}>
              <span style={{ color:'#4DA3FF', fontWeight:500 }}>Preț minim/noapte</span>
              <span style={{ color:'#4ADE80', fontFamily:'monospace', fontWeight:700, fontSize:16 }}>{minim.toLocaleString('ro-RO')} RON</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AptDetailModal({ apt, onClose, onEdit, onDelete }: { apt:any; onClose:()=>void; onEdit:(a:any)=>void; onDelete:(id:string)=>void }) {
  const sc = STATUS_COLOR[apt.status]||'#94A3B8'
  return (
    <div onClick={e=>{ if(e.target===e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(7,18,32,0.75)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)' }}>
      <div style={{ background:'rgba(14,27,43,0.92)', backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)', border:'1px solid rgba(159,215,255,0.18)', borderRadius:20, padding:'28px 28px 24px', width:560, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', position:'relative', animation:'fadeIn 0.18s ease' }}>
        <div style={{ position:'absolute', top:0, left:'20%', right:'20%', height:'1px', background:'linear-gradient(90deg,transparent,rgba(159,215,255,0.35),transparent)' }}/>
        <button onClick={onClose} style={{ position:'absolute', top:18, right:18, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(159,215,255,0.08)', border:'1px solid rgba(159,215,255,0.14)', borderRadius:7, cursor:'pointer', color:'rgba(159,215,255,0.6)' }}>
          <X size={13}/>
        </button>
        {/* Header */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            {apt.nota && <span style={{ background:'rgba(77,163,255,0.15)', border:'1px solid rgba(77,163,255,0.3)', borderRadius:6, padding:'2px 9px', fontSize:11, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace' }}>{apt.nota}</span>}
            <span style={{ background:`${sc}18`, border:`1px solid ${sc}30`, borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:500, color:sc }}>{apt.status}</span>
          </div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'#FFFFFF', letterSpacing:-0.3, marginBottom:5 }}>{apt.nume}</h2>
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'rgba(159,215,255,0.45)' }}>
            <MapPin size={11}/><span>{apt.adresa}</span><CopyBtn text={apt.adresa}/>
          </div>
        </div>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:18 }}>
          {[{label:'Camere',value:apt.nr_camere},{label:'Pers. max',value:apt.capacitate_max},{label:'Preț/noapte',value:`${apt.pret_standard} RON`,color:'#4DA3FF'}].map(s=>(
            <div key={s.label} style={{ background:'rgba(14,27,43,0.5)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:'monospace', color:(s as any).color||'#FFFFFF', lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginTop:3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Links */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          {apt.link_site && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <a href={apt.link_site} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:7, background:'rgba(77,163,255,0.12)', color:'#7BC8FF', border:'1px solid rgba(77,163,255,0.2)', textDecoration:'none' }}>
                <ExternalLink size={11}/> Site AB Homes
              </a>
              <CopyBtn text={apt.link_site}/>
            </div>
          )}
          {apt.link_booking && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <a href={apt.link_booking} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:7, background:'rgba(34,197,94,0.12)', color:'#4ADE80', border:'1px solid rgba(34,197,94,0.2)', textDecoration:'none' }}>
                <MapPin size={11}/> Google Maps
              </a>
              <CopyBtn text={apt.link_booking}/>
            </div>
          )}
          {apt.link_airbnb && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <a href={apt.link_airbnb} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:7, background:'rgba(239,68,68,0.12)', color:'#F87171', border:'1px solid rgba(239,68,68,0.2)', textDecoration:'none' }}>
                <ExternalLink size={11}/> Airbnb
              </a>
              <CopyBtn text={apt.link_airbnb}/>
            </div>
          )}
        </div>
        {/* Details */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:12, marginBottom:4 }}>
          {apt.proprietar?.nume && <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'rgba(159,215,255,0.45)' }}>Proprietar</span><span style={{ color:'#FFFFFF', fontWeight:500 }}>{apt.proprietar.nume}</span></div>}
          <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'rgba(159,215,255,0.45)' }}>Comision</span><span style={{ color:'#4ADE80', fontFamily:'monospace' }}>{apt.comision_procent}% · {COMISION_TIP_LABEL[apt.comision_tip]||apt.comision_tip}</span></div>
          {apt.dotari?.length>0 && <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}><span style={{ color:'rgba(159,215,255,0.45)', flexShrink:0 }}>Dotări</span><span style={{ color:'rgba(214,228,244,0.7)', textAlign:'right' }}>{Array.isArray(apt.dotari)?apt.dotari.join(', '):apt.dotari}</span></div>}
          {apt.reguli && <div><div style={{ color:'rgba(159,215,255,0.45)', marginBottom:4 }}>Reguli</div><div style={{ color:'rgba(214,228,244,0.6)', fontSize:11, lineHeight:1.6 }}>{apt.reguli}</div></div>}
          {apt.instructiuni_checkin && <div><div style={{ color:'rgba(159,215,255,0.45)', marginBottom:4 }}>Check-in</div><div style={{ color:'rgba(214,228,244,0.6)', fontSize:11, lineHeight:1.6 }}>{apt.instructiuni_checkin}</div></div>}
        </div>
        <CostCalculator apt={apt}/>
        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <Button variant="primary" icon={<Edit2 size={13}/>} onClick={()=>{ onClose(); onEdit(apt) }} style={{ flex:1 }}>Editează</Button>
          <Button variant="danger" icon={<Trash2 size={13}/>} onClick={()=>{ onClose(); onDelete(apt.id) }}>Șterge</Button>
        </div>
      </div>
    </div>
  )
}

function AptRow({ a, onClick }: { a:any; onClick:()=>void }) {
  const sc = STATUS_COLOR[a.status]||'#94A3B8'
  const [hover, setHover] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:hover?'rgba(77,163,255,0.06)':'rgba(214,228,244,0.04)', border:`1px solid ${hover?'rgba(159,215,255,0.18)':'rgba(159,215,255,0.08)'}`, borderLeft:`3px solid ${sc}60`, borderRadius:10, cursor:'pointer', transition:'all 0.12s' }}>
      {/* Code */}
      {a.nota
        ? <span style={{ background:'rgba(77,163,255,0.15)', border:'1px solid rgba(77,163,255,0.25)', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace', flexShrink:0, minWidth:50, textAlign:'center' }}>{a.nota}</span>
        : <span style={{ width:50, flexShrink:0 }}/>}
      {/* Name */}
      <span style={{ fontSize:13, fontWeight:500, color:'#FFFFFF', minWidth:190, flexShrink:0 }}>{a.nume}</span>
      {/* Address */}
      <div style={{ display:'flex', alignItems:'center', gap:4, flex:1, minWidth:0 }}>
        <MapPin size={10} color="rgba(159,215,255,0.35)" style={{ flexShrink:0 }}/>
        <span style={{ fontSize:11.5, color:'rgba(159,215,255,0.5)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.adresa}</span>
        <CopyBtn text={a.adresa}/>
      </div>
      {/* Quick stats */}
      <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
        <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)', fontFamily:'monospace' }}>{a.nr_camere}c · {a.capacitate_max}p</span>
        <span style={{ fontSize:12, fontWeight:600, color:'#4DA3FF', fontFamily:'monospace' }}>{a.pret_standard} RON</span>
        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:`${sc}15`, color:sc, border:`1px solid ${sc}25`, whiteSpace:'nowrap' }}>{a.status}</span>
      </div>
      <span style={{ fontSize:16, color:'rgba(159,215,255,0.25)', flexShrink:0 }}>›</span>
    </div>
  )
}

export default function ApartamentePage() {
  const [loading, setLoading] = useState(true)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [viewApt, setViewApt] = useState<any>(null)
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

  async function save(){
    if(!editing.nume||!editing.adresa){ show('error','Completează numele și adresa'); return }
    setSaving(true)
    const payload={
      nume:editing.nume, adresa:editing.adresa, zona:editing.zona||null,
      nr_camere:editing.nr_camere, capacitate_max:editing.capacitate_max,
      pret_standard:editing.pret_standard, proprietar_id:editing.proprietar_id||null,
      comision_tip:editing.comision_tip, comision_procent:editing.comision_procent,
      comision_fix:editing.comision_fix, link_airbnb:editing.link_airbnb||null,
      link_booking:editing.link_booking||null, link_site:editing.link_site||null,
      instructiuni_checkin:editing.instructiuni_checkin||null,
      reguli:editing.reguli||null, status:editing.status, nota:editing.nota||null,
    }
    const { error } = editing.id
      ? await supabase.from('apartamente').update(payload).eq('id',editing.id)
      : await supabase.from('apartamente').insert(payload)
    if(error){ show('error',error.message); setSaving(false); return }
    show('success', editing.id?'Apartament actualizat':'Apartament adăugat')
    setEditOpen(false); setSaving(false); load()
  }

  async function deleteApt(){
    if(!deleteId) return
    setDeleting(true)
    await supabase.from('apartamente').delete().eq('id',deleteId)
    show('success','Apartament șters')
    setDeleteId(null); setDeleting(false); load()
  }

  const filtered = apartamente.filter(a=>
    !search ||
    a.nume.toLowerCase().includes(search.toLowerCase()) ||
    (a.nota||'').toLowerCase().includes(search.toLowerCase()) ||
    a.adresa.toLowerCase().includes(search.toLowerCase())
  )
  const myApts = filtered.filter(a=>a.nota)
  const otherApts = filtered.filter(a=>!a.nota)

  if(loading) return (<><PageHeader title="Apartamente"/><PageLoading/></>)

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații în administrare`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caută cod, nume, adresă..." style={{ width:220, padding:'6px 12px', fontSize:12 }}/>
            <Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Apartament nou</Button>
          </div>
        }
      />
      <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:4 }}>
        {apartamente.length===0 ? (
          <EmptyState icon={<Building2 size={48}/>} title="Niciun apartament" action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă</Button>}/>
        ) : (
          <>
            {myApts.length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.28)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:8, paddingLeft:4 }}>AB Homes ({myApts.length})</div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {myApts.map(a=><AptRow key={a.id} a={a} onClick={()=>setViewApt(a)}/>)}
                </div>
              </div>
            )}
            {otherApts.length>0 && (
              <div>
                <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.28)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:8, paddingLeft:4 }}>Alte locații ({otherApts.length})</div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {otherApts.map(a=><AptRow key={a.id} a={a} onClick={()=>setViewApt(a)}/>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {viewApt && <AptDetailModal apt={viewApt} onClose={()=>setViewApt(null)} onEdit={a=>{setViewApt(null);openEdit(a)}} onDelete={id=>{setViewApt(null);setDeleteId(id)}}/>}

      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează apartament':'Apartament nou'} width="640px">
        <FormRow cols={2}>
          <FormGroup><label>Cod intern</label><input value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} placeholder="Ex: L99, HD02..."/></FormGroup>
          <FormGroup><label>Status</label>
            <select value={editing.status||'activ'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              <option value="activ">Activ</option><option value="inactiv">Inactiv</option><option value="mentenanta">Mentenanță</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Nume apartament *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Ex: Airy Palas"/></FormGroup>
          <FormGroup><label>Zonă</label><input value={editing.zona||''} onChange={e=>setEditing({...editing,zona:e.target.value})} placeholder="Ex: Palas, Copou..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Adresă completă *</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Stradă, număr, complex..."/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Nr. camere</label><input type="number" value={editing.nr_camere||2} onChange={e=>setEditing({...editing,nr_camere:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Capacitate max</label><input type="number" value={editing.capacitate_max||4} onChange={e=>setEditing({...editing,capacitate_max:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Preț standard (RON/n)</label><input type="number" value={editing.pret_standard||0} onChange={e=>setEditing({...editing,pret_standard:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Proprietar</label>
            <select value={editing.proprietar_id||''} onChange={e=>setEditing({...editing,proprietar_id:e.target.value||undefined})}>
              <option value="">— Fără proprietar —</option>
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
          <FormGroup><label>Link site AB Homes</label><input value={editing.link_site||''} onChange={e=>setEditing({...editing,link_site:e.target.value})} placeholder="https://abhomesiasi.ro/..."/></FormGroup>
          <FormGroup><label>Link Google Maps</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Link Airbnb</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="airbnb.com/rooms/..."/></FormGroup>
        <FormGroup><label>Instrucțiuni check-in</label><textarea value={editing.instructiuni_checkin||''} onChange={e=>setEditing({...editing,instructiuni_checkin:e.target.value})} rows={2} placeholder="Cod acces, etaj..."/></FormGroup>
        <FormGroup><label>Reguli apartament</label><textarea value={editing.reguli||''} onChange={e=>setEditing({...editing,reguli:e.target.value})} rows={2} placeholder="Nefumători, fără petreceri..."/></FormGroup>
        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex:1 }}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{ flex:1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={deleteApt} loading={deleting} title="Șterge apartament" message="Sigur vrei să ștergi acest apartament?"/>
      <Toast toast={toast}/>
    </>
  )
}
