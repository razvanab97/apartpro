'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { CATEGORII_SUGESTII, LINK_SUGESTII, type Sugestie } from '@/lib/sugestii'
import { Loader2, Check, RotateCcw, Copy, ExternalLink } from 'lucide-react'

// Sugestiile trimise de oaspeti prin formularul public (lib/sugestii.ts) - de citit si bifat ca rezolvate.
const fmt = (iso: string) => new Date(iso).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtZi = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : ''
const catEt = (k: string) => CATEGORII_SUGESTII.find(c => c.k === k)?.ro || k

export default function SugestiiOaspeti() {
  const [lista, setLista] = useState<Sugestie[] | null>(null)
  const [eroare, setEroare] = useState('')
  const [filtru, setFiltru] = useState<'noua' | 'rezolvata' | 'toate'>('noua')
  const [copiat, setCopiat] = useState(false)
  async function incarca() {
    const { data, error } = await supabase.from('sugestii_oaspeti').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) { setEroare(/sugestii_oaspeti/.test(error.message) ? 'Tabelul nu există încă — rulează în Supabase migrarea pentru sugestii.' : error.message); setLista([]); return }
    setLista(data as Sugestie[])
  }
  useEffect(() => { incarca() }, [])
  async function seteaza(id: string, patch: Partial<Sugestie>) {
    setLista(l => l?.map(x => x.id === id ? { ...x, ...patch } : x) || null)
    await supabase.from('sugestii_oaspeti').update(patch).eq('id', id)
  }
  const vizibile = (lista || []).filter(x => filtru === 'toate' || x.status === filtru)
  const nr = (s: string) => (lista || []).filter(x => x.status === s).length
  const btn = (activ: boolean) => ({ padding: '6px 12px', borderRadius: 20, border: `1px solid ${activ ? 'rgba(77,163,255,0.6)' : 'rgba(159,215,255,0.15)'}`, background: activ ? 'rgba(77,163,255,0.15)' : 'transparent', color: activ ? '#7BC8FF' : 'rgba(214,228,244,0.7)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' } as const)
  return (
    <>
      <PageHeader title="Sugestii oaspeți" subtitle="Ce ne recomandă oaspeții după plecare — din formularul trimis în mesajul de mulțumire"
        actions={<>
          <button onClick={() => { navigator.clipboard?.writeText(LINK_SUGESTII).then(() => { setCopiat(true); setTimeout(() => setCopiat(false), 1500) }).catch(() => {}) }} style={btn(false)}>{copiat ? <Check size={12} /> : <Copy size={12} />} {copiat ? 'Copiat' : 'Copiază linkul formularului'}</button>
          <a href={LINK_SUGESTII} target="_blank" rel="noreferrer" style={{ ...btn(false), textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><ExternalLink size={12} /> Deschide formularul</a>
        </>} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button data-filtru="noua" onClick={() => setFiltru('noua')} style={btn(filtru === 'noua')}>Noi · {nr('noua')}</button>
          <button onClick={() => setFiltru('rezolvata')} style={btn(filtru === 'rezolvata')}>Rezolvate · {nr('rezolvata')}</button>
          <button onClick={() => setFiltru('toate')} style={btn(filtru === 'toate')}>Toate · {(lista || []).length}</button>
        </div>
        {!lista && <div style={{ color: 'rgba(159,215,255,0.6)', display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă…</div>}
        {eroare && <div data-sugestii-eroare style={{ color: '#FCD34D', fontSize: 13.5 }}>⚠ {eroare}</div>}
        {lista && !eroare && !vizibile.length && <div style={{ color: 'rgba(159,215,255,0.5)', fontSize: 13.5 }}>{filtru === 'noua' ? 'Nicio sugestie nouă.' : 'Nimic aici încă.'}</div>}
        {vizibile.map(s => (
          <div key={s.id} data-sugestie style={{ background: 'rgba(14,27,48,0.6)', border: `1px solid ${s.status === 'noua' ? 'rgba(255,138,61,0.35)' : 'rgba(159,215,255,0.12)'}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: '#FFFFFF' }}>{s.nume_client || 'Oaspete necunoscut'}</span>
              {s.apartament && <span style={{ fontSize: 12.5, color: '#7BC8FF', fontWeight: 700 }}>{s.apartament}</span>}
              {s.data_checkout && <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.55)' }}>plecat {fmtZi(s.data_checkout)}</span>}
              <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.45)', fontFamily: 'monospace' }}>{s.telefon}</span>
              {!s.rezervare_id && <span style={{ fontSize: 11, color: '#FCD34D' }}>rezervare negăsită după telefon</span>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{fmt(s.created_at)}{s.limba === 'en' ? ' · EN' : ''}</span>
            </div>
            {(s.nota || s.categorii?.length) ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {s.nota ? <span style={{ color: '#FF8A3D', fontSize: 15, letterSpacing: 1 }}>{'★'.repeat(s.nota)}<span style={{ color: 'rgba(159,215,255,0.2)' }}>{'★'.repeat(5 - s.nota)}</span></span> : null}
              {(s.categorii || []).map(k => <span key={k} style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,138,61,0.12)', border: '1px solid rgba(255,138,61,0.3)', color: '#FFB27A', fontWeight: 700 }}>{catEt(k)}</span>)}
            </div> : null}
            <div style={{ fontSize: 14.5, color: '#E8F4FF', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{s.text}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input defaultValue={s.nota_interna || ''} onBlur={e => e.target.value !== (s.nota_interna || '') && seteaza(s.id, { nota_interna: e.target.value || null })} placeholder="Notă internă (ce am făcut)…"
                style={{ flex: 1, minWidth: 200, background: 'rgba(10,20,36,0.6)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 8, padding: '7px 10px', color: '#E8F4FF', fontSize: 13 }} />
              {s.status === 'noua'
                ? <button data-rezolva onClick={() => seteaza(s.id, { status: 'rezolvata' })} style={{ ...btn(false), color: '#4ADE80', borderColor: 'rgba(74,222,128,0.4)', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Check size={13} /> Rezolvată</button>
                : <button onClick={() => seteaza(s.id, { status: 'noua' })} style={{ ...btn(false), display: 'inline-flex', gap: 5, alignItems: 'center' }}><RotateCcw size={12} /> Redeschide</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
