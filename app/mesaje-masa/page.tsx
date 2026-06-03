'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'

const pad = (n:number) => String(n).padStart(2,'0')
const fmt = (d:string) => { try { const dt=new Date(d); return `${pad(dt.getDate())}.${pad(dt.getMonth()+1)}.${dt.getFullYear()}` } catch { return d } }

const SABLOANE = [
  { key:'revenire',   label:'🏠 Invitație revenire', text:'Buna ziua, {nume}!\n\nSperam ca v-a placut sejurul la AB Homes Iasi!\n\nDaca planificati o noua vizita in Iasi, va asteptam cu drag. Avem apartamente moderne in zone centrale, cu self check-in si tot confortul. 🏠\n\nScriati-ne pentru disponibilitate!\n\nEchipa AB Homes Iasi' },
  { key:'confirmare', label:'✅ Confirmare rezervare', text:'Buna ziua, {nume}! 👋\n\nVa confirmam rezervarea la *{apartament}* pentru *{checkin}* → *{checkout}*.\n\nVa asteptam cu drag!\nEchipa AB Homes Iasi' },
  { key:'checkin',    label:'📅 Reminder check-in',  text:'Buna ziua, {nume}! 😊\n\nVa reamintim ca maine, *{checkin}*, aveti rezervarea la *{apartament}*.\n\nVa vom trimite detaliile de acces in ziua sosirii.\nEchipa AB Homes Iasi' },
  { key:'checkout',   label:'🌅 Reminder check-out', text:'Buna ziua, {nume}!\n\nVa reamintim ca astazi este ziua check-out-ului din *{apartament}*.\n\n⏰ Ora de check-out: 11:00\n🔑 Va rugam sa lasati cheia la usa.\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'review',     label:'⭐ Cerere review',       text:'Buna ziua, {nume}! 🙏\n\nSperam ca ati avut o sedere placuta la *{apartament}*.\n\nNe-ar bucura mult un review pe platforma!\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'custom',     label:'✏️ Personalizat',        text:'' },
]

function waLink(phone:string, msg:string){
  const clean = phone.replace(/\D/g,'')
  const nr = clean.startsWith('40') ? clean : clean.startsWith('0') ? '4'+clean : '40'+clean
  return `https://wa.me/${nr}?text=${encodeURIComponent(msg.normalize('NFC'))}`
}

function apply(text:string, r:any){
  const firstName = (r.nume_client||'').split(' ')[0]
  const apt = r.apartament?.nota || r.apartament?.nume || ''
  return text.replace(/{nume}/g,firstName).replace(/{apartament}/g,apt)
    .replace(/{checkin}/g,fmt(r.data_checkin||'')).replace(/{checkout}/g,fmt(r.data_checkout||''))
}

