'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Impartirea utilitatilor intre locatari, pe luni, ca in tabelul „Copiii de la 503” (cerut direct pentru Canta:
// „cheltuielile împărțite ca în tabel, astfel încât să avem calculul în timp real”). Sumele vin direct din
// Cheltuieli (gaz, curent, întreținere, internet, alte; fara chirie, optional), pe luna in care sunt inregistrate.
// Persoanele se tin in setari „impartire_<apartament>” {persoane: [...], cuChirie: false}.
type Rand = { data: string; categorie: string; valoare: number; status: string }
// modul „Manual” (cerut direct: „buton de manual pentru când trebuie să editez sau să lucrez”): valori puse de mana
// peste cele din Cheltuieli, pe luna si coloana; luni adaugate de mana; o nota pe luna. Tot in setari.
type Cfg = { persoane: string[]; cuChirie?: boolean; manual?: Record<string, Record<string, number>>; note?: Record<string, string>; luniExtra?: string[] }
const COL: { k: string; t: string; c: string }[] = [
  { k: 'eon_gaz', t: 'Gaz', c: '#F9A8D4' }, { k: 'eon_curent', t: 'Curent', c: '#FCD34D' },
  { k: 'asociatie', t: 'Întreținere', c: '#86EFAC' }, { k: 'internet', t: 'Internet', c: '#93C5FD' },
]
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const f2 = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 })

