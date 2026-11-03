'use client'
import { useEffect, useState } from 'react'
import { supabase, calculeazaDecont } from '@/lib/supabase'
import { Button, Badge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConnectionError } from '@/components/ui'
import { Plus, Check, TrendingUp, FileText, Download } from 'lucide-react'

// Deconturile lunare ale proprietarilor (tabul Deconturi din Proprietari + pagina /deconturi)
const LUNI = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
type BadgeColor = 'green'|'amber'|'red'|'blue'|'gray'
const STATUS_COLOR: Record<string, BadgeColor> = { draft:'gray', aprobat:'amber', platit:'green' }
const pad = (n:number) => String(n).padStart(2,'0')
// formateaza local (YYYY-MM-DD) - .toISOString() taie ultima zi a lunii pentru fuse est de UTC (ex: Romania)
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? r2(n) : 0 }
const textRest = (rest: number, deVirat: number) => deVirat <= 0 && rest === 0 ? 'nimic de virat' : rest > 0 ? `${rest.toLocaleString('ro-RO')} RON` : rest < 0 ? `plătit în plus ${(-rest).toLocaleString('ro-RO')} RON` : 'achitat ✓'
const inputSuma = (color: string): React.CSSProperties => ({ width: 110, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color })

// Plata catre proprietar pe luna (cerut direct: „să se vadă ce am plătit pentru luna respectivă și ce a rămas de plată.
// Să putem să edităm sumele”) - in setari decont_proprietar_<apt>_<an>_<luna>, aceeasi cheie ca linia „Decont” din
// Proprietari → Plăți: { platit: integral?, suma: de virat, platitSuma: cat s-a platit, editat: suma de virat modificata
// de mana, data: ultima plata }. Daca nu exista, dar decontul salvat e marcat „platit”, se considera platit integral.
export const cheiePlata = (aptId: string, an: number, luna: number) => `decont_proprietar_${aptId}_${an}_${luna}`
export function platitDin(valoare: string | null | undefined, salvat?: { suma_neta_proprietar: any; status: string; data_platii?: string | null } | null) {
  let st: any = null; try { st = valoare ? JSON.parse(valoare) : null } catch {}
  if (st) {
    const suma = Number(st.suma) || 0
    const platit = st.platitSuma != null ? Number(st.platitSuma) || 0 : st.platit ? suma : 0
    return { platit: r2(platit), deVirat: st.editat || st.platit ? r2(suma) : null, data: st.data && platit > 0 ? String(st.data) : null, editat: !!st.editat }
  }
  if (salvat?.status === 'platit') { const s = r2(Number(salvat.suma_neta_proprietar) || 0); return { platit: s, deVirat: s, data: salvat.data_platii || null, editat: false } }
  return { platit: 0, deVirat: null, data: null, editat: false }
}
export const valoarePlata = (deVirat: number, platit: number, editat: boolean, dataVeche: string | null, azi: string, platitVechi?: number) =>
  ({ platit: deVirat > 0 && platit >= deVirat, suma: deVirat, platitSuma: platit, editat, data: platit > 0 ? (platit !== (platitVechi ?? 0) || !dataVeche ? azi : dataVeche) : null })
// statusul decontului salvat urmeaza plata: achitat integral → „platit”; altfel ramane „aprobat” daca era aprobat, sau „draft”
const stareDecont = (deVirat: number, platit: number, statusVechi: string | null) =>
  deVirat > 0 && platit >= deVirat ? { status: 'platit', data_platii: toYMD(new Date()) }
    : { status: statusVechi === 'aprobat' ? 'aprobat' : 'draft', data_platii: null }

