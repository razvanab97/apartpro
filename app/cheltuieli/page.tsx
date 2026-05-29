'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast } from '@/components/ui'
import { Plus, Check, Circle } from 'lucide-react'
import { format } from 'date-fns'

const UTILITATI = [
  { key: 'chirie',     label: 'Chirie',              tip: 'fix',  due_day: 1  },
  { key: 'asociatie',  label: 'Asociație',            tip: 'var',  due_day: 15 },
  { key: 'eon_curent', label: 'E.ON Curent',          tip: 'var',  due_day: 20 },
  { key: 'eon_gaz',    label: 'E.ON Gaz',             tip: 'var',  due_day: 20 },
  { key: 'internet',   label: 'Internet',             tip: 'fix',  due_day: 10 },
  { key: 'salubris',   label: 'Salubris',             tip: 'fix',  due_day: 5  },
]

function dueDateStr(dueDay: number, luna: number, an: number) {
  return `${String(dueDay).padStart(2,'0')}/${String(luna).padStart(2,'0')}`
}

function tots(items: any[], paid: Record<string,boolean>) {
  const total = items.reduce((s,i) => s + (i.valoare||0), 0)
  const platit = items.filter(i => paid[i._pid]).reduce((s,i) => s + (i.valoare||0), 0)
  return { total, platit, rest: total - platit }
}

