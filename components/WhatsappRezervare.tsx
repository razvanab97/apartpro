'use client'
// Tabul „WhatsApp” din fereastra rezervarii (cerut direct: „să avem buton de WhatsApp pentru numărul de telefon și să avem o
// secțiune separată de WhatsApp unde să avem mai multe mesaje prestabilite pe care să le putem trimite direct”).
// Trei surse de mesaje, toate completate cu datele rezervarii si editabile inainte de trimitere:
//  1. mesajele standard (aceleasi ca in Calendar - lib/mesajeWhatsapp.ts): confirmare, reminder sosire, date acces, gata locatia, check-out
//  2. sabloanele apartamentului (pagina Șabloane mesaje, tabela sabloane_mesaje)
//  3. „Mesajele mele” - create aici, in setari „wa_mesaje_proprii”, comune pe orice dispozitiv
// Trimiterea deschide WhatsApp (wa.me) cu textul pregatit - nimic nu pleaca singur.
import { useEffect, useMemo, useState } from 'react'
import { supabase, normalizeWaPhone } from '@/lib/supabase'
import { aptCuGhid, cuLinkGhid, type InfoGhid } from '@/lib/ghidLink'
import { waLink, msgCheckin, msgAcces, msgCheckoutGen, msgConfirmareRezervare, msgGataAcces, completeazaMesaj, citesteMesajeProprii,
  CHEIE_MESAJE_PROPRII, VARIABILE_MESAJ, type MesajPropriu } from '@/lib/mesajeWhatsapp'
import { MessageCircle, Copy, Plus, Pencil, Trash2, Send, Check } from 'lucide-react'

const TIP_SABLON: Record<string, string> = { checkin: '📥 Check-in', checkout: '📤 Check-out', acces: '🔑 Acces & parcare', reguli: '📋 Reguli casă', altele: '💬 Altele', gata_curatenie: '✨ Gata curățenia' }
type Mesaj = { k: string; titlu: string; text: string; grup: 'standard' | 'apartament' | 'propriu'; propriu?: MesajPropriu }

async function copiaza(t: string) { try { await navigator.clipboard.writeText(t); return true } catch { return false } }