// utilitarele Tailwind folosite aici nu se genereaza in proiect (globals.css are directivele v3, iar pachetul e v4) -
// le definim local, doar in componenta (.dcx), ca previzualizarea decontului sa arate ca un tabel aerisit, nu lipit
const DCX_CSS = `
.dcx{--border:rgba(159,215,255,0.14);--bg3:rgba(14,27,43,0.55);--bg4:rgba(159,215,255,0.06);--text:#E8F4FF;--text2:rgba(214,228,244,0.85);--text3:rgba(159,215,255,0.55);--green:#4ADE80;--amber:#FCD34D;--red:#F87171}.dcx.p-6{padding:20px 24px}.dcx .flex{display:flex}.dcx .grid{display:grid}.dcx .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.dcx .flex-wrap{flex-wrap:wrap}.dcx .flex-1{flex:1 1 0%}
.dcx .items-center{align-items:center}.dcx .justify-between{justify-content:space-between}.dcx .w-full{width:100%}
.dcx .gap-1{gap:4px}.dcx .gap-1\.5{gap:6px}.dcx .gap-2{gap:8px}.dcx .gap-3{gap:12px}
.dcx .p-2{padding:8px}.dcx .p-3{padding:12px}.dcx .p-4{padding:16px}.dcx .py-1\.5{padding-top:6px;padding-bottom:6px}.dcx .pb-2{padding-bottom:8px}.dcx .pt-1\.5{padding-top:6px}.dcx .pt-2{padding-top:8px}
.dcx .mb-4{margin-bottom:16px}.dcx .mt-1{margin-top:4px}.dcx .mt-2{margin-top:8px}.dcx .mt-3{margin-top:12px}
.dcx .space-y-1\.5>*+*{margin-top:6px}.dcx .space-y-2>*+*{margin-top:8px}.dcx .space-y-3>*+*{margin-top:12px}
.dcx .rounded-lg{border-radius:8px}.dcx .rounded-xl{border-radius:12px}.dcx .rounded-\[14px\]{border-radius:14px}.dcx .overflow-hidden{overflow:hidden}
.dcx .border{border-width:1px;border-style:solid}.dcx .border-b{border-bottom-width:1px;border-bottom-style:solid}.dcx .border-t{border-top-width:1px;border-top-style:solid}
.dcx .border,.dcx .border-b,.dcx .border-t{border-color:var(--border,rgba(159,215,255,0.15))}
.dcx .border-\[\#2a3350\]{border-color:#2a3350}.dcx .bg-\[\#161b27\]{background:#161b27}
.dcx .text-center{text-align:center}.dcx .text-sm{font-size:13.5px}.dcx .text-xs{font-size:11.5px}.dcx .text-lg{font-size:17px}.dcx .text-xl{font-size:20px}.dcx .text-\[10px\]{font-size:10px}
.dcx .font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.dcx .font-normal{font-weight:400}.dcx .font-medium{font-weight:500}.dcx .font-semibold{font-weight:600}.dcx .font-bold{font-weight:700}
.dcx p{margin:0}
`
const CHK: React.CSSProperties = { width: 15, height: 15, padding: 0, margin: 0, flexShrink: 0, accentColor: '#4DA3FF', cursor: 'pointer' }

