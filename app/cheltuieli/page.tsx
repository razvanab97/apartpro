'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Check, Pencil, Plus, X } from 'lucide-react'

const COLS = [
  { key: 'chirie',     label: 'Chirie',       due: 1  },
  { key: 'asociatie',  label: 'Asociație',    due: 15 },
  { key: 'eon_curent', label: 'E.ON Curent',  due: 20 },
  { key: 'eon_gaz',    label: 'E.ON Gaz',     due: 20 },
  { key: 'internet',   label: 'Internet',     due: 10 },
  { key: 'salubris',   label: 'Salubris',     due: 5  },
]

const AB_CODES = ['L99','EX59','GS08','HD02','L83','N32','NT9','L94','L88','CG40','C64','N33','VM07']

const cell: React.CSSProperties = {
  padding: '0 14px',
  height: 44,
  borderRight: '1px solid rgba(159,215,255,0.07)',
  display: 'flex',
  alignItems: 'center',
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(77,163,255,0.08)',
  border: '1px solid rgba(77,163,255,0.35)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 13,
  padding: '4px 8px',
  width: '100%',
  outline: 'none',
}

export default function CheltuieliPage() {
  const now = new Date()
  const [luna]  = useState(now.getMonth() + 1)
  const [an]    = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [apts, setApts]       = useState<any[]>([])
  const [rows, setRows]       = useState<Record<string, Record<string, any>>>({})
  const [editing, setEditing] = useState<{aptId:string; col:string} | null>(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function load() {
    setLoading(true)
    const pad = (n:number) => String(n).padStart(2,'0')
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
    const pad = (n:number) => String(n).padStart(2,'0')
    const existing = rows[aptId]?.[col]
    const colDef = COLS.find(c => c.key === col)!
    const dateStr = `${an}-${pad(luna)}-${pad(colDef.due)}`

    if (existing) {
      const { error } = await supabase.from('cheltuieli')
        .update({ valoare: val, data: dateStr })
        .eq('id', existing.id)
      if (error) { show('error', error.message); setSaving(false); return }
      setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...existing, valoare: val } } }))
    } else {
      const apt = apts.find(a => a.id === aptId)
      const { data, error } = await supabase.from('cheltuieli').insert({
        apartament_id: aptId,
        categorie: col,
        descriere: colDef.label,
        valoare: val,
        data: dateStr,
        status: 'nevalidat',
        suportat_de: 'proprietar',
        tva: 0,
      }).select().single()
      if (error) { show('error', error.message); setSaving(false); return }
      setRows(r => ({ ...r, [aptId]: { ...(r[aptId]||{}), [col]: data } }))
    }
    setSaving(false)
    setEditing(null)
    setEditVal('')
  }

  async function togglePaid(aptId: string, col: string) {
    const item = rows[aptId]?.[col]
    if (!item) { show('error', 'Introdu mai întâi valoarea'); return }
    const newStatus = item.status === 'validat' ? 'nevalidat' : 'validat'
    await supabase.from('cheltuieli').update({ status: newStatus }).eq('id', item.id)
    setRows(r => ({ ...r, [aptId]: { ...r[aptId], [col]: { ...item, status: newStatus } } }))
  }

  function colTotal(col: string) {
    return apts.reduce((s, a) => s + Number(rows[a.id]?.[col]?.valoare || 0), 0)
  }

  function rowTotal(aptId: string) {
    return COLS.reduce((s, c) => s + Number(rows[aptId]?.[c.key]?.valoare || 0), 0)
  }

  function rowPaid(aptId: string) {
    return COLS.reduce((s, c) => {
      const item = rows[aptId]?.[c.key]
      return s + (item?.status === 'validat' ? Number(item.valoare) : 0)
    }, 0)
  }

  const lunaLabel = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'][luna]

  const abApts  = apts.filter(a => AB_CODES.includes(a.nota))
  const altApts = apts.filter(a => !AB_CODES.includes(a.nota))

  const thStyle: React.CSSProperties = {
    padding: '0 14px',
    height: 40,
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(159,215,255,0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '.06em',
    borderRight: '1px solid rgba(159,215,255,0.07)',
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  }

  function renderRow(apt: any, isLast: boolean) {
    const total = rowTotal(apt.id)
    const paid  = rowPaid(apt.id)
    const rest  = total - paid
    const allPaid = total > 0 && rest === 0

    return (
      <div key={apt.id} style={{
        display: 'grid',
        gridTemplateColumns: `200px repeat(${COLS.length}, 1fr) 160px`,
        borderBottom: isLast ? 'none' : '1px solid rgba(159,215,255,0.07)',
        transition: 'background .15s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(77,163,255,0.04)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        {/* Nume apartament */}
        <div style={{ ...cell, gap: 8, borderRight: '1px solid rgba(159,215,255,0.07)' }}>
          {apt.nota
            ? <span style={{ fontSize:11, fontWeight:500, color:'var(--accent-blue)', background:'rgba(77,163,255,0.12)', padding:'2px 7px', borderRadius:5 }}>{apt.nota}</span>
            : null
          }
          <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{apt.nume}</span>
        </div>

        {/* Coloane utilități */}
        {COLS.map(col => {
          const item  = rows[apt.id]?.[col.key]
          const isPaid = item?.status === 'validat'
          const isEdit = editing?.aptId === apt.id && editing?.col === col.key
          const val   = item ? Number(item.valoare) : 0

          return (
            <div key={col.key} style={{
              ...cell,
              position: 'relative',
              justifyContent: 'space-between',
              background: isPaid ? 'rgba(74,222,128,0.05)' : 'transparent',
            }}>
              {isEdit ? (
                <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%' }}>
                  <input
                    ref={inputRef}
                    type="number"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter') commitEdit(); if(e.key==='Escape'){setEditing(null);setEditVal('')} }}
                    style={inputStyle}
                    min={0}
                  />
                  <button onClick={commitEdit} disabled={saving}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#4ADE80', padding:2, display:'flex' }}>
                    <Check size={14}/>
                  </button>
                  <button onClick={() => { setEditing(null); setEditVal('') }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(159,215,255,0.4)', padding:2, display:'flex' }}>
                    <X size={14}/>
                  </button>
                </div>
              ) : (
                <>
                  <span style={{
                    fontSize: 13,
                    fontWeight: val > 0 ? 500 : 400,
                    color: isPaid ? '#4ADE80' : val > 0 ? 'var(--text)' : 'rgba(159,215,255,0.2)',
                  }}>
                    {val > 0 ? val.toLocaleString('ro-RO') : '—'}
                  </span>
                  <div style={{ display:'flex', gap:3, opacity:0 }} className="row-actions">
                    <button onClick={() => startEdit(apt.id, col.key)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(159,215,255,0.5)', padding:'2px 3px', display:'flex', borderRadius:4 }}>
                      <Pencil size={11}/>
                    </button>
                    {val > 0 && (
                      <button onClick={() => togglePaid(apt.id, col.key)}
                        style={{ background:'none', border:'none', cursor:'pointer', color: isPaid ? '#4ADE80' : 'rgba(159,215,255,0.4)', padding:'2px 3px', display:'flex', borderRadius:4 }}>
                        <Check size={11}/>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* Sumar rând */}
        <div style={{ ...cell, flexDirection:'column', alignItems:'flex-end', justifyContent:'center', gap:1, borderRight:'none' }}>
          {total > 0 ? (
            <>
              <span style={{ fontSize:12, fontWeight:500, color: allPaid ? '#4ADE80' : 'var(--text)' }}>
                {total.toLocaleString('ro-RO')} RON
              </span>
              {paid > 0 && rest > 0 && (
                <span style={{ fontSize:10, color:'#F87171' }}>rest {rest.toLocaleString('ro-RO')} RON</span>
              )}
              {allPaid && (
                <span style={{ fontSize:10, color:'#4ADE80' }}>✓ achitat</span>
              )}
            </>
          ) : (
            <span style={{ fontSize:12, color:'rgba(159,215,255,0.15)' }}>—</span>
          )}
        </div>
      </div>
    )
  }

  function renderSection(list: any[], title: string) {
    if (!list.length) return null
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.4)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8, paddingLeft:4 }}>
          {title}
        </div>
        <div style={{ background:'rgba(214,228,244,0.04)', border:'1px solid rgba(159,215,255,0.1)', borderRadius:14, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:`200px repeat(${COLS.length}, 1fr) 160px`, background:'rgba(11,18,32,0.6)', borderBottom:'1px solid rgba(159,215,255,0.1)' }}>
            <div style={{ ...thStyle }}>Apartament</div>
            {COLS.map(c => <div key={c.key} style={{ ...thStyle }}>{c.label}<span style={{ fontSize:10, color:'rgba(159,215,255,0.3)', marginLeft:4 }}>/{c.due}</span></div>)}
            <div style={{ ...thStyle, borderRight:'none' }}>Total</div>
          </div>
          {/* Rows */}
          {list.map((apt, i) => renderRow(apt, i === list.length - 1))}
          {/* Footer totals */}
          <div style={{ display:'grid', gridTemplateColumns:`200px repeat(${COLS.length}, 1fr) 160px`, borderTop:'1px solid rgba(159,215,255,0.1)', background:'rgba(11,18,32,0.4)' }}>
            <div style={{ ...thStyle, color:'rgba(159,215,255,0.3)' }}>Total coloană</div>
            {COLS.map(c => {
              const t = colTotal(c.key)
              return <div key={c.key} style={{ ...thStyle, color: t > 0 ? 'rgba(77,163,255,0.8)' : 'rgba(159,215,255,0.15)', fontWeight:500, fontSize:12 }}>
                {t > 0 ? t.toLocaleString('ro-RO') : '—'}
              </div>
            })}
            <div style={{ ...thStyle, borderRight:'none', color:'rgba(77,163,255,0.9)', fontSize:13 }}>
              {list.reduce((s,a)=>s+rowTotal(a.id),0).toLocaleString('ro-RO')} RON
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Cheltuieli & Utilități" subtitle={`${lunaLabel} ${an}`} actions={null}/>
      <style>{`
        .row-actions { opacity: 0; transition: opacity .15s; }
        div:hover > .row-actions { opacity: 1 !important; }
        [style*="grid"] div:hover .row-actions { opacity: 1; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>
      <div style={{ padding:'0 24px 24px', overflowX:'auto' }}>
        {loading ? (
          <div style={{ color:'rgba(159,215,255,0.4)', fontSize:13, padding:'40px 0' }}>Se încarcă...</div>
        ) : (
          <>
            {renderSection(abApts, 'AB Homes — apartamente proprii')}
            {renderSection(altApts, 'Alte apartamente')}
          </>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
