'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { incarcaNealocate, alocaNealocata, type Nealocata } from '@/lib/syncFivestar'

// Calendar → "Nealocate": rezervarile active din 5starDesk fara camera atribuita acolo (lista lor de
// "Rezervari nealocate"), aduse live, cu apartamentele libere pe datele fiecareia si alocare dintr-un click.
// Pana le aloci nu apar in grila si nu se numara la incasari/ocupare; dupa alocare apar normal.
type Apt = { id: string; nota?: string|null; nume: string }

const fmtZi = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'][m-1]}${y !== new Date().getFullYear() ? ' ' + y : ''}` }
const nopti = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

export default function NealocatePanel({ apts, onAlocat }: { apts: Apt[]; onAlocat: () => void }) {
  const [lista, setLista] = useState<Nealocata[]>([])
  const [ocupate, setOcupate] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eroare, setEroare] = useState<string|null>(null)
  const [deschis, setDeschis] = useState(false)
  const [alegere, setAlegere] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string|null>(null)
  const [mesaj, setMesaj] = useState<string|null>(null)

  async function load() {
    setLoading(true); setEroare(null)
    try {
      const l = await incarcaNealocate()
      setLista(l)
      if (l.length) {
        const min = l.reduce((m, x) => x.checkin < m ? x.checkin : m, l[0].checkin)
        const max = l.reduce((m, x) => x.checkout > m ? x.checkout : m, l[0].checkout)
        const { data } = await supabase.from('rezervari').select('id,apartament_id,data_checkin,data_checkout,camera_semnalata')
          .neq('status_rezervare', 'anulata').lt('data_checkin', max).gt('data_checkout', min).limit(2000)
        setOcupate(data || [])
      }
    } catch (e: any) { setEroare('Nu am putut citi rezervările nealocate din 5starDesk' + (e?.message ? ` (${e.message})` : '')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const liber = (n: Nealocata, aptId: string) => !ocupate.some(r =>
    r.apartament_id === aptId && r.id !== n.rid && r.camera_semnalata !== 'NEALOCAT' && r.data_checkin < n.checkout && r.data_checkout > n.checkin)
  const eticheta = (a: Apt) => a.nota ? `${a.nota} · ${a.nume}` : a.nume

  async function aloca(n: Nealocata) {
    const aptId = alegere[n.id5sd]
    if (!aptId) return
    setBusy(n.id5sd); setMesaj(null)
    const err = await alocaNealocata(n, aptId)
    setBusy(null)
    if (err) { setMesaj(`Eroare la ${n.nume}: ${err}`); return }
    const a = apts.find(x => x.id === aptId)
    setMesaj(`✓ ${n.nume} alocată pe ${a?.nota || a?.nume}. Alocă-o și în 5starDesk („Alocă o cameră”), ca să rămână la fel și acolo.`)
    setAlegere(x => { const c = { ...x }; delete c[n.id5sd]; return c })
    await load(); onAlocat()
  }

  const nealocateLaNoi = lista.filter(n => !n.alocataManual).length
  if (!loading && !eroare && !lista.length) return null
  const sel: React.CSSProperties = { background:'rgba(20,38,65,0.9)', border:'1px solid rgba(100,160,255,0.25)', borderRadius:7, color:'rgba(214,228,244,0.9)', fontSize:12, padding:'5px 8px', outline:'none', width:230, flexShrink:0 }

  return (
    <div style={{ borderBottom:'1px solid rgba(252,211,77,0.2)', background:'rgba(252,211,77,0.04)', flexShrink:0 }}>
      <button onClick={() => setDeschis(d => !d)}
        style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 20px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' as const }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#FCD34D' }}>📥 Nealocate în 5starDesk</span>
        {loading ? <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>se încarcă…</span> : <>
          <span style={{ fontSize:11, fontWeight:700, color: nealocateLaNoi ? '#F87171' : '#4ADE80', background: nealocateLaNoi ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.1)', padding:'1px 8px', borderRadius:10 }}>
            {nealocateLaNoi ? `${nealocateLaNoi} de alocat` : 'toate alocate la noi'}
          </span>
          {lista.length - nealocateLaNoi > 0 && <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>{lista.length - nealocateLaNoi} alocate doar în aplicație</span>}
        </>}
        <span style={{ marginLeft:'auto', fontSize:11, color:'rgba(159,215,255,0.45)' }}>{deschis ? '▲ ascunde' : '▼ arată'}</span>
      </button>
      {deschis && (
        <div style={{ padding:'0 20px 12px', maxHeight:340, overflowY:'auto' as const }}>
          <div style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginBottom:8 }}>
            Rezervări active în 5starDesk fără cameră atribuită acolo. Până le aloci nu apar în calendar și nu se numără la încasări. Alocarea de aici nu ajunge în 5starDesk — acolo apasă tot „Alocă o cameră”; după asta sincronizarea le aliniază singură.
          </div>
          {eroare && <div style={{ fontSize:12, color:'#F87171', marginBottom:8 }}>{eroare} <button onClick={load} style={{ marginLeft:6, fontSize:11, background:'none', border:'1px solid rgba(248,113,113,0.4)', color:'#F87171', borderRadius:5, cursor:'pointer' }}>Reîncearcă</button></div>}
          {mesaj && <div style={{ fontSize:12, color: mesaj.startsWith('✓') ? '#4ADE80' : '#F87171', marginBottom:8 }}>{mesaj}</div>}
          <div style={{ display:'flex', flexDirection:'column' as const, gap:6 }}>
            {lista.map(n => {
              const libere = apts.filter(a => liber(n, a.id))
              const aptAlocat = n.aptId ? apts.find(a => a.id === n.aptId) : null
              return (
                <div key={n.id5sd} style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const, padding:'7px 10px', borderRadius:8, background:'rgba(14,27,43,0.6)', border:`1px solid ${n.alocataManual ? 'rgba(74,222,128,0.2)' : 'rgba(252,211,77,0.18)'}` }}>
                  <div style={{ minWidth:200, flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#E8F4FF' }}>{n.nume}</div>
                    <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>
                      {fmtZi(n.checkin)} → {fmtZi(n.checkout)} · {nopti(n.checkin, n.checkout)}n · <b style={{ color:'#4ADE80' }}>{Math.round(n.pret).toLocaleString('ro-RO')} RON</b> · {n.sursa} · ID {n.id5sd}
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, color: n.alocataManual ? '#4ADE80' : 'rgba(252,211,77,0.85)' }}>
                    {n.alocataManual ? `✓ la noi pe ${aptAlocat?.nota || aptAlocat?.nume || '?'}` : n.rid ? 'la noi, nealocată' : 'neimportată'}
                  </span>
                  <select value={alegere[n.id5sd] || ''} onChange={e => setAlegere(x => ({ ...x, [n.id5sd]: e.target.value }))} style={sel}>
                    <option value="">{libere.length ? `— alege (${libere.length} libere) —` : '— niciun apartament liber —'}</option>
                    {libere.filter(a => a.id !== n.aptId).map(a => <option key={a.id} value={a.id}>{eticheta(a)}</option>)}
                  </select>
                  <button onClick={() => aloca(n)} disabled={!alegere[n.id5sd] || busy === n.id5sd}
                    style={{ padding:'6px 12px', borderRadius:7, border:'none', background: alegere[n.id5sd] ? '#4ADE80' : 'rgba(74,222,128,0.15)', color: alegere[n.id5sd] ? '#062012' : 'rgba(74,222,128,0.5)', fontSize:11, fontWeight:700, cursor: alegere[n.id5sd] ? 'pointer' : 'default' }}>
                    {busy === n.id5sd ? 'Se alocă…' : n.alocataManual ? 'Mută' : 'Alocă'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
