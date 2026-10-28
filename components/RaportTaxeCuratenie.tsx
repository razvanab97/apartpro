'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { citesteTaxe, salveazaTaxe, curateniiTaxate, stergeCuratenieGata, cheieCuratenie, TaxeCfg, CurateniaTaxata } from '@/lib/taxeCuratenie'

// Raport separat de curatenie (cerut direct): curateniile finalizate taxate proprietarului, pe luna si pe
// apartament, cu tariful editabil (implicit 75 RON la Cherry 3), suma modificabila pe o singura curatenie
// si buton de stergere. Totalul ajunge automat in Rapoarte → Calculator decontat → Curățenie.

const LUNI = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie']
const lunaAcum = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` }
const lunaVecina = (l: string, d: number) => { const [a, m] = l.split('-').map(Number); const x = new Date(a, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
const lunaText = (l: string) => { const [a, m] = l.split('-').map(Number); return `${LUNI[m - 1]} ${a}` }
const fmt = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const ziText = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' })

export default function RaportTaxeCuratenie() {
  const [luna, setLuna] = useState(lunaAcum)
  const [cfg, setCfg] = useState<TaxeCfg | null>(null)
  const [apts, setApts] = useState<{ id: string; nota: string | null; nume: string }[]>([])
  const [rows, setRows] = useState<CurateniaTaxata[] | null>(null)
  const [aptNou, setAptNou] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [copiat, setCopiat] = useState<string | null>(null)

  useEffect(() => {
    citesteTaxe().then(setCfg)
    supabase.from('apartamente').select('id,nota,nume').order('nume').then(({ data }) => setApts((data || []) as any))
  }, [])

  async function incarca(c = cfg) {
    if (!c) return
    setRows(null)
    const [a, m] = luna.split('-').map(Number)
    const end = `${luna}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
    setRows(await curateniiTaxate(`${luna}-01`, end, c))
  }
  useEffect(() => { incarca() }, [luna, cfg])

  async function salveaza(c: TaxeCfg) {
    setCfg(c)
    const e = await salveazaTaxe(c)
    setMesaj(e ? 'Eroare: ' + e : 'Salvat ✓'); setTimeout(() => setMesaj(''), 1800)
  }
  const setApt = (id: string, p: Partial<TaxeCfg['apt'][string]>) => cfg && salveaza({ ...cfg, apt: { ...cfg.apt, [id]: { ...cfg.apt[id], ...p } } })

  async function sterge(r: CurateniaTaxata) {
    const apt = apts.find(a => a.id === r.apartament_id)
    if (!window.confirm(`Ștergi curățenia finalizată din ${ziText(r.data)} (${apt?.nume || ''})? Nu se mai scad ${fmt(r.suma)} RON proprietarului.`)) return
    const e = await stergeCuratenieGata(r.apartament_id, r.data)
    if (e) { setMesaj('Eroare: ' + e); return }
    setRows(v => (v || []).filter(x => !(x.apartament_id === r.apartament_id && x.data === r.data)))
  }

  function setSuma(r: CurateniaTaxata, val: string) {
    if (!cfg) return
    const k = cheieCuratenie(r.apartament_id, r.data), supr = { ...cfg.suprascrieri }
    if (val === '' || Number(val) === Number(cfg.apt[r.apartament_id]?.tarif)) delete supr[k]; else supr[k] = Number(val)
    salveaza({ ...cfg, suprascrieri: supr })
  }

  const grupuri = useMemo(() => {
    if (!cfg || !rows) return []
    return Object.keys(cfg.apt).map(id => ({ id, apt: apts.find(a => a.id === id), t: cfg.apt[id], rows: rows.filter(r => r.apartament_id === id) }))
      .sort((x, y) => Number(y.t.activ) - Number(x.t.activ) || (x.apt?.nume || '').localeCompare(y.apt?.nume || ''))
  }, [cfg, rows, apts])

  function textProprietar(g: typeof grupuri[number]) {
    const total = g.rows.reduce((s, r) => s + r.suma, 0)
    return `Curățenie ${g.apt?.nume?.trim() || ''} — ${lunaText(luna)}\n` + g.rows.map(r => `• ${ziText(r.data)}: ${fmt(r.suma)} RON`).join('\n') + `\nTotal: ${g.rows.length} curățenii = ${fmt(total)} RON`
  }

  const inp: React.CSSProperties = { background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(100,160,255,0.2)', borderRadius: 8, color: '#E8F4FF', fontSize: 13, padding: '7px 9px', outline: 'none' }
  const btn: React.CSSProperties = { padding: '7px 11px', borderRadius: 8, border: '1px solid rgba(100,160,255,0.2)', background: 'rgba(20,38,65,0.8)', color: '#7BC8FF', fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }
  const totalLuna = (rows || []).reduce((s, r) => s + r.suma, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setLuna(lunaVecina(luna, -1))} style={btn} title="Luna precedentă">‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#E8F4FF', minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{lunaText(luna)}</span>
        <button onClick={() => setLuna(lunaVecina(luna, 1))} style={btn} title="Luna următoare">›</button>
        {luna !== lunaAcum() && <button onClick={() => setLuna(lunaAcum())} style={{ ...btn, fontSize: 11 }}>Luna curentă</button>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: mesaj.startsWith('Eroare') ? '#F87171' : '#4ADE80' }}>{mesaj}</span>
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.6)', flex: 1, minWidth: 180 }}>De scăzut proprietarilor pentru curățenie · {(rows || []).length} curățenii finalizate</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#4ADE80', fontFamily: 'monospace' }}>{fmt(totalLuna)} RON</span>
      </div>

      {!cfg || !rows ? <div style={{ color: 'rgba(159,215,255,0.5)', fontSize: 13 }}>Se încarcă…</div> : grupuri.map(g => {
        const total = g.rows.reduce((s, r) => s + r.suma, 0)
        return (
          <div key={g.id} style={{ background: 'rgba(20,35,58,0.6)', border: '1px solid rgba(159,215,255,0.1)', borderLeft: `3px solid ${g.t.activ ? '#4ADE80' : 'rgba(159,215,255,0.2)'}`, borderRadius: 14, overflow: 'hidden', opacity: g.t.activ ? 1 : 0.6 }}>
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(159,215,255,0.07)' }}>
              {g.apt?.nota && <span style={{ fontSize: 11, fontWeight: 700, color: '#4DA3FF', background: 'rgba(77,163,255,0.12)', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace' }}>{g.apt.nota}</span>}
              <span style={{ fontSize: 15, fontWeight: 700, color: '#E8F4FF', flex: 1, minWidth: 120 }}>{g.apt?.nume || 'Apartament șters'}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#4ADE80', fontFamily: 'monospace' }}>{fmt(total)} RON</span>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', background: 'rgba(14,27,43,0.4)' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'rgba(159,215,255,0.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Tarif / curățenie (RON)
                <input type="number" min={0} defaultValue={g.t.tarif} key={'t' + g.t.tarif} onBlur={e => Number(e.target.value) !== g.t.tarif && setApt(g.id, { tarif: Number(e.target.value) || 0 })} style={{ ...inp, width: 110 }} data-test="tarif" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'rgba(159,215,255,0.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Începând cu
                <input type="date" value={g.t.dela} onChange={e => e.target.value && setApt(g.id, { dela: e.target.value })} style={inp} />
              </label>
              <button onClick={() => setApt(g.id, { activ: !g.t.activ })} style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: g.t.activ ? '#4ADE80' : 'rgba(159,215,255,0.6)' }}>{g.t.activ ? '✓ Activ' : 'Oprit'}</button>
              {g.rows.length > 0 && <button onClick={() => navigator.clipboard.writeText(textProprietar(g)).then(() => { setCopiat(g.id); setTimeout(() => setCopiat(null), 1500) }).catch(() => {})} style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#7BC8FF' }}>{copiat === g.id ? '✓ Copiat' : '📋 Copiază pt proprietar'}</button>}
            </div>
            {g.rows.length === 0 ? <div style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(159,215,255,0.45)' }}>Nicio curățenie finalizată în {lunaText(luna)}{g.t.dela > `${luna}-31` ? ` (taxa începe din ${ziText(g.t.dela)})` : ''}.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {g.rows.map(r => (
                  <div key={r.data} data-test="rand-curatenie" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid rgba(159,215,255,0.05)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', minWidth: 110, textTransform: 'capitalize' }}>{ziText(r.data)}</span>
                    <span style={{ fontSize: 11.5, color: 'rgba(159,215,255,0.5)', flex: 1 }}>✅ {r.ora_inceput && r.ora_inceput !== r.ora_gata ? `${r.ora_inceput}–` : ''}{r.ora_gata || ''}</span>
                    <input type="number" min={0} defaultValue={r.suma} key={r.data + r.suma} onBlur={e => Number(e.target.value) !== r.suma && setSuma(r, e.target.value)} title={r.modificata ? 'Sumă modificată doar pentru această curățenie' : 'Tariful standard'} style={{ ...inp, width: 80, textAlign: 'right', padding: '5px 8px', borderColor: r.modificata ? 'rgba(252,211,77,0.5)' : 'rgba(100,160,255,0.2)' }} />
                    <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>RON</span>
                    <button onClick={() => sterge(r)} title="Șterge curățenia finalizată" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', color: '#F87171', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {cfg && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={aptNou} onChange={e => setAptNou(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180 }}>
            <option value="">＋ Taxă curățenie și la alt apartament…</option>
            {apts.filter(a => !cfg.apt[a.id]).map(a => <option key={a.id} value={a.id}>{a.nume}{a.nota ? ` (${a.nota})` : ''}</option>)}
          </select>
          {aptNou && <button onClick={() => { const d = new Date(); salveaza({ ...cfg, apt: { ...cfg.apt, [aptNou]: { tarif: 75, dela: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, activ: true } } }); setAptNou('') }} style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#4ADE80' }}>Adaugă</button>}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', lineHeight: 1.5 }}>Fiecare curățenie bifată „Gata” (din data de început) adaugă tariful la suma scăzută proprietarului. Totalul lunii apare automat în Rapoarte → Calculator decontat → Curățenie.</div>
    </div>
  )
}
