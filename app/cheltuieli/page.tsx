'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Modal, FormGroup, FormRow, Toast, useToast } from '@/components/ui'
import { Check, Pencil, X, Plus, Trash2 } from 'lucide-react'

const UTIL_COLS = [
  { key: 'chirie',     label: 'Chirie',      due: 1  },
  { key: 'asociatie',  label: 'Asociație',   due: 15 },
  { key: 'eon_curent', label: 'E.ON Curent', due: 20 },
  { key: 'eon_gaz',    label: 'E.ON Gaz',    due: 20 },
  { key: 'internet',   label: 'Internet',    due: 10 },
  { key: 'salubris',   label: 'Salubris',    due: 5  },
]
const UTIL_KEYS = UTIL_COLS.map(c => c.key)

const FISCAL_ROWS = [
  { key: 'tva_intracomunitar', label: 'TVA Intracomunitar',  due: 25 },
  { key: 'impozit_profit',     label: 'Impozit pe profit',   due: 25 },
  { key: 'taxa_proprietati',   label: 'Taxă pe proprietăți', due: 31 },
]

const AB_CODES = ['L99','EX59','GS08','HD02','L83','N32','NT9','L94','L88','CG40','C64','N33','VM07']

// Mapare dupa COD (nota) SI dupa NUME — ambele variante
const DEFAULTS_BY_COD: Record<string, Record<string,number>> = {
  'L99':  { chirie:2000, internet:50 },
  'EX59': { chirie:1500, internet:45 },
  'L88':  { chirie:2800, internet:50 },
  'L94':  { chirie:2800, internet:50 },
  'C64':  { chirie:2300, internet:25 },
  'VM07': { chirie:2000 },
  'N32':  { chirie:3080, internet:25 },
  'N33':  { chirie:3080 },
  'GS08': { chirie:2250, internet:70 },
  'HD02': { chirie:2500 },
  'L83':  { chirie:2000 },
  'NT9':  { chirie:3050, internet:65 },
  'CG40': { chirie:0 },
}

const DEFAULTS_BY_NUME: Record<string, Record<string,number>> = {
  'Airy Palas':          { chirie:2000, internet:50 },
  'Cozy Studio':         { chirie:1500, internet:45 },
  'Palas SkyNest':       { chirie:2800, internet:50 },
  'Palas Retreat':       { chirie:2800, internet:50 },
  'SkyPort':             { chirie:2300, internet:25 },
  'Vila Păcurari':       { chirie:2000 },
  'Mint Loft Copou':     { chirie:3080, internet:25 },
  'Urban Oasis':         { chirie:3080 },
  'Green Station':       { chirie:2250, internet:70 },
  'Hideout Rozelor':     { chirie:2500 },
  'Lazar Comfy':         { chirie:2000 },
  'Newton Urban':        { chirie:3050, internet:65 },
  'Peaceful Copou Retreat': { chirie:0 },
  // Extra fara cod AB
  'R99':                 { chirie:2500, internet:45 },
  'Canta':               { chirie:1400, internet:25 },
  'Mircea':              { chirie:1400, internet:25, salubris:83 },
  'Sky View Royal':      { chirie:2500 },
  'Cherry by AB Homes':  { chirie:2000 },
  'Comfy & Chic Apartment': { chirie:1800 },
}

function getDefaults(apt: any): Record<string,number> | null {
  if (apt.nota && DEFAULTS_BY_COD[apt.nota]) return DEFAULTS_BY_COD[apt.nota]
  if (apt.nume && DEFAULTS_BY_NUME[apt.nume]) return DEFAULTS_BY_NUME[apt.nume]
  // fuzzy: cauta partial match in nume
  const numeL = (apt.nume || '').toLowerCase()
  for (const [k, v] of Object.entries(DEFAULTS_BY_NUME)) {
    if (numeL.includes(k.toLowerCase()) || k.toLowerCase().includes(numeL)) return v
  }
  return null
}

