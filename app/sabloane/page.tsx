'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { Upload, Trash2, Plus, Send } from 'lucide-react'
import { generateBatch, generateOne, TOTAL, type AdresaCard } from '@/lib/locatii-romania'

const _mpad = (n:number) => String(n).padStart(2,'0')
const _mfmt = (d:string) => { try { const dt=new Date(d); return `${_mpad(dt.getDate())}.${_mpad(dt.getMonth()+1)}.${dt.getFullYear()}` } catch { return d } }
const WA_SABLOANE = [
  { key:'revenire',   label:'🏠 Invitație revenire', text:'Buna ziua, {nume}!\n\nSperam ca v-a placut sejurul la AB Homes Iasi!\n\nDaca planificati o noua vizita in Iasi, va asteptam cu drag. Avem apartamente moderne in zone centrale, cu self check-in si tot confortul. 🏠\n\nScriati-ne pentru disponibilitate!\n\nEchipa AB Homes Iasi' },
  { key:'confirmare', label:'✅ Confirmare rezervare', text:'Buna ziua, {nume}! 👋\n\nVa confirmam rezervarea la *{apartament}* pentru *{checkin}* → *{checkout}*.\n\nVa asteptam!\nEchipa AB Homes Iasi' },
  { key:'checkin',    label:'📅 Reminder check-in',   text:'Buna ziua, {nume}! 😊\n\nVa reamintim ca maine, *{checkin}*, aveti rezervarea la *{apartament}*.\n\nVa vom trimite detaliile de acces in ziua sosirii.\nEchipa AB Homes Iasi' },
  { key:'checkout',   label:'🌅 Reminder check-out',  text:'Buna ziua, {nume}!\n\nVa reamintim ca astazi este ziua check-out-ului din *{apartament}*.\n\n⏰ Ora de check-out: 11:00\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'review',     label:'⭐ Cerere review',        text:'Buna ziua, {nume}! 🙏\n\nSperam ca ati avut o sedere placuta la *{apartament}*.\n\nNe-ar bucura mult un review!\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'custom',     label:'✏️ Personalizat',         text:'' },
]
function _waLink(phone:string, msg:string){
  const clean = phone.replace(/\D/g,'')
  const nr = clean.startsWith('40') ? clean : '4'+clean.replace(/^0/,'')
  return `https://wa.me/${nr}?text=${encodeURIComponent(msg.normalize('NFC'))}`
}
function _apply(text:string, r:any){
  return text
    .replace(/{nume}/g, (r.nume_client||'').split(' ')[0])
    .replace(/{apartament}/g, r.apartament?.nota || r.apartament?.nume || '')
    .replace(/{checkin}/g, _mfmt(r.data_checkin||''))
    .replace(/{checkout}/g, _mfmt(r.data_checkout||''))
}

const WA_FILTRE = [
  {k:'checkout_30',l:'🔥 Checkout 30 zile'},
  {k:'checkin_azi',l:'Check-in azi'},
  {k:'checkin_maine',l:'Check-in mâine'},
  {k:'checkin_7',l:'Check-in 7 zile'},
  {k:'checkout_azi',l:'Check-out azi'},
  {k:'toate',l:'Toți (aug 2025+)'},
  {k:'custom',l:'📅 Personalizată'},
]

