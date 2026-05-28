'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast, Alert } from '@/components/ui'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, X } from 'lucide-react'
import * as XLSX from 'xlsx'

type ParsedRow = {
  nume_client: string
  nr_persoane: number
  data_checkin: string
  data_checkout: string
  nr_nopti: number
  camera: string
  tip_camera: string
  suma_incasata: number
  valoare_bruta: number
  status_rezervare: string
  canal: string
  observatii: string
  valid: boolean
  eroare?: string
}

function parseDate(dateStr: string): string {
  if (!dateStr) return ''
  // Format: "01 May 2026" -> "2026-05-01"
  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  }
  const parts = dateStr.trim().split(' ')
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0')
    const month = months[parts[1]] || '01'
    const year = parts[2]
    return `${year}-${month}-${day}`
  }
  return dateStr
}

function parseCanal(sursa: string): string {
  const s = (sursa || '').toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  if (s.includes('travelminit')) return 'direct'
  if (s.includes('5stardesk')) return 'direct'
  return 'direct'
}

function parseStatus(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('anulat')) return 'anulata'
  if (s.includes('cazat') || s.includes('decazat')) return 'finalizata'
  if (s.includes('noua')) return 'confirmata'
  return 'confirmata'
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0
  return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState(0)
  const [done, setDone] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.06)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(159,215,255,0.12)',
    borderRadius: 14,
  }

  function handleFile(f: File) {
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = e.target?.result
      const wb = XLSX.read(data, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      
      const parsed: ParsedRow[] = []
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i]
        if (!row || !row[0]) continue
        
        const numeRaw = String(row[0] || '').trim()
        const checkin = parseDate(String(row[3] || ''))
        const checkout = parseDate(String(row[4] || ''))
        const pret = parsePrice(String(row[9] || ''))
        const sold = parsePrice(String(row[10] || ''))
        
        const valid = !!numeRaw && !!checkin && !!checkout && checkin < checkout
        
        parsed.push({
          nume_client: numeRaw,
          nr_persoane: parseInt(String(row[1] || '1')) + parseInt(String(row[2] || '0')),
          data_checkin: checkin,
          data_checkout: checkout,
          nr_nopti: parseInt(String(row[5] || '1')) || 1,
          tip_camera: String(row[6] || '').trim(),
          camera: String(row[7] || '').trim(),
          valoare_bruta: pret,
          suma_incasata: sold,
          status_rezervare: parseStatus(String(row[11] || '')),
          canal: parseCanal(String(row[12] || '')),
          observatii: String(row[13] || '').trim(),
          valid,
          eroare: !valid ? 'Date incomplete' : undefined,
        })
      }
      
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsBinaryString(f)
  }

  async function doImport() {
    setImporting(true)
    let ok = 0, err = 0
    
    // Get apartments to try to match
    const { data: apartamente } = await supabase.from('apartamente').select('id, nume')
    
    for (const row of rows.filter(r => r.valid)) {
      // Try to match apartment by camera/tip_camera name
      let apartament_id = null
      if (apartamente && row.camera) {
        const match = apartamente.find((a: any) => 
          a.nume.toLowerCase().includes(row.camera.toLowerCase()) ||
          row.camera.toLowerCase().includes(a.nume.toLowerCase().split(' ')[0])
        )
        if (match) apartament_id = match.id
      }

      const { error } = await supabase.from('rezervari').insert({
        apartament_id,
        canal: row.canal,
        nume_client: row.nume_client,
        data_checkin: row.data_checkin,
        data_checkout: row.data_checkout,
        nr_persoane: row.nr_persoane || 1,
        valoare_bruta: row.valoare_bruta,
        suma_incasata: row.suma_incasata,
        moneda: 'RON',
        status_plata: row.suma_incasata > 0 ? 'achitat' : 'neplatit',
        status_rezervare: row.status_rezervare,
        status_decont: 'nedecontat',
        observatii: [row.tip_camera, row.camera, row.observatii].filter(Boolean).join(' | ') || null,
      })
      
      if (error) { err++ } else { ok++ }
    }
    
    setImported(ok)
    setErrors(err)
    setImporting(false)
    setDone(true)
    setStep('done')
  }

  const validCount = rows.filter(r => r.valid).length
  const invalidCount = rows.filter(r => !r.valid).length

  return (
    <>
      <PageHeader
        title="Import rezervări din Excel"
        subtitle="Import din 5starDesk, Booking, Airbnb"
      />
      <div style={{ padding: '20px 24px', maxWidth: 900 }}>
        
        {step === 'upload' && (
          <div style={{ ...panel, padding: 40, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'rgba(77,163,255,0.12)', border: '1px solid rgba(159,215,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSpreadsheet size={28} color="#4DA3FF" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF', marginBottom: 8 }}>
              Importă rezervări din 5starDesk
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)', marginBottom: 28, maxWidth: 420, margin: '0 auto 28px' }}>
              Exportă rezervările din 5starDesk ca Excel, apoi încarcă fișierul aici. 
              Toate rezervările vor fi importate automat în ApartPro.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              variant="primary"
              size="lg"
              icon={<Upload size={16} />}
              onClick={() => inputRef.current?.click()}
            >
              Selectează fișier Excel
            </Button>
            <p style={{ fontSize: 11, color: 'rgba(159,215,255,0.3)', marginTop: 16 }}>
              Formate acceptate: .xlsx, .xls
            </p>
          </div>
        )}

        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Summary */}
            <div style={{ ...panel, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <FileSpreadsheet size={20} color="#4DA3FF" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{file?.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>{rows.length} rânduri detectate</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>{validCount}</div>
                  <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>valide</div>
                </div>
                {invalidCount > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#F87171', fontFamily: 'monospace' }}>{invalidCount}</div>
                    <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>invalide</div>
                  </div>
                )}
                <Button variant="primary" icon={<ArrowRight size={15} />} onClick={doImport} loading={importing}>
                  Importă {validCount} rezervări
                </Button>
                <Button variant="ghost" icon={<X size={14} />} onClick={() => { setStep('upload'); setRows([]); setFile(null) }} />
              </div>
            </div>

            {/* Preview table */}
            <div style={{ ...panel, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'rgba(14,27,43,0.9)' }}>
                    <tr>
                      {['', 'Client', 'Check-in', 'Check-out', 'Nopți', 'Camera', 'Sumă', 'Canal', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(159,215,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, i) => (
                      <tr key={i} style={{ opacity: row.valid ? 1 : 0.4 }}>
                        <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                          {row.valid
                            ? <CheckCircle2 size={14} color="#4ADE80" />
                            : <AlertCircle size={14} color="#F87171" />}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: '#FFFFFF', borderBottom: '1px solid rgba(159,215,255,0.04)', whiteSpace: 'nowrap' }}>{row.nume_client}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(159,215,255,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace' }}>{row.data_checkin}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(159,215,255,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace' }}>{row.data_checkout}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(214,228,244,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', textAlign: 'center' }}>{row.nr_nopti}</td>
                        <td style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(159,215,255,0.5)', borderBottom: '1px solid rgba(159,215,255,0.04)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.camera}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#4ADE80', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.suma_incasata.toLocaleString('ro-RO')} RON</td>
                        <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                            fontSize: 10, fontWeight: 600, fontFamily: 'monospace',
                            background: row.canal === 'airbnb' ? 'rgba(239,68,68,0.14)' : row.canal === 'booking' ? 'rgba(77,163,255,0.14)' : 'rgba(34,197,94,0.14)',
                            color: row.canal === 'airbnb' ? '#F87171' : row.canal === 'booking' ? '#7BC8FF' : '#4ADE80',
                            border: row.canal === 'airbnb' ? '1px solid rgba(239,68,68,0.2)' : row.canal === 'booking' ? '1px solid rgba(77,163,255,0.2)' : '1px solid rgba(34,197,94,0.2)',
                          }}>{row.canal}</span>
                        </td>
                        <td style={{ padding: '8px 14px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500,
                            background: row.status_rezervare === 'anulata' ? 'rgba(239,68,68,0.12)' : row.status_rezervare === 'finalizata' ? 'rgba(34,197,94,0.12)' : 'rgba(77,163,255,0.12)',
                            color: row.status_rezervare === 'anulata' ? '#F87171' : row.status_rezervare === 'finalizata' ? '#4ADE80' : '#7BC8FF',
                          }}>{row.status_rezervare}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: 'rgba(159,215,255,0.35)' }}>
                    + {rows.length - 50} rânduri ascunse — vor fi importate toate
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ ...panel, padding: 48, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={32} color="#4ADE80" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Import finalizat!</h2>
            <p style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)', marginBottom: 24 }}>
              {imported} rezervări importate cu succes{errors > 0 ? `, ${errors} erori` : ''}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => window.location.href = '/rezervari'}>
                Vezi rezervările
              </Button>
              <Button variant="secondary" onClick={() => { setStep('upload'); setRows([]); setFile(null); setDone(false) }}>
                Import nou
              </Button>
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}