export default function ImpartireCheltuieli({ aptId }: { aptId: string }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [manual, setManual] = useState(false)
  const [lunaNoua, setLunaNoua] = useState('')
  const [randuri, setRanduri] = useState<Rand[]>([])
  const [edit, setEdit] = useState(false)
  const [txt, setTxt] = useState('')
  const cheie = 'impartire_' + aptId
  useEffect(() => {
    let viu = true
    ;(async () => {
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.from('setari').select('valoare').eq('cheie', cheie).maybeSingle(),
        supabase.from('cheltuieli').select('data,categorie,valoare,status').eq('apartament_id', aptId).order('data', { ascending: false }).limit(500),
      ])
      if (!viu) return
      try { const v = s?.valoare ? JSON.parse(s.valoare) : null; setCfg(v); setTxt((v?.persoane || []).join(', ')) } catch { setCfg(null) }
      setRanduri((r || []) as Rand[])
    })()
    return () => { viu = false }
  }, [aptId, cheie])

  const salveaza = async (v: Cfg) => {
    setCfg(v)
    await supabase.from('setari').upsert({ cheie, valoare: JSON.stringify(v) }, { onConflict: 'cheie' })
  }

  const luni = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const r of randuri) {
      if (r.categorie === 'chirie' && !cfg?.cuChirie) continue
      const l = r.data.slice(0, 7), k = COL.some(c => c.k === r.categorie) ? r.categorie : r.categorie === 'chirie' ? 'chirie' : 'alte'
      ;((m[l] ||= {})[k] = (m[l][k] || 0) + Number(r.valoare || 0))
    }
    for (const l of cfg?.luniExtra || []) m[l] ||= {}
    // valorile manuale inlocuiesc calculul pentru luna / coloana respectiva
    for (const [l, v] of Object.entries(cfg?.manual || {})) for (const [k, x] of Object.entries(v)) (m[l] ||= {})[k] = Number(x) || 0
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24)
  }, [randuri, cfg])
  const eManual = (l: string, k: string) => cfg?.manual?.[l]?.[k] !== undefined
  const seteazaManual = (l: string, k: string, val: string) => {
    if (!cfg) return
    const man = { ...(cfg.manual || {}) }; const r = { ...(man[l] || {}) }
    if (val.trim() === '') delete r[k]; else r[k] = Number(val.replace(',', '.')) || 0
    if (Object.keys(r).length) man[l] = r; else delete man[l]
    salveaza({ ...cfg, manual: man })
  }

  if (!cfg) return (
    <button onClick={() => { setEdit(true); salveaza({ persoane: ['Persoana 1', 'Persoana 2'] }); setTxt('Persoana 1, Persoana 2') }}
      style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 9, border: '1px dashed rgba(148,190,255,0.3)', background: 'transparent', color: '#8EA3BF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
      ＋ Împarte cheltuielile între locatari
    </button>
  )
  const n = Math.max(1, cfg.persoane.length)
  const areAlte = luni.some(([, v]) => v.alte), areChirie = luni.some(([, v]) => v.chirie)
  const cols = [...COL, ...(areAlte ? [{ k: 'alte', t: 'Alte', c: '#C4B5FD' }] : []), ...(areChirie ? [{ k: 'chirie', t: 'Chirie', c: '#FDBA74' }] : [])]
  const curent = luni[0]
  const totalLuna = (v: Record<string, number>) => Object.values(v).reduce((s, x) => s + x, 0)
  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace,Menlo,monospace', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(148,190,255,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7BC8FF' }}>Împărțire cheltuieli · {n} {n === 1 ? 'persoană' : 'persoane'}</span>
        <button onClick={() => setManual(m => !m)} title="Editează manual valorile, adaugă luni și note" style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${manual ? '#FCD34D' : 'rgba(148,190,255,0.2)'}`, background: manual ? 'rgba(252,211,77,0.12)' : 'transparent', color: manual ? '#FCD34D' : '#8EA3BF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{manual ? '✓ gata manual' : '✏️ Manual'}</button>
        <button onClick={() => setEdit(e => !e)} style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(148,190,255,0.2)', background: 'transparent', color: '#8EA3BF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{edit ? 'gata' : '⚙ persoane'}</button>
      </div>
      {edit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={txt} onChange={e => setTxt(e.target.value)} onBlur={() => salveaza({ ...cfg, persoane: txt.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="Nume separate prin virgulă" style={{ fontSize: 12.5 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#B9C7DA' }}>
            <input type="checkbox" checked={!!cfg.cuChirie} onChange={e => salveaza({ ...cfg, cuChirie: e.target.checked })} style={{ width: 14, height: 14 }} /> include și chiria
          </label>
        </div>
      )}
      {curent && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(n, 4)},minmax(0,1fr))`, gap: 8 }}>
          {cfg.persoane.map(p => (
            <div key={p} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,190,255,0.12)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B9C7DA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</div>
              <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 17, color: '#E6EEF9' }}>{f2(Math.round(totalLuna(curent[1]) / n * 100) / 100)}<span style={{ fontSize: 10.5, color: '#8EA3BF', marginLeft: 3 }}>RON</span></div>
              <div style={{ fontSize: 10.5, color: '#55688A' }}>{LUNI[+curent[0].slice(5) - 1]} {curent[0].slice(0, 4)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(148,190,255,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
          <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
            <th style={{ ...th, textAlign: 'left', color: '#8EA3BF' }}>Luna</th>
            {cols.map(c => <th key={c.k} style={{ ...th, color: c.c }}>{c.t}</th>)}
            <th style={{ ...th, color: '#E6EEF9' }}>Total</th><th style={{ ...th, color: '#3DDC97' }}>/ pers</th>
            {(manual || Object.keys(cfg.note || {}).length > 0) && <th style={{ ...th, textAlign: 'left', color: '#8EA3BF' }}>Notă</th>}
          </tr></thead>
          <tbody>
            {luni.map(([l, v]) => { const t = totalLuna(v); return (
              <tr key={l} style={{ borderTop: '1px solid rgba(148,190,255,0.08)' }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', fontWeight: 700, color: '#E6EEF9' }}>{LUNI[+l.slice(5) - 1].slice(0, 3)} {l.slice(2, 4)}</td>
                {cols.map(c => <td key={c.k} style={{ ...td, color: eManual(l, c.k) ? '#FCD34D' : v[c.k] ? '#B9C7DA' : 'rgba(148,190,255,0.25)' }} title={eManual(l, c.k) ? 'Valoare pusă manual' : undefined}>
                  {manual
                    ? <input defaultValue={eManual(l, c.k) ? String(cfg.manual![l][c.k]) : ''} placeholder={v[c.k] && !eManual(l, c.k) ? String(Math.round(v[c.k])) : '—'} onBlur={e => { if (e.target.value !== (eManual(l, c.k) ? String(cfg.manual![l][c.k]) : '')) seteazaManual(l, c.k, e.target.value) }}
                        inputMode="decimal" style={{ width: 70, padding: '3px 6px', fontSize: 12, textAlign: 'right', fontFamily: 'inherit', borderColor: eManual(l, c.k) ? 'rgba(252,211,77,0.5)' : undefined }} />
                    : v[c.k] ? f2(Math.round(v[c.k])) + (eManual(l, c.k) ? '*' : '') : '—'}
                </td>)}
                <td style={{ ...td, fontWeight: 800, color: '#E6EEF9' }}>{f2(Math.round(t))}</td>
                <td style={{ ...td, fontWeight: 800, color: '#3DDC97' }}>{f2(Math.round(t / n * 100) / 100)}</td>
                {(manual || Object.keys(cfg.note || {}).length > 0) && <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: '#B9C7DA' }}>
                  {manual ? <input defaultValue={cfg.note?.[l] || ''} placeholder="ex. 19 noiembrie" onBlur={e => { const note = { ...(cfg.note || {}) }; if (e.target.value.trim()) note[l] = e.target.value.trim(); else delete note[l]; salveaza({ ...cfg, note }) }} style={{ width: 120, padding: '3px 6px', fontSize: 12 }} /> : cfg.note?.[l] || ''}
                </td>}
              </tr>
            ) })}
            {!luni.length && <tr><td colSpan={cols.length + 3} style={{ ...td, textAlign: 'center', color: '#8EA3BF' }}>Nicio cheltuială încă.</td></tr>}
          </tbody>
        </table>
      </div>
      {manual && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={lunaNoua} onChange={e => setLunaNoua(e.target.value)} style={{ padding: '5px 8px', fontSize: 12, width: 'auto' }} />
          <button disabled={!lunaNoua} onClick={() => { if (!lunaNoua) return; salveaza({ ...cfg, luniExtra: [...new Set([...(cfg.luniExtra || []), lunaNoua])] }); setLunaNoua('') }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(148,190,255,0.25)', background: 'transparent', color: '#B9C7DA', fontSize: 12, fontWeight: 700, cursor: lunaNoua ? 'pointer' : 'default' }}>＋ Adaugă lună</button>
          {Object.keys(cfg.manual || {}).length > 0 && <button onClick={() => salveaza({ ...cfg, manual: {} })} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#F87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↺ Șterge valorile manuale</button>}
          <span style={{ fontSize: 11, color: '#8EA3BF' }}>Scrii o sumă ca să înlocuiești calculul (galben = manual); golești câmpul ca să revii la calcul.</span>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#55688A' }}>{Object.keys(cfg.manual || {}).length > 0 ? '* valori puse manual · ' : ''}Calcul în timp real din Cheltuieli, pe luna în care e înregistrată plata{cfg.cuChirie ? ', cu chiria' : ', fără chirie'}.</div>
    </div>
  )
}
