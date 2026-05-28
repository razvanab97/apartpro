'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, X, Building2, Link } from 'lucide-react'
import * as XLSX from 'xlsx'

type ParsedRow = {
  nume_client: string
  nr_persoane: number
  data_checkin: string
  data_checkout: string
  nr_nopti: number
  camera: string        // din Excel coloana Camera
  tip_camera: string    // din Excel coloana Tip camera
  suma_incasata: number
  valoare_bruta: number
  status_rezervare: string
  canal: string
  observatii: string
  valid: boolean
  eroare?: string
  // matched apartment
  apartament_id?: string
  apartament_nume?: string
  apartament_match?: 'exact' | 'partial' | 'none'
}

type Apartament = { id: string; nume: string; nota: string | null }

function parseDate(dateStr: string): string {
  if (!dateStr) return ''
  const months: Record<string, string> = {
    'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
    'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'
  }
  const parts = dateStr.trim().split(' ')
  if (parts.length === 3) {
    return `${parts[2]}-${months[parts[1]] || '01'}-${parts[0].padStart(2,'0')}`
  }
  return dateStr
}

function parseCanal(sursa: string): string {
  const s = (sursa || '').toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking')) return 'booking'
  return 'direct'
}

function parseStatus(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('anulat')) return 'anulata'
  if (s.includes('cazat') || s.includes('decazat')) return 'finalizata'
  return 'confirmata'
}

function parsePrice(priceStr: string): number {
  return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0
}

// Match apartment from Excel camera/tip_camera against DB apartments
function matchApartament(camera: string, tipCamera: string, apartamente: Apartament[]): { id?: string; nume?: string; match: 'exact' | 'partial' | 'none' } {
  if (!camera && !tipCamera) return { match: 'none' }
  
  const camLower = (camera || '').toLowerCase().trim()
  const tipLower = (tipCamera || '').toLowerCase().trim()

  // 1. Try exact match on code (nota field) — e.g. "L99", "HD02"
  // Excel column "Camera" often contains the code
  for (const apt of apartamente) {
    if (apt.nota && camLower === apt.nota.toLowerCase()) {
      return { id: apt.id, nume: apt.nume, match: 'exact' }
    }
  }

  // 2. Try exact match on name
  for (const apt of apartamente) {
    if (apt.nume.toLowerCase() === camLower || apt.nume.toLowerCase() === tipLower) {
      return { id: apt.id, nume: apt.nume, match: 'exact' }
    }
  }

  // 3. Partial match — camera contains part of apartment name or vice versa
  for (const apt of apartamente) {
    const aptLower = apt.nume.toLowerCase()
    // Check if camera name is contained in apt name or vice versa
    const camWords = camLower.split(/[\s-_]+/).filter(w => w.length > 2)
    const matched = camWords.some(w => aptLower.includes(w)) ||
                    tipLower.split(/[\s-_]+/).filter(w => w.length > 2).some(w => aptLower.includes(w))
    if (matched) {
      return { id: apt.id, nume: apt.nume, match: 'partial' }
    }
  }

  // 4. Fuzzy match on code — e.g. "ComfyLazar" -> "L83" / "Lazar Comfy"
  const knownMappings: Record<string, string> = {
    'comfylazar': 'Lazar Comfy',
    'skynest': 'Palas SkyNest',
    'hideout': 'Hideout Rozelor',
    'airy': 'Airy Palas',
    'skyview': 'Sky View Royal',
    'newton': 'Newton Urban',
    'oasis': 'Urban Oasis',
    'mint': 'Mint Loft Copou',
    'retreat': 'Palas Retreat',
    'green': 'Green Station',
    'cozy': 'Cozy Studio',
    'vila': 'Vila Păcurari',
    'comfy': 'Comfy & Chic Apartment',
    'copou': 'Peaceful Copou Retreat',
    'cherry': 'Cherry by AB Homes',
    'skyport': 'SkyPort',
    'lazar': 'Lazar Comfy',
    'peaceful': 'Peaceful Copou Retreat',
  }
  
  for (const [key, aptName] of Object.entries(knownMappings)) {
    if (camLower.includes(key) || tipLower.includes(key)) {
      const apt = apartamente.find(a => a.nume.toLowerCase() === aptName.toLowerCase())
      if (apt) return { id: apt.id, nume: apt.nume, match: 'partial' }
    }
  }

  return { match: 'none' }
}