export default function WhatsappRezervare({ rezervare, activ, onMergiLaTelefon }: { rezervare: any; activ: boolean; onMergiLaTelefon?: () => void }) {
  const aptId: string = rezervare?.apartament_id || ''
  const [incarcat, setIncarcat] = useState<string | null>(null)
  const [apt, setApt] = useState<any>(null)
  const [setari, setSetari] = useState<Record<string, string>>({})
  const [coApt, setCoApt] = useState<Record<string, string>>({})
  const [gata, setGata] = useState<Record<string, string>>({})
  const [sabloane, setSabloane] = useState<any[]>([])
  const [ghid, setGhid] = useState<Map<string, InfoGhid>>(new Map())
  const [proprii, setProprii] = useState<MesajPropriu[]>([])
  const [ales, setAles] = useState('confirmare')
  const [text, setText] = useState<string | null>(null)   // null = textul generat; altfel modificat de mana
  const [editor, setEditor] = useState<{ id?: string; titlu: string; text: string } | null>(null)
  const [stergere, setStergere] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<{ ok: boolean; t: string } | null>(null)
  const [copiat, setCopiat] = useState<string | null>(null)

  // se incarca doar cand tabul e deschis (o data pe apartament)
  useEffect(() => {
    if (!activ || incarcat === aptId) return
    setIncarcat(aptId)
    let viu = true
    void supabase.from('setari').select('cheie,valoare').in('cheie', ['checkin_confirmare', 'checkin_acces', CHEIE_MESAJE_PROPRII]).then(({ data }) => {
      if (!viu) return
      const m: Record<string, string> = {}; for (const s of data || []) m[s.cheie] = s.valoare
      setSetari(m); setProprii(citesteMesajeProprii(m[CHEIE_MESAJE_PROPRII]))
    })
    void supabase.from('sabloane_mesaje').select('*').or(aptId ? `apartament_id.eq.${aptId},apartament_id.is.null` : 'apartament_id.is.null').then(({ data }) => {
      if (!viu) return
      const rows = data || [], co: Record<string, string> = {}, g: Record<string, string> = {}
      for (const s of rows) { if (s.tip === 'checkout' && s.apartament_id) co[s.apartament_id] = s.text; if (s.tip === 'gata_curatenie') g[s.apartament_id || '__global__'] = s.text }
      setCoApt(co); setGata(g)
      setSabloane(rows.filter((s: any) => s.apartament_id && s.tip !== 'gata_curatenie'))
    })
    if (aptId) void supabase.from('apartamente').select('id,nume,nota,mesaj_checkin,mesaj_checkout').eq('id', aptId).maybeSingle().then(({ data }) => { if (viu) setApt(data || null) })
    void aptCuGhid().then(m => { if (viu) setGhid(m) }).catch(() => {})
    return () => { viu = false }
  }, [activ, aptId, incarcat])

  const tel = String(rezervare?.telefon_client || '').trim()
  const areTel = normalizeWaPhone(tel).replace(/\D/g, '').length >= 8
  const r = useMemo(() => ({ ...rezervare, apartament: { ...(rezervare?.apartament || {}), ...(apt || {}), id: aptId } }), [rezervare, apt, aptId])
  const aptG = apt ? { id: apt.id, nota: apt.nota } : rezervare?.apartament || null

  const mesaje: Mesaj[] = [
    { k: 'confirmare', titlu: '✅ Confirmare rezervare', grup: 'standard', text: msgConfirmareRezervare(r) },
    { k: 'sosire', titlu: '📅 Reminder sosire', grup: 'standard', text: msgCheckin(r, setari.checkin_confirmare) },
    { k: 'acces', titlu: '🔑 Date acces', grup: 'standard', text: cuLinkGhid(msgAcces(r, setari.checkin_acces), aptG, ghid) },
    { k: 'gata', titlu: '🏠 Gata locația', grup: 'standard', text: cuLinkGhid(msgGataAcces(r, gata), aptG, ghid, true) },
    { k: 'checkout', titlu: '🌅 Check-out', grup: 'standard', text: msgCheckoutGen(r, coApt) },
    ...sabloane.map((s: any): Mesaj => ({ k: 's_' + s.id, grup: 'apartament', titlu: s.titlu || TIP_SABLON[s.tip] || s.tip,
      text: completeazaMesaj(s.text || '', r) + (Array.isArray(s.poze) && s.poze.length ? '\n\n' + s.poze.join('\n') : '') })),
    ...proprii.map((m): Mesaj => ({ k: 'p_' + m.id, grup: 'propriu', titlu: m.titlu, text: completeazaMesaj(m.text, r), propriu: m })),
  ]
  const curent = mesaje.find(m => m.k === ales) || mesaje[0]
  const textFinal = text ?? curent.text
  const alege = (k: string) => { setAles(k); setText(null); setEditor(null); setStergere(null); setMesaj(null) }

  async function salveazaProprii(lista: MesajPropriu[]) {
    const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_MESAJE_PROPRII, valoare: JSON.stringify(lista) }, { onConflict: 'cheie' })
    if (error) { setMesaj({ ok: false, t: 'Nu s-a salvat: ' + error.message }); return false }
    setProprii(lista); return true
  }
  async function salveazaEditor() {
    if (!editor || !editor.titlu.trim() || !editor.text.trim()) return
    // lista proaspata din baza (poate s-a adaugat ceva din alt dispozitiv intre timp)
    const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_MESAJE_PROPRII).maybeSingle()
    const lista = citesteMesajeProprii(data?.valoare ?? JSON.stringify(proprii))
    const id = editor.id || Date.now().toString(36)
    const nou = { id, titlu: editor.titlu.trim(), text: editor.text }
    const out = editor.id && lista.some(m => m.id === editor.id) ? lista.map(m => m.id === editor.id ? nou : m) : [...lista, nou]
    if (await salveazaProprii(out)) { setEditor(null); setAles('p_' + id); setText(null); setMesaj({ ok: true, t: editor.id ? 'Mesaj actualizat' : 'Mesaj salvat — îl găsești la „Mesajele mele”, la orice rezervare' }) }
  }
  async function sterge(id: string) {
    const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_MESAJE_PROPRII).maybeSingle()
    const lista = citesteMesajeProprii(data?.valoare ?? JSON.stringify(proprii)).filter(m => m.id !== id)
    if (await salveazaProprii(lista)) { setStergere(null); alege('confirmare'); setMesaj({ ok: true, t: 'Mesaj șters' }) }
  }
  const faraEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }   // Enter in fereastra = salveaza rezervarea

  const grup = (g: Mesaj['grup'], titlu: string) => {
    const l = mesaje.filter(m => m.grup === g)
    if (!l.length && g !== 'propriu') return null
    return (
      <div className="wa-grup">
        <div className="wa-grup-t">{titlu}</div>
        {l.map(m => (
          <button key={m.k} type="button" data-wa-mesaj={m.k} className="wa-item" aria-pressed={!editor && ales === m.k} onClick={() => alege(m.k)}>{m.titlu}</button>
        ))}
        {g === 'propriu' && <button type="button" data-wa-nou className="wa-item wa-nou" onClick={() => { setEditor({ titlu: '', text: '' }); setMesaj(null) }}><Plus size={13} /> Mesaj nou</button>}
      </div>
    )
  }

  return (
    <div data-whatsapp>
      <style>{CSS}</style>
      <div className="wa-tel">
        <span className="wa-ic"><MessageCircle size={16} /></span>
        <div style={{ minWidth: 0, flex: '1 1 150px' }}>
          <div className="rz-lbl">Telefon client</div>
          <div className="wa-nr">{tel || 'fără telefon'}</div>
        </div>
        {areTel ? <>
          <a data-wa-chat className="rz-btn wa-btn" href={`https://wa.me/${normalizeWaPhone(tel)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Deschide chat</a>
          <button type="button" className="rz-btn" onClick={async () => { if (await copiaza(tel)) { setCopiat('nr'); setTimeout(() => setCopiat(null), 1500) } }} title="Copiază numărul">{copiat === 'nr' ? <Check size={14} /> : <Copy size={14} />}</button>
        </> : <button type="button" className="rz-btn" onClick={onMergiLaTelefon}>Adaugă telefonul</button>}
      </div>

      <div className="wa-layout">
        <nav className="wa-lista" aria-label="Mesaje prestabilite">
          {grup('standard', 'Rezervare')}
          {grup('apartament', 'Șabloanele apartamentului')}
          {grup('propriu', 'Mesajele mele')}
        </nav>

        <div className="wa-prev">
          {editor ? (
            <div data-wa-editor className="wa-card">
              <div className="rz-lbl" style={{ marginBottom: 6 }}>{editor.id ? 'Editează mesajul' : 'Mesaj nou'}</div>
              <input data-wa-titlu value={editor.titlu} onKeyDown={faraEnter} onChange={e => setEditor({ ...editor, titlu: e.target.value })} placeholder="Titlu (ex. 💳 Cerere avans)" />
              <textarea data-wa-text value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} rows={9} placeholder={'Bună ziua, {nume}! …'} style={{ marginTop: 8 }} />
              <div className="wa-vars">
                <span>Se completează singure:</span>
                {VARIABILE_MESAJ.map(([v, l]) => <button key={v} type="button" className="rz-sug" title={l} onClick={() => setEditor({ ...editor, text: editor.text + v })}>{v}</button>)}
              </div>
              <div className="wa-acts">
                <button type="button" className="rz-btn" onClick={() => setEditor(null)}>Renunță</button>
                <button type="button" data-wa-salveaza className="rz-btn rz-btn-go" disabled={!editor.titlu.trim() || !editor.text.trim()} onClick={() => void salveazaEditor()}><Check size={14} /> Salvează mesajul</button>
              </div>
            </div>
          ) : (
            <div className="wa-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <b className="wa-titlu">{curent.titlu}</b>
                {text !== null && <button type="button" className="rz-link" style={{ margin: 0 }} onClick={() => setText(null)}>↺ textul inițial</button>}
                {curent.propriu && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button type="button" className="rz-btn wa-mic" onClick={() => setEditor({ id: curent.propriu!.id, titlu: curent.propriu!.titlu, text: curent.propriu!.text })}><Pencil size={12} /> Editează</button>
                  {stergere === curent.propriu.id
                    ? <button type="button" data-wa-sterge-da className="rz-btn wa-mic" style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.5)' }} onClick={() => void sterge(curent.propriu!.id)}>Sigur? Șterge</button>
                    : <button type="button" className="rz-btn wa-mic" onClick={() => setStergere(curent.propriu!.id)}><Trash2 size={12} /></button>}
                </span>}
              </div>
              <textarea data-wa-previzualizare value={textFinal} onChange={e => setText(e.target.value)} rows={11} />
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)', marginTop: 4 }}>Poți modifica textul aici înainte de trimitere — se schimbă doar pentru acest mesaj.</div>
              <div className="wa-acts">
                <button type="button" className="rz-btn" onClick={async () => { if (await copiaza(textFinal)) { setCopiat('text'); setTimeout(() => setCopiat(null), 1500) } }}>{copiat === 'text' ? <><Check size={14} /> Copiat</> : <><Copy size={14} /> Copiază</>}</button>
                {areTel
                  ? <a data-wa-trimite className="rz-btn wa-btn" href={waLink(tel, textFinal)} target="_blank" rel="noreferrer"><Send size={14} /> Trimite pe WhatsApp</a>
                  : <span className="rz-btn" style={{ opacity: 0.45, cursor: 'default' }}><Send size={14} /> Fără telefon</span>}
              </div>
            </div>
          )}
          {mesaj && <div className={`rz-msg${mesaj.ok ? '' : ' rz-msg-err'}`}>{mesaj.t}</div>}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.wa-tel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;border:1px solid rgba(37,211,102,0.3);background:rgba(37,211,102,0.06);margin-bottom:16px}
.wa-ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#25D366;color:#fff;flex-shrink:0}
.wa-nr{font-size:15px;font-weight:700;color:#EAF4FF;font-variant-numeric:tabular-nums;white-space:nowrap}
.rz .wa-btn{color:#06140B;background:#25D366;border-color:#25D366;text-decoration:none}
.rz .wa-btn:hover{color:#06140B;background:#3BE07A}
.wa-layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;align-items:start}
.wa-lista{display:flex;flex-direction:column;gap:14px}
.wa-grup{display:flex;flex-direction:column;gap:3px}
.wa-grup-t{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(159,215,255,0.45);margin-bottom:3px}
.wa-item{display:flex;align-items:center;gap:6px;text-align:left;padding:7px 10px;border-radius:8px;border:1px solid transparent;background:transparent;color:rgba(214,228,244,0.8);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.wa-item:hover{background:rgba(255,255,255,0.04)}
.wa-item[aria-pressed=true]{background:rgba(37,211,102,0.12);border-color:rgba(37,211,102,0.4);color:#EAF4FF}
.wa-nou{color:#7BC8FF;border:1px dashed rgba(77,163,255,0.35)}
.wa-card{padding:12px;border-radius:12px;border:1px solid rgba(159,215,255,0.12);background:rgba(255,255,255,0.02)}
.wa-titlu{font-size:13.5px;color:#EAF4FF}
.rz .wa-card textarea{font-size:13px;line-height:1.5;resize:vertical}
.wa-vars{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:rgba(159,215,255,0.45)}
.wa-acts{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:10px}
.rz .wa-mic{padding:4px 8px;font-size:11.5px}
@media (max-width:620px){
  .wa-layout{grid-template-columns:1fr}
  .wa-lista{flex-direction:row;flex-wrap:wrap;gap:10px}
  .wa-grup{flex-direction:row;flex-wrap:wrap;align-items:center;width:100%}
  .wa-grup-t{width:100%}
  .wa-item{border-color:rgba(255,255,255,0.08)}
}
`
