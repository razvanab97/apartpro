'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Modal, FormGroup, FormRow, Toast, useToast } from '@/components/ui'
import { Check, Pencil, X, Plus, Upload, Trash2 } from 'lucide-react'

const COLS = [
  { key: 'chirie',     label: 'Chirie',      due: 1  },
  { key: 'asociatie',  label: 'Asociație',   due: 15 },
  { key: 'eon_curent', label: 'E.ON Curent', due: 20 },
  { key: 'eon_gaz',    label: 'E.ON Gaz',    due: 20 },
  { key: 'internet',   label: 'Internet',    due: 10 },
  { key: 'salubris',   label: 'Salubris',    due: 5  },
]

const DEFAULTS: Record<string, Record<string, number>> = {
  'EX59': { chirie: 1500, internet: 45 },
  'L88':  { chirie: 2800, internet: 50 },
  'L94':  { chirie: 2800, internet: 50 },
  'C64':  { chirie: 2300, internet: 25 },
  'VM07': { chirie: 2000 },
  'N32':  { chirie: 3080, internet: 25 },
  'N33':  { chirie: 3080 },
  'GS08': { chirie: 2250, internet: 70 },
  'HD02': { chirie: 2500 },
  'L83':  { chirie: 2000 },
  'L99':  { chirie: 2000, internet: 50 },
  'NT9':  { chirie: 3050, internet: 65 },
  'CG40': { chirie: 0 },
  'R99':    { chirie: 2500, internet: 45 },
  'Canta':  { chirie: 1400, internet: 25 },
  'Mircea': { chirie: 1400, internet: 25, salubris: 83 },
}

const AB_CODES = ['L99','EX59','GS08','HD02','L83','N32','NT9','L94','L88','CG40','C64','N33','VM07']

// ── Tipuri pentru sectiunile de jos ──────────────────────────────────────
type FlatItem = {
  id?: string
  categorie: string   // 'consumabile' | 'contabilitate' | 'fiscal'
  subcategorie: string
  descriere: string
  furnizor?: string
  valoare: number
  status: string
  data?: string
}

const FISCAL_TYPES = [
  { key: 'tva_intracomunitar', label: 'TVA Intracomunitar',   due: 25 },
  { key: 'impozit_profit',     label: 'Impozit pe profit',    due: 25 },
  { key: 'taxa_proprietati',   label: 'Taxă pe proprietăți',  due: 31 },
]

