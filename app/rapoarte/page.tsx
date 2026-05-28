'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, LUNI, CANALE_LABEL, CATEGORII_LABEL } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Card, CardHeader, CardTitle, FormGroup, FormRow, PageLoading, Toast, useToast } from '@/components/ui'
import { FileText, Download, TrendingUp, DollarSign } from 'lucide-react'

export default function RapoartePage() {
  const [loading, setLoading] = useState(false)
  const [apartamente, setApartamente] = useState<any[]>([])
  const [selectedApt, setSelectedApt] = useState('')
  const [selectedLuna, setSelectedLuna] = useState(new Date().getMonth() + 1)
  const [selectedAn, setSelectedAn] = useState(new Date().getFullYear())
  const [raport, setRaport] = useState<any>(null)
  const [exporting, setExporting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('*, proprietar:proprietari(id,nume,email,telefon,iban,banca,adresa)').order('nume').then(({ data }) => setApartamente(data||[]))
  }, [])

  async function genereazaRaport() {
    
    setLoading(true)
    const apt = selectedApt ? apartamente.find(a => a.id === selectedApt) : null
    const primaZi = new Date(selectedAn, selectedLuna - 1, 1)
    const ultimaZi = new Date(selectedAn, selectedLuna, 0)
    const start = primaZi.toISOString().split('T')[0]
    const end = ultimaZi.toISOString().split('T')[0]
    const zileLuna = ultimaZi.getDate()

    const [{ data: rez }, { data: ch }, { data: dec }] = await Promise.all([
      (selectedApt ? supabase.from('rezervari').select('*,apartament:apartamente(nume,nota)').eq('apartament_id', selectedApt) : supabase.from('rezervari').select('*,apartament:apartamente(nume,nota)')).gte('data_checkin', start).lte('data_checkin', end).in('status_rezervare', ['confirmata','finalizata']).order('data_checkin'),
      (selectedApt ? supabase.from('cheltuieli').select('*,apartament:apartamente(nume)').eq('apartament_id', selectedApt) : supabase.from('cheltuieli').select('*,apartament:apartamente(nume)')).gte('data', start).lte('data', end),
      selectedApt ? supabase.from('deconturi').select('*').eq('apartament_id', selectedApt) : supabase.from('deconturi').select('*').eq('luna', selectedLuna).eq('an', selectedAn).maybeSingle(),
    ])

    const rezervari = rez||[]
    const cheltuieli = ch||[]
    const totalIncasari = rezervari.reduce((s:number,r:any)=>s+Number(r.suma_incasata||0),0)
    const totalComPlatf = rezervari.reduce((s:number,r:any)=>s+Number(r.comision_platforma_valoare||0),0)
    const totalTva = rezervari.reduce((s:number,r:any)=>s+Number(r.tva_comision_platforma||0),0)
    const totalCostOp = cheltuieli.filter((c:any)=>c.suportat_de==='proprietar').reduce((s:number,c:any)=>s+Number(c.valoare||0),0)
    const noptiOcupate = rezervari.reduce((s:number,r:any)=>s+Number(r.nr_nopti||0),0)
    const gradOcupare = Math.round(noptiOcupate/zileLuna*100)

    setRaport({ apt, rezervari, cheltuieli, dec, totalIncasari, totalComPlatf, totalTva, totalCostOp, noptiOcupate, gradOcupare, luna: selectedLuna, an: selectedAn, start, end, zileLuna })
    setLoading(false)
  }

  async function exportPDF() {
    if (!raport) return
    setExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = 210
      const margin = 15

      // Header
      doc.setFillColor(15, 17, 23)
      doc.rect(0, 0, pageW, 35, 'F')
      doc.setTextColor(79, 124, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('RAPORT LUNAR', margin, 15)
      doc.setTextColor(232, 237, 248)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`${raport.apt?.nume || 'Toate locațiile'} · ${LUNI[raport.luna]} ${raport.an}`, margin, 23)
      doc.setTextColor(90, 107, 138)
      doc.text(`Generat: ${new Date().toLocaleDateString('ro-RO')}`, margin, 30)

      let y = 45

      // Proprietar info
      if (raport.apt.proprietar) {
        const p = raport.apt.proprietar
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 30, 30)
        doc.text('DATE PROPRIETAR', margin, y); y += 6
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        doc.text(`Nume: ${p.nume}`, margin, y); y += 5
        if (p.telefon) { doc.text(`Telefon: ${p.telefon}`, margin, y); y += 5 }
        if (p.email) { doc.text(`Email: ${p.email}`, margin, y); y += 5 }
        if (p.iban) { doc.text(`IBAN: ${p.iban}`, margin, y); y += 5 }
        y += 4
      }

      // Summary stats
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text('SUMAR PERIOADĂ', margin, y); y += 6
      const summaryData = [
        [`Perioadă`, `${raport.start} — ${raport.end}`],
        [`Rezervări`, `${raport.rezervari.length}`],
        [`Nopți ocupate`, `${raport.noptiOcupate} din ${raport.zileLuna}`],
        [`Grad ocupare`, `${raport.gradOcupare}%`],
      ]
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin },
        body: summaryData,
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { textColor: [90,107,138], fontStyle: 'bold' }, 1: { textColor: [30,30,30] } },
        theme: 'plain',
        tableLineColor: [220, 220, 220], tableLineWidth: 0.1,
      })
      y = (doc as any).lastAutoTable.finalY + 8

      // Rezervari table
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text('REZERVĂRI', margin, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin },
        head: [['Client', 'Canal', 'Check-in', 'Check-out', 'Nopți', 'Sumă (RON)', 'Proprietar (RON)']],
        body: raport.rezervari.map((r:any) => [
          r.nume_client,
          CANALE_LABEL[r.canal]||r.canal,
          r.data_checkin, r.data_checkout,
          r.nr_nopti,
          Number(r.suma_incasata).toLocaleString('ro-RO'),
          Number(r.suma_proprietar).toLocaleString('ro-RO'),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [79, 124, 255], textColor: [255,255,255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 252] },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      // Financial summary
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text('CALCUL FINANCIAR', margin, y); y += 4
      const financialData = [
        ['Venituri brute totale', `${raport.totalIncasari.toLocaleString('ro-RO')} RON`, ''],
        ['- Comisioane platforme', `${raport.totalComPlatf.toLocaleString('ro-RO')} RON`, ''],
        ['- TVA / taxe platforme', `${raport.totalTva.toLocaleString('ro-RO')} RON`, ''],
        ['- Costuri operaționale', `${raport.totalCostOp.toLocaleString('ro-RO')} RON`, 'suportate de proprietar'],
        ['- Comision administrare', `${raport.apt?.comision_procent || 20}%`, ''],
      ]
      const decont = raport.dec
      if (decont) {
        financialData.push(['= SUMĂ NETĂ DE VIRAT', `${Number(decont.suma_neta_proprietar).toLocaleString('ro-RO')} RON`, ''])
      }
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin },
        head: [['Detaliu', 'Valoare', 'Notă']],
        body: financialData,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 37, 53], textColor: [232, 237, 248], fontStyle: 'bold' },
        didParseCell: (data: any) => {
          if (data.row.index === financialData.length - 1 && data.section === 'body') {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.textColor = [45, 212, 160]
            data.cell.styles.fillColor = [240, 253, 249]
          }
        },
      })

      // Footer
      const finalY = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(8)
      doc.setTextColor(130, 130, 130)
      doc.text('Acest raport a fost generat automat de platforma ApartPro.', margin, finalY)
      doc.text('Pentru orice nelămuriri, contactați administratorul.', margin, finalY + 5)

      doc.save(`Raport_${raport.apt.nume.replace(/\s/g,'_')}_${LUNI[raport.luna]}_${raport.an}.pdf`)
      show('success', 'PDF generat cu succes!')
    } catch (e) {
      show('error', 'Eroare la generarea PDF-ului')
    }
    setExporting(false)
  }

  return (
    <>
      <PageHeader title="Rapoarte" subtitle="Generează și exportă rapoarte pentru proprietari" />
      <div className="p-6">
        <Card className="mb-6">
          <CardHeader><CardTitle>Configurare raport</CardTitle></CardHeader>
          <FormRow cols={3}>
            <FormGroup>
              <label>Apartament</label>
              <select value={selectedApt} onChange={e=>setSelectedApt(e.target.value)}>
                <option value="">🏢 Toate locațiile</option>
                <option disabled>──────────</option>
                {apartamente.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
              </select>
            </FormGroup>
            <FormGroup>
              <label>Luna</label>
              <select value={selectedLuna} onChange={e=>setSelectedLuna(parseInt(e.target.value))}>
                {LUNI.slice(1).map((l,i)=><option key={i+1} value={i+1}>{l}</option>)}
              </select>
            </FormGroup>
            <FormGroup>
              <label>Anul</label>
              <select value={selectedAn} onChange={e=>setSelectedAn(parseInt(e.target.value))}>
                {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </FormGroup>
          </FormRow>
          <Button variant="primary" onClick={genereazaRaport} loading={loading} icon={<TrendingUp size={14}/>}>Generează raport</Button>
        </Card>

        {raport && (
          <Card>
            <CardHeader>
              <CardTitle>📋 {raport.apt?.nume || 'Toate locațiile'} · {LUNI[raport.luna]} {raport.an}</CardTitle>
              <Button variant="primary" onClick={exportPDF} loading={exporting} icon={<Download size={14}/>}>Export PDF</Button>
            </CardHeader>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <div className="p-3 rounded-xl text-center" style={{ background:'var(--bg3)' }}>
                <p className="text-xl font-bold font-mono" style={{ color:'var(--text)' }}>{raport.rezervari.length}</p>
                <p className="text-[11px]" style={{ color:'var(--text3)' }}>rezervări</p>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background:'var(--bg3)' }}>
                <p className="text-xl font-bold font-mono" style={{ color:'var(--text)' }}>{raport.noptiOcupate}/{raport.zileLuna}</p>
                <p className="text-[11px]" style={{ color:'var(--text3)' }}>nopți</p>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background:'var(--bg3)' }}>
                <p className="text-xl font-bold font-mono" style={{ color: raport.gradOcupare>=70?'var(--green)':raport.gradOcupare>=40?'var(--amber)':'var(--red)' }}>{raport.gradOcupare}%</p>
                <p className="text-[11px]" style={{ color:'var(--text3)' }}>ocupare</p>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background:'var(--bg3)' }}>
                <p className="text-xl font-bold font-mono" style={{ color:'var(--accent)' }}>{raport.totalIncasari.toLocaleString('ro-RO')}</p>
                <p className="text-[11px]" style={{ color:'var(--text3)' }}>RON brut</p>
              </div>
            </div>

            {/* Rezervari table */}
            <div className="mb-5 rounded-xl overflow-hidden border" style={{ borderColor:'var(--border)' }}>
              <table>
                <thead><tr>
                  <th>Client</th><th>Canal</th><th>Check-in</th><th>Check-out</th>
                  <th>Nopți</th><th>Sumă</th><th>Comision admin</th><th>Net proprietar</th>
                </tr></thead>
                <tbody>
                  {raport.rezervari.map((r:any)=>(
                    <tr key={r.id}>
                      <td style={{ color:'var(--text)', fontWeight:500 }}>{r.nume_client}</td>
                      <td>{CANALE_LABEL[r.canal]||r.canal}</td>
                      <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.data_checkin}</td>
                      <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.data_checkout}</td>
                      <td style={{ textAlign:'center' }}>{r.nr_nopti}</td>
                      <td style={{ fontFamily:'monospace', fontWeight:600, color:'var(--text)' }}>{Number(r.suma_incasata).toLocaleString('ro-RO')} RON</td>
                      <td style={{ fontFamily:'monospace', color:'var(--red)' }}>-{Number(r.comision_administrator).toLocaleString('ro-RO')} RON</td>
                      <td style={{ fontFamily:'monospace', fontWeight:700, color:'var(--green)' }}>{Number(r.suma_proprietar).toLocaleString('ro-RO')} RON</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial calc */}
            <div className="rounded-xl p-4 space-y-2" style={{ background:'var(--bg3)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>Calcul financiar final</p>
              <div className="flex justify-between text-sm"><span style={{ color:'var(--text3)' }}>Total încasări brute</span><span className="font-mono font-medium" style={{ color:'var(--text)' }}>{raport.totalIncasari.toLocaleString('ro-RO')} RON</span></div>
              {raport.totalComPlatf>0 && <div className="flex justify-between text-sm"><span style={{ color:'var(--text3)' }}>- Comisioane platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{raport.totalComPlatf.toLocaleString('ro-RO')} RON</span></div>}
              {raport.totalTva>0 && <div className="flex justify-between text-sm"><span style={{ color:'var(--text3)' }}>- TVA platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{raport.totalTva.toLocaleString('ro-RO')} RON</span></div>}
              {raport.totalCostOp>0 && <div className="flex justify-between text-sm"><span style={{ color:'var(--text3)' }}>- Costuri operaționale</span><span className="font-mono" style={{ color:'var(--red)' }}>-{raport.totalCostOp.toLocaleString('ro-RO')} RON</span></div>}
              {raport.dec && (
                <>
                  <div className="flex justify-between text-sm border-t pt-2" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>- Comision administrare ({raport.apt?.comision_procent || 20}%)</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(raport.dec.comision_administrator_valoare).toLocaleString('ro-RO')} RON</span></div>
                  <div className="flex justify-between mt-2 p-3 rounded-xl" style={{ background:'rgba(45,212,160,0.08)', border:'1px solid rgba(45,212,160,0.2)' }}>
                    <span className="font-bold text-sm" style={{ color:'var(--text)' }}>= Net de virat proprietarului</span>
                    <span className="font-bold text-lg font-mono" style={{ color:'var(--green)' }}>{Number(raport.dec.suma_neta_proprietar).toLocaleString('ro-RO')} RON</span>
                  </div>
                </>
              )}
              {!raport.dec && <p className="text-xs text-center pt-2" style={{ color:'var(--amber)' }}>⚠️ Generează și salvează decontul din modulul Deconturi pentru a vedea valoarea finală.</p>}
            </div>
          </Card>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