export default function MesajeMasaPage() {
  const [clienti, setClienti] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sablon, setSablon] = useState(SABLOANE[0])
  const [textCustom, setTextCustom] = useState('')
  const [selectati, setSelectati] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filtru, setFiltru] = useState('checkout_30')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [trimitere, setTrimitre] = useState(false)
  const [trimiteIdx, setTrimiteIdx] = useState(-1)
  const { toast, show } = useToast()

  const now = new Date()
  const today = now.toISOString().slice(0,10)

  useEffect(() => { load() }, [filtru, dateFrom, dateTo])

  async function load() {
    setLoading(true)
    const d30 = new Date(now.getTime()-30*86400000).toISOString().slice(0,10)
    const d7  = new Date(now.getTime()+7*86400000).toISOString().slice(0,10)
    const maine = new Date(now.getTime()+86400000).toISOString().slice(0,10)

    let q = supabase.from('rezervari')
      .select('id,nume_client,telefon_client,canal,data_checkin,data_checkout,apartament_id')
      .not('telefon_client','is',null)
      .neq('status_rezervare','anulata')
      .order('data_checkin',{ascending:false})
      .limit(1000)

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
      window.open(waLink(selList[i].telefon_client, apply(textFinal,selList[i])), '_blank')
      if (i < selList.length-1) await new Promise(r=>setTimeout(r,700))
    }
    setTrimitre(false); setTrimiteIdx(-1)
    show('success',`✓ ${selList.length} linkuri deschise`)
  }

  const inp = {background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'7px 12px',outline:'none'} as const
  const card = {background:'rgba(11,18,36,0.75)',border:'1px solid rgba(100,160,255,0.12)',borderRadius:14} as const

  return (
    <>
      <PageHeader title="Mesaje în masă WhatsApp" subtitle={loading ? 'Se încarcă...' : `${clienti.length} clienți unici`}/>

      <div style={{flex:1,overflowY:'auto',padding:'12px 20px 40px'}}>

        {/* ── Filtre perioadă ── */}
        <div style={{...card,padding:'12px 16px',marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Perioadă</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[
              {k:'checkout_30',l:'🔥 Checkout 30 zile'},
              {k:'checkin_azi',l:'Check-in azi'},
              {k:'checkin_maine',l:'Check-in mâine'},
              {k:'checkin_7',l:'Check-in 7 zile'},
              {k:'checkout_azi',l:'Check-out azi'},
              {k:'toate',l:'Toți (aug 2025+)'},
              {k:'custom',l:'📅 Personalizată'},
            ].map(f=>(
              <button key={f.k} onClick={()=>setFiltru(f.k)}
                style={{padding:'5px 12px',borderRadius:7,border:`1px solid ${filtru===f.k?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.1)'}`,background:filtru===f.k?'rgba(77,163,255,0.15)':'transparent',color:filtru===f.k?'#7BC8FF':'rgba(159,215,255,0.45)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                {f.l}
              </button>
            ))}
          </div>
          {filtru==='custom' && (
            <div style={{display:'flex',gap:10,marginTop:10}}>
              <div><div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginBottom:4}}>De la</div><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={inp}/></div>
              <div><div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginBottom:4}}>Până la</div><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={inp}/></div>
            </div>
          )}
        </div>

        {/* ── Grid principal ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:12,alignItems:'start'}}>

          {/* Lista clienți */}
          <div style={{...card,overflow:'hidden'}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:'1px solid rgba(100,160,255,0.08)'}}>
              <input type="checkbox"
                checked={filtered.length>0&&filtered.every(r=>selectati.has(r.id))}
                onChange={()=>{
                  const allSel = filtered.every(r=>selectati.has(r.id))
                  setSelectati(prev=>{const n=new Set(prev);filtered.forEach(r=>allSel?n.delete(r.id):n.add(r.id));return n})
                }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Caută client..."
                style={{...inp,flex:1,maxWidth:200}}/>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.45)',marginLeft:'auto',whiteSpace:'nowrap'}}>
                {selList.length}/{filtered.length} selectați
              </span>
            </div>
            {/* Rows */}
            <div style={{maxHeight:440,overflowY:'auto'}}>
              {filtered.length===0
                ? <div style={{padding:32,textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:12}}>
                    {loading?'Se încarcă...':'Niciun client'}
                  </div>
                : filtered.map(r=>{
                  const sel = selectati.has(r.id)
                  return(
                    <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderBottom:'1px solid rgba(100,160,255,0.04)',background:sel?'rgba(77,163,255,0.03)':'transparent'}}>
                      <input type="checkbox" checked={sel}
                        onChange={()=>{setSelectati(prev=>{const n=new Set(prev);sel?n.delete(r.id):n.add(r.id);return n})}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nume_client}</div>
                        <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {r.telefon_client} · {r.apartament?.nota||''} · {fmt(r.data_checkin)}→{fmt(r.data_checkout)}
                        </div>
                      </div>
                      {textFinal&&r.telefon_client&&(
                        <a href={waLink(r.telefon_client,apply(textFinal,r))} target="_blank" rel="noopener"
                          style={{padding:'4px 9px',borderRadius:6,border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',color:'#4ADE80',fontSize:11,fontWeight:600,textDecoration:'none',flexShrink:0}}>
                          💬
                        </a>
                      )}
                    </div>
                  )
                })
              }
            </div>
          </div>

          {/* Panou dreapta */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>

            {/* Șabloane */}
            <div style={{...card,padding:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Șablon</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {SABLOANE.map(s=>(
                  <button key={s.key} onClick={()=>setSablon(s)}
                    style={{padding:'7px 10px',borderRadius:7,border:`1px solid ${sablon.key===s.key?'rgba(77,163,255,0.4)':'rgba(159,215,255,0.08)'}`,background:sablon.key===s.key?'rgba(77,163,255,0.12)':'transparent',color:sablon.key===s.key?'#7BC8FF':'rgba(159,215,255,0.45)',fontSize:11,cursor:'pointer',textAlign:'left'}}>
                    {s.label}
                  </button>
                ))}
              </div>
              {sablon.key==='custom' && (
                <textarea value={textCustom} onChange={e=>setTextCustom(e.target.value)}
                  placeholder="Scrie mesajul..." rows={5}
                  style={{...inp,width:'100%',marginTop:8,resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/>
              )}
            </div>

            {/* Preview */}
            {textFinal && selList.length>0 && (
              <div style={{...card,padding:12,borderColor:'rgba(74,222,128,0.15)',background:'rgba(74,222,128,0.03)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'rgba(74,222,128,0.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>
                  Preview — {selList[0].nume_client?.split(' ')[0]}
                </div>
                <div style={{fontSize:11,color:'rgba(214,228,244,0.7)',whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:120,overflowY:'auto'}}>
                  {apply(textFinal,selList[0])}
                </div>
              </div>
            )}

            {/* Buton trimitere */}
            <button onClick={porneste} disabled={!textFinal||selList.length===0||trimitere}
              style={{padding:'13px 0',borderRadius:10,border:'none',width:'100%',
                background:!textFinal||selList.length===0||trimitere?'rgba(159,215,255,0.08)':'linear-gradient(135deg,#22C55E,#16A34A)',
                color:!textFinal||selList.length===0||trimitere?'rgba(159,215,255,0.25)':'#fff',
                fontSize:13,fontWeight:700,cursor:!textFinal||selList.length===0||trimitere?'not-allowed':'pointer'}}>
              {trimitere ? `⏳ ${trimiteIdx+1}/${selList.length} se deschide...` : `🚀 Pornește — ${selList.length} mesaje`}
            </button>

            <div style={{fontSize:10,color:'rgba(159,215,255,0.25)',lineHeight:1.6}}>
              Variabile: <span style={{color:'rgba(159,215,255,0.4)'}}>{'{nume}'} {'{apartament}'} {'{checkin}'} {'{checkout}'}</span>
            </div>
          </div>
        </div>
      </div>
      <Toast toast={toast}/>
    </>
  )
}