export default function CheltuieliPage() {
  const now = new Date()
  const [luna]  = useState(now.getMonth() + 1)
  const [an]    = useState(now.getFullYear())
  const [loading, setLoading]   = useState(true)
  const [seeding, setSeeding]   = useState(false)
  const [apts, setApts]         = useState<any[]>([])
  const [rows, setRows]         = useState<Record<string, Record<string, any>>>({})
  const [editing, setEditing]   = useState<{aptId:string;col:string}|null>(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Consumabile
  const [consumabile, setConsumabile] = useState<FlatItem[]>([])
  const [modalCons, setModalCons]     = useState(false)
  const [formCons, setFormCons]       = useState({ descriere:'', furnizor:'', valoare:'', data:'' })

  // Contabilitate
  const [contab, setContab]     = useState<FlatItem[]>([])
  const [modalContab, setModalContab] = useState(false)
  const [formContab, setFormContab]   = useState({ descriere:'', furnizor:'', valoare:'', data:'' })

  // Fiscal
  const [fiscal, setFiscal]     = useState<Record<string, FlatItem>>({})
  const [editFiscal, setEditFiscal] = useState<{key:string}|null>(null)
  const [editFiscalVal, setEditFiscalVal] = useState('')
  const fiscalRef = useRef<HTMLInputElement>(null)

  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 50) }, [editing])
  useEffect(() => { if (editFiscal) setTimeout(() => fiscalRef.current?.focus(), 50) }, [editFiscal])

  const pad = (n: number) => String(n).padStart(2,'0')
  const monthStart = `${an}-${pad(luna)}-01`
  const monthEnd   = `${an}-${pad(luna)}-31`

  async function load() {
    setLoading(true)
    const [{ data: aptData }, { data: chData }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota,status').eq('status','activ').order('nume'),
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,descriere,valoare,status,data,furnizor:nota')
        .gte('data', monthStart).lte('data', monthEnd),
    ])
    setApts(aptData || [])
    const r: Record<string, Record<string, any>> = {}
    const cons: FlatItem[] = []
    const cont: FlatItem[] = []
    const fisc: Record<string, FlatItem> = {}

    ;(chData || []).forEach((c: any) => {
      if (COLS.find(col => col.key === c.categorie) && c.apartament_id) {
        if (!r[c.apartament_id]) r[c.apartament_id] = {}
        r[c.apartament_id][c.categorie] = c
      } else if (c.categorie === 'consumabile') {
        cons.push({ id:c.id, categorie:'consumabile', subcategorie:'consumabile', descriere:c.descriere, furnizor:c.furnizor, valoare:Number(c.valoare), status:c.status, data:c.data })
      } else if (c.categorie === 'contabilitate') {
        cont.push({ id:c.id, categorie:'contabilitate', subcategorie:'contabilitate', descriere:c.descriere, furnizor:c.furnizor, valoare:Number(c.valoare), status:c.status, data:c.data })
      } else if (FISCAL_TYPES.find(f => f.key === c.categorie)) {
        fisc[c.categorie] = { id:c.id, categorie:'fiscal', subcategorie:c.categorie, descriere:c.descriere, valoare:Number(c.valoare), status:c.status, data:c.data }
      }
    })
    setRows(r)
    setConsumabile(cons)
    setContab(cont)
    setFiscal(fisc)
    setLoading(false)
  }

  async function seedDefaults() {
    setSeeding(true)
    const inserts: any[] = []
    apts.forEach(apt => {
      const key = DEFAULTS[apt.nota] ? apt.nota : apt.nume
      const defs = DEFAULTS[key]
      if (!defs) return
      COLS.forEach(col => {
        const val = defs[col.key]
        if (!val || val === 0) return
        if (rows[apt.id]?.[col.key]) return
        inserts.push({ apartament_id:apt.id, categorie:col.key, descriere:col.label, valoare:val, data:`${an}-${pad(luna)}-${pad(col.due)}`, status:'nevalidat', suportat_de:'proprietar', tva:0 })
      })
    })
    if (!inserts.length) { show('info','Toate valorile există deja'); setSeeding(false); return }
    const { error } = await supabase.from('cheltuieli').insert(inserts)
    if (error) { show('error', error.message) } else { show('success', `${inserts.length} valori importate`); await load() }
    setSeeding(false)
  }

  function startEdit(aptId: string, col: string) {
    const cur = rows[aptId]?.[col]
    setEditVal(cur ? String(cur.valoare) : '')
    setEditing({ aptId, col })
  }

  async function commitEdit() {
    if (!editing) return
    const { aptId, col } = editing
    const val = parseFloat(editVal) || 0
    setSaving(true)
    const existing = rows[aptId]?.[col]
    const colDef = COLS.find(c => c.key === col)!
    const dateStr = `${an}-${pad(luna)}-${pad(colDef.due)}`
    if (existing) {
      await supabase.from('cheltuieli').update({ valoare:val, data:dateStr }).eq('id', existing.id)
      setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...existing, valoare:val } } }))
    } else {
      const { data, error } = await supabase.from('cheltuieli').insert({ apartament_id:aptId, categorie:col, descriere:colDef.label, valoare:val, data:dateStr, status:'nevalidat', suportat_de:'proprietar', tva:0 }).select().single()
      if (!error && data) setRows(r => ({ ...r, [aptId]: { ...(r[aptId]||{}), [col]: data } }))
    }
    setSaving(false); setEditing(null); setEditVal('')
  }

  async function togglePaid(aptId: string, col: string) {
    const item = rows[aptId]?.[col]
    if (!item) { show('error','Introdu mai întâi valoarea'); return }
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status:ns }).eq('id', item.id)
    setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...item, status:ns } } }))
  }

  // ── Consumabile ────────────────────────────────────────────────────────
  async function addConsumabil() {
    if (!formCons.descriere || !formCons.valoare) { show('error','Completează descrierea și valoarea'); return }
    setSaving(true)
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: null, categorie:'consumabile', descriere:formCons.descriere,
      valoare:parseFloat(formCons.valoare)||0, data:formCons.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat', suportat_de:'administrator', tva:0, nota:formCons.furnizor||null,
    }).select().single()
    if (error) { show('error', error.message) } else {
      setConsumabile(c => [...c, { id:data.id, categorie:'consumabile', subcategorie:'consumabile', descriere:data.descriere, furnizor:data.nota, valoare:Number(data.valoare), status:data.status, data:data.data }])
      show('success','Consumabil adăugat'); setModalCons(false); setFormCons({ descriere:'', furnizor:'', valoare:'', data:'' })
    }
    setSaving(false)
  }

  async function toggleFlatPaid(item: FlatItem, setter: React.Dispatch<React.SetStateAction<FlatItem[]>>) {
    if (!item.id) return
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status:ns }).eq('id', item.id)
    setter(list => list.map(i => i.id === item.id ? { ...i, status:ns } : i))
  }

  async function deleteFlatItem(item: FlatItem, setter: React.Dispatch<React.SetStateAction<FlatItem[]>>) {
    if (!item.id) return
    await supabase.from('cheltuieli').delete().eq('id', item.id)
    setter(list => list.filter(i => i.id !== item.id))
    show('success','Șters')
  }

  // ── Contabilitate ──────────────────────────────────────────────────────
  async function addContab() {
    if (!formContab.descriere || !formContab.valoare) { show('error','Completează descrierea și valoarea'); return }
    setSaving(true)
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id:null, categorie:'contabilitate', descriere:formContab.descriere,
      valoare:parseFloat(formContab.valoare)||0, data:formContab.data||`${an}-${pad(luna)}-01`,
      status:'nevalidat', suportat_de:'administrator', tva:0, nota:formContab.furnizor||null,
    }).select().single()
    if (error) { show('error', error.message) } else {
      setContab(c => [...c, { id:data.id, categorie:'contabilitate', subcategorie:'contabilitate', descriere:data.descriere, furnizor:data.nota, valoare:Number(data.valoare), status:data.status, data:data.data }])
      show('success','Înregistrat'); setModalContab(false); setFormContab({ descriere:'', furnizor:'', valoare:'', data:'' })
    }
    setSaving(false)
  }

  // ── Fiscal ─────────────────────────────────────────────────────────────
  async function commitFiscal() {
    if (!editFiscal) return
    const { key } = editFiscal
    const val = parseFloat(editFiscalVal) || 0
    const ft = FISCAL_TYPES.find(f => f.key === key)!
    const existing = fiscal[key]
    setSaving(true)
    if (existing?.id) {
      await supabase.from('cheltuieli').update({ valoare:val }).eq('id', existing.id)
      setFiscal(f => ({ ...f, [key]: { ...existing, valoare:val } }))
    } else {
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id:null, categorie:key, descriere:ft.label,
        valoare:val, data:`${an}-${pad(luna)}-${pad(ft.due)}`,
        status:'nevalidat', suportat_de:'administrator', tva:0,
      }).select().single()
      if (!error && data) setFiscal(f => ({ ...f, [key]: { id:data.id, categorie:'fiscal', subcategorie:key, descriere:ft.label, valoare:val, status:data.status, data:data.data } }))
    }
    setSaving(false); setEditFiscal(null); setEditFiscalVal('')
  }

  async function toggleFiscalPaid(key: string) {
    const item = fiscal[key]
    if (!item?.id) { show('error','Introdu mai întâi valoarea'); return }
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status:ns }).eq('id', item.id)
    setFiscal(f => ({ ...f, [key]: { ...item, status:ns } }))
  }

  // ── Calcule ────────────────────────────────────────────────────────────
  const rowTotal = (id: string) => COLS.reduce((s,c) => s + Number(rows[id]?.[c.key]?.valoare||0), 0)
  const rowPaid  = (id: string) => COLS.reduce((s,c) => { const it=rows[id]?.[c.key]; return s+(it?.status==='validat'?Number(it.valoare):0) }, 0)
  const colTotal = (col: string, list: any[]) => list.reduce((s,a) => s + Number(rows[a.id]?.[col]?.valoare||0), 0)

  const consTotal  = consumabile.reduce((s,i)=>s+i.valoare,0)
  const consPaid   = consumabile.filter(i=>i.status==='validat').reduce((s,i)=>s+i.valoare,0)
  const contTotal  = contab.reduce((s,i)=>s+i.valoare,0)
  const contPaid   = contab.filter(i=>i.status==='validat').reduce((s,i)=>s+i.valoare,0)
  const fiscTotal  = FISCAL_TYPES.reduce((s,f)=>s+Number(fiscal[f.key]?.valoare||0),0)
  const fiscPaid   = FISCAL_TYPES.reduce((s,f)=>{ const it=fiscal[f.key]; return s+(it?.status==='validat'?Number(it.valoare):0) },0)

  const lunaLabel = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'][luna]
  const abApts    = apts.filter(a => AB_CODES.includes(a.nota))
  const extraApts = apts.filter(a => !AB_CODES.includes(a.nota))

  // ── Stiluri ────────────────────────────────────────────────────────────
  const thS: React.CSSProperties = {
    padding:'0 12px', height:38, fontSize:11, fontWeight:500,
    color:'rgba(159,215,255,0.45)', textTransform:'uppercase' as const,
    letterSpacing:'.06em', borderRight:'1px solid rgba(159,215,255,0.06)',
    whiteSpace:'nowrap' as const, display:'flex', alignItems:'center',
  }
  const tdS: React.CSSProperties = {
    padding:'0 10px', height:46, borderRight:'1px solid rgba(159,215,255,0.06)',
    display:'flex', alignItems:'center', position:'relative' as const,
  }
  const gridCols = `180px repeat(${COLS.length}, 1fr) 150px`

  const cardStyle: React.CSSProperties = {
    background:'rgba(214,228,244,0.03)', border:'1px solid rgba(159,215,255,0.09)',
    borderRadius:14, overflow:'hidden',
  }
  const secLabelStyle: React.CSSProperties = {
    fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.4)',
    letterSpacing:'.08em', textTransform:'uppercase' as const,
  }
  const pillBtn = (active: boolean): React.CSSProperties => ({
    background:'none', border:'none', cursor:'pointer', padding:'3px 4px',
    display:'flex', borderRadius:4,
    color: active ? '#4ADE80' : 'rgba(159,215,255,0.25)',
  })
  const editBtn: React.CSSProperties = {
    background:'none', border:'none', cursor:'pointer', padding:'3px 4px',
    display:'flex', borderRadius:4, color:'rgba(159,215,255,0.4)',
  }
  const addBtnStyle: React.CSSProperties = {
    display:'flex', alignItems:'center', gap:5, padding:'6px 12px',
    borderRadius:7, fontSize:12, fontWeight:500,
    border:'1px dashed rgba(77,163,255,0.3)', background:'transparent',
    color:'rgba(77,163,255,0.6)', cursor:'pointer',
  }

  // ── Render rând tabel principal ────────────────────────────────────────
  function renderRow(apt: any, isLast: boolean) {
    const total   = rowTotal(apt.id)
    const paid    = rowPaid(apt.id)
    const rest    = total - paid
    const allPaid = total > 0 && rest === 0
    return (
      <div key={apt.id} className="ch-row" style={{ display:'grid', gridTemplateColumns:gridCols, borderBottom:isLast?'none':'1px solid rgba(159,215,255,0.06)' }}>
        <div style={{ ...tdS, gap:7 }}>
          {apt.nota && <span style={{ fontSize:11, fontWeight:500, color:'var(--accent-blue)', background:'rgba(77,163,255,0.12)', padding:'2px 7px', borderRadius:5, flexShrink:0 }}>{apt.nota}</span>}
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{apt.nume}</span>
        </div>
        {COLS.map(col => {
          const item   = rows[apt.id]?.[col.key]
          const isPaid = item?.status === 'validat'
          const isEdit = editing?.aptId === apt.id && editing?.col === col.key
          const val    = item ? Number(item.valoare) : 0
          return (
            <div key={col.key} className="ch-cell" style={{ ...tdS, background:isPaid?'rgba(74,222,128,0.06)':'transparent', justifyContent:'space-between' }}>
              {isEdit ? (
                <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%' }}>
                  <input ref={inputRef} type="number" value={editVal}
                    onChange={e=>setEditVal(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape'){setEditing(null);setEditVal('')}}}
                    style={{ background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.4)', borderRadius:5, color:'#fff', fontSize:13, padding:'3px 7px', width:'100%', outline:'none' }} min={0}/>
                  <button onClick={commitEdit} disabled={saving} style={{ ...pillBtn(true), flexShrink:0 }}><Check size={13}/></button>
                  <button onClick={()=>{setEditing(null);setEditVal('')}} style={{ ...editBtn, flexShrink:0 }}><X size={13}/></button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize:13, fontWeight:val>0?500:400, color:isPaid?'#4ADE80':val>0?'var(--text)':'rgba(159,215,255,0.18)' }}>
                    {val>0?val.toLocaleString('ro-RO'):'—'}
                  </span>
                  <div className="cell-actions" style={{ display:'flex', gap:2 }}>
                    <button title="Editează" onClick={()=>startEdit(apt.id,col.key)} style={editBtn}><Pencil size={11}/></button>
                    <button title={isPaid?'Neplătit':'Plătit'} onClick={()=>togglePaid(apt.id,col.key)} style={pillBtn(isPaid)}><Check size={11}/></button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div style={{ ...tdS, flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:1, borderRight:'none' }}>
          {total>0?(<>
            <span style={{ fontSize:12, fontWeight:500, color:allPaid?'#4ADE80':'var(--text)' }}>{total.toLocaleString('ro-RO')} RON</span>
            {paid>0&&rest>0&&<span style={{ fontSize:10, color:'#F87171' }}>rest {rest.toLocaleString('ro-RO')}</span>}
            {allPaid&&<span style={{ fontSize:10, color:'rgba(74,222,128,0.6)' }}>✓ achitat</span>}
          </>):<span style={{ fontSize:12, color:'rgba(159,215,255,0.15)' }}>—</span>}
        </div>
      </div>
    )
  }

  function renderAptSection(list: any[], title: string) {
    if (!list.length) return null
    const secTotal = list.reduce((s,a)=>s+rowTotal(a.id),0)
    const secPaid  = list.reduce((s,a)=>s+rowPaid(a.id),0)
    const secRest  = secTotal-secPaid
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={secLabelStyle}>{title}</span>
          {secTotal>0&&<>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{secTotal.toLocaleString('ro-RO')} RON</span>
            {secPaid>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>{secPaid.toLocaleString('ro-RO')} plătit</span></>}
            {secRest>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#F87171' }}>{secRest.toLocaleString('ro-RO')} rest</span></>}
          </>}
        </div>
        <div style={cardStyle}>
          <div style={{ display:'grid', gridTemplateColumns:gridCols, background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(159,215,255,0.09)' }}>
            <div style={thS}>Apartament</div>
            {COLS.map(c=><div key={c.key} style={thS}>{c.label}<span style={{ fontSize:10, color:'rgba(159,215,255,0.25)', marginLeft:5 }}>/{c.due}</span></div>)}
            <div style={{ ...thS, borderRight:'none' }}>Total</div>
          </div>
          {list.map((apt,i)=>renderRow(apt,i===list.length-1))}
          <div style={{ display:'grid', gridTemplateColumns:gridCols, borderTop:'1px solid rgba(159,215,255,0.09)', background:'rgba(11,18,32,0.3)' }}>
            <div style={{ ...thS, color:'rgba(159,215,255,0.25)', fontSize:10 }}>Total</div>
            {COLS.map(c=>{const t=colTotal(c.key,list);return<div key={c.key} style={{ ...thS, color:t>0?'rgba(77,163,255,0.7)':'rgba(159,215,255,0.12)', fontWeight:500, fontSize:12 }}>{t>0?t.toLocaleString('ro-RO'):'—'}</div>})}
            <div style={{ ...thS, borderRight:'none', color:'rgba(77,163,255,0.9)', fontSize:13, fontWeight:500 }}>{secTotal.toLocaleString('ro-RO')} RON</div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render rând flat (consumabile / contabilitate) ─────────────────────
  function renderFlatRow(item: FlatItem, idx: number, isLast: boolean, setter: React.Dispatch<React.SetStateAction<FlatItem[]>>) {
    const isPaid = item.status === 'validat'
    return (
      <div key={item.id||idx} className="ch-row" style={{ display:'grid', gridTemplateColumns:'1fr 180px 120px 90px 80px', borderBottom:isLast?'none':'1px solid rgba(159,215,255,0.06)', alignItems:'center' }}>
        <div style={{ ...tdS, flexDirection:'column', alignItems:'flex-start', justifyContent:'center', gap:1 }}>
          <span style={{ fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{item.descriere}</span>
          {item.furnizor&&<span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>{item.furnizor}</span>}
        </div>
        <div style={{ ...tdS, fontSize:11, color:'rgba(159,215,255,0.4)' }}>{item.data||'—'}</div>
        <div style={{ ...tdS, fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{item.valoare.toLocaleString('ro-RO')} RON</div>
        <div style={{ ...tdS }}>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:5, background:isPaid?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)', color:isPaid?'#4ADE80':'#F87171' }}>
            {isPaid?'Plătit':'Neachitat'}
          </span>
        </div>
        <div style={{ ...tdS, gap:4, borderRight:'none' }}>
          <button title={isPaid?'Neplătit':'Plătit'} onClick={()=>toggleFlatPaid(item,setter)} style={pillBtn(isPaid)}><Check size={13}/></button>
          <button title="Șterge" onClick={()=>deleteFlatItem(item,setter)} style={{ ...editBtn, color:'rgba(248,113,113,0.4)' }}><Trash2 size={11}/></button>
        </div>
      </div>
    )
  }

  // ── Render sectiune flat ───────────────────────────────────────────────
  function renderFlatSection(
    title: string, items: FlatItem[], total: number, paid: number,
    setter: React.Dispatch<React.SetStateAction<FlatItem[]>>,
    onAdd: () => void, addLabel: string
  ) {
    const rest = total - paid
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={secLabelStyle}>{title}</span>
          {total>0&&<>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{total.toLocaleString('ro-RO')} RON</span>
            {paid>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>{paid.toLocaleString('ro-RO')} plătit</span></>}
            {rest>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#F87171' }}>{rest.toLocaleString('ro-RO')} rest</span></>}
          </>}
          <button onClick={onAdd} style={{ ...addBtnStyle, marginLeft:'auto' }}><Plus size={12}/>{addLabel}</button>
        </div>
        <div style={cardStyle}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 180px 120px 90px 80px', background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(159,215,255,0.09)' }}>
            <div style={thS}>Descriere / Furnizor</div>
            <div style={thS}>Data facturii</div>
            <div style={thS}>Valoare</div>
            <div style={thS}>Status</div>
            <div style={{ ...thS, borderRight:'none' }}></div>
          </div>
          {items.length === 0
            ? <div style={{ padding:'20px 16px', fontSize:13, color:'rgba(159,215,255,0.25)', fontStyle:'italic' }}>Nicio înregistrare luna aceasta</div>
            : items.map((item,i)=>renderFlatRow(item,i,i===items.length-1,setter))
          }
        </div>
      </div>
    )
  }

  // ── Render sectiune fiscal ─────────────────────────────────────────────
  function renderFiscalSection() {
    const rest = fiscTotal - fiscPaid
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={secLabelStyle}>Obligații fiscale</span>
          {fiscTotal>0&&<>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{fiscTotal.toLocaleString('ro-RO')} RON</span>
            {fiscPaid>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>{fiscPaid.toLocaleString('ro-RO')} plătit</span></>}
            {rest>0&&<><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#F87171' }}>{rest.toLocaleString('ro-RO')} rest</span></>}
          </>}
        </div>
        <div style={cardStyle}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 90px 80px', background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(159,215,255,0.09)' }}>
            <div style={thS}>Tip obligație</div>
            <div style={thS}>Scadență</div>
            <div style={thS}>Valoare</div>
            <div style={{ ...thS, borderRight:'none' }}>Status</div>
          </div>
          {FISCAL_TYPES.map((ft, i) => {
            const item    = fiscal[ft.key]
            const isPaid  = item?.status === 'validat'
            const val     = item ? Number(item.valoare) : 0
            const isEdit  = editFiscal?.key === ft.key
            return (
              <div key={ft.key} className="ch-row" style={{ display:'grid', gridTemplateColumns:'1fr 140px 90px 80px', borderBottom:i===FISCAL_TYPES.length-1?'none':'1px solid rgba(159,215,255,0.06)', alignItems:'center' }}>
                <div style={{ ...tdS }}>
                  <span style={{ fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{ft.label}</span>
                </div>
                <div style={{ ...tdS, fontSize:12, color:'rgba(159,215,255,0.4)' }}>
                  {ft.due} {lunaLabel} {an}
                </div>
                <div style={{ ...tdS, justifyContent:'space-between' }} className="ch-cell">
                  {isEdit ? (
                    <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%' }}>
                      <input ref={fiscalRef} type="number" value={editFiscalVal}
                        onChange={e=>setEditFiscalVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')commitFiscal();if(e.key==='Escape'){setEditFiscal(null);setEditFiscalVal('')}}}
                        style={{ background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.4)', borderRadius:5, color:'#fff', fontSize:13, padding:'3px 7px', width:'100%', outline:'none' }} min={0}/>
                      <button onClick={commitFiscal} style={{ ...pillBtn(true), flexShrink:0 }}><Check size={12}/></button>
                      <button onClick={()=>{setEditFiscal(null);setEditFiscalVal('')}} style={{ ...editBtn, flexShrink:0 }}><X size={12}/></button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize:13, fontWeight:val>0?500:400, color:isPaid?'#4ADE80':val>0?'var(--text)':'rgba(159,215,255,0.18)' }}>
                        {val>0?val.toLocaleString('ro-RO'):'—'}
                      </span>
                      <div className="cell-actions" style={{ display:'flex', gap:2 }}>
                        <button title="Editează" onClick={()=>{setEditFiscalVal(val>0?String(val):'');setEditFiscal({key:ft.key})}} style={editBtn}><Pencil size={11}/></button>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ ...tdS, gap:4, borderRight:'none' }}>
                  <button title={isPaid?'Neplătit':'Plătit'} onClick={()=>toggleFiscalPaid(ft.key)} style={pillBtn(isPaid)}><Check size={13}/></button>
                  <span style={{ fontSize:11, padding:'2px 7px', borderRadius:5, background:isPaid?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)', color:isPaid?'#4ADE80':'#F87171' }}>
                    {isPaid?'✓':'—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Cheltuieli & Utilități" subtitle={`${lunaLabel} ${an}`}
        actions={
          <button onClick={seedDefaults} disabled={seeding||loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:500, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)', color:'var(--accent-blue)', cursor:'pointer', opacity:seeding?0.6:1 }}>
            <Plus size={13}/>{seeding?'Se importă...':'Import valori fixe'}
          </button>
        }
      />
      <style>{`
        .ch-row:hover { background: rgba(77,163,255,0.025) !important; }
        .ch-cell .cell-actions { opacity:0; transition:opacity .15s; }
        .ch-cell:hover .cell-actions { opacity:1; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      `}</style>

      <div style={{ padding:'0 24px 40px', overflowX:'auto' }}>
        {loading
          ? <div style={{ color:'rgba(159,215,255,0.35)', fontSize:13, padding:'48px 0' }}>Se încarcă...</div>
          : <>
              {renderAptSection(abApts,    'AB Homes — apartamente proprii')}
              {renderAptSection(extraApts, 'Extra — alte locații')}

              {/* Separator */}
              <div style={{ borderTop:'1px solid rgba(159,215,255,0.08)', margin:'8px 0 28px' }}/>

              {renderFlatSection(
                'Consumabile & Aprovizionare',
                consumabile, consTotal, consPaid,
                setConsumabile,
                () => setModalCons(true),
                'Adaugă factură'
              )}

              {renderFlatSection(
                'Contabilitate',
                contab, contTotal, contPaid,
                setContab,
                () => setModalContab(true),
                'Adaugă cost contă'
              )}

              {renderFiscalSection()}
            </>
        }
      </div>

      {/* Modal consumabile */}
      <Modal open={modalCons} onClose={()=>{setModalCons(false);setFormCons({descriere:'',furnizor:'',valoare:'',data:''})}}
        title="Adaugă factură consumabile" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={formCons.descriere} onChange={e=>setFormCons({...formCons,descriere:e.target.value})} placeholder="ex. Produse curățenie Metro, Consumabile Jumbo..."/></FormGroup>
        <FormGroup><label>Furnizor</label><input value={formCons.furnizor} onChange={e=>setFormCons({...formCons,furnizor:e.target.value})} placeholder="ex. Metro, Jumbo, Dedeman..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={formCons.valoare} onChange={e=>setFormCons({...formCons,valoare:e.target.value})} min={0} step={1} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={formCons.data} onChange={e=>setFormCons({...formCons,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button onClick={addConsumabil} disabled={saving} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'var(--accent-blue)', color:'#fff', fontWeight:500, fontSize:13, cursor:'pointer' }}>
            <Upload size={13} style={{ display:'inline', marginRight:6 }}/>Înregistrează factură
          </button>
          <button onClick={()=>{setModalCons(false);setFormCons({descriere:'',furnizor:'',valoare:'',data:''})}} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.6)', fontSize:13, cursor:'pointer' }}>Anulează</button>
        </div>
      </Modal>

      {/* Modal contabilitate */}
      <Modal open={modalContab} onClose={()=>{setModalContab(false);setFormContab({descriere:'',furnizor:'',valoare:'',data:''})}}
        title="Adaugă cost contabilitate" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={formContab.descriere} onChange={e=>setFormContab({...formContab,descriere:e.target.value})} placeholder="ex. Servicii contabilitate Mai 2026..."/></FormGroup>
        <FormGroup><label>Furnizor / Cabinet</label><input value={formContab.furnizor} onChange={e=>setFormContab({...formContab,furnizor:e.target.value})} placeholder="ex. Cabinet Contabil X..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={formContab.valoare} onChange={e=>setFormContab({...formContab,valoare:e.target.value})} min={0} step={1} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={formContab.data} onChange={e=>setFormContab({...formContab,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button onClick={addContab} disabled={saving} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'var(--accent-blue)', color:'#fff', fontWeight:500, fontSize:13, cursor:'pointer' }}>Salvează</button>
          <button onClick={()=>{setModalContab(false);setFormContab({descriere:'',furnizor:'',valoare:'',data:''})}} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.6)', fontSize:13, cursor:'pointer' }}>Anulează</button>
        </div>
      </Modal>

      <Toast toast={toast}/>
    </>
  )
}
