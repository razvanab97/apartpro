'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { FileText, Download, ChevronDown, ChevronUp } from 'lucide-react'

const LUNI = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

const PLATFORME = [
  { key: 'airbnb',   label: 'Airbnb',   comPct: 0.15, hasPaymentFee: false },
  { key: 'booking',  label: 'Booking',  comPct: 0.17, hasPaymentFee: true  },
  { key: 'direct',   label: 'Direct',   comPct: 0,    hasPaymentFee: false },
  { key: 'whatsapp', label: 'WhatsApp', comPct: 0,    hasPaymentFee: false },
  { key: 'telefon',  label: 'Telefon',  comPct: 0,    hasPaymentFee: false },
]

function calcComision(brut: number, canal: string) {
  const p = PLATFORME.find(x => x.key === canal) || { comPct: 0, hasPaymentFee: false }
  const com = brut * p.comPct
  const tva = com * 0.21
  return { com, tva, total: com + tva }
}

function fmt(n: number) {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CanalBadge({ canal }: { canal: string }) {
  const s: Record<string, React.CSSProperties> = {
    booking: { background: 'rgba(77,163,255,0.14)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.2)' },
    airbnb:  { background: 'rgba(239,68,68,0.14)',  color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' },
    direct:  { background: 'rgba(34,197,94,0.14)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)' },
  }
  const l: Record<string,string> = { booking:'Booking', airbnb:'Airbnb', direct:'Direct', whatsapp:'Direct', telefon:'Direct', site:'Direct' }
  return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:600, fontFamily:'monospace', ...(s[canal] || s.direct) }}>{l[canal] || canal}</span>
}

