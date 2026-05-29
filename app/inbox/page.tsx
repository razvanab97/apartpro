'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, MessageCircle, Phone, Mail, Globe, Trash2, ArrowRight, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'

type Cerere = {
  id: string
  nume_client: string
  telefon?: string
  canal: string
  apartament_id?: string
  data_checkin?: string
  data_checkout?: string
  nr_persoane?: number
  mesaj?: string
  status: 'noua' | 'contactat' | 'confirmat' | 'pierdut'
  prioritate: 'urgenta' | 'normala' | 'scazuta'
  created_at: string
  apartament?: { id: string; nume: string; nota: string | null }
}

const STATUS_CONFIG = {
  noua:       { label: 'Nouă',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: '🆕' },
  contactat:  { label: 'Contactat',  color: '#4DA3FF', bg: 'rgba(77,163,255,0.12)', icon: '💬' },
  confirmat:  { label: 'Confirmată', color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: '✅' },
  pierdut:    { label: 'Pierdută',   color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   icon: '❌' },
}

const CANAL_CONFIG: Record<string,{label:string;color:string;bg:string;icon:React.ReactNode}> = {
  whatsapp: { label:'WhatsApp', color:'#4ADE80', bg:'rgba(34,197,94,0.12)', icon:<MessageCircle size={12}/> },
  booking:  { label:'Booking',  color:'#7BC8FF', bg:'rgba(77,163,255,0.12)', icon:<Globe size={12}/> },
  airbnb:   { label:'Airbnb',   color:'#F87171', bg:'rgba(239,68,68,0.12)', icon:<Globe size={12}/> },
  telefon:  { label:'Telefon',  color:'#FCD34D', bg:'rgba(245,158,11,0.12)', icon:<Phone size={12}/> },
  email:    { label:'Email',    color:'#C4B5FD', bg:'rgba(167,139,250,0.12)', icon:<Mail size={12}/> },
  direct:   { label:'Direct',   color:'#94A3B8', bg:'rgba(148,163,184,0.1)', icon:<MessageCircle size={12}/> },
}

const empty = { nume_client:'', telefon:'', canal:'whatsapp', apartament_id:'', data_checkin:'', data_checkout:'', nr_persoane:2, mesaj:'', status:'noua' as const, prioritate:'normala' as const }

