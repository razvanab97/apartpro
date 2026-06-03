'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'

const pad = (n:number) => String(n).padStart(2,'0')
const fmt = (d:string) => { try { const dt=new Date(d); return `${pad(dt.getDate())}.${pad(dt.getMonth()+1)}.${dt.getFullYear()}` } catch { return d } }

const SABLOANE = [
  { key:'revenire', label:'🏠 Invitație revenire', text:'Buna ziua, {nume}! 👋\n\nSperam ca v-a placut sejurul la AB Homes Iasi!\n\nDaca planificati o noua vizita in Iasi, va asteptam cu drag. Avem apartamente moderne in zone centrale, cu self check-in si tot confortul necesar. 🏠\n\nScriati-ne pentru disponibilitate si cea mai buna oferta!\n\nEchipa AB Homes Iasi' },
  { key:'confirmare', label:'✅ Confirmare rezervare', text:'Buna ziua, {nume}! 👋\n\nVa confirmam rezervarea la *{apartament}* pentru *{checkin}* → *{checkout}*.\n\nVa asteptam cu drag!\nEchipa AB Homes Iasi' },
  { key:'checkin', label:'📅 Reminder check-in', text:'Buna ziua, {nume}! 😊\n\nVa reamintim ca maine, *{checkin}*, aveti rezervarea la *{apartament}*.\n\nVa vom trimite detaliile de acces in ziua sosirii.\nEchipa AB Homes Iasi' },
  { key:'checkout', label:'🌅 Reminder check-out', text:'Buna ziua, {nume}!\n\nVa reamintim ca astazi este ziua check-out-ului din *{apartament}*.\n\n⏰ Ora de check-out: 11:00\n🔑 Va rugam sa lasati cheia la usa.\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'review', label:'⭐ Cerere review', text:'Buna ziua, {nume}! 🙏\n\nSperam ca ati avut o sedere placuta la *{apartament}*.\n\nNe-ar bucura mult un review pe platforma!\n\nVa multumim!\nEchipa AB Homes Iasi' },
  { key:'custom', label:'✏️ Mesaj personalizat', text:'' },
]

function waLink(phone:string, msg:string){
  const clean = phone.replace(/\D/g,'')
  const nr = clean.startsWith('40') ? clean : clean.startsWith('0') ? '4'+clean : '40'+clean
  return `https://wa.me/${nr}?text=${encodeURIComponent(msg.normalize('NFC'))}`
}

function applyTemplate(text:string, r:any){
  const firstName = (r.nume_client||'').split(' ')[0]
  const apt = r.apartament?.nota || r.apartament?.nume || ''
  return text
    .replace(/{nume}/g, firstName)
    .replace(/{apartament}/g, apt)
    .replace(/{checkin}/g, fmt(r.data_checkin||''))
    .replace(/{checkout}/g, fmt(r.data_checkout||''))
}

export default function MesajeMasaPage() {
  const [clienti, setClienti] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sablon, setSablon] = useState(SABLOANE[0])
  const [textCustom, setTextCustom] = useState('')
  const [selectati, setSelectati] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtruTip, setFiltruTip] = useState('checkout_30')
  const [trimiteIdx, setTrimiteIdx] = useState<number>(-1)
  const [trimitere, setTrimitre] = useState(false)
  const [apts, setApts] = useState<any[]>([])
  const { toast, show } = useToast()

  const now = new Date()
  const today = now.toISOString().slice(0,10)

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume').then(({data})=>setApts(data||[]))
    load()
  }, [filtruTip, dateFrom, dateTo])

  async function load() {
    setLoading(true)
    const d30ago = new Date(now.getTime()-30*86400000).toISOString().slice(0,10)
    const d7 = new Date(now.getTime()+7*86400000).toISOString().slice(0,10)
    const maine = new Date(now.getTime()+86400000).toISOString().slice(0,10)

    let q = supabase.from('rezervari')
      .select('id,nume_client,telefon_client,canal,data_checkin,data_checkout,apartament_id')
      .not('telefon_client','is',null)
      .neq('status_rezervare','anulata')
      .order('data_checkin',{ascending:false})
      .limit(1000)

    if (filtruTip === 'custom' && dateFrom && dateTo) {
      q = q.gte('data_checkout', dateFrom).lte('data_checkout', dateTo)
    } else if (filtruTip === 'checkout_30') {
      q = q.gte('data_checkout', d30ago).lte('data_checkout', today)
    } else if (filtruTip === 'checkin_azi') {
      q = q.eq('data_checkin', today)
    } else if (filtruTip === 'checkin_maine') {
      q = q.eq('data_checkin', maine)
    } else if (filtruTip === 'checkout_azi') {
      q = q.eq('data_checkout', today)
    } else if (filtruTip === 'checkin_7') {
      q = q.gte('data_checkin', today).lte('data_checkin', d7)
    } else if (filtruTip === 'toate') {
      q = q.gte('data_checkin', '2025-08-01')
    }

    const {data} = await q
    const {data: aptsData} = await supabase.from('apartamente').select('id,nota,nume')
    const aptMap = new Map((aptsData||[]).map((a:any)=>[a.id,a]))

    // Deduplicate by phone
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
  const filtered = clienti.filter(r =>
    !search || (r.nume_client||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.telefon_client||'').includes(search)
  )
  const selectatiFiltered = filtered.filter(r => selectati.has(r.id))

  async function pornesteTrimitere() {
    if (!textFinal || selectatiFiltered.length === 0) return
    setTrimitre(true)
    setTrimiteIdx(0)
    // Open links one by one with small delay
    for (let i = 0; i < selectatiFiltered.length; i++) {
      setTrimiteIdx(i)
      const r = selectatiFiltered[i]
      const msg = applyTemplate(textFinal, r)
      const link = waLink(r.telefon_client||'', msg)
      window.open(link, '_blank')
      if (i < selectatiFiltered.length - 1) {
        await new Promise(res => setTimeout(res, 800))
      }
    }
    setTrimitre(false)
    setTrimiteIdx(-1)
    show('success', `✓ ${selectatiFiltered.length} linkuri WhatsApp deschise`)
  }

  const glassCard = {background:'rgba(11,18,36,0.7)',border:'1px solid rgba(100,160,255,0.12)',borderRadius:14}

  return (
    <>
      <PageHeader title="Mesaje în masă WhatsApp" subtitle={`${clienti.length} clienți unici`}/>
      <div style={{flex:1,overflowY:'auto',padding:'0 20px 40px',display:'flex',flexDirection:'column' as const,gap:14}}>

        {/* Filtre */}
        <div style={{...glassCard,padding:'14px 16px'}}>
          <div style={{fontSize:11,fontWeight:600,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:10}}>Selectare clienți</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:10}}>
            {[
              {k:'checkout_30',l:'🔥 Checkout 30 zile'},
              {k:'checkin_azi',l:'Check-in azi'},
              {k:'checkin_maine',l:'Check-in mâine'},
              {k:'checkin_7',l:'Check-in 7 zile'},
              {k:'checkout_azi',l:'Check-out azi'},
              {k:'toate',l:'Toți (aug 2025+)'},
              {k:'custom',l:'📅 Perioadă personalizată'},
            ].map(f=>(
              <button key={f.k} onClick={()=>setFiltruTip(f.k)}
                style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${filtruTip===f.k?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.12)'}`,background:filtruTip===f.k?'rgba(77,163,255,0.15)':'transparent',color:filtruTip===f.k?'#7BC8FF':'rgba(159,215,255,0.5)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                {f.l}
              </button>
            ))}
          </div>
          {filtruTip==='custom' && (
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' as const}}>
              <div>
                <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4}}>De la checkout</div>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'7px 10px',outline:'none'}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4}}>Până la checkout</div>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'7px 10px',outline:'none'}}/>
              </div>
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:14,alignItems:'start'}}>

          {/* Lista clienti */}
          <div style={{...glassCard,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(11,18,32,0.5)',borderBottom:'1px solid rgba(100,160,255,0.08)'}}>
              <input type="checkbox"
                checked={filtered.length>0 && filtered.every(r=>selectati.has(r.id))}
                onChange={()=>{
                  const allSel = filtered.every(r=>selectati.has(r.id))
                  const n = new Set(selectati)
                  filtered.forEach(r => allSel ? n.delete(r.id) : n.add(r.id))
                  setSelectati(n)
                }} style={{cursor:'pointer'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Caută..."
                style={{background:'rgba(20,38,65,0.6)',border:'1px solid rgba(100,160,255,0.15)',borderRadius:7,color:'rgba(214,228,244,0.7)',fontSize:11,padding:'5px 10px',outline:'none',width:160}}/>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginLeft:'auto'}}>
                {loading?'...':`${selectatiFiltered.length}/${filtered.length} selectați`}
              </span>
            </div>
            <div style={{maxHeight:420,overflowY:'auto' as const}}>
              {filtered.map((r,i)=>{
                const sel = selectati.has(r.id)
                const msg = textFinal ? applyTemplate(textFinal,r) : ''
                const link = textFinal&&r.telefon_client ? waLink(r.telefon_client,msg) : '#'
                return(
                  <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:'1px solid rgba(100,160,255,0.04)',background:sel?'rgba(77,163,255,0.04)':'transparent',opacity:trimiteIdx===i?0.5:1}}>
                    <input type="checkbox" checked={sel}
                      onChange={()=>{const n=new Set(selectati);sel?n.delete(r.id):n.add(r.id);setSelectati(n)}}
                      style={{cursor:'pointer',flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#E8F4FF'}}>{r.nume_client}</div>
                      <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>
                        {r.telefon_client} · {r.apartament?.nota||''} · {fmt(r.data_checkin)}→{fmt(r.data_checkout)}
                      </div>
                    </div>
                    {textFinal&&r.telefon_client&&(
                      <a href={link} target="_blank" rel="noopener"
                        style={{padding:'4px 10px',borderRadius:6,border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',color:'#4ADE80',fontSize:10,fontWeight:600,textDecoration:'none',flexShrink:0}}>
                        💬
                      </a>
                    )}
                  </div>
                )
              })}
              {!loading&&filtered.length===0&&(
                <div style={{padding:24,textAlign:'center' as const,color:'rgba(159,215,255,0.3)',fontSize:12}}>Niciun client</div>
              )}
            </div>
          </div>

          {/* Sablon + trimitere */}
          <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
            <div style={{...glassCard,padding:14}}>
              <div style={{fontSize:11,fontWeight:600,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:8}}>Șablon mesaj</div>
              <div style={{display:'flex',flexDirection:'column' as const,gap:5,marginBottom:10}}>
                {SABLOANE.map(s=>(
                  <button key={s.key} onClick={()=>setSablon(s)}
                    style={{padding:'7px 10px',borderRadius:7,border:`1px solid ${sablon.key===s.key?'rgba(77,163,255,0.4)':'rgba(159,215,255,0.1)'}`,background:sablon.key===s.key?'rgba(77,163,255,0.12)':'transparent',color:sablon.key===s.key?'#7BC8FF':'rgba(159,215,255,0.5)',fontSize:11,fontWeight:500,cursor:'pointer',textAlign:'left' as const}}>
                    {s.label}
                  </button>
                ))}
              </div>
              {sablon.key==='custom'?(
                <textarea value={textCustom} onChange={e=>setTextCustom(e.target.value)}
                  placeholder="Scrie mesajul..." rows={6}
                  style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:11,padding:'8px 10px',outline:'none',resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const}}/>
              ):(
                <div style={{background:'rgba(20,38,65,0.4)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:8,padding:'8px 10px',fontSize:11,color:'rgba(214,228,244,0.6)',whiteSpace:'pre-wrap' as const,lineHeight:1.5,maxHeight:140,overflowY:'auto' as const}}>
                  {sablon.text}
                </div>
              )}
            </div>

            {/* Preview */}
            {textFinal && selectatiFiltered.length>0 && (()=>{
              const r = selectatiFiltered[0]
              return (
                <div style={{...glassCard,padding:12,background:'rgba(74,222,128,0.04)',borderColor:'rgba(74,222,128,0.15)'}}>
                  <div style={{fontSize:10,fontWeight:600,color:'rgba(74,222,128,0.5)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:6}}>Preview — {r.nume_client?.split(' ')[0]}</div>
                  <div style={{fontSize:11,color:'rgba(214,228,244,0.7)',whiteSpace:'pre-wrap' as const,lineHeight:1.5}}>
                    {applyTemplate(textFinal,r)}
                  </div>
                </div>
              )
            })()}

            {/* Buton lansare */}
            <button
              onClick={pornesteTrimitere}
              disabled={!textFinal||selectatiFiltered.length===0||trimitere}
              style={{padding:'13px',borderRadius:10,border:'none',
                background:(!textFinal||selectatiFiltered.length===0||trimitere)?'rgba(159,215,255,0.08)':'linear-gradient(135deg,#22C55E,#16A34A)',
                color:(!textFinal||selectatiFiltered.length===0||trimitere)?'rgba(159,215,255,0.3)':'#fff',
                fontSize:14,fontWeight:700,cursor:(!textFinal||selectatiFiltered.length===0||trimitere)?'not-allowed':'pointer',
                transition:'all .2s'}}>
              {trimitere
                ? `⏳ ${trimiteIdx+1}/${selectatiFiltered.length} — se deschide...`
                : `🚀 Pornește — ${selectatiFiltered.length} mesaje`}
            </button>

            <div style={{fontSize:10,color:'rgba(159,215,255,0.25)',lineHeight:1.5,padding:'0 2px'}}>
              Variabile: <span style={{color:'rgba(159,215,255,0.45)'}}>{'{nume}'} {'{apartament}'} {'{checkin}'} {'{checkout}'}</span>
            </div>
          </div>
        </div>
      </div>
      <Toast toast={toast}/>
    </>
  )
}
