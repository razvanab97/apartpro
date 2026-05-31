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

// Calculate pro-rated amount for the selected period
function calcProRata(r: any, periodStart: string, periodEnd: string): number {
  const checkin = r.data_checkin
  const checkout = r.data_checkout
  const brut = Number(r.suma_incasata || 0)
  const nopti = Number(r.nr_nopti || 1)
  if (nopti === 0) return brut

  // Overlap between reservation and period
  const overlapStart = checkin > periodStart ? checkin : periodStart
  const overlapEnd = checkout < periodEnd ? checkout : periodEnd

  const overlapDays = Math.ceil(
    (new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / 86400000
  )

  if (overlapDays <= 0) return 0
  if (overlapDays >= nopti) return brut // fully within period

  // Pro-rata
  return Math.round((brut / nopti * overlapDays) * 100) / 100
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

function RezervareRow({ r, tipRaport, comisionAB, periodStart, periodEnd }: { r: any; tipRaport: 'cu_comision'|'fara_comision'; comisionAB: number; periodStart: string; periodEnd: string }) {
  const [open, setOpen] = useState(false)
  const brutTotal = Number(r.suma_incasata || 0)
  const nopti = Number(r.nr_nopti || 1)
  const brut = periodStart && periodEnd ? calcProRata(r, periodStart, periodEnd) : brutTotal
  const isProRata = brut !== brutTotal && brutTotal > 0
  const proRataPct = brutTotal > 0 ? Math.round(brut/brutTotal*100) : 100
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
        <td style={{ padding:'9px 12px', fontFamily:'monospace', fontWeight:600, color:'#FFFFFF', textAlign:'right' }}>
          {fmt(brut)}
          {isProRata && <span title={`${proRataPct}% din ${fmt(brutTotal)} RON total`} style={{ display:'block', fontSize:9, color:'rgba(245,158,11,0.7)', fontFamily:'sans-serif' }}>{proRataPct}% pro-rată</span>}
        </td>
        <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:11, color:'rgba(159,215,255,0.55)', textAlign:'right' }}>
          {nopti > 0 ? fmt(Math.round(brutTotal / nopti * 100)/100) : '—'}
        </td>
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
  const [selectedApts, setSelectedApts] = useState<string[]>([])
  const [modSelectie, setModSelectie] = useState<'luna'|'zile'>('luna')
  const [dataStart, setDataStart] = useState('')
  const [dataEnd, setDataEnd] = useState('')
  const [lunaStart, setLunaStart] = useState(new Date().getMonth() + 1)
  const [anStart, setAnStart] = useState(new Date().getFullYear())
  const [lunaEnd, setLunaEnd] = useState(new Date().getMonth() + 1)
  const [anEnd, setAnEnd] = useState(new Date().getFullYear())
  const [selectedPlatforme, setSelectedPlatforme] = useState<string[]>(['airbnb','booking','direct','whatsapp','telefon'])
  const [tipRaport, setTipRaport] = useState<'cu_comision'|'fara_comision'>('cu_comision')
  const [comisionAB, setComisionAB] = useState(20)
  const [rezervari, setRezervari] = useState<any[]>([])
  const [generated, setGenerated] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'rezervari'|'fiscal'>('rezervari')
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota,comision_procent').order('nota').then(({ data }) => setApartamente(data || []))
  }, [])

  function togglePlatforma(key: string) {
    setSelectedPlatforme(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  async function genereaza() {
    setLoading(true)
    const primaZi = modSelectie === 'zile' && dataStart ? new Date(dataStart+'T00:00:00') : new Date(anStart, lunaStart - 1, 1)
    const ultimaZi = modSelectie === 'zile' && dataEnd ? new Date(dataEnd+'T23:59:59') : new Date(anEnd, lunaEnd, 0)
    const start = primaZi.toISOString().split('T')[0]
    const end = ultimaZi.toISOString().split('T')[0]

    // Fetch all reservations that OVERLAP with the period (not just checkin in period)
    let q = supabase.from('rezervari')
      .select('*, apartament:apartamente(id,nume,nota)')
      .lte('data_checkin', end)    // checkin before period end
      .gt('data_checkout', start)   // checkout after period start
      .in('status_rezervare', ['confirmata', 'finalizata'])
      .in('canal', selectedPlatforme)
      .order('data_checkin')

    if (selectedApts.length > 0) q = q.in('apartament_id', selectedApts)

    const { data } = await q
    setRezervari(data || [])
    setPeriodStart(start)
    setPeriodEnd(end)
    setGenerated(true)
    setLoading(false)
  }

  const totals = rezervari.reduce((acc, r) => {
    // Use pro-rata for reservations that span across period boundary
    const brut = periodStart && periodEnd ? calcProRata(r, periodStart, periodEnd) : Number(r.suma_incasata || 0)
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
    acc.totalNopti += Number(r.nr_nopti || 0)
    return acc
  }, { brut:0, com:0, tva:0, platforma:0, netPlatforme:0, comisionAB:0, netFinal:0, totalNopti:0 })

  const aptNume = selectedApts.length === 0 ? 'Toate locațiile' : selectedApts.length === 1 ? (apartamente.find(a=>a.id===selectedApts[0])?.nota ? `[${apartamente.find(a=>a.id===selectedApts[0])?.nota}] ${apartamente.find(a=>a.id===selectedApts[0])?.nume}` : apartamente.find(a=>a.id===selectedApts[0])?.nume || '?') : `${selectedApts.length} locații`

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
        styles: { fontSize: 7, cellPadding: 2, textColor: [30,30,30], fillColor: [255,255,255] },
        headStyles: { fillColor: [14,27,43], textColor: [159,215,255], fontStyle:'bold' },
        alternateRowStyles: { fillColor: [245,248,255] },
        bodyStyles: { textColor: [30,30,30], fillColor: [255,255,255] },
        didParseCell: (data: any) => {
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fillColor = [0,80,40]
            data.cell.styles.textColor = [200,255,200]
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
  const showAptCol = selectedApts.length !== 1

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <PageHeader title="Rapoarte" subtitle="Calcul comisioane și situație financiară"/>
      <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:12, paddingBottom:60 }}>

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
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:10, alignItems:'end' }}>
            <div style={{ gridColumn:'1 / -1' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>Locații ({selectedApts.length === 0 ? 'toate' : selectedApts.length + ' selectate'})</label>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setSelectedApts([])} style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.2)', color:'#7BC8FF', cursor:'pointer' }}>Toate</button>
                  <button onClick={() => setSelectedApts(apartamente.map(a=>a.id))} style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:'transparent', border:'1px solid rgba(159,215,255,0.12)', color:'rgba(159,215,255,0.4)', cursor:'pointer' }}>Selectează toate</button>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {apartamente.map(a => (
                  <button key={a.id} onClick={() => setSelectedApts(prev => prev.includes(a.id) ? prev.filter(x=>x!==a.id) : [...prev, a.id])} style={{
                    fontSize:11, padding:'4px 10px', borderRadius:7, cursor:'pointer',
                    background: selectedApts.includes(a.id) ? 'rgba(77,163,255,0.18)' : 'rgba(214,228,244,0.05)',
                    border: `1px solid ${selectedApts.includes(a.id) ? 'rgba(77,163,255,0.4)' : 'rgba(159,215,255,0.1)'}`,
                    color: selectedApts.includes(a.id) ? '#FFFFFF' : 'rgba(159,215,255,0.45)',
                    fontWeight: selectedApts.includes(a.id) ? 600 : 400,
                    transition:'all 0.12s',
                  }}>
                    {a.nota ? <><span style={{fontSize:9,color:selectedApts.includes(a.id)?'#7BC8FF':'rgba(159,215,255,0.3)',fontFamily:'monospace',marginRight:4}}>{a.nota}</span></> : null}{a.nume}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                {([['luna','📅 Pe lună'],['zile','🗓 Interval exact']] as [string,string][]).map(([k,l])=>(
                  <button key={k} onClick={()=>setModSelectie(k as any)}
                    style={{ padding:'5px 14px', borderRadius:7, border:`1px solid ${modSelectie===k?'rgba(77,163,255,0.4)':'rgba(159,215,255,0.12)'}`, background:modSelectie===k?'rgba(77,163,255,0.12)':'transparent', color:modSelectie===k?'#7BC8FF':'rgba(159,215,255,0.45)', fontSize:12, fontWeight:modSelectie===k?600:400, cursor:'pointer', transition:'all .15s' }}>
                    {l}
                  </button>
                ))}
              </div>
              {modSelectie==='luna'&&(
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
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
                </div>
              )}
              {modSelectie==='zile'&&(
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>De la</label>
                    <input type="date" value={dataStart} onChange={e=>setDataStart(e.target.value)}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid rgba(100,160,255,0.2)', background:'rgba(20,38,65,0.8)', color:'rgba(214,228,244,0.9)', fontSize:13, outline:'none' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'rgba(159,215,255,0.5)', marginBottom:4, display:'block' }}>Până la</label>
                    <input type="date" value={dataEnd} onChange={e=>setDataEnd(e.target.value)}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid rgba(100,160,255,0.2)', background:'rgba(20,38,65,0.8)', color:'rgba(214,228,244,0.9)', fontSize:13, outline:'none' }}/>
                  </div>
                </div>
              )}
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
          <div style={{ display:'grid', gridTemplateColumns: tipRaport==='cu_comision' ? 'repeat(6,1fr)' : 'repeat(5,1fr)', gap:8 }}>
            {[
              { label:'Total brut', value:fmt(totals.brut), color:'#FFFFFF', sub:`${rezervari.length} rez.` },
              { label:'Medie / zi', value: totals.totalNopti>0 ? fmt(Math.round(totals.brut/totals.totalNopti*100)/100)+' RON' : '—', color:'rgba(159,215,255,0.8)', sub:`${totals.totalNopti} nopți totale` },
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
          <div style={{ ...panel, overflow:'visible' }}>
            {rezervari.length === 0 ? (
              <div style={{ padding:'40px', textAlign:'center', color:'rgba(159,215,255,0.4)', fontSize:13 }}>Nicio rezervare pentru filtrele selectate</div>
            ) : (
              <div style={{ overflowX:'auto', borderRadius:8 }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead style={{ background:'rgba(14,27,43,0.95)', position:'sticky', top:0, zIndex:2 }}>
                    <tr>
                      {['Client','Perioadă','N','Canal', ...(showAptCol?['Apt']:[]), 'Brut','€/zi','Com.Platf','Net Platf', ...(tipRaport==='cu_comision'?[`Com.AB ${comisionAB}%`]:[]), 'Net Final',''].map(h=>(
                        <th key={h} style={{ padding:'8px 12px', textAlign: ['Brut','Com.Platf','Net Platf',`Com.AB ${comisionAB}%`,'Net Final'].includes(h)?'right':'left', fontSize:10, fontWeight:600, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid rgba(159,215,255,0.1)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rezervari.map((r,i) => <RezervareRow key={r.id||i} r={r} tipRaport={tipRaport} comisionAB={comisionAB} periodStart={periodStart} periodEnd={periodEnd}/>)}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'rgba(14,27,43,0.5)' }}>
                      <td colSpan={showAptCol?4:3} style={{ padding:'10px 12px', fontSize:12, fontWeight:600, color:'rgba(159,215,255,0.6)' }}>TOTAL — {rezervari.length} rez. · {totals.totalNopti} nopți</td>
                      <td/>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#FFFFFF', textAlign:'right' }}>{fmt(totals.brut)}</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'rgba(159,215,255,0.7)', textAlign:'right' }}>
                        {totals.totalNopti > 0 ? fmt(Math.round(totals.brut / totals.totalNopti * 100)/100) : '—'}
                        <span style={{ display:'block', fontSize:9, color:'rgba(159,215,255,0.35)', fontFamily:'sans-serif' }}>medie/zi</span>
                      </td>
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
      {/* TVA / FISCAL TAB */}
      {generated && rezervari.length > 0 && (
        <div style={{ padding:'0 20px 20px' }}>
          <div style={{ display:'flex', gap:4, marginBottom:12, background:'rgba(14,27,43,0.4)', borderRadius:10, padding:4, width:'fit-content' }}>
            {([['rezervari','📋 Rezervări'],['fiscal','📊 Situație Fiscală']] as [string,string][]).map(([k,l])=>(
              <button key={k} onClick={()=>setActiveTab(k as any)} style={{ fontSize:12, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', fontWeight:activeTab===k?600:400, background:activeTab===k?'rgba(77,163,255,0.2)':'transparent', color:activeTab===k?'#FFFFFF':'rgba(159,215,255,0.45)', outline:activeTab===k?'1px solid rgba(77,163,255,0.3)':'none' }}>{l}</button>
            ))}
          </div>

          {activeTab === 'fiscal' && (() => {
            // Per platform breakdown
            const byPlatform = PLATFORME.map(p => {
              const rezP = rezervari.filter(r => r.canal === p.key || (p.key==='direct' && ['direct','whatsapp','telefon','site'].includes(r.canal)))
              const brut = rezP.reduce((s,r)=>s+Number(r.suma_incasata||0),0)
              const { com, tva, total } = rezP.reduce((acc,r)=>{ const c=calcComision(Number(r.suma_incasata||0),r.canal); return {com:acc.com+c.com,tva:acc.tva+c.tva,total:acc.total+c.total} },{com:0,tva:0,total:0})
              return { ...p, brut, com, tva, total, nr: rezP.length }
            }).filter(p => p.nr > 0)

            const totalBrut = totals.brut
            const totalCom = totals.com
            const totalTVA = totals.tva
            const totalPlatforme = totals.platforma
            const totalComAB = totals.comisionAB
            const netFinal = totals.netFinal

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {/* Per platform */}
                <div style={{ ...panel, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(159,215,255,0.08)', fontSize:12, fontWeight:600, color:'rgba(159,215,255,0.6)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Detaliu comisioane pe platformă</div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead style={{ background:'rgba(14,27,43,0.5)' }}>
                      <tr>
                        {['Platformă','Nr. rez.','Brut total','Com. platformă','TVA 21%','Total dedus','Net după'].map(h=>(
                          <th key={h} style={{ padding:'8px 14px', textAlign:h==='Platformă'||h==='Nr. rez.'?'left':'right', fontSize:10, fontWeight:600, color:'rgba(159,215,255,0.4)', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid rgba(159,215,255,0.08)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byPlatform.map(p=>(
                        <tr key={p.key}>
                          <td style={{ padding:'9px 14px' }}>
                            <span style={{ fontSize:12, fontWeight:600, color: p.key==='airbnb'?'#F87171':p.key==='booking'?'#7BC8FF':'#4ADE80' }}>{p.label}</span>
                            {p.comPct > 0 && <span style={{ fontSize:10, color:'rgba(159,215,255,0.35)', marginLeft:6 }}>{p.comPct*100}%</span>}
                          </td>
                          <td style={{ padding:'9px 14px', fontSize:12, color:'rgba(214,228,244,0.6)' }}>{p.nr}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'monospace', fontWeight:600, color:'#FFFFFF', textAlign:'right' }}>{fmt(p.brut)}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'monospace', color: p.com>0?'#F87171':'rgba(159,215,255,0.3)', textAlign:'right' }}>{p.com>0?`-${fmt(p.com)}`:'—'}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'monospace', color: p.tva>0?'#F87171':'rgba(159,215,255,0.3)', textAlign:'right' }}>{p.tva>0?`-${fmt(p.tva)}`:'—'}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'monospace', color:'#F87171', fontWeight:600, textAlign:'right' }}>{p.total>0?`-${fmt(p.total)}`:'—'}</td>
                          <td style={{ padding:'9px 14px', fontFamily:'monospace', color:'#FCD34D', textAlign:'right' }}>{fmt(p.brut-p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'rgba(14,27,43,0.4)' }}>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'rgba(159,215,255,0.6)' }}>TOTAL</td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'rgba(214,228,244,0.6)' }}>{rezervari.length}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:'#FFFFFF', textAlign:'right' }}>{fmt(totalBrut)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:'#F87171', textAlign:'right' }}>-{fmt(totalCom)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:'#F87171', textAlign:'right' }}>-{fmt(totalTVA)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:'#F87171', textAlign:'right' }}>-{fmt(totalPlatforme)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:'#FCD34D', textAlign:'right' }}>{fmt(totalBrut-totalPlatforme)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Summary boxes */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                  <div style={{ ...panel, padding:16, borderColor:'rgba(239,68,68,0.2)' }}>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:6 }}>📤 TVA intracomunitar de plată</div>
                    <div style={{ fontSize:24, fontWeight:700, color:'#F87171', fontFamily:'monospace' }}>{fmt(totalTVA)} RON</div>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.3)', marginTop:4 }}>21% din comisioanele Airbnb + Booking</div>
                    <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:4 }}>
                      {byPlatform.filter(p=>p.tva>0).map(p=>(
                        <div key={p.key} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                          <span style={{ color:'rgba(159,215,255,0.5)' }}>{p.label}</span>
                          <span style={{ color:'#F87171', fontFamily:'monospace' }}>{fmt(p.tva)} RON</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ ...panel, padding:16, borderColor:'rgba(245,158,11,0.2)' }}>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:6 }}>💸 Comisioane platforme plătite</div>
                    <div style={{ fontSize:24, fontWeight:700, color:'#FCD34D', fontFamily:'monospace' }}>{fmt(totalCom)} RON</div>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.3)', marginTop:4 }}>Fără TVA</div>
                    <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:4 }}>
                      {byPlatform.filter(p=>p.com>0).map(p=>(
                        <div key={p.key} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                          <span style={{ color:'rgba(159,215,255,0.5)' }}>{p.label} ({p.comPct*100}%)</span>
                          <span style={{ color:'#FCD34D', fontFamily:'monospace' }}>{fmt(p.com)} RON</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ ...panel, padding:16, borderColor:'rgba(77,163,255,0.2)' }}>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:6 }}>✓ Venit net AB Homes</div>
                    <div style={{ fontSize:24, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>{fmt(totalComAB)} RON</div>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.3)', marginTop:4 }}>Comision administrare {comisionAB}%</div>
                    <div style={{ marginTop:10, padding:'8px', background:'rgba(14,27,43,0.4)', borderRadius:7 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                        <span style={{ color:'rgba(159,215,255,0.5)' }}>Total brut</span>
                        <span style={{ color:'#FFFFFF', fontFamily:'monospace' }}>{fmt(totalBrut)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                        <span style={{ color:'rgba(159,215,255,0.5)' }}>- Platforme+TVA</span>
                        <span style={{ color:'#F87171', fontFamily:'monospace' }}>-{fmt(totalPlatforme)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                        <span style={{ color:'rgba(159,215,255,0.5)' }}>- Com. AB Homes</span>
                        <span style={{ color:'#F87171', fontFamily:'monospace' }}>-{fmt(totalComAB)}</span>
                      </div>
                      <div style={{ borderTop:'1px solid rgba(159,215,255,0.1)', paddingTop:4, display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:700 }}>
                        <span style={{ color:'rgba(159,215,255,0.6)' }}>Net proprietari</span>
                        <span style={{ color:'#4ADE80', fontFamily:'monospace' }}>{fmt(netFinal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
      {/* ══ CALCULATOR DECONTAT PROPRIETAR ══ */}
      {generated && <CalculatorDecontat netFinal={totals.netFinal} perioada={`${periodStart} — ${periodEnd}`}/>}
      <Toast toast={toast}/>
    </div>
  )
}

function CalculatorDecontat({ netFinal, perioada }: { netFinal: number; perioada: string }) {
  const [contabilitate, setContabilitate] = useState(0)
  const [curatenie, setCuratenie] = useState(0)
  const [lenjerii, setLenjerii] = useState(0)
  const [promovare, setPromovare] = useState(0)
  const [incasatCash, setIncasatCash] = useState(0)
  const [altelinii, setAltelinii] = useState<{desc:string;val:number;tip:'scade'|'adauga'}[]>([])

  const totalScazaminte = Number(contabilitate)+Number(curatenie)+Number(lenjerii)+Number(promovare)+
    altelinii.filter(l=>l.tip==='scade').reduce((s,l)=>s+Number(l.val||0),0)
  const totalAdaosuri = Number(incasatCash) +
    altelinii.filter(l=>l.tip==='adauga').reduce((s,l)=>s+Number(l.val||0),0)
  const netProprietar = netFinal + totalAdaosuri - totalScazaminte

  function fmtR(v:number){ return v.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}) }

  const inp: React.CSSProperties = {
    background:'rgba(20,38,65,0.8)', border:'0.5px solid rgba(100,160,255,0.2)',
    borderRadius:7, color:'rgba(214,228,244,0.9)', fontSize:13,
    padding:'7px 10px', outline:'none', width:'100%'
  }
  const panel2: React.CSSProperties = {
    background:'rgba(214,228,244,0.05)', border:'0.5px solid rgba(159,215,255,0.1)',
    borderTop: '2px solid rgba(252,211,77,0.4)',
    borderRadius:12, overflow:'hidden', margin:'0 20px 20px'
  }

  return (
    <div style={panel2}>
      <div style={{ padding:'12px 16px', background:'rgba(14,27,43,0.5)', borderBottom:'0.5px solid rgba(159,215,255,0.07)', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:14 }}>💰</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#E8F4FF' }}>Calculator decontat proprietar</div>
          <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>{perioada}</div>
        </div>
        <div style={{ textAlign:'right' as const }}>
          <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', textTransform:'uppercase', letterSpacing:'.05em' }}>Net raportat</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>{fmtR(netFinal)} RON</div>
        </div>
      </div>
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Net de baza */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'rgba(74,222,128,0.06)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8 }}>
          <span style={{ fontSize:13, color:'rgba(159,215,255,0.6)' }}>Net după platforme și comision AB</span>
          <span style={{ fontSize:18, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>{fmtR(netFinal)} RON</span>
        </div>

        {/* Incasat cash */}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>+ Încasat cash</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <div>
              <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:4 }}>Sumă încasată cash (se adaugă la total)</div>
              <input type="number" min={0} value={incasatCash||''} placeholder="0"
                onChange={e=>setIncasatCash(Number(e.target.value)||0)} style={inp}/>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'#4ADE80', fontFamily:'monospace', paddingTop:20, minWidth:80, textAlign:'right' as const }}>
              + {fmtR(Number(incasatCash))}
            </div>
          </div>
        </div>

        {/* Scazaminte fixe */}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:'rgba(248,113,113,0.6)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>− Scăzăminte</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {([
              ['Contabilitate', contabilitate, setContabilitate],
              ['Curățenie', curatenie, setCuratenie],
              ['Lenjerii', lenjerii, setLenjerii],
              ['Promovare', promovare, setPromovare],
            ] as any[]).map(([label, val, setter]) => (
              <div key={label}>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
                <input type="number" min={0} value={val||''} placeholder="0"
                  onChange={e=>setter(Number(e.target.value)||0)} style={inp}/>
              </div>
            ))}
          </div>
        </div>

        {/* Alte linii */}
        {altelinii.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {altelinii.map((linie, idx) => (
              <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 100px 80px auto', gap:6, alignItems:'center' }}>
                <input value={linie.desc} placeholder="Descriere"
                  onChange={e=>{ const n=[...altelinii]; n[idx]={...n[idx],desc:e.target.value}; setAltelinii(n) }}
                  style={inp}/>
                <input type="number" min={0} value={linie.val||''} placeholder="0"
                  onChange={e=>{ const n=[...altelinii]; n[idx]={...n[idx],val:Number(e.target.value)||0}; setAltelinii(n) }}
                  style={inp}/>
                <select value={linie.tip}
                  onChange={e=>{ const n=[...altelinii]; n[idx]={...n[idx],tip:e.target.value as any}; setAltelinii(n) }}
                  style={{...inp, padding:'7px 6px'}}>
                  <option value="scade">− scade</option>
                  <option value="adauga">+ adaugă</option>
                </select>
                <button onClick={()=>setAltelinii(altelinii.filter((_,i)=>i!==idx))}
                  style={{ width:32, height:36, borderRadius:7, border:'0.5px solid rgba(248,113,113,0.25)', background:'rgba(248,113,113,0.06)', color:'#F87171', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={()=>setAltelinii([...altelinii,{desc:'',val:0,tip:'scade'}])}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'0.5px solid rgba(77,163,255,0.25)', background:'rgba(77,163,255,0.06)', color:'rgba(77,163,255,0.7)', fontSize:12, cursor:'pointer', alignSelf:'flex-start' as const }}>
          + Adaugă linie
        </button>

        {/* Sumar */}
        <div style={{ background:'rgba(14,27,43,0.6)', border:'0.5px solid rgba(159,215,255,0.1)', borderRadius:10, padding:'14px 16px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:10 }}>
            {[
              ['Net raportat', netFinal, '#4ADE80', false],
              incasatCash>0 && ['+ Încasat cash', incasatCash, '#4ADE80', false],
              ...altelinii.filter(l=>l.tip==='adauga'&&l.val>0).map(l=>[`+ ${l.desc||'Adaos'}`, l.val, '#4ADE80', false]),
              contabilitate>0 && ['− Contabilitate', contabilitate, '#F87171', true],
              curatenie>0 && ['− Curățenie', curatenie, '#F87171', true],
              lenjerii>0 && ['− Lenjerii', lenjerii, '#F87171', true],
              promovare>0 && ['− Promovare', promovare, '#F87171', true],
              ...altelinii.filter(l=>l.tip==='scade'&&l.val>0).map(l=>[`− ${l.desc||'Deducere'}`, l.val, '#F87171', true]),
            ].filter(Boolean).map((item:any, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'rgba(159,215,255,0.5)' }}>{item[0]}</span>
                <span style={{ color:item[2], fontFamily:'monospace' }}>{item[3]?'-':''}{fmtR(Number(item[1]))}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(159,215,255,0.15)', paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:14, fontWeight:600, color:'#E8F4FF' }}>Sumă de plătit proprietarului</span>
            <span style={{ fontSize:22, fontWeight:700, color:netProprietar>=0?'#4ADE80':'#F87171', fontFamily:'monospace' }}>{fmtR(netProprietar)} RON</span>
          </div>
        </div>

      </div>
    </div>
  )
}