function RezervareRow({ r, tipRaport, comisionAB }: { r: any; tipRaport: 'cu_comision'|'fara_comision'; comisionAB: number }) {
  const [open, setOpen] = useState(false)
  const brut = Number(r.suma_incasata || 0)
  const { com, tva, total: totalPlatforma } = calcComision(brut, r.canal)
  const netDupaPlatforme = brut - totalPlatforma
  const comisionABVal = tipRaport === 'cu_comision' ? netDupaPlatforme * (comisionAB / 100) : 0
  const netFinal = netDupaPlatforme - comisionABVal

  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor:'pointer', background: open ? 'rgba(77,163,255,0.05)' : 'transparent' }}>
        <td style={{ padding:'9px 12px', fontSize:12, fontWeight:500, color:'#FFFFFF', whiteSpace:'nowrap' }}>{r.nume_client}</td>
        <td style={{ padding:'9px 12px', fontSize:11, color:'rgba(159,215,255,0.55)', fontFamily:'monospace', whiteSpace:'nowrap' }}>{r.data_checkin} → {r.data_checkout}</td>
        <td style={{ padding:'9px 12px', textAlign:'center', fontSize:11, color:'rgba(214,228,244,0.6)' }}>{r.nr_nopti}</td>
        <td style={{ padding:'9px 12px' }}><CanalBadge canal={r.canal}/></td>
        {r.apartament && <td style={{ padding:'9px 12px', fontSize:11, color:'rgba(159,215,255,0.5)' }}>{r.apartament.nota ? `[${r.apartament.nota}]` : r.apartament.nume}</td>}
        <td style={{ padding:'9px 12px', fontFamily:'monospace', fontWeight:600, color:'#FFFFFF', textAlign:'right' }}>{fmt(brut)}</td>
        <td style={{ padding:'9px 12px', fontFamily:'monospace', color:'#F87171', textAlign:'right' }}>{totalPlatforma > 0 ? `-${fmt(totalPlatforma)}` : '—'}</td>
        <td style={{ padding:'9px 12px', fontFamily:'monospace', color:'#FCD34D', textAlign:'right' }}>{fmt(netDupaPlatforme)}</td>
        {tipRaport === 'cu_comision' && <td style={{ padding:'9px 12px', fontFamily:'monospace', color:'#F87171', textAlign:'right' }}>-{fmt(comisionABVal)}</td>}
        <td style={{ padding:'9px 12px', fontFamily:'monospace', fontWeight:700, color:'#4ADE80', textAlign:'right' }}>{fmt(netFinal)}</td>
        <td style={{ padding:'9px 12px', textAlign:'center', color:'rgba(159,215,255,0.3)' }}>{open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={tipRaport === 'cu_comision' ? 11 : 10} style={{ padding:'0 12px 10px 36px', background:'rgba(77,163,255,0.03)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, paddingTop:8 }}>
              {[
                { l:'Brut', v:fmt(brut)+' RON', c:'#FFFFFF' },
                { l:'Com. platformă', v:com>0?`-${fmt(com)} RON`:'N/A', c:'#F87171' },
                { l:'TVA 21%', v:tva>0?`-${fmt(tva)} RON`:'N/A', c:'#F87171' },
                { l:'Net platforme', v:fmt(netDupaPlatforme)+' RON', c:'#FCD34D' },
                ...(tipRaport==='cu_comision' ? [{ l:`Com. AB ${comisionAB}%`, v:`-${fmt(comisionABVal)} RON`, c:'#F87171' }] : []),
                { l:'Net final', v:fmt(netFinal)+' RON', c:'#4ADE80' },
              ].map(i => (
                <div key={i.l} style={{ background:'rgba(14,27,43,0.5)', borderRadius:7, padding:'6px 10px' }}>
                  <div style={{ fontSize:9, color:'rgba(159,215,255,0.4)', marginBottom:2 }}>{i.l}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:i.c, fontFamily:'monospace' }}>{i.v}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function RapoartePage() {
  const [apartamente, setApartamente] = useState<any[]>([])
  const [selectedApt, setSelectedApt] = useState('')
  const [lunaStart, setLunaStart] = useState(new Date().getMonth() + 1)
  const [anStart, setAnStart] = useState(new Date().getFullYear())
  const [lunaEnd, setLunaEnd] = useState(new Date().getMonth() + 1)
  const [anEnd, setAnEnd] = useState(new Date().getFullYear())
  const [selectedPlatforme, setSelectedPlatforme] = useState<string[]>(['airbnb','booking','direct','whatsapp','telefon'])
  const [tipRaport, setTipRaport] = useState<'cu_comision'|'fara_comision'>('cu_comision')
  const [comisionAB, setComisionAB] = useState(20)
  const [rezervari, setRezervari] = useState<any[]>([])
  const [generated, setGenerated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota,comision_procent').order('nota').then(({ data }) => setApartamente(data || []))
  }, [])

  function togglePlatforma(key: string) {
    setSelectedPlatforme(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  async function genereaza() {
    setLoading(true)
    const primaZi = new Date(anStart, lunaStart - 1, 1)
    const ultimaZi = new Date(anEnd, lunaEnd, 0)
    const start = primaZi.toISOString().split('T')[0]
    const end = ultimaZi.toISOString().split('T')[0]

    let q = supabase.from('rezervari')
      .select('*, apartament:apartamente(id,nume,nota)')
      .gte('data_checkin', start).lte('data_checkin', end)
      .in('status_rezervare', ['confirmata', 'finalizata'])
      .in('canal', selectedPlatforme)
      .order('data_checkin')

    if (selectedApt) q = q.eq('apartament_id', selectedApt)

    const { data } = await q
    setRezervari(data || [])
    setGenerated(true)
    setLoading(false)
  }

  const totals = rezervari.reduce((acc, r) => {
    const brut = Number(r.suma_incasata || 0)
    const { com, tva, total } = calcComision(brut, r.canal)
    const net = brut - total
    const comAB = tipRaport === 'cu_comision' ? net * (comisionAB / 100) : 0
    acc.brut += brut
    acc.com += com
    acc.tva += tva
    acc.platforma += total
    acc.netPlatforme += net
    acc.comisionAB += comAB
    acc.netFinal += net - comAB
    return acc
  }, { brut:0, com:0, tva:0, platforma:0, netPlatforme:0, comisionAB:0, netFinal:0 })

  const aptNume = selectedApt ? (apartamente.find(a => a.id === selectedApt)?.nota ? `[${apartamente.find(a => a.id === selectedApt)?.nota}] ${apartamente.find(a => a.id === selectedApt)?.nume}` : apartamente.find(a => a.id === selectedApt)?.nume) : 'Toate locațiile'

  async function exportPDF() {
    if (!generated || rezervari.length === 0) return
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = 297
      doc.setFillColor(11, 18, 32); doc.rect(0, 0, pageW, 30, 'F')
      doc.setTextColor(77, 163, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text('RAPORT ' + (tipRaport === 'cu_comision' ? 'CU COMISION ADMINISTRARE' : 'FARA COMISION ADMINISTRARE'), 14, 12)
      doc.setTextColor(214, 228, 244); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text(`${aptNume} | ${LUNI[lunaStart-1]} ${anStart}${lunaStart!==lunaEnd||anStart!==anEnd?' → '+LUNI[lunaEnd-1]+' '+anEnd:''} | Platforme: ${selectedPlatforme.join(', ')}`, 14, 22)

      const cols = tipRaport === 'cu_comision'
        ? ['Client','Perioadă','N','Canal','Apt','Brut','Com.Platf','Net Platf',`Com.AB ${comisionAB}%`,'Net Final']
        : ['Client','Perioadă','N','Canal','Apt','Brut','Com.Platf','Net Platf','Net Final']

      const rows = rezervari.map(r => {
        const brut = Number(r.suma_incasata||0)
        const { total } = calcComision(brut, r.canal)
        const net = brut - total
        const comAB = tipRaport === 'cu_comision' ? net*(comisionAB/100) : 0
        const row = [r.nume_client, `${r.data_checkin}→${r.data_checkout}`, String(r.nr_nopti||0), r.canal?.toUpperCase(), r.apartament?.nota||'—', `${fmt(brut)}`, total>0?`-${fmt(total)}`:'—', `${fmt(net)}`]
        if (tipRaport === 'cu_comision') row.push(`-${fmt(comAB)}`)
        row.push(`${fmt(net-comAB)}`)
        return row
      })

      const totalRow = ['TOTAL','','','','', fmt(totals.brut), `-${fmt(totals.platforma)}`, fmt(totals.netPlatforme)]
      if (tipRaport === 'cu_comision') totalRow.push(`-${fmt(totals.comisionAB)}`)
      totalRow.push(fmt(totals.netFinal))
      rows.push(totalRow)

      autoTable(doc, {
        startY: 35, head: [cols], body: rows,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [14,27,43], textColor: [159,215,255], fontStyle:'bold' },
        alternateRowStyles: { fillColor: [20,35,55] },
        bodyStyles: { textColor: [214,228,244] },
        didParseCell: (data: any) => {
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fillColor = [14,27,43]
            data.cell.styles.textColor = [77,255,163]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      })
      const period = `${anStart}_${String(lunaStart).padStart(2,'0')}${lunaStart!==lunaEnd||anStart!==anEnd?'-'+anEnd+'_'+String(lunaEnd).padStart(2,'0'):''}`
      doc.save(`Raport_${tipRaport}_${aptNume.replace(/[\[\] ]/g,'_')}_${period}.pdf`)
      show('success','PDF exportat!')
    } catch { show('error','Eroare export') }
    setExporting(false)
  }

  const panel: React.CSSProperties = { background:'rgba(214,228,244,0.06)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:14 }
  const showAptCol = !selectedApt

  return (
    <>
      <PageHeader title="Rapoarte" subtitle="Calcul comisioane și situație financiară"/>
      <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:12, overflowY:'auto', flex:1 }}>

        {/* TIP RAPORT */}
        <div style={{ display:'flex', gap:8 }}>
          {[
            { key:'cu_comision', label:'Cu comision administrare', desc:'Include deducerea comisionului AB Homes', color:'#4DA3FF' },
            { key:'fara_comision', label:'Fără comision administrare', desc:'Doar platforme + TVA, net proprietar brut', color:'#4ADE80' },
          ].map(t => (
            <button key={t.key} onClick={() => setTipRaport(t.key as any)} style={{
              flex:1, padding:'12px 16px', borderRadius:12, cursor:'pointer', textAlign:'left',
              background: tipRaport===t.key ? `rgba(${t.color==='#4DA3FF'?'77,163,255':'34,197,94'},0.12)` : 'rgba(214,228,244,0.04)',
              border: `1.5px solid ${tipRaport===t.key ? t.color+'50' : 'rgba(159,215,255,0.1)'}`,
              outline: 'none',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: tipRaport===t.key ? t.color : 'rgba(159,215,255,0.2)' }}/>
                <span style={{ fontSize:13, fontWeight:600, color: tipRaport===t.key ? '#FFFFFF' : 'rgba(159,215,255,0.5)' }}>{t.label}</span>
              </div>
              <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)', paddingLeft:18 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* FILTERS */}
        <div style={{ ...panel, padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:10, alignItems:'end' }}>
            <div>
              <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>Apartament</label>
              <select value={selectedApt} onChange={e => { setSelectedApt(e.target.value); const a = apartamente.find(x => x.id===e.target.value); if (a?.comision_procent) setComisionAB(a.comision_procent) }}>
                <option value="">🏢 Toate locațiile</option>
                <option disabled>──────────</option>
                {apartamente.map(a => <option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>De la</label>
              <div style={{ display:'flex', gap:4 }}>
                <select value={lunaStart} onChange={e=>setLunaStart(Number(e.target.value))} style={{ flex:2 }}>
                  {LUNI.map((l,i)=><option key={i} value={i+1}>{l}</option>)}
                </select>
                <select value={anStart} onChange={e=>setAnStart(Number(e.target.value))} style={{ flex:1 }}>
                  {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>Până la</label>
              <div style={{ display:'flex', gap:4 }}>
                <select value={lunaEnd} onChange={e=>setLunaEnd(Number(e.target.value))} style={{ flex:2 }}>
                  {LUNI.map((l,i)=><option key={i} value={i+1}>{l}</option>)}
                </select>
                <select value={anEnd} onChange={e=>setAnEnd(Number(e.target.value))} style={{ flex:1 }}>
                  {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            {tipRaport === 'cu_comision' && (
              <div>
                <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>Com. AB (%)</label>
                <input type="number" value={comisionAB} onChange={e=>setComisionAB(Number(e.target.value))} min={0} max={100} style={{ textAlign:'center' }}/>
              </div>
            )}
            <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
              <Button variant="primary" onClick={genereaza} loading={loading} icon={<FileText size={13}/>}>Generează</Button>
              {generated && rezervari.length > 0 && <Button variant="secondary" onClick={exportPDF} loading={exporting} icon={<Download size={13}/>}>PDF</Button>}
            </div>
          </div>

          {/* Platforme selector */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>Platforme:</span>
            {PLATFORME.map(p => (
              <button key={p.key} onClick={() => togglePlatforma(p.key)} style={{
                fontSize:11, padding:'4px 12px', borderRadius:20, cursor:'pointer',
                background: selectedPlatforme.includes(p.key) ? (p.key==='airbnb'?'rgba(239,68,68,0.2)':p.key==='booking'?'rgba(77,163,255,0.2)':'rgba(34,197,94,0.15)') : 'rgba(159,215,255,0.06)',
                border: `1px solid ${selectedPlatforme.includes(p.key) ? (p.key==='airbnb'?'rgba(239,68,68,0.4)':p.key==='booking'?'rgba(77,163,255,0.4)':'rgba(34,197,94,0.3)') : 'rgba(159,215,255,0.1)'}`,
                color: selectedPlatforme.includes(p.key) ? '#FFFFFF' : 'rgba(159,215,255,0.4)',
                fontWeight: selectedPlatforme.includes(p.key) ? 600 : 400,
                transition:'all 0.12s',
              }}>{p.label}</button>
            ))}
            <button onClick={() => setSelectedPlatforme(PLATFORME.map(p=>p.key))} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'transparent', border:'1px solid rgba(159,215,255,0.1)', color:'rgba(159,215,255,0.4)', cursor:'pointer' }}>Toate</button>
            <button onClick={() => setSelectedPlatforme([])} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'transparent', border:'1px solid rgba(159,215,255,0.1)', color:'rgba(159,215,255,0.4)', cursor:'pointer' }}>Niciunul</button>
          </div>
        </div>

        {/* TOTALS */}
        {generated && (
          <div style={{ display:'grid', gridTemplateColumns: tipRaport==='cu_comision' ? 'repeat(5,1fr)' : 'repeat(4,1fr)', gap:8 }}>
            {[
              { label:'Total brut', value:fmt(totals.brut), color:'#FFFFFF', sub:`${rezervari.length} rez.` },
              { label:'Com. platforme + TVA', value:`-${fmt(totals.platforma)}`, color:'#F87171', sub:'Airbnb 15% / Booking 17% + TVA 21%' },
              { label:'Net după platforme', value:fmt(totals.netPlatforme), color:'#FCD34D', sub:'baza de calcul' },
              ...(tipRaport==='cu_comision' ? [{ label:`Com. AB Homes ${comisionAB}%`, value:`-${fmt(totals.comisionAB)}`, color:'#F87171', sub:'din net platforme' }] : []),
              { label: tipRaport==='cu_comision' ? '✓ Net proprietar' : '✓ Net final', value:fmt(totals.netFinal), color:'#4ADE80', sub:'de plătit' },
            ].map(s => (
              <div key={s.label} style={{ ...panel, padding:'12px 14px' }}>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.45)', marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:18, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.3)', marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* TABLE */}
        {generated && (
          <div style={{ ...panel, overflow:'hidden' }}>
            {rezervari.length === 0 ? (
              <div style={{ padding:'40px', textAlign:'center', color:'rgba(159,215,255,0.4)', fontSize:13 }}>Nicio rezervare pentru filtrele selectate</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead style={{ background:'rgba(14,27,43,0.6)' }}>
                    <tr>
                      {['Client','Perioadă','N','Canal', ...(showAptCol?['Apt']:[]), 'Brut','Com.Platf','Net Platf', ...(tipRaport==='cu_comision'?[`Com.AB ${comisionAB}%`]:[]), 'Net Final',''].map(h=>(
                        <th key={h} style={{ padding:'8px 12px', textAlign: ['Brut','Com.Platf','Net Platf',`Com.AB ${comisionAB}%`,'Net Final'].includes(h)?'right':'left', fontSize:10, fontWeight:600, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid rgba(159,215,255,0.1)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rezervari.map((r,i) => <RezervareRow key={r.id||i} r={r} tipRaport={tipRaport} comisionAB={comisionAB}/>)}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'rgba(14,27,43,0.5)' }}>
                      <td colSpan={showAptCol?4:3} style={{ padding:'10px 12px', fontSize:12, fontWeight:600, color:'rgba(159,215,255,0.6)' }}>TOTAL — {rezervari.length} rezervări</td>
                      <td/>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#FFFFFF', textAlign:'right' }}>{fmt(totals.brut)}</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#F87171', textAlign:'right' }}>-{fmt(totals.platforma)}</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#FCD34D', textAlign:'right' }}>{fmt(totals.netPlatforme)}</td>
                      {tipRaport==='cu_comision' && <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#F87171', textAlign:'right' }}>-{fmt(totals.comisionAB)}</td>}
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#4ADE80', textAlign:'right', fontSize:15 }}>{fmt(totals.netFinal)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
