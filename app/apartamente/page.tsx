'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Apartament, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink, Copy, MapPin, Check, Calculator, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_COLOR: Record<string, 'green'|'red'|'amber'> = { activ:'green', inactiv:'red', mentenanta:'amber' }
const STATUS_LABEL: Record<string, string> = { activ:'Activ', inactiv:'Inactiv', mentenanta:'Mentenanță' }
const COMISION_TIP_LABEL: Record<string, string> = {
  procent_brut: '% din brut', procent_net_platforme: '% net platforme',
  procent_net_dupa_costuri: '% net după costuri', fix_lunar: 'Fix lunar', mixt: 'Fix + %',
}

const empty: Partial<Apartament> = {
  nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0,
  proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0,
  link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'',
}

// Calculator cost lunar
function CostCalculator({ apt }: { apt: any }) {
  const [open, setOpen] = useState(false)
  const [chirie, setChirie] = useState(apt.pret_standard || 0)
  const [utilitati, setUtilitati] = useState(300)
  const [altele, setAltele] = useState(100)
  const [zileLuna, setZileLuna] = useState(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate())

  const total = Number(chirie) + Number(utilitati) + Number(altele)
  const perZi = Math.round(total / zileLuna)
  const pretMinim = Math.round(perZi * 1.2) // 20% profit minim

  return (
    <div style={{ borderTop: '1px solid rgba(159,215,255,0.08)', marginTop: 12, paddingTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
          color: 'rgba(159,215,255,0.5)', background: 'none', border: 'none',
          cursor: 'pointer', padding: 0, width: '100%',
        }}
      >
        <Calculator size={12}/>
        <span>Calculator cost lunar</span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 3, display: 'block' }}>Chirie (RON/lună)</label>
              <input type="number" value={chirie} onChange={e=>setChirie(Number(e.target.value))}
                style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 6, color: '#fff', width: '100%' }}/>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 3, display: 'block' }}>Utilități (RON/lună)</label>
              <input type="number" value={utilitati} onChange={e=>setUtilitati(Number(e.target.value))}
                style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 6, color: '#fff', width: '100%' }}/>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 3, display: 'block' }}>Alte cheltuieli (RON)</label>
              <input type="number" value={altele} onChange={e=>setAltele(Number(e.target.value))}
                style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 6, color: '#fff', width: '100%' }}/>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 3, display: 'block' }}>Zile lună</label>
              <input type="number" value={zileLuna} onChange={e=>setZileLuna(Number(e.target.value))} min={28} max={31}
                style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 6, color: '#fff', width: '100%' }}/>
            </div>
          </div>
          <div style={{ background: 'rgba(77,163,255,0.08)', border: '1px solid rgba(77,163,255,0.15)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'rgba(159,215,255,0.5)' }}>Total costuri/lună</span>
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontWeight: 600 }}>{total.toLocaleString('ro-RO')} RON</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'rgba(159,215,255,0.5)' }}>Cost/zi</span>
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontWeight: 600 }}>{perZi.toLocaleString('ro-RO')} RON</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(159,215,255,0.1)', paddingTop: 6, marginTop: 4 }}>
              <span style={{ color: '#4DA3FF', fontWeight: 500 }}>Preț minim recomandat/noapte</span>
              <span style={{ color: '#4ADE80', fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{pretMinim.toLocaleString('ro-RO')} RON</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
      color: copied ? '#4ADE80' : 'rgba(159,215,255,0.4)', display: 'inline-flex', alignItems: 'center',
      borderRadius: 4, transition: 'color 0.15s',
    }}>
      {copied ? <Check size={11}/> : <Copy size={11}/>}
    </button>
  )
}