export default function CheltuieliPage() {
  const now = new Date()
  const [luna]  = useState(now.getMonth() + 1)
  const [an]    = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [apartamente, setApartamente] = useState<any[]>([])
  const [cheltuieli, setCheltuieli] = useState<any[]>([])
  const [paid, setPaid] = useState<Record<string,boolean>>({})
  const [saving, setSaving] = useState<string|null>(null)
  const [modalApt, setModalApt] = useState<any>(null)
  const [form, setForm] = useState({ descriere:'', valoare:'', due:'' })
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: apts }, { data: ch }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nume'),
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,descriere,valoare,data,status,nota')
        .gte('data', `${an}-${String(luna).padStart(2,'0')}-01`)
        .lte('data', `${an}-${String(luna).padStart(2,'0')}-31`)
    ])
    setApartamente(apts||[])
    setCheltuieli(ch||[])
    const p: Record<string,boolean> = {}
    ;(ch||[]).forEach((c:any) => { if (c.status === 'validat') p[c.id] = true })
    setPaid(p)
    setLoading(false)
  }

  function getItems(aptId: string) {
    const saved = cheltuieli.filter(c => c.apartament_id === aptId)
    return UTILITATI.map(u => {
      const found = saved.find(c => c.categorie === u.key)
      return {
        _pid:     found ? found.id : `${aptId}_${u.key}_new`,
        _isNew:   !found,
        _isSaved: !!found,
        dbId:     found?.id,
        key:      u.key,
        label:    u.label,
        tip:      u.tip,
        valoare:  found ? Number(found.valoare) : 0,
        due:      dueDateStr(u.due_day, luna, an),
      }
    }).filter(i => i.valoare > 0 || i._isNew)
  }

  function getExtra(aptId: string) {
    return cheltuieli.filter(c => c.apartament_id === aptId && !UTILITATI.find(u => u.key === c.categorie))
      .map(c => ({
        _pid: c.id, _isNew: false, _isSaved: true,
        dbId: c.id, key: c.id, label: c.descriere, tip: 'extra',
        valoare: Number(c.valoare), due: c.data?.slice(8,10)+'/'+c.data?.slice(5,7),
      }))
  }

  async function togglePaid(item: any, aptId: string) {
    if (item._isNew && !item.valoare) {
      show('error', 'Introdu mai întâi valoarea'); return
    }
    setSaving(item._pid)
    const nowPaid = !paid[item._pid]
    if (item._isNew) {
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id: aptId,
        categorie: item.key,
        descriere: item.label,
        valoare: item.valoare,
        data: `${an}-${String(luna).padStart(2,'0')}-${item.due.slice(0,2)}`,
        status: nowPaid ? 'validat' : 'nevalidat',
        suportat_de: 'proprietar', tva: 0,
      }).select().single()
      if (!error && data) {
        setPaid(p => ({ ...p, [data.id]: nowPaid }))
        await load()
      }
    } else {
      await supabase.from('cheltuieli').update({ status: nowPaid ? 'validat' : 'nevalidat' }).eq('id', item.dbId)
      setPaid(p => ({ ...p, [item._pid]: nowPaid }))
    }
    setSaving(null)
  }

  async function addConsumabil() {
    if (!form.descriere || !form.valoare) { show('error','Completează denumirea și valoarea'); return }
    setSaving('modal')
    const dueDay = form.due ? form.due.split('/')[0] : '25'
    const { error } = await supabase.from('cheltuieli').insert({
      apartament_id: modalApt.id,
      categorie: 'alte',
      descriere: form.descriere,
      valoare: parseFloat(form.valoare)||0,
      data: `${an}-${String(luna).padStart(2,'0')}-${dueDay.padStart(2,'0')}`,
      status: 'nevalidat',
      suportat_de: 'proprietar', tva: 0,
    })
    if (error) { show('error', error.message) } else {
      show('success','Consumabil adăugat')
      setModalApt(null); setForm({ descriere:'', valoare:'', due:'' })
      await load()
    }
    setSaving(null)
  }

  const lunaLabel = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'][luna]

  return (
    <>
      <PageHeader title="Cheltuieli & Utilități"
        subtitle={`${lunaLabel} ${an}`}
        actions={null}
      />

      <div className="p-6" style={{ overflowY:'auto' }}>
        {loading ? (
          <div style={{ color:'var(--text-secondary)', fontSize:14 }}>Se încarcă...</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {apartamente.map((apt, idx) => {
              const utilItems = getItems(apt.id)
              const extraItems = getExtra(apt.id)
              const allItems = [...utilItems, ...extraItems]
              const { total, platit, rest } = tots(allItems, paid)
              const allPaid = rest === 0 && total > 0

              return (
                <div key={apt.id}>
                  <div style={{ padding:'18px 0 14px' }}>
                    {/* Header apartament */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                      <span style={{
                        fontSize:12, fontWeight:500, color:'var(--accent-blue)',
                        background:'rgba(77,163,255,0.12)', padding:'3px 9px',
                        borderRadius:6, letterSpacing:'.02em'
                      }}>{apt.nota || '—'}</span>
                      <span style={{ fontSize:15, fontWeight:500, color:'var(--text)' }}>{apt.nume}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginLeft:4, flexWrap:'wrap' }}>
                        <span style={{ color:'rgba(159,215,255,0.3)', fontSize:13 }}>·</span>
                        <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>total</span>
                        <span style={{ fontSize:12, fontWeight:500, color:'var(--text-secondary)' }}>{total.toLocaleString('ro-RO')} RON</span>
                        {platit > 0 && (<>
                          <span style={{ color:'rgba(159,215,255,0.3)', fontSize:13 }}>·</span>
                          <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>plătit</span>
                          <span style={{ fontSize:12, fontWeight:500, color:'#4ADE80' }}>{platit.toLocaleString('ro-RO')} RON</span>
                        </>)}
                        {!allPaid && rest > 0 && (<>
                          <span style={{ color:'rgba(159,215,255,0.3)', fontSize:13 }}>·</span>
                          <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>rest</span>
                          <span style={{ fontSize:12, fontWeight:500, color:'#F87171' }}>{rest.toLocaleString('ro-RO')} RON</span>
                        </>)}
                        {allPaid && (<>
                          <span style={{ color:'rgba(159,215,255,0.3)', fontSize:13 }}>·</span>
                          <span style={{ fontSize:12, fontWeight:500, color:'#4ADE80' }}>✓ achitat integral</span>
                        </>)}
                      </div>
                    </div>

                    {/* Pills */}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'flex-start' }}>
                      {allItems.map(item => {
                        const isPaid = !!paid[item._pid]
                        const isSaving = saving === item._pid
                        return (
                          <div key={item._pid} style={{
                            display:'flex', alignItems:'stretch',
                            border: isPaid ? '0.5px solid rgba(74,222,128,0.4)' : '0.5px solid rgba(159,215,255,0.12)',
                            borderRadius:8,
                            background: isPaid ? 'rgba(74,222,128,0.07)' : 'rgba(214,228,244,0.06)',
                            transition:'border-color .15s, background .15s',
                          }}>
                            <div style={{ padding:'7px 10px', lineHeight:1.25 }}>
                              <div style={{ fontSize:11, color: isPaid ? 'rgba(74,222,128,0.7)' : 'var(--text-secondary)', whiteSpace:'nowrap' }}>
                                {item.label}
                              </div>
                              {item.valoare > 0
                                ? <div style={{ fontSize:13, fontWeight:500, color: isPaid ? '#4ADE80' : 'var(--text)', whiteSpace:'nowrap' }}>
                                    {item.valoare.toLocaleString('ro-RO')} RON
                                  </div>
                                : <div style={{ fontSize:12, color:'var(--text-tertiary)', fontStyle:'italic' }}>necompletat</div>
                              }
                              <div style={{ fontSize:10, color: isPaid ? 'rgba(74,222,128,0.5)' : 'var(--text-tertiary)', whiteSpace:'nowrap' }}>
                                scad. {item.due}
                              </div>
                            </div>
                            <button
                              onClick={() => togglePaid(item, apt.id)}
                              disabled={isSaving}
                              aria-label="Marchează plătit"
                              style={{
                                width:28, display:'flex', alignItems:'center', justifyContent:'center',
                                borderLeft: isPaid ? '0.5px solid rgba(74,222,128,0.3)' : '0.5px solid rgba(159,215,255,0.1)',
                                background:'transparent', cursor:'pointer',
                                color: isPaid ? '#4ADE80' : 'rgba(159,215,255,0.35)',
                                fontSize:14, flexShrink:0,
                                borderLeft: isPaid ? '0.5px solid rgba(74,222,128,0.3)' : '0.5px solid rgba(159,215,255,0.1)',
                                transition:'color .15s', opacity: isSaving ? 0.5 : 1,
                              }}
                            >
                              {isPaid ? <Check size={14}/> : <Circle size={14}/>}
                            </button>
                          </div>
                        )
                      })}

                      {/* Buton adaugă consumabil */}
                      <button
                        onClick={() => setModalApt(apt)}
                        style={{
                          display:'flex', alignItems:'center', gap:5,
                          padding:'7px 11px',
                          border:'0.5px dashed rgba(159,215,255,0.25)',
                          borderRadius:8, background:'transparent', cursor:'pointer',
                          fontSize:12, color:'var(--text-tertiary)',
                          transition:'all .15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor='var(--accent-blue)'
                          ;(e.currentTarget as HTMLElement).style.color='var(--accent-blue)'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor='rgba(159,215,255,0.25)'
                          ;(e.currentTarget as HTMLElement).style.color='var(--text-tertiary)'
                        }}
                      >
                        <Plus size={13}/>consumabil
                      </button>
                    </div>
                  </div>

                  {idx < apartamente.length - 1 && (
                    <div style={{ borderTop:'0.5px solid rgba(159,215,255,0.08)' }}/>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal consumabil */}
      <Modal open={!!modalApt} onClose={() => { setModalApt(null); setForm({ descriere:'', valoare:'', due:'' }) }}
        title={`Adaugă consumabil — ${modalApt?.nume||''}`} width="max-w-sm">
        <FormGroup>
          <label>Denumire</label>
          <input value={form.descriere} onChange={e => setForm({...form, descriere:e.target.value})} placeholder="ex. Reparație, Curățenie extra..."/>
        </FormGroup>
        <FormRow cols={2}>
          <FormGroup>
            <label>Valoare (RON)</label>
            <input type="number" value={form.valoare} onChange={e => setForm({...form, valoare:e.target.value})} min={0} step={1} placeholder="0"/>
          </FormGroup>
          <FormGroup>
            <label>Scadență (zz/ll)</label>
            <input value={form.due} onChange={e => setForm({...form, due:e.target.value})} placeholder="ex. 25/05"/>
          </FormGroup>
        </FormRow>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={addConsumabil} loading={saving==='modal'} className="flex-1">Adaugă</Button>
          <Button variant="secondary" onClick={() => { setModalApt(null); setForm({ descriere:'', valoare:'', due:'' }) }} className="flex-1">Anulează</Button>
        </div>
      </Modal>

      <Toast toast={toast}/>
    </>
  )
}
