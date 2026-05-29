'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Check, Pencil, X, Plus } from 'lucide-react'

const COLS = [
  { key: 'chirie',     label: 'Chirie',      due: 1  },
  { key: 'asociatie',  label: 'Asociație',   due: 15 },
  { key: 'eon_curent', label: 'E.ON Curent', due: 20 },
  { key: 'eon_gaz',    label: 'E.ON Gaz',    due: 20 },
  { key: 'internet',   label: 'Internet',    due: 10 },
  { key: 'salubris',   label: 'Salubris',    due: 5  },
]

// CSV: Apartament,Chirie,Asociatie,EON Curent,EON Gaz,Internet,Salubris
// Gara = GS08, Podu Ros = HD02
// Canta si Mircea = extra (fara cod AB)
const DEFAULTS: Record<string, Record<string, number>> = {
  // AB Homes cu cod
  'EX59': { chirie: 1500, internet: 45 },
  'L88':  { chirie: 2800, internet: 50 },
  'L94':  { chirie: 2800, internet: 50 },
  'C64':  { chirie: 2300, internet: 25 },
  'VM07': { chirie: 2000 },
  'N32':  { chirie: 3080, internet: 25 },
  'N33':  { chirie: 3080 },
  'GS08': { chirie: 2250, internet: 70 },   // Gara = Green Station
  'HD02': { chirie: 2500 },                  // Podu Ros = Hideout Rozelor
  'L83':  { chirie: 2000 },
  'L99':  { chirie: 2000, internet: 50 },
  'NT9':  { chirie: 3050, internet: 65 },
  'CG40': { chirie: 0 },
  // Extra (fara cod AB — mapate dupa nume)
  'R99':    { chirie: 2500, internet: 45 },
  'Canta':  { chirie: 1400, internet: 25 },
  'Mircea': { chirie: 1400, internet: 25, salubris: 83 },
}

// Coduri AB Homes oficiale
const AB_CODES = ['L99','EX59','GS08','HD02','L83','N32','NT9','L94','L88','CG40','C64','N33','VM07']