const pad = (n: number) => String(n).padStart(2,'0')
const LUNI = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

export default function CheltuieliPage() {
  const now  = new Date()
  const luna = now.getMonth() + 1
  const an   = now.getFullYear()

  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [apts, setApts]       = useState<any[]>([])
  const [util, setUtil]       = useState<Record<string, Record<string,any>>>({})
  const [consumabile, setCons]= useState<any[]>([])
  const [contab, setContab]   = useState<any[]>([])
  const [fiscal, setFiscal]   = useState<Record<string,any>>({})

  const [editCell, setEditCell] = useState<{aptId:string;col:string}|null>(null)
  const [editVal,  setEditVal]  = useState('')
  const cellRef = useRef<HTMLInputElement>(null)
  const [editFisc, setEditFisc]       = useState<string|null>(null)
  const [editFiscVal, setEditFiscVal] = useState('')
  const fiscRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const [modalCons,   setModalCons]   = useState(false)
  const [modalContab, setModalContab] = useState(false)
  const [fCons,   setFCons]   = useState({ descriere:'', furnizor:'', valoare:'', data:'' })
  const [fContab, setFContab] = useState({ descriere:'', furnizor:'', valoare:'', data:'' })

  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { if (editCell) setTimeout(() => cellRef.current?.focus(), 50) }, [editCell])
  useEffect(() => { if (editFisc) setTimeout(() => fiscRef.current?.focus(), 50) }, [editFisc])

  async function load() {
    setLoading(true)
    const [{ data: aptData }, { data: chData }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nume'),
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,descriere,valoare,status,data,nota')
        .gte('data', `${an}-${pad(luna)}-01`)
        .lte('data', `${an}-${pad(luna)}-31`),
    ])
    setApts(aptData || [])
    const u: Record<string,Record<string,any>> = {}
    const cons: any[] = []
    const cont: any[] = []
    const fisc: Record<string,any> = {}
    ;(chData || []).forEach((c: any) => {
      if (UTIL_KEYS.includes(c.categorie) && c.apartament_id) {
        if (!u[c.apartament_id]) u[c.apartament_id] = {}
        u[c.apartament_id][c.categorie] = c
      } else if (c.categorie === 'consumabile') {
        cons.push(c)
      } else if (c.categorie === 'contabilitate') {
        cont.push(c)
      } else if (FISCAL_ROWS.find(f => f.key === c.categorie)) {
        fisc[c.categorie] = c
      }
    })
    setUtil(u); setCons(cons); setContab(cont); setFiscal(fisc)
    setLoading(false)
  }

  async function seedDefaults() {
    setSeeding(true)
    const ins: any[] = []
    ;(apts || []).forEach(apt => {
      const defs = getDefaults(apt)
      if (!defs) return
      UTIL_COLS.forEach(col => {
        const v = defs[col.key]
        if (!v || v === 0) return
        if (util[apt.id]?.[col.key]) return
        ins.push({
          apartament_id: apt.id, categorie: col.key, descriere: col.label,
          valoare: v, data: `${an}-${pad(luna)}-${pad(col.due)}`,
          status: 'nevalidat', suportat_de: 'proprietar', tva: 0,
        })
      })
    })
    if (!ins.length) { show('info','Toate valorile există deja'); setSeeding(false); return }
    const { error } = await supabase.from('cheltuieli').insert(ins)
    if (error) show('error', error.message)
    else { show('success', `${ins.length} valori importate`); await load() }
    setSeeding(false)
  }

  async function commitCell() {
    if (!editCell) return
    const { aptId, col } = editCell
    const val = parseFloat(editVal) || 0
    const colDef = UTIL_COLS.find(c => c.key === col)!
    const dateStr = `${an}-${pad(luna)}-${pad(colDef.due)}`
    const existing = util[aptId]?.[col]
    setSaving(true)
    if (existing) {
      await supabase.from('cheltuieli').update({ valoare: val, data: dateStr }).eq('id', existing.id)
      setUtil(u => ({ ...u, [aptId]: { ...u[aptId], [col]: { ...existing, valoare: val } } }))
    } else {
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id: aptId, categorie: col, descriere: colDef.label, valoare: val,
        data: dateStr, status: 'nevalidat', suportat_de: 'proprietar', tva: 0,
      }).select().single()
      if (!error && data) setUtil(u => ({ ...u, [aptId]: { ...(u[aptId]||{}), [col]: data } }))
    }
    setSaving(false); setEditCell(null); setEditVal('')
  }

  async function toggleUtil(aptId: string, col: string) {
    const item = util[aptId]?.[col]
    if (!item) { show('error','Introdu mai întâi valoarea'); return }
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status: ns }).eq('id', item.id)
    setUtil(u => ({ ...u, [aptId]: { ...u[aptId], [col]: { ...item, status: ns } } }))
  }

  async function saveCons() {
    if (!fCons.descriere || !fCons.valoare) { show('error','Completează descrierea și valoarea'); return }
    setSaving(true)
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: null, categorie: 'consumabile', descriere: fCons.descriere,
      valoare: parseFloat(fCons.valoare)||0, data: fCons.data||`${an}-${pad(luna)}-01`,
      status: 'nevalidat', suportat_de: 'administrator', tva: 0, nota: fCons.furnizor||null,
    }).select().single()
    if (error) show('error', error.message)
    else { setCons(c => [...c, data]); show('success','Adăugat'); setModalCons(false); setFCons({ descriere:'',furnizor:'',valoare:'',data:'' }) }
    setSaving(false)
  }

  async function saveContab() {
    if (!fContab.descriere || !fContab.valoare) { show('error','Completează descrierea și valoarea'); return }
    setSaving(true)
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: null, categorie: 'contabilitate', descriere: fContab.descriere,
      valoare: parseFloat(fContab.valoare)||0, data: fContab.data||`${an}-${pad(luna)}-01`,
      status: 'nevalidat', suportat_de: 'administrator', tva: 0, nota: fContab.furnizor||null,
    }).select().single()
    if (error) show('error', error.message)
    else { setContab(c => [...c, data]); show('success','Adăugat'); setModalContab(false); setFContab({ descriere:'',furnizor:'',valoare:'',data:'' }) }
    setSaving(false)
  }

  async function toggleFlat(item: any, setter: React.Dispatch<React.SetStateAction<any[]>>) {
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status: ns }).eq('id', item.id)
    setter((list: any[]) => list.map(i => i.id === item.id ? { ...i, status: ns } : i))
  }

  async function deleteFlat(item: any, setter: React.Dispatch<React.SetStateAction<any[]>>) {
    await supabase.from('cheltuieli').delete().eq('id', item.id)
    setter((list: any[]) => list.filter(i => i.id !== item.id))
  }

  async function commitFisc() {
    if (!editFisc) return
    const val = parseFloat(editFiscVal) || 0
    const ft  = FISCAL_ROWS.find(f => f.key === editFisc)!
    const existing = fiscal[editFisc]
    setSaving(true)
    if (existing) {
      await supabase.from('cheltuieli').update({ valoare: val }).eq('id', existing.id)
      setFiscal(f => ({ ...f, [editFisc]: { ...existing, valoare: val } }))
    } else {
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id: null, categorie: editFisc, descriere: ft.label, valoare: val,
        data: `${an}-${pad(luna)}-${pad(ft.due)}`, status: 'nevalidat', suportat_de: 'administrator', tva: 0,
      }).select().single()
      if (!error && data) setFiscal(f => ({ ...f, [editFisc]: data }))
    }
    setSaving(false); setEditFisc(null); setEditFiscVal('')
  }

  async function toggleFisc(key: string) {
    const item = fiscal[key]
    if (!item) { show('error','Introdu mai întâi valoarea'); return }
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status: ns }).eq('id', item.id)
    setFiscal(f => ({ ...f, [key]: { ...item, status: ns } }))
  }

  const rowTotal = (id:string) => UTIL_COLS.reduce((s,c) => s+Number(util[id]?.[c.key]?.valoare||0), 0)
  const rowPaid  = (id:string) => UTIL_COLS.reduce((s,c) => { const it=util[id]?.[c.key]; return s+(it?.status==='validat'?Number(it.valoare):0) }, 0)
  const colTotal = (col:string, list:any[]) => list.reduce((s,a) => s+Number(util[a.id]?.[col]?.valoare||0), 0)

  const abApts    = apts.filter(a => AB_CODES.includes(a.nota))
  const extraApts = apts.filter(a => !AB_CODES.includes(a.nota))

  // ── stiluri ──────────────────────────────────────────────────────────────
  const card  = { background:'rgba(214,228,244,0.03)', border:'1px solid rgba(159,215,255,0.09)', borderRadius:14, overflow:'hidden' } as React.CSSProperties
  const hdr   = { background:'rgba(11,18,32,0.55)', borderBottom:'1px solid rgba(159,215,255,0.09)' } as React.CSSProperties
  const ftr   = { borderTop:'1px solid rgba(159,215,255,0.09)', background:'rgba(11,18,32,0.3)' } as React.CSSProperties
  const TH    = { padding:'0 12px', height:38, fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.4)', textTransform:'uppercase' as const, letterSpacing:'.06em', borderRight:'1px solid rgba(159,215,255,0.06)', whiteSpace:'nowrap' as const, display:'flex', alignItems:'center' } as React.CSSProperties
  const TD    = { padding:'0 12px', height:46, borderRight:'1px solid rgba(159,215,255,0.06)', display:'flex', alignItems:'center' } as React.CSSProperties
  const SL    = { fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.4)', letterSpacing:'.08em', textTransform:'uppercase' as const } as React.CSSProperties
  const sep   = { fontSize:11, color:'rgba(159,215,255,0.2)' }
  const inp   = { background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.4)', borderRadius:5, color:'#fff', fontSize:13, padding:'3px 7px', width:'100%', outline:'none' }
  const bCk   = (on:boolean) => ({ background:'none', border:'none', cursor:'pointer', padding:'3px 5px', display:'flex', borderRadius:4, color:on?'#4ADE80':'rgba(159,215,255,0.3)', flexShrink:0 } as React.CSSProperties)
  const bEd   = { background:'none', border:'none', cursor:'pointer', padding:'3px 5px', display:'flex', borderRadius:4, color:'rgba(159,215,255,0.35)', flexShrink:0 } as React.CSSProperties
  const bDel  = { background:'none', border:'none', cursor:'pointer', padding:'3px 5px', display:'flex', borderRadius:4, color:'rgba(248,113,113,0.4)', flexShrink:0 } as React.CSSProperties
  const gridU = `180px repeat(${UTIL_COLS.length}, 1fr) 160px`

  function SecMeta({ total, paid }: { total:number; paid:number }) {
    const rest = total - paid
    if (!total) return null
    return (
      <>
        <span style={sep}>·</span>
        <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{total.toLocaleString('ro-RO')} RON</span>
        {paid>0&&<><span style={sep}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>{paid.toLocaleString('ro-RO')} plătit</span></>}
        {rest>0&&<><span style={sep}>·</span><span style={{ fontSize:11, color:'#F87171' }}>{rest.toLocaleString('ro-RO')} rest</span></>}
        {rest===0&&paid>0&&<><span style={sep}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>✓ achitat</span></>}
      </>
    )
  }

  // ── rând tabel utilități ─────────────────────────────────────────────────
  function URow({ apt, last }: { apt:any; last:boolean }) {
    const total   = rowTotal(apt.id)
    const paid    = rowPaid(apt.id)
    const rest    = total - paid
    const allPaid = total > 0 && rest === 0
    return (
      <div style={{ display:'grid', gridTemplateColumns:gridU, borderBottom:last?'none':'1px solid rgba(159,215,255,0.06)', transition:'background .1s' }}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(77,163,255,0.03)'}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
        {/* Nume */}
        <div style={{ ...TD, gap:8 }}>
          {apt.nota&&<span style={{ fontSize:11, fontWeight:500, color:'var(--accent-blue)', background:'rgba(77,163,255,0.12)', padding:'2px 8px', borderRadius:5, flexShrink:0 }}>{apt.nota}</span>}
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{apt.nume}</span>
        </div>
        {/* Celule utilități */}
        {UTIL_COLS.map(col => {
          const item   = util[apt.id]?.[col.key]
          const isPaid = item?.status === 'validat'
          const isEdit = editCell?.aptId === apt.id && editCell?.col === col.key
          const val    = item ? Number(item.valoare) : 0
          return (
            <div key={col.key} style={{ ...TD, background:isPaid?'rgba(74,222,128,0.06)':'transparent', gap:4, justifyContent:'space-between' }}>
              {isEdit ? (
                <div style={{ display:'flex', alignItems:'center', gap:3, width:'100%' }}>
                  <input ref={cellRef} type="number" value={editVal} style={inp} min={0}
                    onChange={e=>setEditVal(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')commitCell();if(e.key==='Escape'){setEditCell(null);setEditVal('')}}}/>
                  <button onClick={commitCell} disabled={saving} style={bCk(true)}><Check size={13}/></button>
                  <button onClick={()=>{setEditCell(null);setEditVal('')}} style={bEd}><X size={13}/></button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
                  <span style={{ fontSize:13, fontWeight:val>0?500:400, color:isPaid?'#4ADE80':val>0?'var(--text)':'rgba(159,215,255,0.18)' }}>
                    {val>0?val.toLocaleString('ro-RO'):'—'}
                  </span>
                  {/* Butoane MEREU vizibile */}
                  <div style={{ display:'flex', gap:1, alignItems:'center' }}>
                    <button title="Editează valoarea" onClick={()=>{setEditVal(val>0?String(val):'');setEditCell({aptId:apt.id,col:col.key})}} style={bEd}>
                      <Pencil size={11}/>
                    </button>
                    <button
                      title={isPaid?'Marchează neplătit':'Marchează plătit'}
                      onClick={()=>toggleUtil(apt.id, col.key)}
                      style={{
                        ...bCk(isPaid),
                        background: isPaid ? 'rgba(74,222,128,0.15)' : 'rgba(159,215,255,0.06)',
                        borderRadius: 6,
                        width: 24, height: 24,
                        justifyContent: 'center',
                      }}>
                      <Check size={12}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {/* Total rând */}
        <div style={{ ...TD, flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:1, borderRight:'none' }}>
          {total>0?(<>
            <span style={{ fontSize:12, fontWeight:500, color:allPaid?'#4ADE80':'var(--text)' }}>{total.toLocaleString('ro-RO')} RON</span>
            {paid>0&&rest>0&&<span style={{ fontSize:10, color:'#F87171' }}>rest {rest.toLocaleString('ro-RO')}</span>}
            {allPaid&&<span style={{ fontSize:10, color:'rgba(74,222,128,0.6)' }}>✓ achitat</span>}
          </>):<span style={{ fontSize:12, color:'rgba(159,215,255,0.15)' }}>—</span>}
        </div>
      </div>
    )
  }

  function AptSection({ list, title }: { list:any[]; title:string }) {
    if (!list.length) return null
    const tot  = list.reduce((s,a)=>s+rowTotal(a.id),0)
    const paid = list.reduce((s,a)=>s+rowPaid(a.id),0)
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={SL}>{title}</span>
          <SecMeta total={tot} paid={paid}/>
        </div>
        <div style={card}>
          <div style={{ display:'grid', gridTemplateColumns:gridU, ...hdr }}>
            <div style={TH}>Apartament</div>
            {UTIL_COLS.map(c=><div key={c.key} style={TH}>{c.label}<span style={{ fontSize:10, color:'rgba(159,215,255,0.22)', marginLeft:5 }}>/{c.due}</span></div>)}
            <div style={{ ...TH, borderRight:'none' }}>Total</div>
          </div>
          {list.map((apt,i)=><URow key={apt.id} apt={apt} last={i===list.length-1}/>)}
          <div style={{ display:'grid', gridTemplateColumns:gridU, ...ftr }}>
            <div style={{ ...TH, color:'rgba(159,215,255,0.2)', fontSize:10 }}>Total coloană</div>
            {UTIL_COLS.map(c=>{const t=colTotal(c.key,list);return<div key={c.key} style={{ ...TH, color:t>0?'rgba(77,163,255,0.65)':'rgba(159,215,255,0.1)', fontSize:12, fontWeight:500 }}>{t>0?t.toLocaleString('ro-RO'):'—'}</div>})}
            <div style={{ ...TH, borderRight:'none', color:'rgba(77,163,255,0.85)', fontSize:13, fontWeight:500 }}>{tot.toLocaleString('ro-RO')} RON</div>
          </div>
        </div>
      </div>
    )
  }

  // ── rând flat ────────────────────────────────────────────────────────────
  function FlatRow({ item, last, setter }: { item:any; last:boolean; setter:React.Dispatch<React.SetStateAction<any[]>> }) {
    const isPaid = item.status === 'validat'
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 110px 80px', borderBottom:last?'none':'1px solid rgba(159,215,255,0.06)', transition:'background .1s' }}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(77,163,255,0.03)'}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
        <div style={{ ...TD, flexDirection:'column', alignItems:'flex-start', gap:1 }}>
          <span style={{ fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{item.descriere}</span>
          {item.nota&&<span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>{item.nota}</span>}
        </div>
        <div style={{ ...TD, fontSize:12, color:'rgba(159,215,255,0.4)' }}>{item.data||'—'}</div>
        <div style={{ ...TD, fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{Number(item.valoare).toLocaleString('ro-RO')} RON</div>
        <div style={{ ...TD, gap:6, borderRight:'none' }}>
          <button
            title={isPaid?'Marchează neplătit':'Marchează plătit'}
            onClick={()=>toggleFlat(item,setter)}
            style={{ ...bCk(isPaid), background:isPaid?'rgba(74,222,128,0.15)':'rgba(159,215,255,0.06)', borderRadius:6, width:26, height:26, justifyContent:'center' }}>
            <Check size={12}/>
          </button>
          <button title="Șterge" onClick={()=>deleteFlat(item,setter)} style={bDel}><Trash2 size={11}/></button>
        </div>
      </div>
    )
  }

  function FlatSection({ title, items, setter, onAdd, addLabel }:
    { title:string; items:any[]; setter:React.Dispatch<React.SetStateAction<any[]>>; onAdd:()=>void; addLabel:string }) {
    const tot  = items.reduce((s,i)=>s+Number(i.valoare),0)
    const paid = items.filter(i=>i.status==='validat').reduce((s,i)=>s+Number(i.valoare),0)
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={SL}>{title}</span>
          <SecMeta total={tot} paid={paid}/>
          <button onClick={onAdd} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:7, fontSize:12, fontWeight:500, border:'1px dashed rgba(77,163,255,0.3)', background:'transparent', color:'rgba(77,163,255,0.65)', cursor:'pointer' }}>
            <Plus size={12}/>{addLabel}
          </button>
        </div>
        <div style={card}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 110px 80px', ...hdr }}>
            <div style={TH}>Descriere / Furnizor</div>
            <div style={TH}>Data</div>
            <div style={TH}>Valoare</div>
            <div style={{ ...TH, borderRight:'none' }}>Plătit</div>
          </div>
          {items.length===0
            ? <div style={{ padding:'18px 16px', fontSize:13, color:'rgba(159,215,255,0.2)', fontStyle:'italic' }}>Nicio înregistrare luna aceasta</div>
            : items.map((it,i)=><FlatRow key={it.id||i} item={it} last={i===items.length-1} setter={setter}/>)
          }
          {items.length>0&&<div style={{ ...ftr, padding:'8px 14px', display:'flex', justifyContent:'flex-end' }}>
            <span style={{ fontSize:12, fontWeight:500, color:'rgba(77,163,255,0.8)' }}>Total: {tot.toLocaleString('ro-RO')} RON</span>
          </div>}
        </div>
      </div>
    )
  }

  // ── fiscal ───────────────────────────────────────────────────────────────
  function FiscalSection() {
    const tot  = FISCAL_ROWS.reduce((s,f)=>s+Number(fiscal[f.key]?.valoare||0),0)
    const paid = FISCAL_ROWS.reduce((s,f)=>{ const it=fiscal[f.key]; return s+(it?.status==='validat'?Number(it.valoare):0) },0)
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={SL}>Obligații fiscale</span>
          <SecMeta total={tot} paid={paid}/>
        </div>
        <div style={card}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 150px 80px', ...hdr }}>
            <div style={TH}>Tip obligație</div>
            <div style={TH}>Scadență</div>
            <div style={TH}>Valoare</div>
            <div style={{ ...TH, borderRight:'none' }}>Plătit</div>
          </div>
          {FISCAL_ROWS.map((ft,i)=>{
            const item   = fiscal[ft.key]
            const isPaid = item?.status==='validat'
            const val    = item?Number(item.valoare):0
            const isEdit = editFisc===ft.key
            return (
              <div key={ft.key} style={{ display:'grid', gridTemplateColumns:'1fr 160px 150px 80px', borderBottom:i===FISCAL_ROWS.length-1?'none':'1px solid rgba(159,215,255,0.06)', transition:'background .1s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(77,163,255,0.03)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                <div style={{ ...TD }}>
                  <span style={{ fontSize:13, fontWeight:500, color:isPaid?'#4ADE80':'var(--text)' }}>{ft.label}</span>
                </div>
                <div style={{ ...TD, fontSize:12, color:'rgba(159,215,255,0.4)' }}>{ft.due} {LUNI[luna]} {an}</div>
                <div style={{ ...TD, gap:6 }}>
                  {isEdit?(
                    <div style={{ display:'flex', alignItems:'center', gap:3, width:'100%' }}>
                      <input ref={fiscRef} type="number" value={editFiscVal} style={inp} min={0}
                        onChange={e=>setEditFiscVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')commitFisc();if(e.key==='Escape'){setEditFisc(null);setEditFiscVal('')}}}/>
                      <button onClick={commitFisc} style={bCk(true)}><Check size={13}/></button>
                      <button onClick={()=>{setEditFisc(null);setEditFiscVal('')}} style={bEd}><X size={13}/></button>
                    </div>
                  ):(
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
                      <span style={{ fontSize:13, fontWeight:val>0?500:400, color:isPaid?'#4ADE80':val>0?'var(--text)':'rgba(159,215,255,0.2)' }}>
                        {val>0?val.toLocaleString('ro-RO'):'—'}
                      </span>
                      <button onClick={()=>{setEditFiscVal(val>0?String(val):'');setEditFisc(ft.key)}} style={bEd}><Pencil size={11}/></button>
                    </div>
                  )}
                </div>
                <div style={{ ...TD, borderRight:'none', justifyContent:'center' }}>
                  <button
                    title={isPaid?'Marchează neplătit':'Marchează plătit'}
                    onClick={()=>toggleFisc(ft.key)}
                    style={{ ...bCk(isPaid), background:isPaid?'rgba(74,222,128,0.15)':'rgba(159,215,255,0.06)', borderRadius:6, width:26, height:26, justifyContent:'center' }}>
                    <Check size={12}/>
                  </button>
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
      <PageHeader title="Cheltuieli & Utilități" subtitle={`${LUNI[luna]} ${an}`}
        actions={
          <button onClick={seedDefaults} disabled={seeding||loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:500, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)', color:'var(--accent-blue)', cursor:'pointer', opacity:seeding?0.6:1, transition:'opacity .2s' }}>
            <Plus size={13}/>{seeding?'Se importă...':'Import valori fixe'}
          </button>
        }
      />
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      `}</style>
      <div style={{ padding:'0 24px 40px', overflowX:'auto' }}>
        {loading
          ? <div style={{ color:'rgba(159,215,255,0.35)', fontSize:13, padding:'48px 0' }}>Se încarcă...</div>
          : <>
              <AptSection list={abApts}    title="AB Homes — apartamente proprii"/>
              <AptSection list={extraApts} title="Extra — alte locații"/>
              <div style={{ borderTop:'1px solid rgba(159,215,255,0.07)', margin:'4px 0 28px'}}/>
              <FlatSection title="Consumabile & Aprovizionare" items={consumabile} setter={setCons} onAdd={()=>setModalCons(true)} addLabel="Adaugă factură"/>
              <FlatSection title="Contabilitate" items={contab} setter={setContab} onAdd={()=>setModalContab(true)} addLabel="Adaugă cost"/>
              <FiscalSection/>
            </>
        }
      </div>

      <Modal open={modalCons} onClose={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă factură consumabile" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fCons.descriere} onChange={e=>setFCons({...fCons,descriere:e.target.value})} placeholder="ex. Produse curățenie Metro..."/></FormGroup>
        <FormGroup><label>Furnizor</label><input value={fCons.furnizor} onChange={e=>setFCons({...fCons,furnizor:e.target.value})} placeholder="ex. Metro, Jumbo, Dedeman..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={fCons.valoare} onChange={e=>setFCons({...fCons,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fCons.data} onChange={e=>setFCons({...fCons,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button onClick={saveCons} disabled={saving} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'var(--accent-blue)', color:'#fff', fontWeight:500, fontSize:13, cursor:'pointer' }}>Înregistrează</button>
          <button onClick={()=>{setModalCons(false);setFCons({descriere:'',furnizor:'',valoare:'',data:''})}} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.6)', fontSize:13, cursor:'pointer' }}>Anulează</button>
        </div>
      </Modal>

      <Modal open={modalContab} onClose={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} title="Adaugă cost contabilitate" width="max-w-md">
        <FormGroup><label>Descriere *</label><input value={fContab.descriere} onChange={e=>setFContab({...fContab,descriere:e.target.value})} placeholder="ex. Servicii contabilitate Mai 2026..."/></FormGroup>
        <FormGroup><label>Furnizor / Cabinet</label><input value={fContab.furnizor} onChange={e=>setFContab({...fContab,furnizor:e.target.value})} placeholder="ex. Cabinet Contabil..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON) *</label><input type="number" value={fContab.valoare} onChange={e=>setFContab({...fContab,valoare:e.target.value})} min={0} placeholder="0"/></FormGroup>
          <FormGroup><label>Data facturii</label><input type="date" value={fContab.data} onChange={e=>setFContab({...fContab,data:e.target.value})}/></FormGroup>
        </FormRow>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button onClick={saveContab} disabled={saving} style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background:'var(--accent-blue)', color:'#fff', fontWeight:500, fontSize:13, cursor:'pointer' }}>Salvează</button>
          <button onClick={()=>{setModalContab(false);setFContab({descriere:'',furnizor:'',valoare:'',data:''})}} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.6)', fontSize:13, cursor:'pointer' }}>Anulează</button>
        </div>
      </Modal>

      <Toast toast={toast}/>
    </>
  )
}