export default function ApartamentePage() {
  const [loading, setLoading] = useState(true)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Apartament>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: apt }, { data: prop }] = await Promise.all([
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nota').order('nume'),
      supabase.from('proprietari').select('id,nume').order('nume'),
    ])
    setApartamente((apt as Apartament[]) || [])
    setProprietari((prop as Proprietar[]) || [])
    setLoading(false)
  }

  function openNew() { setEditing(empty); setOpen(true) }
  function openEdit(a: Apartament) { setEditing({ ...a }); setOpen(true) }

  async function save() {
    if (!editing.nume || !editing.adresa) { show('error', 'Completează numele și adresa'); return }
    setSaving(true)
    const payload = {
      nume: editing.nume, adresa: editing.adresa, zona: editing.zona||null,
      nr_camere: editing.nr_camere, capacitate_max: editing.capacitate_max,
      pret_standard: editing.pret_standard, proprietar_id: editing.proprietar_id||null,
      comision_tip: editing.comision_tip, comision_procent: editing.comision_procent,
      comision_fix: editing.comision_fix, link_airbnb: editing.link_airbnb||null,
      link_booking: editing.link_booking||null, link_site: editing.link_site||null,
      instructiuni_checkin: editing.instructiuni_checkin||null,
      reguli: editing.reguli||null, status: editing.status, nota: editing.nota||null,
    }
    const { error } = editing.id
      ? await supabase.from('apartamente').update(payload).eq('id', editing.id)
      : await supabase.from('apartamente').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Apartament actualizat' : 'Apartament adăugat')
    setOpen(false); setSaving(false); load()
  }

  async function deleteApt() {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('apartamente').delete().eq('id', deleteId)
    if (error) { show('error', error.message) } else { show('success', 'Apartament șters') }
    setDeleteId(null); setDeleting(false); load()
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.06)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(159,215,255,0.12)',
    borderRadius: 14,
  }

  if (loading) return (<><PageHeader title="Apartamente" /><PageLoading /></>)

  // Separate owned from others
  const myApts = apartamente.filter(a => a.nota && !['Sky View Royal','Cherry by AB Homes','Comfy & Chic Apartment','SkyPort'].includes(a.nume))
  const otherApts = apartamente.filter(a => !a.nota || ['Sky View Royal','Cherry by AB Homes','Comfy & Chic Apartment','SkyPort'].includes(a.nume))

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații în administrare`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Caută..." style={{ width: 180, padding: '6px 12px', fontSize: 12 }} />
            <Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Apartament nou</Button>
          </div>
        }
      />
      <div style={{ padding: '20px 24px' }}>
        {apartamente.length === 0 ? (
          <EmptyState icon={<Building2 size={48}/>} title="Niciun apartament"
            action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă apartament</Button>}/>
        ) : (
          <>
            {/* My apartments with codes */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
                Apartamente AB Homes ({myApts.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {myApts.map(a => <AptCard key={a.id} a={a} onEdit={openEdit} onDelete={setDeleteId} />)}
              </div>
            </div>

            {/* Other apartments */}
            {otherApts.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
                  Alte locații ({otherApts.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {otherApts.map(a => <AptCard key={a.id} a={a} onEdit={openEdit} onDelete={setDeleteId} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? 'Editează apartament' : 'Apartament nou'} width="640px">
        <FormRow cols={2}>
          <FormGroup><label>Cod intern</label><input value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} placeholder="Ex: L99, HD02..."/></FormGroup>
          <FormGroup>
            <label>Status</label>
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
          <FormGroup>
            <label>Proprietar</label>
            <select value={editing.proprietar_id||''} onChange={e=>setEditing({...editing,proprietar_id:e.target.value||undefined})}>
              <option value="">— Fără proprietar —</option>
              {proprietari.map(p=><option key={p.id} value={p.id}>{p.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Tip comision</label>
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
          <FormGroup><label>Procent comision (%)</label><input type="number" value={editing.comision_procent||20} onChange={e=>setEditing({...editing,comision_procent:parseFloat(e.target.value)||0})} min={0} max={100}/></FormGroup>
          <FormGroup><label>Comision fix (RON)</label><input type="number" value={editing.comision_fix||0} onChange={e=>setEditing({...editing,comision_fix:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Link site (sau Google Maps)</label><input value={editing.link_site||''} onChange={e=>setEditing({...editing,link_site:e.target.value})} placeholder="https://abhomesiasi.ro/..."/></FormGroup>
          <FormGroup><label>Link Google Maps</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Link Airbnb</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="airbnb.com/rooms/..."/></FormGroup>
          <FormGroup></FormGroup>
        </FormRow>
        <FormGroup><label>Instrucțiuni check-in / cod acces</label><textarea value={editing.instructiuni_checkin||''} onChange={e=>setEditing({...editing,instructiuni_checkin:e.target.value})} rows={2} placeholder="Cutia cu chei, cod, etaj..."/></FormGroup>
        <FormGroup><label>Reguli apartament</label><textarea value={editing.reguli||''} onChange={e=>setEditing({...editing,reguli:e.target.value})} rows={2} placeholder="Nefumători, fără petreceri..."/></FormGroup>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex: 1 }}>Salvează</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} style={{ flex: 1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={deleteApt} loading={deleting}
        title="Șterge apartament" message="Sigur vrei să ștergi acest apartament?" />
      <Toast toast={toast}/>
    </>
  )
}

function AptCard({ a, onEdit, onDelete }: { a: any; onEdit: (a: any) => void; onDelete: (id: string) => void }) {
  const statusColor = { activ: '#22C55E', inactiv: '#EF4444', mentenanta: '#F59E0B' }
  const sc = statusColor[a.status as keyof typeof statusColor] || '#94A3B8'

  return (
    <div style={{
      background: 'rgba(214,228,244,0.06)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(159,215,255,0.12)',
      borderRadius: 14, padding: '18px 18px 14px',
      transition: 'border-color 0.15s', cursor: 'pointer',
      borderTop: `2px solid ${sc}22`,
    }}
      onClick={() => onEdit(a)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {a.nota && (
              <span style={{
                background: 'rgba(77,163,255,0.15)', border: '1px solid rgba(77,163,255,0.25)',
                borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                color: '#4DA3FF', fontFamily: 'monospace', flexShrink: 0,
              }}>{a.nota}</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.nume}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>
            <MapPin size={10}/>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.adresa}</span>
            <CopyBtn text={a.adresa} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
          <span style={{
            background: `${sc}18`, border: `1px solid ${sc}30`,
            borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 500, color: sc, flexShrink: 0,
          }}>{a.status}</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'rgba(14,27,43,0.4)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace', lineHeight: 1 }}>{a.nr_camere}</div>
          <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', marginTop: 2 }}>camere</div>
        </div>
        <div style={{ background: 'rgba(14,27,43,0.4)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace', lineHeight: 1 }}>{a.capacitate_max}</div>
          <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', marginTop: 2 }}>pers. max</div>
        </div>
        <div style={{ background: 'rgba(14,27,43,0.4)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4DA3FF', fontFamily: 'monospace', lineHeight: 1 }}>{a.pret_standard}</div>
          <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', marginTop: 2 }}>RON/n</div>
        </div>
      </div>

      {/* Links row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {a.link_site && (
          <a href={a.link_site} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.2)', textDecoration: 'none' }}>
            <ExternalLink size={9}/> Site
          </a>
        )}
        {a.link_booking && (
          <a href={a.link_booking} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)', textDecoration: 'none' }}>
            <MapPin size={9}/> Maps
          </a>
        )}
        {a.link_booking && <CopyBtn text={a.link_booking} />}
        {a.link_airbnb && (
          <a href={a.link_airbnb} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)', textDecoration: 'none' }}>
            <ExternalLink size={9}/> Airbnb
          </a>
        )}
      </div>

      {/* Proprietar & comision */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'rgba(159,215,255,0.4)' }}>
          Proprietar: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{(a as any).proprietar?.nume || '—'}</span>
        </span>
        <span style={{ color: '#4ADE80', fontFamily: 'monospace' }}>
          {a.comision_procent}%
        </span>
      </div>

      {/* Calculator */}
      <CostCalculator apt={a} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(159,215,255,0.06)' }}
        onClick={e=>e.stopPropagation()}>
        <Button variant="ghost" size="sm" icon={<Edit2 size={12}/>} onClick={() => onEdit(a)} style={{ flex: 1, fontSize: 11 }}>Editează</Button>
        <Button variant="ghost" size="sm" icon={<Trash2 size={12}/>} onClick={() => onDelete(a.id)} style={{ color: '#F87171', fontSize: 11 }}>Șterge</Button>
      </div>
    </div>
  )
}