export default function CheltuieliPage() {
  const now = new Date()
  const [luna]    = useState(now.getMonth() + 1)
  const [an]      = useState(now.getFullYear())
  const [loading, setLoading]   = useState(true)
  const [seeding, setSeeding]   = useState(false)
  const [apts, setApts]         = useState<any[]>([])
  const [rows, setRows]         = useState<Record<string, Record<string, any>>>({})
  const [editing, setEditing]   = useState<{aptId:string;col:string}|null>(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 50) }, [editing])

  const pad = (n: number) => String(n).padStart(2,'0')

  async function load() {
    setLoading(true)
    const [{ data: aptData }, { data: chData }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota,status').eq('status','activ').order('nume'),
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,valoare,status,data')
        .gte('data', `${an}-${pad(luna)}-01`)
        .lte('data', `${an}-${pad(luna)}-31`),
    ])
    setApts(aptData || [])
    const r: Record<string, Record<string, any>> = {}
    ;(chData || []).forEach((c: any) => {
      if (!r[c.apartament_id]) r[c.apartament_id] = {}
      r[c.apartament_id][c.categorie] = c
    })
    setRows(r)
    setLoading(false)
  }

  async function seedDefaults() {
    setSeeding(true)
    const inserts: any[] = []
    apts.forEach(apt => {
      // Caută după nota (cod) sau după nume pentru extras
      const key = DEFAULTS[apt.nota] ? apt.nota : apt.nume
      const defs = DEFAULTS[key]
      if (!defs) return
      COLS.forEach(col => {
        const val = defs[col.key]
        if (!val || val === 0) return
        if (rows[apt.id]?.[col.key]) return
        inserts.push({
          apartament_id: apt.id,
          categorie: col.key,
          descriere: col.label,
          valoare: val,
          data: `${an}-${pad(luna)}-${pad(col.due)}`,
          status: 'nevalidat',
          suportat_de: 'proprietar',
          tva: 0,
        })
      })
    })
    if (!inserts.length) { show('info','Toate valorile există deja'); setSeeding(false); return }
    const { error } = await supabase.from('cheltuieli').insert(inserts)
    if (error) { show('error', error.message) } else {
      show('success', `${inserts.length} valori importate`)
      await load()
    }
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
      await supabase.from('cheltuieli').update({ valoare: val, data: dateStr }).eq('id', existing.id)
      setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...existing, valoare: val } } }))
    } else {
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id: aptId, categorie: col, descriere: colDef.label,
        valoare: val, data: dateStr, status: 'nevalidat', suportat_de: 'proprietar', tva: 0,
      }).select().single()
      if (!error && data)
        setRows(r => ({ ...r, [aptId]: { ...(r[aptId]||{}), [col]: data } }))
    }
    setSaving(false)
    setEditing(null)
    setEditVal('')
  }

  async function togglePaid(aptId: string, col: string) {
    const item = rows[aptId]?.[col]
    if (!item) { show('error','Introdu mai întâi valoarea'); return }
    const ns = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status: ns }).eq('id', item.id)
    setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...item, status: ns } } }))
  }

  const rowTotal = (id: string) => COLS.reduce((s,c) => s + Number(rows[id]?.[c.key]?.valoare||0), 0)
  const rowPaid  = (id: string) => COLS.reduce((s,c) => { const it=rows[id]?.[c.key]; return s+(it?.status==='validat'?Number(it.valoare):0) }, 0)
  const colTotal = (col: string, list: any[]) => list.reduce((s,a) => s + Number(rows[a.id]?.[col]?.valoare||0), 0)

  const lunaLabel = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'][luna]

  // Sectiuni: AB cu cod, Extra (Canta/Mircea/R99/etc fara cod AB)
  const abApts    = apts.filter(a => AB_CODES.includes(a.nota))
  const extraApts = apts.filter(a => !AB_CODES.includes(a.nota))

  const thS: React.CSSProperties = {
    padding: '0 12px', height: 38, fontSize: 11, fontWeight: 500,
    color: 'rgba(159,215,255,0.45)', textTransform: 'uppercase' as const,
    letterSpacing: '.06em', borderRight: '1px solid rgba(159,215,255,0.06)',
    whiteSpace: 'nowrap' as const, display:'flex', alignItems:'center',
  }
  const tdS: React.CSSProperties = {
    padding: '0 10px', height: 46,
    borderRight: '1px solid rgba(159,215,255,0.06)',
    display: 'flex', alignItems: 'center', position:'relative' as const,
  }
  const gridCols = `180px repeat(${COLS.length}, 1fr) 150px`

  function renderRow(apt: any, isLast: boolean) {
    const total   = rowTotal(apt.id)
    const paid    = rowPaid(apt.id)
    const rest    = total - paid
    const allPaid = total > 0 && rest === 0

    return (
      <div key={apt.id} className="ch-row" style={{
        display:'grid', gridTemplateColumns: gridCols,
        borderBottom: isLast ? 'none' : '1px solid rgba(159,215,255,0.06)',
      }}>
        {/* Apartament */}
        <div style={{ ...tdS, gap:7 }}>
          {apt.nota
            ? <span style={{ fontSize:11, fontWeight:500, color:'var(--accent-blue)', background:'rgba(77,163,255,0.12)', padding:'2px 7px', borderRadius:5, flexShrink:0 }}>{apt.nota}</span>
            : null}
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{apt.nume}</span>
        </div>

        {/* Celule */}
        {COLS.map(col => {
          const item   = rows[apt.id]?.[col.key]
          const isPaid = item?.status === 'validat'
          const isEdit = editing?.aptId === apt.id && editing?.col === col.key
          const val    = item ? Number(item.valoare) : 0
          return (
            <div key={col.key} className="ch-cell" style={{
              ...tdS,
              background: isPaid ? 'rgba(74,222,128,0.06)' : 'transparent',
              justifyContent:'space-between',
            }}>
              {isEdit ? (
                <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%' }}>
                  <input
                    ref={inputRef} type="number" value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter') commitEdit(); if(e.key==='Escape'){setEditing(null);setEditVal('')} }}
                    style={{ background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.4)', borderRadius:5, color:'#fff', fontSize:13, padding:'3px 7px', width:'100%', outline:'none' }}
                    min={0}
                  />
                  <button onClick={commitEdit} disabled={saving} style={{ background:'none',border:'none',cursor:'pointer',color:'#4ADE80',padding:2,display:'flex',flexShrink:0 }}><Check size={13}/></button>
                  <button onClick={() => {setEditing(null);setEditVal('')}} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',padding:2,display:'flex',flexShrink:0 }}><X size={13}/></button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize:13, fontWeight:val>0?500:400, color: isPaid?'#4ADE80': val>0?'var(--text)':'rgba(159,215,255,0.18)' }}>
                    {val > 0 ? val.toLocaleString('ro-RO') : '—'}
                  </span>
                  <div className="cell-actions" style={{ display:'flex', gap:2 }}>
                    <button title="Editează" onClick={() => startEdit(apt.id, col.key)}
                      style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',padding:'3px 4px',display:'flex',borderRadius:4 }}>
                      <Pencil size={11}/>
                    </button>
                    <button title={isPaid?'Neplătit':'Plătit'} onClick={() => togglePaid(apt.id, col.key)}
                      style={{ background:'none',border:'none',cursor:'pointer',color:isPaid?'#4ADE80':'rgba(159,215,255,0.25)',padding:'3px 4px',display:'flex',borderRadius:4 }}>
                      <Check size={11}/>
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* Total rând */}
        <div style={{ ...tdS, flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:1, borderRight:'none' }}>
          {total > 0 ? (<>
            <span style={{ fontSize:12, fontWeight:500, color: allPaid?'#4ADE80':'var(--text)' }}>{total.toLocaleString('ro-RO')} RON</span>
            {paid > 0 && rest > 0 && <span style={{ fontSize:10, color:'#F87171' }}>rest {rest.toLocaleString('ro-RO')}</span>}
            {allPaid && <span style={{ fontSize:10, color:'rgba(74,222,128,0.6)' }}>✓ achitat</span>}
          </>) : <span style={{ fontSize:12, color:'rgba(159,215,255,0.15)' }}>—</span>}
        </div>
      </div>
    )
  }

  function renderSection(list: any[], title: string) {
    if (!list.length) return null
    const secTotal = list.reduce((s,a) => s+rowTotal(a.id), 0)
    const secPaid  = list.reduce((s,a) => s+rowPaid(a.id), 0)
    const secRest  = secTotal - secPaid
    return (
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.4)', letterSpacing:'.08em', textTransform:'uppercase' }}>{title}</span>
          {secTotal > 0 && <>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{secTotal.toLocaleString('ro-RO')} RON</span>
            {secPaid > 0 && <><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#4ADE80' }}>{secPaid.toLocaleString('ro-RO')} plătit</span></>}
            {secRest > 0 && <><span style={{ fontSize:11, color:'rgba(159,215,255,0.2)' }}>·</span><span style={{ fontSize:11, color:'#F87171' }}>{secRest.toLocaleString('ro-RO')} rest</span></>}
          </>}
        </div>
        <div style={{ background:'rgba(214,228,244,0.03)', border:'1px solid rgba(159,215,255,0.09)', borderRadius:14, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns: gridCols, background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(159,215,255,0.09)' }}>
            <div style={thS}>Apartament</div>
            {COLS.map(c => (
              <div key={c.key} style={thS}>
                {c.label}<span style={{ fontSize:10, color:'rgba(159,215,255,0.25)', marginLeft:5 }}>/{c.due}</span>
              </div>
            ))}
            <div style={{ ...thS, borderRight:'none' }}>Total</div>
          </div>
          {/* Rows */}
          {list.map((apt, i) => renderRow(apt, i === list.length-1))}
          {/* Footer */}
          <div style={{ display:'grid', gridTemplateColumns: gridCols, borderTop:'1px solid rgba(159,215,255,0.09)', background:'rgba(11,18,32,0.3)' }}>
            <div style={{ ...thS, color:'rgba(159,215,255,0.25)', fontSize:10 }}>Total</div>
            {COLS.map(c => {
              const t = colTotal(c.key, list)
              return <div key={c.key} style={{ ...thS, color:t>0?'rgba(77,163,255,0.7)':'rgba(159,215,255,0.12)', fontWeight:500, fontSize:12 }}>
                {t > 0 ? t.toLocaleString('ro-RO') : '—'}
              </div>
            })}
            <div style={{ ...thS, borderRight:'none', color:'rgba(77,163,255,0.9)', fontSize:13, fontWeight:500 }}>
              {secTotal.toLocaleString('ro-RO')} RON
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Cheltuieli & Utilități"
        subtitle={`${lunaLabel} ${an}`}
        actions={
          <button onClick={seedDefaults} disabled={seeding || loading} style={{
            display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
            borderRadius:8, fontSize:12, fontWeight:500,
            border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)',
            color:'var(--accent-blue)', cursor:'pointer', opacity: seeding ? 0.6 : 1,
          }}>
            <Plus size={13}/>{seeding ? 'Se importă...' : 'Import valori fixe'}
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
      <div style={{ padding:'0 24px 32px', overflowX:'auto' }}>
        {loading
          ? <div style={{ color:'rgba(159,215,255,0.35)', fontSize:13, padding:'48px 0' }}>Se încarcă...</div>
          : <>
              {renderSection(abApts,    'AB Homes — apartamente proprii')}
              {renderSection(extraApts, 'Extra — alte locații')}
            </>
        }
      </div>
      <Toast toast={toast}/>
    </>
  )
}
