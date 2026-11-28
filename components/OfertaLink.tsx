'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MONEDE_REZ } from '@/lib/moneda'
import { GHID_BAZA } from '@/lib/gazdeGhid'
import { CHEI_BLOCARE, blocariDinSetari } from '@/lib/mentenanta'
import { PREFIX_OFERTA, cheieOferta, tokenNou, noptiOferta, stareEfectiva, conflicte, type Oferta } from '@/lib/ofertaLink'

// Rezervare prin link (vezi lib/ofertaLink.ts): creezi oferta (apartament, perioada, persoane, pret, valabilitate),
// trimiti linkul clientului (WhatsApp / copiat), clientul completeaza datele si confirma -> rezervarea apare singura.

type Apt = { id: string; nume: string }
export type OfertaInitiala = { aptId?: string; checkin?: string; checkout?: string; total?: string | number; moneda?: string; persoane?: string | number; nume?: string; telefon?: string }

const C = { bg: '#0D1A2B', line: 'rgba(100,160,255,0.2)', text: 'rgba(214,228,244,0.92)', dim: 'rgba(159,215,255,0.5)', acc: '#38BDF8', vio: '#A78BFA', ok: '#4ADE80', warn: '#FBBF24', err: '#F87171' }
const inp: React.CSSProperties = { width: '100%', background: 'rgba(20,38,65,0.8)', border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
const lbl: React.CSSProperties = { fontSize: 10, color: C.dim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }
const scurt = (n: string) => String(n || '').replace(/\s*by AB HOMES\s*/i, '').trim()
const zz = (iso: string) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : ''
const VALAB = [{ h: 24, t: '24 ore' }, { h: 48, t: '48 ore' }, { h: 72, t: '3 zile' }, { h: 168, t: '7 zile' }]
export const linkOferta = (token: string) => `${GHID_BAZA}/o/${token}`
const waTel = (t: string) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0')) d = '40' + d.slice(1); return d }

function mesajWa(o: Oferta, apt: string, link: string) {
  const n = noptiOferta(o.checkin, o.checkout), en = o.limba === 'en'
  const bani = `${Number(o.total).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${o.moneda}`
  return en
    ? `Hello${o.titlu_client ? ' ' + o.titlu_client : ''}! 👋\n\nHere is your booking offer for *${apt}*:\n📅 ${zz(o.checkin)} – ${zz(o.checkout)} (${n} ${n === 1 ? 'night' : 'nights'})${o.total > 0 ? `\n💰 Total: ${bani}` : ''}\n\nTo confirm, please fill in your details here:\n${link}\n\nAB Homes Iași`
    : `Bună ziua${o.titlu_client ? ', ' + o.titlu_client : ''}! 👋\n\nVă trimitem oferta de rezervare pentru *${apt}*:\n📅 ${zz(o.checkin)} – ${zz(o.checkout)} (${n} ${n === 1 ? 'noapte' : 'nopți'})${o.total > 0 ? `\n💰 Total: ${bani}` : ''}\n\nPentru confirmare, completați datele aici:\n${link}\n\nEchipa AB Homes Iași`
}

export default function OfertaLink({ apts, initial, onClose }: { apts: Apt[]; initial?: OfertaInitiala; onClose: () => void }) {
  const [tab, setTab] = useState<'noua' | 'lista'>(initial ? 'noua' : 'lista')
  const pers = Number(initial?.persoane) || 2
  const [f, setF] = useState({ aptId: initial?.aptId || '', checkin: initial?.checkin || '', checkout: initial?.checkout || '', adulti: String(pers), copii: '0',
    total: initial?.total != null && initial.total !== '' ? String(initial.total) : '', moneda: initial?.moneda || 'RON', ore: 48, limba: 'ro' as 'ro' | 'en', nume: initial?.nume || '', telefon: initial?.telefon || '', nota: '' })
  const set = (p: Partial<typeof f>) => setF(o => ({ ...o, ...p }))
  const [disp, setDisp] = useState<{ liber: boolean; rezervari: number; blocari: number; oferte: number } | null>(null)
  const [salvez, setSalvez] = useState(false), [eroare, setEroare] = useState(''), [creata, setCreata] = useState<Oferta | null>(null), [copiat, setCopiat] = useState('')
  const [lista, setLista] = useState<Oferta[] | null>(null), [numeRez, setNumeRez] = useState<Record<string, string>>({})
  const nopti = noptiOferta(f.checkin, f.checkout)
  const numeApt = (id: string) => scurt(apts.find(a => a.id === id)?.nume || '')

  async function incarcaLista() {
    const { data } = await supabase.from('setari').select('valoare').like('cheie', PREFIX_OFERTA + '%')
    const l = ((data || []) as any[]).map(r => { try { return JSON.parse(r.valoare) as Oferta } catch { return null } }).filter((o): o is Oferta => !!o?.token)
      .sort((a, b) => String(b.creat_la).localeCompare(String(a.creat_la)))
    setLista(l)
    const ids = l.map(o => o.rezervare_id).filter(Boolean) as string[]
    if (ids.length) { const { data: r } = await supabase.from('rezervari').select('id,nume_client').in('id', ids); setNumeRez(Object.fromEntries(((r || []) as any[]).map(x => [x.id, x.nume_client]))) }
  }
  useEffect(() => { incarcaLista() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // perioada libera? (rezervari, blocari ale proprietarilor, alte oferte deschise pe aceleasi zile)
  useEffect(() => {
    setDisp(null)
    if (!f.aptId || !f.checkin || !f.checkout || f.checkout <= f.checkin) return
    let anulat = false
    Promise.all([
      supabase.from('rezervari').select('data_checkin,data_checkout,status_rezervare,camera_semnalata').eq('apartament_id', f.aptId).lt('data_checkin', f.checkout).gt('data_checkout', f.checkin),
      supabase.from('setari').select('cheie,valoare').in('cheie', CHEI_BLOCARE),
    ]).then(([{ data: r }, { data: b }]) => {
      if (anulat) return
      const c = conflicte(f.checkin, f.checkout, (r || []) as any[], blocariDinSetari(b).filter(x => x.apt === f.aptId))
      const oferte = (lista || []).filter(o => o.apartament_id === f.aptId && stareEfectiva(o) === 'trimisa' && o.checkin < f.checkout && o.checkout > f.checkin).length
      setDisp({ ...c, oferte })
    })
    return () => { anulat = true }
  }, [f.aptId, f.checkin, f.checkout, lista])

  async function creeaza() {
    setEroare('')
    if (!f.aptId) return setEroare('Alege apartamentul')
    if (!f.checkin || !f.checkout || f.checkout <= f.checkin) return setEroare('Alege perioada (plecarea după sosire)')
    const adulti = Math.max(1, parseInt(f.adulti) || 1), copii = Math.max(0, parseInt(f.copii) || 0)
    const o: Oferta = { token: tokenNou(), apartament_id: f.aptId, checkin: f.checkin, checkout: f.checkout, adulti, copii,
      total: Math.max(0, Math.round((parseFloat(String(f.total).replace(',', '.')) || 0) * 100) / 100), moneda: f.moneda || 'RON',
      expira: new Date(Date.now() + f.ore * 3600000).toISOString(), limba: f.limba, nota: f.nota.trim().slice(0, 600), titlu_client: f.nume.trim().split(/\s+/)[0] || '',
      stare: 'trimisa', creat_la: new Date().toISOString() }
    setSalvez(true)
    const { error } = await supabase.from('setari').upsert({ cheie: cheieOferta(o.token), valoare: JSON.stringify(o) }, { onConflict: 'cheie' })
    setSalvez(false)
    if (error) return setEroare(error.message)
    setCreata(o); incarcaLista()
  }
  async function schimbaStare(o: Oferta, stare: 'anulata') {
    await supabase.from('setari').upsert({ cheie: cheieOferta(o.token), valoare: JSON.stringify({ ...o, stare }) }, { onConflict: 'cheie' }); incarcaLista()
  }
  async function sterge(o: Oferta) { await supabase.from('setari').delete().eq('cheie', cheieOferta(o.token)); incarcaLista() }
  const copiaza = async (txt: string, cheie: string) => { try { await navigator.clipboard.writeText(txt); setCopiat(cheie); setTimeout(() => setCopiat(''), 1800) } catch { window.prompt('Copiază linkul:', txt) } }

  const ET: Record<string, [string, string]> = { trimisa: ['⏳ Trimisă', C.warn], confirmata: ['✅ Confirmată', C.ok], anulata: ['✕ Retrasă', C.dim], expirata: ['⌛ Expirată', C.err] }
  const linkC = creata ? linkOferta(creata.token) : ''
  const telWa = useMemo(() => waTel(f.telefon), [f.telefon])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(2,8,18,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div data-oferta-modal onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', background: C.bg, border: '1px solid rgba(56,189,248,0.3)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.acc }}>🔗 Rezervare prin link</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Trimiți oferta, clientul completează datele și confirmă — rezervarea apare singură</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {([['noua', 'Ofertă nouă'], ['lista', `Oferte trimise${lista ? ` (${lista.length})` : ''}`]] as const).map(([k, t]) =>
            <button key={k} data-oferta-tab={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${tab === k ? 'rgba(56,189,248,0.5)' : C.line}`, background: tab === k ? 'rgba(56,189,248,0.14)' : 'transparent', color: tab === k ? C.acc : C.dim, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{t}</button>)}
        </div>

        {tab === 'noua' && !creata && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><div style={lbl}>Apartament</div>
            <select data-oferta-apt value={f.aptId} onChange={e => set({ aptId: e.target.value })} style={inp}><option value="">— alege —</option>{apts.map(a => <option key={a.id} value={a.id}>{scurt(a.nume)}</option>)}</select></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={lbl}>Sosire</div><input data-oferta-ci type="date" value={f.checkin} onChange={e => set({ checkin: e.target.value })} style={inp} /></div>
            <div><div style={lbl}>Plecare</div><input data-oferta-co type="date" value={f.checkout} onChange={e => set({ checkout: e.target.value })} style={inp} /></div>
          </div>
          {disp && <div data-oferta-disp style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8, border: `1px solid ${disp.liber && !disp.oferte ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.4)'}`, background: disp.liber && !disp.oferte ? 'rgba(74,222,128,0.07)' : 'rgba(251,191,36,0.08)', color: disp.liber && !disp.oferte ? C.ok : C.warn }}>
            {disp.liber ? `✓ Liber · ${nopti} ${nopti === 1 ? 'noapte' : 'nopți'}` : `⚠ Perioada se suprapune cu ${disp.rezervari ? `${disp.rezervari} rezervare${disp.rezervari > 1 ? 'i' : ''}` : ''}${disp.rezervari && disp.blocari ? ' și ' : ''}${disp.blocari ? 'o blocare a proprietarului' : ''} — clientul nu va putea confirma`}
            {disp.oferte > 0 && <div style={{ marginTop: 3 }}>⏳ Mai e {disp.oferte === 1 ? 'o ofertă deschisă' : `${disp.oferte} oferte deschise`} pe aceste zile — confirmă cine e primul</div>}
          </div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 8 }}>
            <div><div style={lbl}>Adulți</div><input data-oferta-adulti type="number" min={1} value={f.adulti} onChange={e => set({ adulti: e.target.value })} style={inp} /></div>
            <div><div style={lbl}>Copii</div><input data-oferta-copii type="number" min={0} value={f.copii} onChange={e => set({ copii: e.target.value })} style={inp} /></div>
            <div><div style={lbl}>Preț total</div><div style={{ display: 'flex', gap: 4 }}>
              <input data-oferta-total type="number" min={0} value={f.total} onChange={e => set({ total: e.target.value })} placeholder="0" style={{ ...inp, flex: 1, minWidth: 0 }} />
              <select data-oferta-moneda value={f.moneda} onChange={e => set({ moneda: e.target.value })} style={{ ...inp, width: 64, padding: '0 4px', fontWeight: 700 }}>{MONEDE_REZ.map(m => <option key={m} value={m}>{m}</option>)}</select>
            </div></div>
          </div>
          {nopti > 0 && Number(f.total) > 0 && <div style={{ fontSize: 11.5, color: C.dim, marginTop: -4 }}>= {(Math.round(Number(f.total) / nopti * 100) / 100).toLocaleString('ro-RO')} {f.moneda} / noapte</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={lbl}>Nume client (opțional)</div><input data-oferta-nume value={f.nume} onChange={e => set({ nume: e.target.value })} placeholder="pentru salut" style={inp} /></div>
            <div><div style={lbl}>Telefon (pt. WhatsApp)</div><input data-oferta-tel value={f.telefon} onChange={e => set({ telefon: e.target.value })} placeholder="+40 7xx…" style={inp} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={lbl}>Valabilă</div><select data-oferta-valab value={f.ore} onChange={e => set({ ore: Number(e.target.value) })} style={inp}>{VALAB.map(v => <option key={v.h} value={v.h}>{v.t}</option>)}</select></div>
            <div><div style={lbl}>Limba paginii</div><select data-oferta-limba value={f.limba} onChange={e => set({ limba: e.target.value as 'ro' | 'en' })} style={inp}><option value="ro">Română</option><option value="en">English</option></select></div>
          </div>
          <div><div style={lbl}>Mesaj în ofertă (opțional)</div><textarea data-oferta-nota rows={2} value={f.nota} onChange={e => set({ nota: e.target.value })} placeholder="ex. parcare inclusă, plata la sosire…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          {eroare && <div style={{ fontSize: 12, color: C.err }}>⚠ {eroare}</div>}
          <button data-oferta-creeaza onClick={creeaza} disabled={salvez} style={{ padding: 11, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0EA5E9,#7C3AED)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: salvez ? .6 : 1 }}>{salvez ? 'Se creează…' : '🔗 Creează linkul ofertei'}</button>
          <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.5 }}>Zilele NU se blochează până confirmă clientul. La confirmare se verifică din nou că perioada e liberă, se creează rezervarea (Direct, neplătită) cu datele lui și primești notificare.</div>
        </div>}

        {tab === 'noua' && creata && <div data-oferta-gata style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: C.ok, fontWeight: 700 }}>✓ Oferta e gata — trimite linkul clientului</div>
          <div data-oferta-link style={{ fontFamily: 'monospace', fontSize: 12, padding: '9px 10px', borderRadius: 8, background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.3)', wordBreak: 'break-all', userSelect: 'all' }}>{linkC}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button data-oferta-copiaza onClick={() => copiaza(linkC, 'nou')} style={{ ...inp, cursor: 'pointer', fontWeight: 700, textAlign: 'center' }}>{copiat === 'nou' ? '✓ Copiat' : '📋 Copiază'}</button>
            <a data-oferta-wa href={`https://wa.me/${telWa}?text=${encodeURIComponent(mesajWa(creata, numeApt(creata.apartament_id), linkC))}`} target="_blank" rel="noreferrer" style={{ ...inp, textAlign: 'center', fontWeight: 700, color: C.ok, textDecoration: 'none', borderColor: 'rgba(37,211,102,0.35)' }}>WhatsApp</a>
            <a href={linkC} target="_blank" rel="noreferrer" style={{ ...inp, textAlign: 'center', fontWeight: 700, color: C.acc, textDecoration: 'none' }}>↗ Deschide</a>
          </div>
          <button onClick={() => copiaza(mesajWa(creata, numeApt(creata.apartament_id), linkC), 'msg')} style={{ ...inp, cursor: 'pointer', textAlign: 'center' }}>{copiat === 'msg' ? '✓ Mesaj copiat' : 'Copiază mesajul cu link (pentru email / SMS)'}</button>
          <button onClick={() => { setCreata(null); set({ nume: '', telefon: '', nota: '' }) }} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Altă ofertă</button>
        </div>}

        {tab === 'lista' && <div data-oferta-lista style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!lista && <div style={{ fontSize: 12, color: C.dim }}>Se încarcă…</div>}
          {lista && !lista.length && <div style={{ fontSize: 12.5, color: C.dim }}>Nicio ofertă trimisă încă. Creează una din „Ofertă nouă”.</div>}
          {(lista || []).slice(0, 40).map(o => { const st = stareEfectiva(o), [et, col] = ET[st]; const ln = linkOferta(o.token); return (
            <div key={o.token} data-oferta-rand style={{ padding: '9px 11px', borderRadius: 10, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <b>{numeApt(o.apartament_id) || 'Apartament'} · {zz(o.checkin)} – {zz(o.checkout)}</b>
                <span style={{ color: col, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{et}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.dim }}>
                {o.total > 0 ? `${Number(o.total).toLocaleString('ro-RO')} ${o.moneda} · ` : ''}{o.adulti + o.copii} pers. · {st === 'confirmata' ? `confirmată de ${(o.rezervare_id && numeRez[o.rezervare_id]) || 'client'}${o.confirmat_la ? ' pe ' + new Date(o.confirmat_la).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}` : `${o.titlu_client ? o.titlu_client + ' · ' : ''}valabilă până ${new Date(o.expira).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
                {st === 'trimisa' && <button onClick={() => copiaza(ln, o.token)} style={{ background: 'none', border: 'none', color: C.acc, cursor: 'pointer', padding: 0 }}>{copiat === o.token ? '✓ Copiat' : '📋 Copiază linkul'}</button>}
                <a href={ln} target="_blank" rel="noreferrer" style={{ color: C.acc, textDecoration: 'none' }}>↗ Deschide</a>
                {st === 'trimisa' && <button data-oferta-retrage onClick={() => schimbaStare(o, 'anulata')} style={{ background: 'none', border: 'none', color: C.warn, cursor: 'pointer', padding: 0 }}>Retrage</button>}
                {st !== 'trimisa' && st !== 'confirmata' && <button onClick={() => sterge(o)} style={{ background: 'none', border: 'none', color: C.err, cursor: 'pointer', padding: 0 }}>Șterge</button>}
              </div>
            </div>) })}
        </div>}
      </div>
    </div>
  )
}
