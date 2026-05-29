'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, PageLoading, Toast, useToast } from '@/components/ui'
import { FileText, Download, ChevronDown, ChevronUp } from 'lucide-react'

const LUNI = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

// Calcul comision platformă
function calcComisionPlatforma(brut: number, canal: string) {
  if (canal === 'airbnb') {
    const com = brut * 0.15
    const tva = com * 0.21
    return { com, tva, total: com + tva, label: 'Airbnb 15% + TVA 21%' }
  }
  if (canal === 'booking') {
    const com = brut * 0.17  // 15% + 1.8% plati = ~17%
    const tva = com * 0.21
    return { com, tva, total: com + tva, label: 'Booking 17% + TVA 21%' }
  }
  return { com: 0, tva: 0, total: 0, label: 'Direct' }
}

function calcRezervare(r: any, comisionAB: number = 20) {
  const brut = Number(r.suma_incasata || 0)
  const { com, tva, total: totalPlatforma, label } = calcComisionPlatforma(brut, r.canal)
  const netDupaPlatforme = brut - totalPlatforma
  const comisionABVal = netDupaPlatforme * (comisionAB / 100)
  const netProprietar = netDupaPlatforme - comisionABVal
  return { brut, com, tva, totalPlatforma, netDupaPlatforme, comisionABVal, netProprietar, label }
}

function fmt(n: number) {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CanalBadge({ canal }: { canal: string }) {
  const s: Record<string, React.CSSProperties> = {
    booking: { background: 'rgba(77,163,255,0.14)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.2)' },
    airbnb: { background: 'rgba(239,68,68,0.14)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' },
    direct: { background: 'rgba(34,197,94,0.14)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)' },
  }
  const l: Record<string, string> = { booking: 'Booking', airbnb: 'Airbnb', direct: 'Direct', whatsapp: 'Direct', telefon: 'Direct', site: 'Direct' }
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, fontFamily: 'monospace', ...(s[canal] || s.direct) }}>{l[canal] || canal}</span>
}