const matchColor = {
  exact: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)', color: '#4ADE80', label: '✓ Exact' },
  partial: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', color: '#FCD34D', label: '~ Parțial' },
  none: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', color: '#F87171', label: '✗ Negăsit' },
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState(0)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.06)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(159,215,255,0.12)', borderRadius: 14,
  }

  async function handleFile(f: File) {
    setFile(f)
    // Load apartments first
    const { data: apts } = await supabase.from('apartamente').select('id, nume, nota')
    const aptList = (apts || []) as Apartament[]
    setApartamente(aptList)

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
        const camera = String(row[7] || '').trim()
        const tipCamera = String(row[6] || '').trim()

        const valid = !!numeRaw && !!checkin && !!checkout && checkin < checkout

        // Match apartment
        const aptMatch = matchApartament(camera, tipCamera, aptList)

        parsed.push({
          nume_client: numeRaw,
          nr_persoane: parseInt(String(row[1] || '1')) + parseInt(String(row[2] || '0')),
          data_checkin: checkin,
          data_checkout: checkout,
          nr_nopti: parseInt(String(row[5] || '1')) || 1,
          tip_camera: tipCamera,
          camera: camera,
          valoare_bruta: pret,
          suma_incasata: sold,
          status_rezervare: parseStatus(String(row[11] || '')),
          canal: parseCanal(String(row[12] || '')),
          observatii: String(row[13] || '').trim(),
          valid,
          apartament_id: aptMatch.id,
          apartament_nume: aptMatch.nume,
          apartament_match: aptMatch.match,
        })
      }

      setRows(parsed)
      setStep('preview')
    }
    reader.readAsBinaryString(f)
  }

  function updateRowApt(idx: number, aptId: string) {
    const apt = apartamente.find(a => a.id === aptId)
    setRows(prev => prev.map((r, i) => i === idx ? {
      ...r,
      apartament_id: aptId,
      apartament_nume: apt?.nume,
      apartament_match: 'exact' as const,
    } : r))
  }

  async function doImport() {
    setImporting(true)
    let ok = 0, err = 0

    for (const row of rows.filter(r => r.valid)) {
      const { error } = await supabase.from('rezervari').insert({
        apartament_id: row.apartament_id || null,
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

    setImported(ok); setErrors(err); setImporting(false); setStep('done')
  }

  const validCount = rows.filter(r => r.valid).length
  const exactMatch = rows.filter(r => r.apartament_match === 'exact').length
  const partialMatch = rows.filter(r => r.apartament_match === 'partial').length
  const noMatch = rows.filter(r => r.valid && r.apartament_match === 'none').length

  return (
    <>
      <PageHeader title="Import rezervări" subtitle="Import din 5starDesk Excel" />
      <div style={{ padding: '20px 24px', maxWidth: 1100 }}>

        {step === 'upload' && (
          <div style={{ ...panel, padding: 48, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', background: 'rgba(77,163,255,0.12)', border: '1px solid rgba(159,215,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet size={28} color="#4DA3FF" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF', marginBottom: 8 }}>Importă rezervări din 5starDesk</h2>
            <p style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)', marginBottom: 28, maxWidth: 420, margin: '0 auto 28px' }}>
              Exportă rezervările din 5starDesk ca Excel și încarcă-le aici. Rezervările vor fi asociate automat cu apartamentele din ERP pe baza codului sau numelui camerei.
            </p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button variant="primary" size="lg" icon={<Upload size={16}/>} onClick={() => inputRef.current?.click()}>
              Selectează fișier Excel
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Summary bar */}
            <div style={{ ...panel, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <FileSpreadsheet size={20} color="#4DA3FF" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{file?.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>{rows.length} rânduri · {validCount} valide</div>
                </div>
              </div>
              {/* Match stats */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ ...matchColor.exact, background: matchColor.exact.bg, border: `1px solid ${matchColor.exact.border}`, borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: matchColor.exact.color, fontFamily: 'monospace' }}>{exactMatch}</div>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>asociate exact</div>
                </div>
                <div style={{ ...matchColor.partial, background: matchColor.partial.bg, border: `1px solid ${matchColor.partial.border}`, borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: matchColor.partial.color, fontFamily: 'monospace' }}>{partialMatch}</div>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>asociate parțial</div>
                </div>
                {noMatch > 0 && (
                  <div style={{ background: matchColor.none.bg, border: `1px solid ${matchColor.none.border}`, borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: matchColor.none.color, fontFamily: 'monospace' }}>{noMatch}</div>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>neasociate</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" icon={<ArrowRight size={15}/>} onClick={doImport} loading={importing}>
                  Importă {validCount} rezervări
                </Button>
                <Button variant="ghost" icon={<X size={14}/>} onClick={() => { setStep('upload'); setRows([]); setFile(null) }} />
              </div>
            </div>

            {/* Table */}
            <div style={{ ...panel, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 24 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 45 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 80 }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, background: 'rgba(14,27,43,0.95)', zIndex: 1 }}>
                    <tr>
                      {['', 'Client', 'Apartament', 'Check-in', 'Check-out', 'N', 'Sumă', 'Canal', 'Status'].map(h => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(159,215,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((row, i) => {
                      const mc = matchColor[row.apartament_match || 'none']
                      return (
                        <tr key={i} style={{ opacity: row.valid ? 1 : 0.35 }}>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                            {row.valid ? <CheckCircle2 size={13} color="#4ADE80"/> : <AlertCircle size={13} color="#F87171"/>}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500, color: '#FFFFFF', borderBottom: '1px solid rgba(159,215,255,0.04)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.nume_client}
                          </td>
                          {/* Apartment column with selector */}
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: mc.bg, color: mc.color, border: `1px solid ${mc.border}`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                {mc.label}
                              </span>
                              <select
                                value={row.apartament_id || ''}
                                onChange={e => updateRowApt(i, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 5, color: row.apartament_id ? '#FFFFFF' : 'rgba(159,215,255,0.4)', flex: 1, minWidth: 0 }}
                              >
                                <option value="">— {row.camera || 'Neselectat'} —</option>
                                {apartamente.map(a => (
                                  <option key={a.id} value={a.id}>
                                    {a.nota ? `[${a.nota}] ` : ''}{a.nume}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'rgba(159,215,255,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.data_checkin}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: 'rgba(159,215,255,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.data_checkout}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(214,228,244,0.6)', borderBottom: '1px solid rgba(159,215,255,0.04)', textAlign: 'center' }}>{row.nr_nopti}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600, color: '#4ADE80', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.suma_incasata.toLocaleString('ro-RO')}</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'monospace',
                              background: row.canal==='airbnb'?'rgba(239,68,68,0.14)':row.canal==='booking'?'rgba(77,163,255,0.14)':'rgba(34,197,94,0.14)',
                              color: row.canal==='airbnb'?'#F87171':row.canal==='booking'?'#7BC8FF':'#4ADE80' }}>
                              {row.canal}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                              background: row.status_rezervare==='anulata'?'rgba(239,68,68,0.12)':row.status_rezervare==='finalizata'?'rgba(34,197,94,0.12)':'rgba(77,163,255,0.12)',
                              color: row.status_rezervare==='anulata'?'#F87171':row.status_rezervare==='finalizata'?'#4ADE80':'#7BC8FF' }}>
                              {row.status_rezervare}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: 'rgba(159,215,255,0.35)' }}>
                    + {rows.length - 100} rânduri suplimentare — toate vor fi importate
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ ...panel, padding: 48, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} color="#4ADE80" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Import finalizat!</h2>
            <p style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)', marginBottom: 24 }}>
              {imported} rezervări importate{errors > 0 ? `, ${errors} erori` : ''}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => window.location.href = '/rezervari'}>Vezi rezervările</Button>
              <Button variant="secondary" onClick={() => { setStep('upload'); setRows([]); setFile(null) }}>Import nou</Button>
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}
