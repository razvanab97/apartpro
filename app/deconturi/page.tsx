'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar, calculeazaDecont, LUNI, CATEGORII_LABEL } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, Card, CardHeader, CardTitle, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast } from '@/components/ui'
import { Plus, TrendingUp, FileText, Check, DollarSign, Download } from 'lucide-react'

type BadgeColor = 'green'|'amber'|'red'|'blue'|'gray'
const STATUS_COLOR: Record<string, BadgeColor> = { draft:'gray', aprobat:'amber', platit:'green' }

export default function DeconturiPage() {
  const [loading, setLoading] = useState(true)
  const [deconturi, setDeconturi] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedApt, setSelectedApt] = useState('')
  const [selectedLuna, setSelectedLuna] = useState(new Date().getMonth() + 1)
  const [selectedAn, setSelectedAn] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [viewDecont, setViewDecont] = useState<any>(null)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: dec }, { data: apt }] = await Promise.all([
      supabase.from('deconturi').select('*, apartament:apartamente(id,nume), proprietar:proprietari(id,nume,iban,banca)').order('an', { ascending: false }).order('luna', { ascending: false }),
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nume'),
    ])
    setDeconturi(dec||[])
    setApartamente(apt||[])
    setLoading(false)
  }

  async function genereazaPreview() {
    if (!selectedApt) { show('error','Selectează apartamentul'); return }
    setGenerating(true)

    const apt = apartamente.find(a => a.id === selectedApt)
    if (!apt) { setGenerating(false); return }

    const primaZi = new Date(selectedAn, selectedLuna - 1, 1)
    const ultimaZi = new Date(selectedAn, selectedLuna, 0)
    const start = primaZi.toISOString().split('T')[0]
    const end = ultimaZi.toISOString().split('T')[0]
    const zileLuna = ultimaZi.getDate()

    const [{ data: rez }, { data: ch }] = await Promise.all([
      supabase.from('rezervari').select('*').eq('apartament_id', selectedApt)
        .gte('data_checkin', start).lte('data_checkin', end)
        .in('status_rezervare', ['confirmata', 'finalizata']),
      supabase.from('cheltuieli').select('*').eq('apartament_id', selectedApt)
        .gte('data', start).lte('data', end).eq('suportat_de', 'proprietar'),
    ])

    const rezervari = rez || []
    const cheltuieli = ch || []

    const totalIncasari = rezervari.reduce((s:number,r:any) => s + Number(r.suma_incasata||0), 0)
    const totalComPlatf = rezervari.reduce((s:number,r:any) => s + Number(r.comision_platforma_valoare||0), 0)
    const totalTvaPlatf = rezervari.reduce((s:number,r:any) => s + Number(r.tva_comision_platforma||0), 0)
    const totalCosturi = cheltuieli.reduce((s:number,c:any) => s + Number(c.valoare||0), 0)
    const noptiOcupate = rezervari.reduce((s:number,r:any) => s + Number(r.nr_nopti||0), 0)

    // Recalculate using apartment formula
    let bazaComision = 0
    let comisionAdmin = 0
    let sumaProprietar = 0
    for (const r of rezervari) {
      const c = calculeazaDecont(r, apt)
      bazaComision += c.baza
      comisionAdmin += c.comision
      sumaProprietar += c.suma_proprietar
    }
    // Subtract owner-borne expenses from net
    sumaProprietar = Math.max(0, sumaProprietar - totalCosturi)

    setPreview({
      apt, rezervari, cheltuieli,
      luna: selectedLuna, an: selectedAn,
      perioada_start: start, perioada_sfarsit: end,
      totalIncasari, totalComPlatf, totalTvaPlatf, totalCosturi,
      noptiOcupate, nr_rezervari: rezervari.length,
      gradOcupare: Math.round(noptiOcupate / zileLuna * 100),
      bazaComision: Math.round(bazaComision*100)/100,
      comisionAdmin: Math.round(comisionAdmin*100)/100,
      sumaProprietar: Math.round(sumaProprietar*100)/100,
    })
    setGenerating(false)
  }

  async function salveazaDecont() {
    if (!preview) return
    setGenerating(true)
    const payload = {
      apartament_id: selectedApt,
      proprietar_id: preview.apt.proprietar_id,
      luna: preview.luna, an: preview.an,
      perioada_start: preview.perioada_start, perioada_sfarsit: preview.perioada_sfarsit,
      total_incasari: preview.totalIncasari,
      total_comisioane_platforme: preview.totalComPlatf,
      total_tva_platforme: preview.totalTvaPlatf,
      total_costuri_operationale: preview.totalCosturi,
      baza_comision_administrator: preview.bazaComision,
      comision_administrator_procent: preview.apt.comision_procent,
      comision_administrator_valoare: preview.comisionAdmin,
      suma_neta_proprietar: preview.sumaProprietar,
      nr_nopti_ocupate: preview.noptiOcupate,
      nr_rezervari: preview.nr_rezervari,
      grad_ocupare: preview.gradOcupare,
      status: 'draft',
    }
    const { error } = await supabase.from('deconturi').upsert(payload, { onConflict: 'apartament_id,luna,an' })
    if (error) { show('error', error.message) } else {
      show('success', 'Decont salvat cu succes')
      setOpen(false); setPreview(null); load()
    }
    setGenerating(false)
  }

  async function updateStatus(id: string, status: string) {
    const payload: any = { status }
    if (status === 'platit') payload.data_platii = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('deconturi').update(payload).eq('id', id)
    if (error) { show('error', error.message) } else { show('success', `Status actualizat: ${status}`); load() }
  }

  if (loading) return (<><PageHeader title="Deconturi proprietari" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Deconturi proprietari" subtitle="Calcul și gestionare deconturi lunare"
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={()=>{setPreview(null);setOpen(true)}}>Generează decont</Button>} />
      <div className="p-6">
        {deconturi.length === 0 ? (
          <EmptyState icon={<TrendingUp size={48}/>} title="Niciun decont generat"
            desc="Generează primul decont lunar pentru un proprietar"
            action={<Button variant="primary" icon={<Plus size={14}/>} onClick={()=>{setPreview(null);setOpen(true)}}>Generează decont</Button>}/>
        ) : (
          <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden">
            <table>
              <thead><tr>
                <th>Apartament</th><th>Proprietar</th><th>Perioadă</th>
                <th>Rezervări</th><th>Nopți</th><th>Ocupare</th>
                <th>Încasări</th><th>Comision admin</th><th>Net proprietar</th>
                <th>Status</th><th>Acțiuni</th>
              </tr></thead>
              <tbody>
                {deconturi.map(d => (
                  <tr key={d.id} onClick={()=>setViewDecont(d)}>
                    <td style={{ color:'var(--text)', fontWeight:500 }}>{d.apartament?.nume||'—'}</td>
                    <td>{d.proprietar?.nume||'—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{LUNI[d.luna]} {d.an}</td>
                    <td style={{ textAlign:'center' }}>{d.nr_rezervari}</td>
                    <td style={{ textAlign:'center' }}>{d.nr_nopti_ocupate}</td>
                    <td><span style={{ color: d.grad_ocupare >= 70 ? 'var(--green)' : d.grad_ocupare >= 40 ? 'var(--amber)' : 'var(--red)', fontFamily:'monospace', fontWeight:600 }}>{d.grad_ocupare}%</span></td>
                    <td style={{ fontFamily:'monospace' }}>{Number(d.total_incasari).toLocaleString('ro-RO')} RON</td>
                    <td style={{ fontFamily:'monospace', color:'var(--red)' }}>-{Number(d.comision_administrator_valoare).toLocaleString('ro-RO')} RON</td>
                    <td style={{ fontFamily:'monospace', color:'var(--green)', fontWeight:700 }}>{Number(d.suma_neta_proprietar).toLocaleString('ro-RO')} RON</td>
                    <td><Badge color={STATUS_COLOR[d.status]||'gray'}>{d.status}</Badge></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        {d.status === 'draft' && <Button variant="secondary" size="sm" onClick={()=>updateStatus(d.id,'aprobat')}>Aprobă</Button>}
                        {d.status === 'aprobat' && <Button variant="success" size="sm" icon={<Check size={12}/>} onClick={()=>updateStatus(d.id,'platit')}>Plătit</Button>}
                        <Button variant="ghost" size="sm" icon={<FileText size={12}/>} onClick={()=>setViewDecont(d)}>PDF</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generare decont modal */}
      <Modal open={open} onClose={()=>{setOpen(false);setPreview(null)}} title="Generează decont lunar" width="max-w-2xl">
        <FormRow cols={3}>
          <FormGroup>
            <label>Apartament</label>
            <select value={selectedApt} onChange={e=>setSelectedApt(e.target.value)}>
              <option value="">— Selectează —</option>
              {apartamente.map((a:any)=><option key={a.id} value={a.id}>{a.nume}</option>)}
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
        <Button variant="secondary" onClick={genereazaPreview} loading={generating} className="w-full mb-4" icon={<TrendingUp size={14}/>}>
          Calculează decontul
        </Button>

        {preview && (
          <div className="border rounded-xl p-4 space-y-3" style={{ borderColor:'var(--border)', background:'var(--bg3)' }}>
            <div className="text-sm font-semibold text-center pb-2 border-b" style={{ borderColor:'var(--border)', color:'var(--text)' }}>
              Decont {LUNI[preview.luna]} {preview.an} · {preview.apt.nume}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg" style={{ background:'var(--bg4)' }}>
                <p className="text-lg font-bold font-mono" style={{ color:'var(--text)' }}>{preview.nr_rezervari}</p>
                <p className="text-[10px]" style={{ color:'var(--text3)' }}>rezervări</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background:'var(--bg4)' }}>
                <p className="text-lg font-bold font-mono" style={{ color:'var(--text)' }}>{preview.noptiOcupate}</p>
                <p className="text-[10px]" style={{ color:'var(--text3)' }}>nopți ocupate</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background:'var(--bg4)' }}>
                <p className="text-lg font-bold font-mono" style={{ color: preview.gradOcupare >= 70?'var(--green)':preview.gradOcupare >= 40?'var(--amber)':'var(--red)' }}>{preview.gradOcupare}%</p>
                <p className="text-[10px]" style={{ color:'var(--text3)' }}>ocupare</p>
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>Total încasări brute</span><span className="font-mono font-medium" style={{ color:'var(--text)' }}>{preview.totalIncasari.toLocaleString('ro-RO')} RON</span></div>
              {preview.totalComPlatf > 0 && <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Comisioane platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{preview.totalComPlatf.toLocaleString('ro-RO')} RON</span></div>}
              {preview.totalTvaPlatf > 0 && <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- TVA platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{preview.totalTvaPlatf.toLocaleString('ro-RO')} RON</span></div>}
              {preview.totalCosturi > 0 && <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Costuri operaționale</span><span className="font-mono" style={{ color:'var(--red)' }}>-{preview.totalCosturi.toLocaleString('ro-RO')} RON</span></div>}
              <div className="flex justify-between pt-1.5 border-t" style={{ borderColor:'var(--border)' }}>
                <span style={{ color:'var(--text2)' }}>Bază comision administrator</span>
                <span className="font-mono font-semibold" style={{ color:'var(--text)' }}>{preview.bazaComision.toLocaleString('ro-RO')} RON</span>
              </div>
              <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Comision admin ({preview.apt.comision_procent}%)</span><span className="font-mono" style={{ color:'var(--red)' }}>-{preview.comisionAdmin.toLocaleString('ro-RO')} RON</span></div>
              <div className="flex justify-between p-3 rounded-xl mt-2" style={{ background:'rgba(45,212,160,0.08)', border:'1px solid rgba(45,212,160,0.2)' }}>
                <span className="font-bold" style={{ color:'var(--text)' }}>Sumă netă de virat proprietarului</span>
                <span className="font-bold text-lg font-mono" style={{ color:'var(--green)' }}>{preview.sumaProprietar.toLocaleString('ro-RO')} RON</span>
              </div>
            </div>
            <div className="flex gap-3 mt-3">
              <Button variant="primary" onClick={salveazaDecont} loading={generating} className="flex-1">Salvează decontul</Button>
              <Button variant="secondary" onClick={()=>setPreview(null)} className="flex-1">Recalculează</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View decont modal */}
      {viewDecont && (
        <Modal open={!!viewDecont} onClose={()=>setViewDecont(null)} title={`Decont ${LUNI[viewDecont.luna]} ${viewDecont.an}`} subtitle={`${viewDecont.apartament?.nume} · ${viewDecont.proprietar?.nume}`} width="max-w-lg">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Rezervări</span><span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.nr_rezervari}</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Nopți ocupate</span><span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.nr_nopti_ocupate}</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Grad ocupare</span><span className="font-mono font-bold" style={{ color: viewDecont.grad_ocupare>=70?'var(--green)':'var(--amber)' }}>{viewDecont.grad_ocupare}%</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Total încasări</span><span className="font-mono" style={{ color:'var(--text)' }}>{Number(viewDecont.total_incasari).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Comisioane platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.total_comisioane_platforme).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Costuri operaționale</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.total_costuri_operationale).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Comision admin ({viewDecont.comision_administrator_procent}%)</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.comision_administrator_valoare).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between p-3 rounded-xl mt-1" style={{ background:'rgba(45,212,160,0.08)', border:'1px solid rgba(45,212,160,0.2)' }}>
              <span className="font-bold" style={{ color:'var(--text)' }}>Net de virat proprietarului</span>
              <span className="font-bold text-xl font-mono" style={{ color:'var(--green)' }}>{Number(viewDecont.suma_neta_proprietar).toLocaleString('ro-RO')} RON</span>
            </div>
            {viewDecont.proprietar?.iban && (
              <div className="p-3 rounded-lg text-xs" style={{ background:'var(--bg3)' }}>
                <p style={{ color:'var(--text3)' }}>IBAN: <span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.proprietar.iban}</span></p>
                {viewDecont.proprietar.banca && <p style={{ color:'var(--text3)' }}>Bancă: <span style={{ color:'var(--text)' }}>{viewDecont.proprietar.banca}</span></p>}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {viewDecont.status === 'draft' && <Button variant="secondary" size="sm" onClick={()=>{updateStatus(viewDecont.id,'aprobat');setViewDecont({...viewDecont,status:'aprobat'})}}>Aprobă</Button>}
              {viewDecont.status === 'aprobat' && <Button variant="success" size="sm" icon={<Check size={12}/>} onClick={()=>{updateStatus(viewDecont.id,'platit');setViewDecont({...viewDecont,status:'platit'})}}>Marchează plătit</Button>}
              <Button variant="secondary" size="sm" icon={<Download size={12}/>} onClick={()=>show('info','Export PDF disponibil în modulul Rapoarte')}>Export PDF</Button>
            </div>
          </div>
        </Modal>
      )}

      <Toast toast={toast}/>
    </>
  )
}