function RezervareRow({ r, comisionAB }: { r: any; comisionAB: number }) {
  const [open, setOpen] = useState(false)
  const calc = calcRezervare(r, comisionAB)

  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: 'pointer', background: open ? 'rgba(77,163,255,0.05)' : 'transparent' }}>
        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{r.nume_client}</td>
        <td style={{ padding: '10px 14px', fontSize: 11, color: 'rgba(159,215,255,0.55)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.data_checkin} → {r.data_checkout}</td>
        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: 'rgba(214,228,244,0.6)' }}>{r.nr_nopti}</td>
        <td style={{ padding: '10px 14px' }}><CanalBadge canal={r.canal}/></td>
        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#FFFFFF', textAlign: 'right' }}>{fmt(calc.brut)}</td>
        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#F87171', textAlign: 'right' }}>
          {calc.totalPlatforma > 0 ? `-${fmt(calc.totalPlatforma)}` : '—'}
        </td>
        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#FCD34D', textAlign: 'right' }}>{fmt(calc.netDupaPlatforme)}</td>
        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#F87171', textAlign: 'right' }}>-{fmt(calc.comisionABVal)}</td>
        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#4ADE80', textAlign: 'right' }}>{fmt(calc.netProprietar)}</td>
        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.4)' }}>{open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} style={{ padding: '0 14px 12px 40px', background: 'rgba(77,163,255,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, paddingTop: 8 }}>
              {[
                { label: 'Brut oaspete', value: fmt(calc.brut) + ' RON', color: '#FFFFFF' },
                { label: `Comision ${calc.label}`, value: `-${fmt(calc.com)} RON`, color: '#F87171' },
                { label: 'TVA intracomunitar 21%', value: calc.tva > 0 ? `-${fmt(calc.tva)} RON` : 'N/A', color: calc.tva > 0 ? '#F87171' : '#94A3B8' },
                { label: 'Net după platforme', value: fmt(calc.netDupaPlatforme) + ' RON', color: '#FCD34D' },
                { label: `Comision AB Homes ${comisionAB}%`, value: `-${fmt(calc.comisionABVal)} RON`, color: '#F87171' },
                { label: '= Net proprietar', value: fmt(calc.netProprietar) + ' RON', color: '#4ADE80' },
                { label: 'Apartament', value: r.apartament?.nume || '—', color: 'rgba(214,228,244,0.7)' },
                { label: 'Status', value: r.status_rezervare, color: 'rgba(214,228,244,0.7)' },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(14,27,43,0.5)', borderRadius: 7, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: item.color, fontFamily: 'monospace' }}>{item.value}</div>
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
  const [loading, setLoading] = useState(false)
  const [apartamente, setApartamente] = useState<any[]>([])
  const [selectedApt, setSelectedApt] = useState('')
  const [lunaStart, setLunaStart] = useState(new Date().getMonth() + 1)
  const [anStart, setAnStart] = useState(new Date().getFullYear())
  const [lunaEnd, setLunaEnd] = useState(new Date().getMonth() + 1)
  const [anEnd, setAnEnd] = useState(new Date().getFullYear())
  const [comisionAB, setComisionAB] = useState(20)
  const [rezervari, setRezervari] = useState<any[]>([])
  const [generated, setGenerated] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota,comision_procent').order('nota').then(({ data }) => setApartamente(data || []))
  }, [])

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
      .order('data_checkin')

    if (selectedApt) q = q.eq('apartament_id', selectedApt)

    const { data } = await q
    setRezervari(data || [])
    setGenerated(true)
    setLoading(false)
  }

  // Totals
  const totals = rezervari.reduce((acc, r) => {
    const c = calcRezervare(r, comisionAB)
    acc.brut += c.brut
    acc.com += c.com
    acc.tva += c.tva
    acc.platforma += c.totalPlatforma
    acc.netPlatforme += c.netDupaPlatforme
    acc.comisionAB += c.comisionABVal
    acc.netProprietar += c.netProprietar
    return acc
  }, { brut: 0, com: 0, tva: 0, platforma: 0, netPlatforme: 0, comisionAB: 0, netProprietar: 0 })

  const aptNume = selectedApt ? (apartamente.find(a => a.id === selectedApt)?.nota ? `[${apartamente.find(a => a.id === selectedApt)?.nota}] ${apartamente.find(a => a.id === selectedApt)?.nume}` : apartamente.find(a => a.id === selectedApt)?.nume) : 'Toate locațiile'

  async function exportPDF() {
    if (!generated || rezervari.length === 0) return
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = 297

      doc.setFillColor(11, 18, 32)
      doc.rect(0, 0, pageW, 30, 'F')
      doc.setTextColor(77, 163, 255)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('RAPORT REZERVARI — AB HOMES IASI', 14, 12)
      doc.setTextColor(214, 228, 244)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const perioadaLabel = lunaStart === lunaEnd && anStart === anEnd ? `${LUNI[lunaStart-1]} ${anStart}` : `${LUNI[lunaStart-1]} ${anStart} — ${LUNI[lunaEnd-1]} ${anEnd}`
      doc.text(`${aptNume} | ${perioadaLabel} | Comision AB Homes: ${comisionAB}%`, 14, 22)

      const rows = rezervari.map(r => {
        const c = calcRezervare(r, comisionAB)
        return [
          r.nume_client,
          `${r.data_checkin} → ${r.data_checkout}`,
          String(r.nr_nopti || 0),
          r.canal?.toUpperCase(),
          `${fmt(c.brut)} RON`,
          c.totalPlatforma > 0 ? `-${fmt(c.totalPlatforma)} RON` : '—',
          `${fmt(c.netDupaPlatforme)} RON`,
          `-${fmt(c.comisionABVal)} RON`,
          `${fmt(c.netProprietar)} RON`,
        ]
      })

      // Add totals row
      rows.push([
        'TOTAL', '', String(rezervari.length) + ' rez.', '',
        `${fmt(totals.brut)} RON`,
        `-${fmt(totals.platforma)} RON`,
        `${fmt(totals.netPlatforme)} RON`,
        `-${fmt(totals.comisionAB)} RON`,
        `${fmt(totals.netProprietar)} RON`,
      ])

      autoTable(doc, {
        startY: 35,
        head: [['Client', 'Perioada', 'Nopți', 'Canal', 'Brut', 'Com. Platforme', 'Net Platforme', 'Com. AB Homes', 'Net Proprietar']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [14, 27, 43], textColor: [159, 215, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [20, 35, 55] },
        bodyStyles: { textColor: [214, 228, 244] },
        foot: [[
          { content: `TOTAL: ${rezervari.length} rezervări | ${fmt(totals.brut)} RON brut | ${fmt(totals.netProprietar)} RON net proprietar`, colSpan: 9, styles: { fillColor: [14, 27, 43], textColor: [77, 163, 255], fontStyle: 'bold', fontSize: 9 } }
        ]],
        didParseCell: (data: any) => {
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fillColor = [14, 27, 43]
            data.cell.styles.textColor = [77, 255, 163]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      })

      const fileLabel = lunaStart === lunaEnd && anStart === anEnd ? `${anStart}_${String(lunaStart).padStart(2,'0')}` : `${anStart}_${String(lunaStart).padStart(2,'0')}-${anEnd}_${String(lunaEnd).padStart(2,'0')}`
      doc.save(`Raport_${aptNume.replace(/[\[\] ]/g,'_')}_${fileLabel}.pdf`)
      show('success', 'PDF exportat!')
    } catch (e) {
      show('error', 'Eroare export PDF')
    }
    setExporting(false)
  }

  const panel: React.CSSProperties = { background: 'rgba(214,228,244,0.06)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(159,215,255,0.12)', borderRadius: 14, overflow: 'hidden' }

  return (
    <>
      <PageHeader title="Rapoarte" subtitle="Calcul comisioane și net proprietar"/>
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

        {/* FILTERS */}
        <div style={{ ...panel, padding: '16px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>Apartament / Locație</label>
              <select value={selectedApt} onChange={e => { setSelectedApt(e.target.value); const apt = apartamente.find(a => a.id === e.target.value); if (apt?.comision_procent) setComisionAB(apt.comision_procent) }}>
                <option value="">🏢 Toate locațiile</option>
                <option disabled>──────────</option>
                {apartamente.map(a => <option key={a.id} value={a.id}>{a.nota ? `[${a.nota}] ` : ''}{a.nume}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>De la</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={lunaStart} onChange={e => setLunaStart(Number(e.target.value))} style={{ flex: 2 }}>
                  {LUNI.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
                </select>
                <select value={anStart} onChange={e => setAnStart(Number(e.target.value))} style={{ flex: 1 }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>Până la</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={lunaEnd} onChange={e => setLunaEnd(Number(e.target.value))} style={{ flex: 2 }}>
                  {LUNI.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
                </select>
                <select value={anEnd} onChange={e => setAnEnd(Number(e.target.value))} style={{ flex: 1 }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>Comision AB Homes (%)</label>
              <input type="number" value={comisionAB} onChange={e => setComisionAB(Number(e.target.value))} min={0} max={100} style={{ textAlign: 'center' }}/>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={genereaza} loading={loading} icon={<FileText size={14}/>}>Generează</Button>
              {generated && rezervari.length > 0 && (
                <Button variant="secondary" onClick={exportPDF} loading={exporting} icon={<Download size={14}/>}>PDF</Button>
              )}
            </div>
          </div>
        </div>

        {/* TOTALS STRIP */}
        {generated && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            {[
              { label: 'Total brut încasat', value: fmt(totals.brut), color: '#FFFFFF', sub: `${rezervari.length} rezervări` },
              { label: 'Comision platforme', value: `-${fmt(totals.platforma)}`, color: '#F87171', sub: `(com. + TVA 21%)` },
              { label: 'Net după platforme', value: fmt(totals.netPlatforme), color: '#FCD34D', sub: 'baza de calcul' },
              { label: `Comision AB Homes ${comisionAB}%`, value: `-${fmt(totals.comisionAB)}`, color: '#F87171', sub: 'din net platforme' },
              { label: '✓ Net proprietar', value: fmt(totals.netProprietar), color: '#4ADE80', sub: 'de plătit proprietarului' },
            ].map(s => (
              <div key={s.label} style={{ ...panel, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'monospace', letterSpacing: -0.5 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)', marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* LEGEND */}
        {generated && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Airbnb: 15% com. + 21% TVA pe comision', color: '#F87171' },
              { label: 'Booking: 17% com. + 21% TVA pe comision', color: '#7BC8FF' },
              { label: 'Direct: fără comision platformă', color: '#4ADE80' },
              { label: `AB Homes: ${comisionAB}% din net platforme`, color: '#FCD34D' },
            ].map(i => (
              <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: i.color, flexShrink: 0 }}/>
                {i.label}
              </div>
            ))}
          </div>
        )}

        {/* TABLE */}
        {generated && (
          <div style={panel}>
            {rezervari.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(159,215,255,0.4)', fontSize: 13 }}>
                Nicio rezervare în perioada selectată
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'rgba(14,27,43,0.6)' }}>
                    <tr>
                      {[
                        { label: 'Client', align: 'left' },
                        { label: 'Perioadă', align: 'left' },
                        { label: 'N', align: 'center' },
                        { label: 'Canal', align: 'left' },
                        { label: 'Brut', align: 'right' },
                        { label: 'Com. Platforme', align: 'right' },
                        { label: 'Net Platforme', align: 'right' },
                        { label: `Com. AB ${comisionAB}%`, align: 'right' },
                        { label: 'Net Proprietar', align: 'right' },
                        { label: '', align: 'center' },
                      ].map(h => (
                        <th key={h.label} style={{ padding: '10px 14px', textAlign: h.align as any, fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(159,215,255,0.1)', whiteSpace: 'nowrap' }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rezervari.map((r, i) => (
                      <RezervareRow key={r.id || i} r={r} comisionAB={comisionAB}/>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(14,27,43,0.5)' }}>
                      <td colSpan={4} style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)' }}>TOTAL — {rezervari.length} rezervări</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#FFFFFF', textAlign: 'right' }}>{fmt(totals.brut)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#F87171', textAlign: 'right' }}>-{fmt(totals.platforma)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#FCD34D', textAlign: 'right' }}>{fmt(totals.netPlatforme)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#F87171', textAlign: 'right' }}>-{fmt(totals.comisionAB)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#4ADE80', textAlign: 'right', fontSize: 15 }}>{fmt(totals.netProprietar)}</td>
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