export default function DeconturiContent() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [deconturi, setDeconturi] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  // mai multe apartamente odata (cerut direct: „să putem selecta mai multe apartamente când avem mai mulți proprietari”) -
  // un decont separat pe fiecare apartament (cheia in DB e apartament_id + luna + an), plus total de virat pe proprietar
  const [selectedApts, setSelectedApts] = useState<string[]>([])
  const [selectedLuna, setSelectedLuna] = useState(new Date().getMonth() + 1)
  const [selectedAn, setSelectedAn] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [viewDecont, setViewDecont] = useState<any>(null)
  const [plataRaw, setPlataRaw] = useState<Record<string, string>>({})  // setari decont_proprietar_* (plata pe luna)
  const [editV, setEditV] = useState<{ deVirat: string; platit: string } | null>(null)
  const [savingV, setSavingV] = useState(false)
  const plataDecont = (d: any) => { const pl = platitDin(plataRaw[cheiePlata(d.apartament_id, d.an, d.luna)], d), dv = pl.deVirat ?? r2(Number(d.suma_neta_proprietar) || 0); return { ...pl, deVirat: dv, rest: r2(dv - pl.platit) } }
  useEffect(() => { if (!viewDecont) { setEditV(null); return } const pl = plataDecont(viewDecont); setEditV({ deVirat: String(pl.deVirat), platit: String(pl.platit) }) }, [viewDecont?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  const { toast: dToast, show: dShow } = useToast()

  useEffect(() => { loadDeconturi() }, [])

  async function loadDeconturi() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{ data: dec }, { data: apt }, { data: pl }] = await Promise.all([
        supabase.from('deconturi').select('*, apartament:apartamente(id,nume), proprietar:proprietari(id,nume,iban,banca)').order('an', { ascending: false }).order('luna', { ascending: false }),
        supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nume'),
        supabase.from('setari').select('cheie,valoare').like('cheie', 'decont_proprietar_%'),
      ])
      setPlataRaw(Object.fromEntries((pl || []).map((x: any) => [x.cheie, x.valoare])))
      setDeconturi(dec||[])
      setApartamente(apt||[])
      clearTimeout(bail)
    }catch(err){console.error('[deconturi load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  async function calculeazaApt(apt: any, start: string, end: string, zileLuna: number, luna: number, an: number) {
    const [{ data: rez }, { data: ch }, { data: st }, { data: salvat }] = await Promise.all([
      supabase.from('rezervari').select('*').eq('apartament_id', apt.id)
        .gte('data_checkin', start).lte('data_checkin', end).in('status_rezervare', ['confirmata', 'finalizata']),
      supabase.from('cheltuieli').select('*').eq('apartament_id', apt.id)
        .gte('data', start).lte('data', end).eq('suportat_de', 'proprietar'),
      supabase.from('setari').select('valoare').eq('cheie', cheiePlata(apt.id, an, luna)).maybeSingle(),
      supabase.from('deconturi').select('suma_neta_proprietar,status,data_platii').eq('apartament_id', apt.id).eq('luna', luna).eq('an', an).maybeSingle(),
    ])
    const plata = platitDin(st?.valoare, salvat)
    const rezervari = rez || []
    const cheltuieli = ch || []
    const totalIncasari = rezervari.reduce((s:number,r:any) => s + Number(r.suma_incasata||0), 0)
    const totalComPlatf = rezervari.reduce((s:number,r:any) => s + Number(r.comision_platforma_valoare||0), 0)
    const totalTvaPlatf = rezervari.reduce((s:number,r:any) => s + Number(r.tva_comision_platforma||0), 0)
    const totalCosturi = cheltuieli.reduce((s:number,c:any) => s + Number(c.valoare||0), 0)
    const noptiOcupate = rezervari.reduce((s:number,r:any) => s + Number(r.nr_nopti||0), 0)
    let bazaComision = 0, comisionAdmin = 0, sumaProprietar = 0
    for (const r of rezervari) {
      const c = calculeazaDecont(r, apt)
      bazaComision += c.baza; comisionAdmin += c.comision; sumaProprietar += c.suma_proprietar
    }
    sumaProprietar = Math.round(Math.max(0, sumaProprietar - totalCosturi) * 100) / 100
    return {
      deVirat: String(plata.deVirat ?? sumaProprietar), platit: String(plata.platit), platitInitial: plata.platit, dataPlata: plata.data, editat: plata.editat, statusSalvat: salvat?.status || null,
      apt, rezervari, cheltuieli,
      totalIncasari, totalComPlatf, totalTvaPlatf, totalCosturi,
      noptiOcupate, nr_rezervari: rezervari.length,
      gradOcupare: Math.round(noptiOcupate / zileLuna * 100),
      bazaComision: Math.round(bazaComision*100)/100,
      comisionAdmin: Math.round(comisionAdmin*100)/100,
      sumaProprietar: Math.round(sumaProprietar*100)/100,
    }
  }

  async function genereazaPreview() {
    const apts = apartamente.filter((a:any) => selectedApts.includes(a.id))
    if (!apts.length) { dShow('error','Selectează cel puțin un apartament'); return }
    setGenerating(true)
    const primaZi = new Date(selectedAn, selectedLuna - 1, 1)
    const ultimaZi = new Date(selectedAn, selectedLuna, 0)
    const start = toYMD(primaZi)
    const end = toYMD(ultimaZi)
    try {
      const items = await Promise.all(apts.map((apt:any) => calculeazaApt(apt, start, end, ultimaZi.getDate(), selectedLuna, selectedAn)))
      setPreview({ items, luna: selectedLuna, an: selectedAn, perioada_start: start, perioada_sfarsit: end })
    } catch (e:any) { dShow('error', e?.message || 'Eroare la calcul') }
    setGenerating(false)
  }

  async function salveazaDecont() {
    if (!preview) return
    setGenerating(true)
    const payload = preview.items.map((it:any) => ({
      apartament_id: it.apt.id, proprietar_id: it.apt.proprietar_id,
      luna: preview.luna, an: preview.an,
      perioada_start: preview.perioada_start, perioada_sfarsit: preview.perioada_sfarsit,
      total_incasari: it.totalIncasari, total_comisioane_platforme: it.totalComPlatf,
      total_tva_platforme: it.totalTvaPlatf, total_costuri_operationale: it.totalCosturi,
      baza_comision_administrator: it.bazaComision, comision_administrator_procent: it.apt.comision_procent,
      comision_administrator_valoare: it.comisionAdmin, suma_neta_proprietar: num(it.deVirat),
      nr_nopti_ocupate: it.noptiOcupate, nr_rezervari: it.nr_rezervari,
      ...stareDecont(num(it.deVirat), num(it.platit), it.statusSalvat),
    }))
    const azi = toYMD(new Date())
    const plati = preview.items.map((it:any) => ({ cheie: cheiePlata(it.apt.id, preview.an, preview.luna), valoare: JSON.stringify(valoarePlata(num(it.deVirat), num(it.platit), it.editat || num(it.deVirat) !== it.sumaProprietar, it.dataPlata, azi, it.platitInitial)) }))
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('deconturi').upsert(payload, { onConflict: 'apartament_id,luna,an' }),
      supabase.from('setari').upsert(plati, { onConflict: 'cheie' }),
    ])
    const error = e1 || e2
    if (error) { dShow('error', error.message) } else {
      dShow('success', payload.length > 1 ? `${payload.length} deconturi salvate cu succes` : 'Decont salvat cu succes'); setOpen(false); setPreview(null); loadDeconturi()
    }
    setGenerating(false)
  }

  async function updateStatus(id: string, status: string) {
    const payload: any = { status }
    if (status === 'platit') payload.data_platii = toYMD(new Date())
    const { error } = await supabase.from('deconturi').update(payload).eq('id', id)
    const d = deconturi.find((x: any) => x.id === id)
    if (!error && d && status === 'platit') { const pl = plataDecont(d)
      await supabase.from('setari').upsert({ cheie: cheiePlata(d.apartament_id, d.an, d.luna), valoare: JSON.stringify(valoarePlata(pl.deVirat, pl.deVirat, pl.editat, pl.data, toYMD(new Date()), pl.platit)) }, { onConflict: 'cheie' }) }
    if (error) { dShow('error', error.message) } else { dShow('success', `Status: ${status}`); loadDeconturi() }
  }

  // editare sume la un decont salvat: de virat + platit (ramasul se calculeaza)
  async function salveazaSumeDecont() {
    if (!viewDecont || !editV) return
    setSavingV(true)
    const d = viewDecont, pl = plataDecont(d), dv = num(editV.deVirat), pt = num(editV.platit), st = stareDecont(dv, pt, d.status)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('deconturi').update({ suma_neta_proprietar: dv, ...st }).eq('id', d.id),
      supabase.from('setari').upsert({ cheie: cheiePlata(d.apartament_id, d.an, d.luna), valoare: JSON.stringify(valoarePlata(dv, pt, pl.editat || dv !== r2(Number(d.suma_neta_proprietar) || 0), pl.data, toYMD(new Date()), pl.platit)) }, { onConflict: 'cheie' }),
    ])
    setSavingV(false)
    const error = e1 || e2
    if (error) { dShow('error', error.message); return }
    dShow('success', 'Sumele au fost salvate'); setViewDecont({ ...d, suma_neta_proprietar: dv, ...st }); loadDeconturi()
  }

  const setItem = (id: string, patch: any) => setPreview((p: any) => p && { ...p, items: p.items.map((x: any) => x.apt.id === id ? { ...x, ...patch } : x) })

  const grupuriProprietari = (() => {
    const m = new Map<string, { cheie: string; nume: string; apts: any[] }>()
    for (const a of apartamente) { const cheie = a.proprietar_id || '_', nume = a.proprietar?.nume || 'Fără proprietar'
      if (!m.has(cheie)) m.set(cheie, { cheie, nume, apts: [] }); m.get(cheie)!.apts.push(a) }
    return [...m.values()].sort((x, y) => x.cheie === '_' ? 1 : y.cheie === '_' ? -1 : x.nume.localeCompare(y.nume, 'ro'))
  })()
  const totalPeProprietar = (items: any[]) => {
    const m = new Map<string, { nume: string; nr: number; deVirat: number; platit: number; rest: number }>()
    for (const it of items) { const k = it.apt.proprietar_id || '_'; if (!m.has(k)) m.set(k, { nume: it.apt.proprietar?.nume || 'Fără proprietar', nr: 0, deVirat: 0, platit: 0, rest: 0 })
      const t = m.get(k)!; t.nr++; t.deVirat = r2(t.deVirat + num(it.deVirat)); t.platit = r2(t.platit + num(it.platit)); t.rest = r2(t.deVirat - t.platit) }
    return [...m.values()]
  }

  if (loading) return <PageLoading/>
  if (loadError) return <ConnectionError onRetry={()=>loadDeconturi()}/>

  return (
    <div className="p-6 dcx" style={{overflowY:'auto', flex:1}}>
      <style>{DCX_CSS}</style>
      <div style={{display:'flex', justifyContent:'flex-end', marginBottom:16}}>
        <Button variant="primary" icon={<Plus size={15}/>} onClick={()=>{setPreview(null);setOpen(true)}}>Generează decont</Button>
      </div>
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
              <th>Încasări</th><th>Comision admin</th><th>Net proprietar</th><th>Plătit</th><th>Rămas</th>
              <th>Status</th><th>Acțiuni</th>
            </tr></thead>
            <tbody>
              {deconturi.map((d:any) => (
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
                  {(() => { const pl = plataDecont(d); return (<>
                    <td data-col-platit style={{ fontFamily:'monospace' }}>{pl.platit.toLocaleString('ro-RO')} RON</td>
                    <td data-col-ramas style={{ fontFamily:'monospace', fontWeight:700, color: pl.rest > 0 ? 'var(--amber)' : 'var(--green)' }}>{pl.rest > 0 ? pl.rest.toLocaleString('ro-RO') + ' RON' : '✓'}</td>
                  </>) })()}
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

      <Modal open={open} onClose={()=>{setOpen(false);setPreview(null)}} title="Generează decont lunar" width="760px">
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:6 }}>
            <label style={{ fontSize:12, color:'var(--text3)' }}>Apartamente{selectedApts.length ? ` · ${selectedApts.length} selectate` : ''}</label>
            {selectedApts.length > 0 && <button type="button" onClick={()=>{setSelectedApts([]);setPreview(null)}} style={{ fontSize:11, color:'var(--text3)', background:'none', border:'none', cursor:'pointer' }}>Golește</button>}
          </div>
          <div data-apt-picker style={{ maxHeight:240, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg3)', padding:6 }}>
            {grupuriProprietari.map(gr => {
              const ids = gr.apts.map((a:any)=>a.id), toate = ids.every(id=>selectedApts.includes(id)), unele = !toate && ids.some(id=>selectedApts.includes(id))
              return (
                <div key={gr.cheie} style={{ marginBottom:4 }}>
                  <label data-proprietar style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 6px', fontSize:11, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', color:'var(--text2)', cursor:'pointer' }}>
                    <input type="checkbox" style={CHK} checked={toate} ref={el=>{ if (el) el.indeterminate = unele }}
                      onChange={()=>{ setPreview(null); setSelectedApts(s => toate ? s.filter(id=>!ids.includes(id)) : [...new Set([...s, ...ids])]) }} />
                    {gr.nume} <span style={{ fontWeight:500, color:'var(--text3)', textTransform:'none', letterSpacing:0 }}>· {gr.apts.length} {gr.apts.length===1?'apartament':'apartamente'}</span>
                  </label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'0 6px 4px 28px' }}>
                    {gr.apts.map((a:any) => { const on = selectedApts.includes(a.id); return (
                      <label key={a.id} data-apt style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:8, fontSize:12.5, cursor:'pointer', border:`1px solid ${on?'rgba(77,163,255,0.55)':'var(--border)'}`, background:on?'rgba(77,163,255,0.12)':'transparent', color:on?'var(--text)':'var(--text2)' }}>
                        <input type="checkbox" style={CHK} checked={on} onChange={()=>{ setPreview(null); setSelectedApts(s => on ? s.filter(id=>id!==a.id) : [...s, a.id]) }} />
                        {a.nota ? <b style={{ color:'#7BC8FF', fontFamily:'monospace' }}>{a.nota}</b> : null}{a.nume}
                      </label>) })}
                  </div>
                </div>)
            })}
          </div>
        </div>
        <FormRow cols={2}>
          <FormGroup><label>Luna</label>
            <select value={selectedLuna} onChange={e=>{setSelectedLuna(parseInt(e.target.value));setPreview(null)}}>
              {LUNI.slice(1).map((l,i)=><option key={i+1} value={i+1}>{l}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Anul</label>
            <select value={selectedAn} onChange={e=>{setSelectedAn(parseInt(e.target.value));setPreview(null)}}>
              {Array.from({ length: new Date().getFullYear() - 2021 }, (_, i) => 2023 + i).map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <Button variant="secondary" onClick={genereazaPreview} loading={generating} className="w-full mb-4" icon={<TrendingUp size={14}/>}>
          Calculează decontul
        </Button>
        {preview && (
          <div className="space-y-3">
          {preview.items.map((it:any) => (
            <div key={it.apt.id} data-decont-apt className="border rounded-xl p-4 space-y-3" style={{ borderColor:'var(--border)', background:'var(--bg3)' }}>
              <div className="text-sm font-semibold text-center pb-2 border-b" style={{ borderColor:'var(--border)', color:'var(--text)' }}>
                Decont {LUNI[preview.luna]} {preview.an} · {it.apt.nume}{it.apt.proprietar?.nume ? <span style={{ fontWeight:400, color:'var(--text3)' }}> · {it.apt.proprietar.nume}</span> : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[{v:it.nr_rezervari,l:'rezervări'},{v:it.noptiOcupate,l:'nopți ocupate'},{v:`${it.gradOcupare}%`,l:'ocupare',c:it.gradOcupare>=70?'var(--green)':it.gradOcupare>=40?'var(--amber)':'var(--red)'}].map((x:any)=>(
                  <div key={x.l} className="text-center p-2 rounded-lg" style={{ background:'var(--bg4)' }}>
                    <p className="text-lg font-bold font-mono" style={{ color:x.c||'var(--text)' }}>{x.v}</p>
                    <p className="text-[10px]" style={{ color:'var(--text3)' }}>{x.l}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>Total încasări brute</span><span className="font-mono font-medium" style={{ color:'var(--text)' }}>{it.totalIncasari.toLocaleString('ro-RO')} RON</span></div>
                {it.totalComPlatf > 0 && <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Comisioane platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{it.totalComPlatf.toLocaleString('ro-RO')} RON</span></div>}
                {it.totalCosturi > 0 && <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Costuri operaționale</span><span className="font-mono" style={{ color:'var(--red)' }}>-{it.totalCosturi.toLocaleString('ro-RO')} RON</span></div>}
                <div className="flex justify-between pt-1.5 border-t" style={{ borderColor:'var(--border)' }}>
                  <span style={{ color:'var(--text2)' }}>Bază comision administrator</span>
                  <span className="font-mono font-semibold" style={{ color:'var(--text)' }}>{it.bazaComision.toLocaleString('ro-RO')} RON</span>
                </div>
                <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>- Comision admin{it.apt.comision_tip==='fara_comision'?' (fără comision)':` (${it.apt.comision_procent}%)`}</span><span className="font-mono" style={{ color:'var(--red)' }}>-{it.comisionAdmin.toLocaleString('ro-RO')} RON</span></div>
                {(() => { const dv = num(it.deVirat), pl = num(it.platit), rest = r2(dv - pl); return (
                  <div data-plata className="p-3 rounded-xl mt-2 space-y-2" style={{ background:'rgba(45,212,160,0.06)', border:'1px solid rgba(45,212,160,0.2)' }}>
                    <div className="flex justify-between items-center gap-3 flex-wrap">
                      <span className="font-bold" style={{ color:'var(--text)' }}>De virat proprietarului{dv !== it.sumaProprietar && <span className="font-normal text-xs" style={{ color:'var(--text3)' }}> · calculat {it.sumaProprietar.toLocaleString('ro-RO')}</span>}</span>
                      <span className="flex items-center gap-1.5"><input data-de-virat inputMode="decimal" value={it.deVirat} onChange={e=>setItem(it.apt.id,{deVirat:e.target.value})} style={inputSuma('var(--green)')} /><span className="text-xs" style={{ color:'var(--text3)' }}>RON</span></span>
                    </div>
                    <div className="flex justify-between items-center gap-3 flex-wrap">
                      <span style={{ color:'var(--text2)' }}>Plătit pentru {LUNI[preview.luna]} {preview.an}{it.dataPlata ? <span className="text-xs" style={{ color:'var(--text3)' }}> · ultima plată {it.dataPlata}</span> : null}</span>
                      <span className="flex items-center gap-1.5">
                        {rest > 0 && <button type="button" data-tot onClick={()=>setItem(it.apt.id,{platit:String(dv)})} className="text-xs" style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', cursor:'pointer' }}>Tot</button>}
                        <input data-platit inputMode="decimal" value={it.platit} onChange={e=>setItem(it.apt.id,{platit:e.target.value})} style={inputSuma('var(--text)')} /><span className="text-xs" style={{ color:'var(--text3)' }}>RON</span>
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t" style={{ borderColor:'rgba(45,212,160,0.2)' }}>
                      <span className="font-bold" style={{ color:'var(--text)' }}>Rămas de plată</span>
                      <span data-ramas className="font-bold text-lg font-mono" style={{ color: rest > 0 ? 'var(--amber)' : 'var(--green)' }}>{textRest(rest, dv)}</span>
                    </div>
                  </div>) })()}
              </div>
            </div>
            ))}
            {preview.items.length > 1 && (
              <div data-total-proprietari className="p-3 rounded-xl space-y-1.5" style={{ background:'rgba(45,212,160,0.08)', border:'1px solid rgba(45,212,160,0.25)' }}>
                {totalPeProprietar(preview.items).map(t => (
                  <div key={t.nume} className="text-sm">
                    <div style={{ color:'var(--text)', fontWeight:700 }}>{t.nume} <span style={{ color:'var(--text3)', fontWeight:400 }}>· {t.nr} {t.nr===1?'apartament':'apartamente'}</span></div>
                    <div className="flex justify-between gap-3 flex-wrap font-mono" style={{ color:'var(--text2)' }}>
                      <span>de virat <b style={{ color:'var(--text)' }}>{t.deVirat.toLocaleString('ro-RO')}</b></span>
                      <span>plătit <b style={{ color:'var(--text)' }}>{t.platit.toLocaleString('ro-RO')}</b></span>
                      <span>rămas <b style={{ color: t.rest > 0 ? 'var(--amber)' : 'var(--green)' }}>{textRest(t.rest, t.deVirat)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-3">
              <Button variant="primary" onClick={salveazaDecont} loading={generating} className="flex-1">{preview.items.length > 1 ? `Salvează cele ${preview.items.length} deconturi` : 'Salvează decontul'}</Button>
              <Button variant="secondary" onClick={()=>setPreview(null)} className="flex-1">Recalculează</Button>
            </div>
          </div>
        )}
      </Modal>

      {viewDecont && (
        <Modal open={!!viewDecont} onClose={()=>setViewDecont(null)} title={`Decont ${LUNI[viewDecont.luna]} ${viewDecont.an}`} subtitle={`${viewDecont.apartament?.nume} · ${viewDecont.proprietar?.nume}`} width="540px">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Rezervări</span><span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.nr_rezervari}</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Nopți ocupate</span><span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.nr_nopti_ocupate}</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Grad ocupare</span><span className="font-mono font-bold" style={{ color: viewDecont.grad_ocupare>=70?'var(--green)':'var(--amber)' }}>{viewDecont.grad_ocupare}%</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Total încasări</span><span className="font-mono" style={{ color:'var(--text)' }}>{Number(viewDecont.total_incasari).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Comisioane platforme</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.total_comisioane_platforme).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Costuri operaționale</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.total_costuri_operationale).toLocaleString('ro-RO')} RON</span></div>
            <div className="flex justify-between py-1.5 border-b" style={{ borderColor:'var(--border)' }}><span style={{ color:'var(--text3)' }}>Comision admin ({viewDecont.comision_administrator_procent}%)</span><span className="font-mono" style={{ color:'var(--red)' }}>-{Number(viewDecont.comision_administrator_valoare).toLocaleString('ro-RO')} RON</span></div>
            {editV && (() => { const dv = num(editV.deVirat), pt = num(editV.platit), rest = r2(dv - pt), pl = plataDecont(viewDecont)
              const schimbat = dv !== pl.deVirat || pt !== pl.platit
              return (
              <div data-plata-salvat className="p-3 rounded-xl mt-1 space-y-2" style={{ background:'rgba(45,212,160,0.06)', border:'1px solid rgba(45,212,160,0.2)' }}>
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <span className="font-bold" style={{ color:'var(--text)' }}>Net de virat proprietarului</span>
                  <span className="flex items-center gap-1.5"><input data-de-virat inputMode="decimal" value={editV.deVirat} onChange={e=>setEditV({ ...editV, deVirat: e.target.value })} style={inputSuma('var(--green)')} /><span className="text-xs" style={{ color:'var(--text3)' }}>RON</span></span>
                </div>
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <span style={{ color:'var(--text2)' }}>Plătit{pl.data ? <span className="text-xs" style={{ color:'var(--text3)' }}> · ultima plată {pl.data}</span> : null}</span>
                  <span className="flex items-center gap-1.5">
                    {rest > 0 && <button type="button" data-tot onClick={()=>setEditV({ ...editV, platit: String(dv) })} className="text-xs" style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', cursor:'pointer' }}>Tot</button>}
                    <input data-platit inputMode="decimal" value={editV.platit} onChange={e=>setEditV({ ...editV, platit: e.target.value })} style={inputSuma('var(--text)')} /><span className="text-xs" style={{ color:'var(--text3)' }}>RON</span>
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t" style={{ borderColor:'rgba(45,212,160,0.2)' }}>
                  <span className="font-bold" style={{ color:'var(--text)' }}>Rămas de plată</span>
                  <span data-ramas className="font-bold text-lg font-mono" style={{ color: rest > 0 ? 'var(--amber)' : 'var(--green)' }}>{textRest(rest, dv)}</span>
                </div>
                {schimbat && <Button variant="primary" size="sm" onClick={salveazaSumeDecont} loading={savingV} className="w-full">Salvează sumele</Button>}
              </div>) })()}
            {viewDecont.proprietar?.iban && (
              <div className="p-3 rounded-lg text-xs" style={{ background:'var(--bg3)' }}>
                <p style={{ color:'var(--text3)' }}>IBAN: <span className="font-mono" style={{ color:'var(--text)' }}>{viewDecont.proprietar.iban}</span></p>
                {viewDecont.proprietar.banca && <p style={{ color:'var(--text3)' }}>Bancă: <span style={{ color:'var(--text)' }}>{viewDecont.proprietar.banca}</span></p>}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {viewDecont.status === 'draft' && <Button variant="secondary" size="sm" onClick={()=>{updateStatus(viewDecont.id,'aprobat');setViewDecont({...viewDecont,status:'aprobat'})}}>Aprobă</Button>}
              {viewDecont.status === 'aprobat' && <Button variant="success" size="sm" icon={<Check size={12}/>} onClick={()=>{updateStatus(viewDecont.id,'platit');setViewDecont({...viewDecont,status:'platit'})}}>Marchează plătit</Button>}
              <Button variant="secondary" size="sm" icon={<Download size={12}/>} onClick={()=>dShow('info','Export PDF disponibil în modulul Rapoarte')}>Export PDF</Button>
            </div>
          </div>
        </Modal>
      )}
      <Toast toast={dToast}/>
    </div>
  )
}