export default function InboxPage() {
  const [cereri, setCereri] = useState<Cerere[]>([])
  const [apts, setApts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCanal, setFilterCanal] = useState('')
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('cereri_rezervare').select('*,apartament:apartamente(id,nume,nota)').order('created_at', { ascending: false }),
      supabase.from('apartamente').select('id,nume,nota').order('nota'),
    ])
    setCereri((c||[]) as any)
    setApts(a||[])
    setLoading(false)
  }

  async function save() {
    if (!editing.nume_client) { show('error','Adaugă numele clientului'); return }
    setSaving(true)
    const payload = { ...editing, apartament_id: editing.apartament_id || null, telefon: editing.telefon || null, data_checkin: editing.data_checkin || null, data_checkout: editing.data_checkout || null }
    const { error } = editing.id
      ? await supabase.from('cereri_rezervare').update(payload).eq('id', editing.id)
      : await supabase.from('cereri_rezervare').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Cerere actualizată' : 'Cerere adăugată')
    setEditOpen(false); setSaving(false); load()
  }

  async function updateStatus(id: string, status: Cerere['status']) {
    await supabase.from('cereri_rezervare').update({ status }).eq('id', id)
    setCereri(prev => prev.map(c => c.id === id ? {...c, status} : c))
  }

  async function convertToRezervare(c: Cerere) {
    if (!c.data_checkin || !c.data_checkout) { show('error', 'Adaugă datele de check-in și check-out'); return }
    const { error } = await supabase.from('rezervari').insert({
      apartament_id: c.apartament_id || null,
      canal: c.canal, nume_client: c.nume_client,
      data_checkin: c.data_checkin, data_checkout: c.data_checkout,
      nr_persoane: c.nr_persoane || 1,
      telefon_client: c.telefon,
      status_rezervare: 'confirmata', status_plata: 'neplatit',
      status_decont: 'nedecontat', moneda: 'RON',
      observatii: c.mesaj || null,
    })
    if (error) { show('error', error.message); return }
    await supabase.from('cereri_rezervare').update({ status: 'confirmat' }).eq('id', c.id)
    show('success', 'Rezervare creată! ✓')
    load()
  }

  const filtered = cereri.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterCanal && c.canal !== filterCanal) return false
    return true
  })

  const stats = {
    noua: cereri.filter(c => c.status === 'noua').length,
    contactat: cereri.filter(c => c.status === 'contactat').length,
    confirmat: cereri.filter(c => c.status === 'confirmat').length,
    pierdut: cereri.filter(c => c.status === 'pierdut').length,
  }

  const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.1)', borderRadius:12 }

  return (
    <>
      <PageHeader
        title="Inbox Cereri"
        subtitle={`${stats.noua} noi · ${stats.contactat} în curs · ${cereri.length} total`}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select value={filterCanal} onChange={e=>setFilterCanal(e.target.value)} style={{ fontSize:12, padding:'6px 10px', width:130 }}>
              <option value="">Toate canalele</option>
              {Object.entries(CANAL_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ fontSize:12, padding:'6px 10px', width:130 }}>
              <option value="">Toate statusurile</option>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(empty); setEditOpen(true) }}>Cerere nouă</Button>
          </div>
        }
      />

      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12, overflowY:'auto', flex:1 }}>

        {/* Stats strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {Object.entries(STATUS_CONFIG).map(([k,v]) => (
            <button key={k} onClick={() => setFilterStatus(filterStatus===k?'':k)} style={{
              ...panel, padding:'12px', textAlign:'center', cursor:'pointer', border:`1px solid ${filterStatus===k?v.color+'50':'rgba(159,215,255,0.1)'}`,
              background: filterStatus===k ? v.bg : 'rgba(214,228,244,0.04)',
            }}>
              <div style={{ fontSize:22, fontWeight:700, color:v.color, fontFamily:'monospace' }}>{stats[k as keyof typeof stats]}</div>
              <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginTop:3 }}>{v.icon} {v.label}</div>
            </button>
          ))}
        </div>

        {/* Cereri list */}
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Loader2 size={24} style={{ animation:'spin 1s linear infinite', color:'#4DA3FF' }}/></div>
        ) : filtered.length === 0 ? (
          <div style={{ ...panel, padding:40, textAlign:'center', color:'rgba(159,215,255,0.3)', fontSize:13 }}>
            Nicio cerere. Adaugă prima cerere de rezervare!
          </div>
        ) : filtered.map(c => {
          const sc = STATUS_CONFIG[c.status]
          const cc = CANAL_CONFIG[c.canal] || CANAL_CONFIG.direct
          const apt = c.apartament as any
          return (
            <div key={c.id} style={{ ...panel, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  {/* Name + canal */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:14, fontWeight:600, color:'#FFFFFF' }}>{c.nume_client}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'2px 8px', borderRadius:20, background:cc.bg, color:cc.color, border:`1px solid ${cc.color}30` }}>
                      {cc.icon} {cc.label}
                    </span>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:sc.bg, color:sc.color, border:`1px solid ${sc.color}30` }}>
                      {sc.icon} {sc.label}
                    </span>
                  </div>
                  {/* Details */}
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'rgba(159,215,255,0.55)' }}>
                    {apt && <span>🏠 {apt.nota?`[${apt.nota}] `:''}{apt.nume}</span>}
                    {c.data_checkin && <span>📅 {c.data_checkin} → {c.data_checkout}</span>}
                    {c.nr_persoane && <span>👥 {c.nr_persoane} pers.</span>}
                    {c.telefon && (
                      <a href={`https://wa.me/${c.telefon.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener"
                        style={{ color:'#4ADE80', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                        <MessageCircle size={11}/> {c.telefon}
                      </a>
                    )}
                  </div>
                  {c.mesaj && <div style={{ marginTop:6, fontSize:12, color:'rgba(159,215,255,0.4)', fontStyle:'italic', borderLeft:'2px solid rgba(159,215,255,0.1)', paddingLeft:8 }}>"{c.mesaj}"</div>}
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  {/* Status quick change */}
                  <div style={{ display:'flex', gap:4 }}>
                    {(Object.keys(STATUS_CONFIG) as Cerere['status'][]).filter(s => s !== c.status).map(s => (
                      <button key={s} onClick={() => updateStatus(c.id, s)} title={STATUS_CONFIG[s].label}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:STATUS_CONFIG[s].bg, border:`1px solid ${STATUS_CONFIG[s].color}30`, color:STATUS_CONFIG[s].color, cursor:'pointer' }}>
                        {STATUS_CONFIG[s].icon}
                      </button>
                    ))}
                  </div>
                  {c.status !== 'confirmat' && c.status !== 'pierdut' && (
                    <Button variant="secondary" size="sm" icon={<ArrowRight size={12}/>} onClick={() => convertToRezervare(c)}>
                      → Rezervare
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" icon={<Plus size={12}/>} onClick={() => { setEditing({...c}); setEditOpen(true) }}/>
                  <Button variant="ghost" size="sm" icon={<Trash2 size={12}/>} onClick={() => setDeleteId(c.id)}/>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing.id ? 'Editează cerere' : 'Cerere nouă'} width="560px">
        <FormGroup><label>Nume client *</label><input value={editing.nume_client||''} onChange={e=>setEditing({...editing,nume_client:e.target.value})} placeholder="Numele clientului"/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Telefon / WhatsApp</label><input value={editing.telefon||''} onChange={e=>setEditing({...editing,telefon:e.target.value})} placeholder="+40..."/></FormGroup>
          <FormGroup><label>Canal</label>
            <select value={editing.canal||'whatsapp'} onChange={e=>setEditing({...editing,canal:e.target.value})}>
              {Object.entries(CANAL_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Apartament</label>
          <select value={editing.apartament_id||''} onChange={e=>setEditing({...editing,apartament_id:e.target.value})}>
            <option value="">— Necunoscut —</option>
            {apts.map(a => <option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
          </select>
        </FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Check-in</label><input type="date" value={editing.data_checkin||''} onChange={e=>setEditing({...editing,data_checkin:e.target.value})}/></FormGroup>
          <FormGroup><label>Check-out</label><input type="date" value={editing.data_checkout||''} onChange={e=>setEditing({...editing,data_checkout:e.target.value})}/></FormGroup>
          <FormGroup><label>Persoane</label><input type="number" value={editing.nr_persoane||2} onChange={e=>setEditing({...editing,nr_persoane:parseInt(e.target.value)})} min={1} max={20}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Status</label>
            <select value={editing.status||'noua'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Prioritate</label>
            <select value={editing.prioritate||'normala'} onChange={e=>setEditing({...editing,prioritate:e.target.value})}>
              <option value="urgenta">🔴 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Mesaj / Notă</label><textarea value={editing.mesaj||''} onChange={e=>setEditing({...editing,mesaj:e.target.value})} rows={2} placeholder="Ce a cerut clientul..."/></FormGroup>
        <div style={{ display:'flex', gap:10 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{flex:1}}>Salvează</Button>
          <Button variant="secondary" onClick={() => setEditOpen(false)} style={{flex:1}}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await supabase.from('cereri_rezervare').delete().eq('id', deleteId!); setDeleteId(null); load() }} title="Șterge cerere" message="Sigur vrei să ștergi această cerere?"/>
      <Toast toast={toast}/>
    </>
  )
}