function MesajeMasaContent() {
  const [clienti, setClienti] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sablon, setSablon] = useState(WA_SABLOANE[0])
  const [textCustom, setTextCustom] = useState('')
  const [selectati, setSelectati] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filtru, setFiltru] = useState('checkout_30')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [trimitere, setTrimitre] = useState(false)
  const [trimiteIdx, setTrimiteIdx] = useState(-1)
  const { toast: mToast, show: mShow } = useToast()
  const now = new Date()
  const today = now.toISOString().slice(0,10)

  useEffect(() => { loadClienti() }, [filtru, dateFrom, dateTo])

  async function loadClienti() {
    setLoading(true)
    const d30 = new Date(now.getTime()-30*86400000).toISOString().slice(0,10)
    const d7  = new Date(now.getTime()+7*86400000).toISOString().slice(0,10)
    const maine = new Date(now.getTime()+86400000).toISOString().slice(0,10)
    let q = supabase.from('rezervari')
      .select('id,nume_client,telefon_client,canal,data_checkin,data_checkout,apartament_id')
      .not('telefon_client','is',null).neq('status_rezervare','anulata')
      .order('data_checkin',{ascending:false}).limit(1000)
    if (filtru==='custom' && dateFrom && dateTo)   q = q.gte('data_checkout',dateFrom).lte('data_checkout',dateTo)
    else if (filtru==='checkout_30')               q = q.gte('data_checkout',d30).lte('data_checkout',today)
    else if (filtru==='checkin_azi')               q = q.eq('data_checkin',today)
    else if (filtru==='checkin_maine')             q = q.eq('data_checkin',maine)
    else if (filtru==='checkout_azi')              q = q.eq('data_checkout',today)
    else if (filtru==='checkin_7')                 q = q.gte('data_checkin',today).lte('data_checkin',d7)
    else                                           q = q.gte('data_checkin','2025-08-01')
    const {data} = await q
    const {data:apts} = await supabase.from('apartamente').select('id,nota,nume')
    const aptMap = new Map((apts||[]).map((a:any)=>[a.id,a]))
    const seen = new Map<string,any>()
    for (const r of (data||[])) {
      const tel = (r.telefon_client||'').replace(/\D/g,'')
      if (tel && !seen.has(tel)) seen.set(tel, {...r, apartament: aptMap.get(r.apartament_id)||null})
    }
    const list = Array.from(seen.values())
    setClienti(list)
    setSelectati(new Set(list.map((r:any)=>r.id)))
    setLoading(false)
  }

  const textFinal = sablon.key==='custom' ? textCustom : sablon.text
  const filtered = clienti.filter(r => !search ||
    (r.nume_client||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.telefon_client||'').includes(search))
  const selList = filtered.filter(r => selectati.has(r.id))

  async function porneste() {
    if (!textFinal || selList.length===0) return
    setTrimitre(true)
    for (let i=0; i<selList.length; i++) {
      setTrimiteIdx(i)
      window.open(_waLink(selList[i].telefon_client, _apply(textFinal, selList[i])), '_blank')
      if (i < selList.length-1) await new Promise(r=>setTimeout(r,700))
    }
    setTrimitre(false); setTrimiteIdx(-1)
    mShow('success',`✓ ${selList.length} linkuri deschise`)
  }

  const S = {
    card: { background:'rgba(11,18,36,0.75)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:12 } as React.CSSProperties,
    inp:  { background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:7, color:'rgba(214,228,244,0.85)', fontSize:12, padding:'6px 10px', outline:'none' } as React.CSSProperties,
    lbl:  { fontSize:10, fontWeight:700, color:'rgba(159,215,255,0.4)', textTransform:'uppercase' as const, letterSpacing:'.07em', marginBottom:6 } as React.CSSProperties,
  }

  return (
    <div style={{padding:'12px 20px 40px', overflowY:'auto', flex:1}}>
      <div style={{...S.card, padding:'12px 16px', marginBottom:12}}>
        <div style={S.lbl}>Perioadă</div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {WA_FILTRE.map(f=>(
            <button key={f.k} onClick={()=>setFiltru(f.k)}
              style={{padding:'5px 11px', borderRadius:6, border:`1px solid ${filtru===f.k?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.1)'}`, background:filtru===f.k?'rgba(77,163,255,0.15)':'transparent', color:filtru===f.k?'#7BC8FF':'rgba(159,215,255,0.45)', fontSize:11, fontWeight:600, cursor:'pointer'}}>
              {f.l}
            </button>
          ))}
        </div>
        {filtru==='custom' && (
          <div style={{display:'flex', gap:10, marginTop:10}}>
            <div><div style={S.lbl}>De la</div><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={S.inp}/></div>
            <div><div style={S.lbl}>Până la</div><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={S.inp}/></div>
          </div>
        )}
      </div>
      <div style={{display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap'}}>
        <div style={{...S.card, flex:'1 1 400px', minWidth:0, overflow:'hidden'}}>
          <div style={{display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid rgba(100,160,255,0.08)', background:'rgba(11,18,32,0.4)', flexWrap:'wrap'}}>
            <input type="checkbox"
              checked={filtered.length>0 && filtered.every(r=>selectati.has(r.id))}
              onChange={()=>{const allSel=filtered.every(r=>selectati.has(r.id)); setSelectati(prev=>{const n=new Set(prev); filtered.forEach(r=>allSel?n.delete(r.id):n.add(r.id)); return n})}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Caută..." style={{...S.inp, flex:1, minWidth:120, maxWidth:220}}/>
            <span style={{fontSize:11, color:'rgba(159,215,255,0.4)', marginLeft:'auto'}}>{selList.length}/{filtered.length} selectați</span>
          </div>
          {loading ? (
            <div style={{padding:32, textAlign:'center', color:'rgba(159,215,255,0.4)', fontSize:13}}>Se încarcă...</div>
          ) : filtered.length===0 ? (
            <div style={{padding:32, textAlign:'center', color:'rgba(159,215,255,0.3)', fontSize:13}}>Niciun client găsit</div>
          ) : filtered.map(r=>{
            const sel = selectati.has(r.id)
            return (
              <div key={r.id} style={{display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:'1px solid rgba(100,160,255,0.04)', background:sel?'rgba(77,163,255,0.03)':'transparent'}}>
                <input type="checkbox" checked={sel} onChange={()=>setSelectati(prev=>{const n=new Set(prev);sel?n.delete(r.id):n.add(r.id);return n})}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600, color:'#E8F4FF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.nume_client}</div>
                  <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.telefon_client} · {r.apartament?.nota||''} · {_mfmt(r.data_checkin)}→{_mfmt(r.data_checkout)}</div>
                </div>
                {textFinal && r.telefon_client && (
                  <a href={_waLink(r.telefon_client, _apply(textFinal,r))} target="_blank" rel="noopener"
                    style={{padding:'4px 9px', borderRadius:6, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', fontSize:10, fontWeight:600, textDecoration:'none', flexShrink:0}}>
                    💬
                  </a>
                )}
              </div>
            )
          })}
        </div>
        <div style={{width:300, flexShrink:0, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{...S.card, padding:14}}>
            <div style={S.lbl}>Șablon mesaj</div>
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              {WA_SABLOANE.map(s=>(
                <button key={s.key} onClick={()=>setSablon(s)}
                  style={{padding:'7px 10px', borderRadius:7, border:`1px solid ${sablon.key===s.key?'rgba(77,163,255,0.4)':'rgba(159,215,255,0.08)'}`, background:sablon.key===s.key?'rgba(77,163,255,0.12)':'transparent', color:sablon.key===s.key?'#7BC8FF':'rgba(159,215,255,0.45)', fontSize:11, cursor:'pointer', textAlign:'left'}}>
                  {s.label}
                </button>
              ))}
            </div>
            {sablon.key==='custom' && (
              <textarea value={textCustom} onChange={e=>setTextCustom(e.target.value)} placeholder="Scrie mesajul..." rows={5}
                style={{...S.inp, width:'100%', marginTop:8, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.5}}/>
            )}
          </div>
          {textFinal && selList.length>0 && (
            <div style={{...S.card, padding:12, borderColor:'rgba(74,222,128,0.2)', background:'rgba(74,222,128,0.04)'}}>
              <div style={{...S.lbl, color:'rgba(74,222,128,0.6)'}}>Preview — {selList[0].nume_client?.split(' ')[0]}</div>
              <div style={{fontSize:11, color:'rgba(214,228,244,0.75)', whiteSpace:'pre-wrap', lineHeight:1.6}}>{_apply(textFinal, selList[0])}</div>
            </div>
          )}
          <button onClick={porneste} disabled={!textFinal||selList.length===0||trimitere}
            style={{padding:'13px', borderRadius:10, border:'none', width:'100%', fontSize:13, fontWeight:700, cursor:!textFinal||selList.length===0||trimitere?'not-allowed':'pointer',
              background:!textFinal||selList.length===0||trimitere?'rgba(159,215,255,0.08)':'linear-gradient(135deg,#22C55E,#16A34A)',
              color:!textFinal||selList.length===0||trimitere?'rgba(159,215,255,0.25)':'#fff'}}>
            {trimitere?`⏳ ${trimiteIdx+1}/${selList.length}...`:`🚀 Pornește — ${selList.length} mesaje`}
          </button>
          <div style={{fontSize:10, color:'rgba(159,215,255,0.2)', lineHeight:1.6}}>
            Variabile: <span style={{color:'rgba(159,215,255,0.35)'}}>{'{nume}'} {'{apartament}'} {'{checkin}'} {'{checkout}'}</span>
          </div>
        </div>
      </div>
      <Toast toast={mToast}/>
    </div>
  )
}

const TIPURI = [
  { k: 'checkin', l: '📥 Check-in', color: '#4ADE80' },
  { k: 'checkout', l: '📤 Check-out', color: '#7BC8FF' },
  { k: 'acces', l: '🔑 Acces & Parcare', color: '#FCD34D' },
  { k: 'reguli', l: '📋 Reguli casă', color: '#FB923C' },
  { k: 'altele', l: '💬 Altele', color: '#A78BFA' },
]

const REGION_BADGE: Record<string,{label:string;color:string;bg:string}> = {
  bucuresti: { label:'București', color:'#FCD34D', bg:'rgba(252,211,77,0.1)' },
  moldova:   { label:'Moldova',   color:'#7BC8FF', bg:'rgba(123,200,255,0.1)' },
  alte:      { label:'România',   color:'rgba(159,215,255,0.4)', bg:'rgba(159,215,255,0.06)' },
}

function GeneratorLocatiiContent() {
  const [usedSet, setUsedSet] = useState<Set<number>>(() => {
    try { const s=localStorage.getItem('loc_used_v1'); return s ? new Set(JSON.parse(s) as number[]) : new Set() }
    catch { return new Set() }
  })
  const [batch, setBatch] = useState<AdresaCard[]>([])
  const [copiedKey, setCopiedKey] = useState<string|null>(null)

  useEffect(() => { setBatch(generateBatch(usedSet,4)) }, [])

  function saveUsed(s: Set<number>) {
    try { localStorage.setItem('loc_used_v1', JSON.stringify([...s])) } catch {}
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(()=>setCopiedKey(k=>k===key?null:k), 1400)
    })
  }

  function dismiss(card: AdresaCard) {
    const newUsed = new Set(usedSet); newUsed.add(card.idx); saveUsed(newUsed); setUsedSet(newUsed)
    setBatch(prev => {
      const pos = prev.findIndex(b=>b.idx===card.idx)
      const rest = prev.filter(b=>b.idx!==card.idx)
      const taken = new Set([...newUsed, ...rest.map(b=>b.idx)])
      const next = generateOne(taken)
      if (!next) return rest
      const r=[...rest]; r.splice(pos,0,next); return r
    })
  }

  function reset() {
    const empty = new Set<number>(); saveUsed(empty); setUsedSet(empty)
    setBatch(generateBatch(empty,4))
  }

  const remaining = TOTAL - usedSet.size
  const allDone = batch.length===0

  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'rgba(159,215,255,0.3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }
  const val: React.CSSProperties = { fontSize:13, fontWeight:600, color:'#E8F4FF', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }
  const cpyBtn = (copied:boolean): React.CSSProperties => ({
    padding:'3px 8px', borderRadius:5, flexShrink:0,
    border:`1px solid ${copied?'rgba(74,222,128,0.45)':'rgba(100,160,255,0.18)'}`,
    background:copied?'rgba(74,222,128,0.1)':'rgba(100,160,255,0.05)',
    color:copied?'#4ADE80':'rgba(159,215,255,0.4)', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap'
  })

  return (
    <div style={{flex:1, overflowY:'auto', padding:'0 20px 40px'}}>

      {/* Bara de status */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', margin:'14px 0 16px', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{fontSize:12, color:'rgba(159,215,255,0.35)'}}>
            10% București · 60% Moldova · 30% restul României
          </div>
          <div style={{fontSize:12, fontWeight:600, color: remaining<20?'rgba(251,146,60,0.8)':'rgba(159,215,255,0.5)'}}>
            {usedSet.size}/{TOTAL} folosite · {remaining} rămase
          </div>
        </div>
        <button onClick={reset}
          style={{padding:'7px 16px', borderRadius:8, border:'1px solid rgba(251,146,60,0.3)',
            background:'rgba(251,146,60,0.06)', color:'rgba(251,146,60,0.7)', fontSize:11, fontWeight:700, cursor:'pointer'}}>
          Resetează toate
        </button>
      </div>

      {/* Toate epuizate */}
      {allDone ? (
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'60px 20px', gap:16, background:'rgba(11,18,36,0.6)', borderRadius:16,
          border:'1px solid rgba(100,160,255,0.1)'}}>
          <div style={{fontSize:36}}>🎉</div>
          <div style={{fontSize:16, fontWeight:700, color:'#E8F4FF'}}>Toate adresele au fost folosite</div>
          <div style={{fontSize:12, color:'rgba(159,215,255,0.4)'}}>Ai epuizat cele {TOTAL} adrese din baza de date.</div>
          <button onClick={reset}
            style={{padding:'10px 28px', borderRadius:10, border:'none',
              background:'linear-gradient(135deg,#4DA3FF,#3B82F6)', color:'#fff',
              fontSize:13, fontWeight:700, cursor:'pointer'}}>
            🔄 Resetează și reia de la capăt
          </button>
        </div>
      ) : (
        /* Grid 4 pe orizontală */
        <div style={{display:'flex', gap:12, alignItems:'stretch'}}>
          {batch.map((a) => {
            const badge = REGION_BADGE[a.region]
            const ck = (f:string) => `${a.idx}-${f}`
            return (
              <div key={a.idx} style={{flex:1, minWidth:0, background:'rgba(11,18,36,0.8)',
                border:'1px solid rgba(100,160,255,0.12)', borderRadius:14,
                display:'flex', flexDirection:'column'}}>

                {/* Header card */}
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 12px 8px', borderBottom:'1px solid rgba(100,160,255,0.07)'}}>
                  <span style={{fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5,
                    background:badge.bg, color:badge.color, letterSpacing:'.06em'}}>
                    📍 {badge.label}
                  </span>
                  <button onClick={()=>dismiss(a)} title="Marchează ca folosit"
                    style={{padding:'3px 8px', borderRadius:5, border:'1px solid rgba(74,222,128,0.25)',
                      background:'rgba(74,222,128,0.07)', color:'rgba(74,222,128,0.6)',
                      fontSize:10, fontWeight:700, cursor:'pointer'}}>
                    ✓ Folosit
                  </button>
                </div>

                {/* Câmpuri */}
                <div style={{padding:'12px 12px 14px', display:'flex', flexDirection:'column', gap:10, flex:1}}>
                  {([
                    {key:'judet',      label:'Județ / Sector', value:a.judet},
                    {key:'localitate', label:'Localitate',      value:a.localitate},
                    {key:'adresa',     label:'Adresă',          value:a.adresa},
                  ] as const).map(f=>(
                    <div key={f.key}>
                      <div style={lbl}>{f.label}</div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <div style={val}>{f.value}</div>
                        <button style={cpyBtn(copiedKey===ck(f.key))} onClick={()=>copy(f.value,ck(f.key))}>
                          {copiedKey===ck(f.key)?'✓':'📋'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SabloanePage() {
  const [mainTab, setMainTab] = useState<'sabloane'|'mesaje'|'locatii'>('sabloane')
  const [apts, setApts] = useState<any[]>([])
  const [selApt, setSelApt] = useState<any>(null)
  const [sabloane, setSabloane] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume').eq('status','activ').order('nota')
      .then(({data}) => { setApts(data||[]); if(data?.length) { setSelApt(data[0]); loadSabloane(data[0].id) } })
  }, [])

  async function loadSabloane(aptId: string) {
    setLoading(true)
    const { data } = await supabase.from('sabloane_mesaje')
      .select('*').eq('apartament_id', aptId).order('tip')
    setSabloane(data||[])
    setLoading(false)
  }

  async function saveSablon() {
    if (!editing || !selApt) return
    if (editing.id) {
      await supabase.from('sabloane_mesaje').update({
        tip: editing.tip, titlu: editing.titlu,
        text: editing.text, poze: editing.poze,
      }).eq('id', editing.id)
    } else {
      await supabase.from('sabloane_mesaje').insert({
        apartament_id: selApt.id,
        tip: editing.tip, titlu: editing.titlu,
        text: editing.text, poze: editing.poze||[],
      })
    }
    show('success', '✓ Salvat')
    setEditing(null)
    loadSabloane(selApt.id)
  }

  async function deleteSablon(id: string) {
    await supabase.from('sabloane_mesaje').delete().eq('id', id)
    loadSabloane(selApt.id)
  }

  async function uploadPoza(file: File) {
    setUploading(true)
    const path = `sabloane/${selApt.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('Facturi').upload(path, file, { upsert: true })
    if (error) { show('error', error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('Facturi').getPublicUrl(path)
    setEditing((prev:any) => ({ ...prev, poze: [...(prev.poze||[]), urlData.publicUrl] }))
    setUploading(false)
  }

  function waMessage(s: any, client: string = '') {
    let msg = s.text || ''
    if (client) msg = msg.replace(/{nume}/g, client)
    if (s.poze?.length) msg += '\n\n' + s.poze.join('\n')
    return msg
  }

  const glassCard = { background:'rgba(11,18,36,0.7)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:14 }

  const tabStyle = (a: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none',
    background: a ? 'rgba(77,163,255,0.15)' : 'transparent',
    color: a ? '#4DA3FF' : 'rgba(159,215,255,0.5)',
    borderBottom: a ? '2px solid #4DA3FF' : '2px solid transparent',
  })

  return (
    <>
      <PageHeader title="Șabloane Mesaje" subtitle="Mesaje prestabilite și mesaje în masă WhatsApp"/>
      <div style={{display:'flex', gap:4, padding:'0 20px', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <button style={tabStyle(mainTab==='sabloane')} onClick={()=>setMainTab('sabloane')}>📋 Șabloane</button>
        <button style={tabStyle(mainTab==='mesaje')} onClick={()=>setMainTab('mesaje')}>📨 Mesaje în masă</button>
        <button style={tabStyle(mainTab==='locatii')} onClick={()=>setMainTab('locatii')}>📍 Generator Locații</button>
      </div>
      {mainTab==='mesaje' && <MesajeMasaContent/>}
      {mainTab==='locatii' && <GeneratorLocatiiContent/>}
      {mainTab==='sabloane' && <div style={{flex:1, overflowY:'auto', padding:'0 20px 40px'}}>

        {/* Selector apartament */}
        <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' as const}}>
          {apts.map(a => (
            <button key={a.id} onClick={() => { setSelApt(a); loadSabloane(a.id); setEditing(null) }}
              style={{padding:'6px 14px', borderRadius:9, border:`1px solid ${selApt?.id===a.id?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.12)'}`,
                background:selApt?.id===a.id?'rgba(77,163,255,0.15)':'transparent',
                color:selApt?.id===a.id?'#7BC8FF':'rgba(159,215,255,0.5)', fontSize:12, fontWeight:600, cursor:'pointer'}}>
              {a.nota}
            </button>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 400px', gap:16, alignItems:'start'}}>

          {/* Lista sabloane */}
          <div style={{display:'flex', flexDirection:'column' as const, gap:10}}>
            <button onClick={() => setEditing({tip:'checkin', titlu:'', text:'', poze:[]})}
              style={{display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:10,
                border:'1px dashed rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.06)',
                color:'#7BC8FF', fontSize:13, fontWeight:600, cursor:'pointer'}}>
              <Plus size={16}/> Adaugă șablon nou
            </button>

            {loading && <div style={{padding:24, textAlign:'center' as const, color:'rgba(159,215,255,0.3)'}}>Se încarcă...</div>}

            {sabloane.map(s => {
              const tip = TIPURI.find(t => t.k === s.tip)
              return (
                <div key={s.id} style={{...glassCard, padding:16}}>
                  <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10}}>
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                        <span style={{fontSize:11, padding:'2px 8px', borderRadius:5, background:`${tip?.color||'#7BC8FF'}18`,
                          border:`1px solid ${tip?.color||'#7BC8FF'}30`, color:tip?.color||'#7BC8FF', fontWeight:700}}>
                          {tip?.l || s.tip}
                        </span>
                        <span style={{fontSize:14, fontWeight:600, color:'#E8F4FF'}}>{s.titlu}</span>
                      </div>
                      <div style={{fontSize:12, color:'rgba(159,215,255,0.5)', whiteSpace:'pre-wrap' as const, lineHeight:1.5, maxHeight:80, overflow:'hidden'}}>
                        {s.text}
                      </div>
                      {s.poze?.length > 0 && (
                        <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap' as const}}>
                          {s.poze.map((url:string, i:number) => (
                            <a key={i} href={url} target="_blank" rel="noopener">
                              <img src={url} alt="" style={{width:60, height:60, borderRadius:7, objectFit:'cover' as const, border:'1px solid rgba(100,160,255,0.2)'}}/>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex', gap:6, flexShrink:0}}>
                      <button onClick={() => setEditing({...s})}
                        style={{padding:'5px 10px', borderRadius:7, border:'1px solid rgba(252,211,77,0.3)', background:'rgba(252,211,77,0.08)', color:'#FCD34D', fontSize:11, cursor:'pointer'}}>
                        ✏️
                      </button>
                      <button onClick={() => deleteSablon(s.id)}
                        style={{padding:'5px 10px', borderRadius:7, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer'}}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                  {/* Preview WhatsApp */}
                  <a href={`https://wa.me/?text=${encodeURIComponent(waMessage(s))}`} target="_blank" rel="noopener"
                    style={{display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8,
                      border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.08)',
                      color:'#4ADE80', fontSize:12, fontWeight:600, textDecoration:'none', marginTop:4}}>
                    <Send size={12}/> Test WhatsApp
                  </a>
                </div>
              )
            })}

            {!loading && sabloane.length === 0 && (
              <div style={{padding:32, textAlign:'center' as const, color:'rgba(159,215,255,0.3)', fontSize:13}}>
                Niciun șablon pentru {selApt?.nota}. Adaugă primul!
              </div>
            )}
          </div>

          {/* Editor */}
          {editing && (
            <div style={{...glassCard, padding:18, position:'sticky' as const, top:16}}>
              <div style={{fontSize:14, fontWeight:700, color:'#E8F4FF', marginBottom:14}}>
                {editing.id ? '✏️ Editează șablon' : '➕ Șablon nou'}
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Tip</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap' as const}}>
                  {TIPURI.map(t => (
                    <button key={t.k} onClick={() => setEditing((p:any) => ({...p, tip:t.k}))}
                      style={{padding:'4px 10px', borderRadius:7, border:`1px solid ${editing.tip===t.k?t.color+'60':'rgba(159,215,255,0.1)'}`,
                        background:editing.tip===t.k?t.color+'18':'transparent',
                        color:editing.tip===t.k?t.color:'rgba(159,215,255,0.45)', fontSize:11, cursor:'pointer'}}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Titlu</div>
                <input value={editing.titlu} onChange={e => setEditing((p:any) => ({...p, titlu:e.target.value}))}
                  placeholder="ex: Detalii check-in L99"
                  style={{width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8,
                    color:'rgba(214,228,244,0.9)', fontSize:13, padding:'8px 10px', outline:'none', boxSizing:'border-box' as const}}/>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:5, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>
                  Text mesaj &nbsp;<span style={{color:'rgba(159,215,255,0.3)'}}>— folosește {'{nume}'} pentru prenumele clientului</span>
                </div>
                <textarea value={editing.text} onChange={e => setEditing((p:any) => ({...p, text:e.target.value}))}
                  rows={8} placeholder="Bună ziua, {nume}!&#10;&#10;Detalii check-in..."
                  style={{width:'100%', background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8,
                    color:'rgba(214,228,244,0.9)', fontSize:12, padding:'8px 10px', outline:'none',
                    resize:'vertical' as const, fontFamily:'inherit', boxSizing:'border-box' as const, lineHeight:1.6}}/>
              </div>

              {/* Upload poze */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:8, textTransform:'uppercase' as const, letterSpacing:'.06em'}}>Poze / Imagini</div>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={async e => {
                  const files = Array.from(e.target.files||[])
                  for (const f of files) await uploadPoza(f)
                  e.target.value = ''
                }} style={{display:'none'}}/>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9,
                    border:'1px dashed rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.06)',
                    color:'#7BC8FF', fontSize:12, cursor:'pointer', marginBottom:8, opacity:uploading?0.6:1}}>
                  <Upload size={13}/> {uploading ? 'Se încarcă...' : 'Adaugă poze'}
                </button>
                {editing.poze?.length > 0 && (
                  <div style={{display:'flex', gap:6, flexWrap:'wrap' as const}}>
                    {editing.poze.map((url:string, i:number) => (
                      <div key={i} style={{position:'relative' as const}}>
                        <img src={url} alt="" style={{width:70, height:70, borderRadius:8, objectFit:'cover' as const, border:'1px solid rgba(100,160,255,0.2)'}}/>
                        <button onClick={() => setEditing((p:any) => ({...p, poze:p.poze.filter((_:any,j:number)=>j!==i)}))}
                          style={{position:'absolute' as const, top:-4, right:-4, width:18, height:18, borderRadius:'50%',
                            border:'none', background:'#F87171', color:'#fff', fontSize:10, cursor:'pointer',
                            display:'flex', alignItems:'center', justifyContent:'center'}}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display:'flex', gap:8}}>
                <button onClick={saveSablon}
                  style={{flex:1, padding:'10px', borderRadius:9, border:'none', background:'rgba(77,163,255,0.8)',
                    color:'#0E1B2B', fontSize:13, fontWeight:700, cursor:'pointer'}}>
                  💾 Salvează
                </button>
                <button onClick={() => setEditing(null)}
                  style={{padding:'10px 14px', borderRadius:9, border:'1px solid rgba(159,215,255,0.15)',
                    background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:13, cursor:'pointer'}}>
                  Anulează
                </button>
              </div>
            </div>
          )}
        </div>
      </div>}
      <Toast toast={toast}/>
    </>
  )
}
