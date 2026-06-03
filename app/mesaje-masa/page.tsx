'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'

const pad = (n:number) => String(n).padStart(2,'0')
const fmt = (d:string) => { try { const dt=new Date(d); return `${pad(dt.getDate())}.${pad(dt.getMonth()+1)}.${dt.getFullYear()}` } catch { return d } }

const SABLOANE = [
  { key:'custom', label:'Mesaj personalizat', text:'' },
  { key:'confirmare', label:'Confirmare rezervare', text:'Bună ziua, {nume}! 👋\n\nVă confirmăm rezervarea la *{apartament}* pentru *{checkin}* → *{checkout}*.\n\nVă așteptăm cu drag!\nEchipa AB Homes Iași' },
  { key:'checkin', label:'Reminder check-in', text:'Bună ziua, {nume}! 😊\n\nVă reamintim că mâine, *{checkin}*, aveți rezervarea la *{apartament}*.\n\nVă vom trimite detaliile de acces în ziua sosirii.\nEchipa AB Homes Iași' },
  { key:'checkout', label:'Reminder check-out', text:'Bună ziua, {nume}! 🌅\n\nVă reamintim că astăzi este ziua check-out-ului din *{apartament}*.\n\n⏰ Ora de check-out: 11:00\n🔑 Vă rugăm să lăsați cheia la ușă.\n\nVă mulțumim!\nEchipa AB Homes Iași' },
  { key:'review', label:'Cerere review', text:'Bună ziua, {nume}! 🙏\n\nSperăm că ați avut o ședere plăcută la *{apartament}*.\n\nNe-ar bucura mult un review pe platformă — ajută și alți oaspeți să ne găsească!\n\nVă mulțumim!\nEchipa AB Homes Iași' },
  { key:'promo', label:'Ofertă specială', text:'Bună ziua, {nume}! 🎉\n\nAvem o ofertă specială pentru dumneavoastră!\n\n[completați oferta]\n\nEchipa AB Homes Iași' },
  { key:'revenire', label:'🏠 Invitație revenire Iași', text:'Bună ziua, {nume}! 👋\n\nSperăm că v-a plăcut sejurul la AB Homes Iași!\n\nDacă planificați o nouă vizită în Iași, vă așteptăm cu drag. Avem apartamente moderne în zone centrale, cu self check-in și tot confortul necesar. 🏠\n\nScriați-ne pentru disponibilitate și cea mai bună ofertă!\n\nEchipa AB Homes Iași\nwww.abhomesiasi.ro' },
]

function waLink(phone:string, msg:string){
  const clean = phone.replace(/\D/g,'')
  const nr = clean.startsWith('0') ? '4'+clean : clean.startsWith('40') ? clean : '4'+clean
  return `https://wa.me/${nr}?text=${encodeURIComponent(msg.normalize('NFC'))}`
}

function applyTemplate(text:string, r:any){
  const firstName = (r.nume_client||'').split(' ')[0]
  const apt = r.apartament?.nota || r.apartament?.nume || r.apartament_id || ''
  return text
    .replace(/{nume}/g, firstName)
    .replace(/{apartament}/g, apt)
    .replace(/{checkin}/g, fmt(r.data_checkin||''))
    .replace(/{checkout}/g, fmt(r.data_checkout||''))
}

export default function MesajeMasaPage() {
  const [rezervari, setRezervari] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtru, setFiltru] = useState('toate')
  const [search, setSearch] = useState('')
  const [sablon, setSablon] = useState(SABLOANE[0])
  const [textCustom, setTextCustom] = useState('')
  const [selectati, setSelectati] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string|null>(null)

  useEffect(()=>{ load() },[filtru])

  async function load(){
    setLoading(true)
    const now = new Date()
    const today = now.toISOString().slice(0,10)
    let q = supabase.from('rezervari')
      .select('id,nume_client,telefon_client,canal,data_checkin,data_checkout,apartament_id,apartament:apartament_id(nota,nume)')
      .not('telefon_client','is',null)
      .neq('status_rezervare','anulata')
      .order('data_checkin', {ascending:false})
      .limit(500)

    if(filtru==='checkin_azi') q = q.eq('data_checkin', today)
    else if(filtru==='checkin_maine') q = q.eq('data_checkin', new Date(now.getTime()+86400000).toISOString().slice(0,10))
    else if(filtru==='checkout_azi') q = q.eq('data_checkout', today)
    else if(filtru==='checkin_7') q = q.gte('data_checkin', today).lte('data_checkin', new Date(now.getTime()+7*86400000).toISOString().slice(0,10))
    else if(filtru==='luna') q = q.gte('data_checkin', `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`)
    else if(filtru==='toate') q = q.gte('data_checkin', '2025-08-01')

    const {data} = await q
    // Deduplicare dupa telefon — pastreaza ultima rezervare per client
    const seen = new Map<string,any>()
    for(const r of (data||[])){
      const tel = (r.telefon_client||'').replace(/\D/g,'')
      if(tel && !seen.has(tel)) seen.set(tel, r)
    }
    setRezervari(Array.from(seen.values()))
    setLoading(false)
  }

  const filtered = rezervari.filter(r =>
    !search || (r.nume_client||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.telefon_client||'').includes(search)
  )

  const textFinal = sablon.key==='custom' ? textCustom : sablon.text

  function toggleAll(){
    if(selectati.size===filtered.length) setSelectati(new Set())
    else setSelectati(new Set(filtered.map(r=>r.id)))
  }

  function copyPhone(r:any){
    const msg = applyTemplate(textFinal, r)
    navigator.clipboard.writeText(msg)
    setCopied(r.id)
    setTimeout(()=>setCopied(null),1500)
  }

  const glassCard = { background:'rgba(11,18,36,0.7)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:14, backdropFilter:'blur(12px)' as const }

  return (
    <>
      <PageHeader title="Mesaje în masă WhatsApp" subtitle="Trimite mesaje personalizate clienților"/>
      <div style={{flex:1,overflowY:'auto',padding:'0 24px 40px'}}>

        {/* Filtru + search */}
        <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap' as const}}>
          {[
            {k:'toate',l:'Toți clienții (aug 2025+)'},
            {k:'checkin_azi',l:'Check-in azi'},
            {k:'checkin_maine',l:'Check-in mâine'},
            {k:'checkin_7',l:'Check-in 7 zile'},
            {k:'checkout_azi',l:'Check-out azi'},
            {k:'luna',l:'Luna curentă'},
          ].map(f=>(
            <button key={f.k} onClick={()=>setFiltru(f.k)}
              style={{padding:'7px 14px',borderRadius:9,border:`1px solid ${filtru===f.k?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.12)'}`,background:filtru===f.k?'rgba(77,163,255,0.15)':'transparent',color:filtru===f.k?'#7BC8FF':'rgba(159,215,255,0.5)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              {f.l}
            </button>
          ))}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Caută nume / telefon"
            style={{marginLeft:'auto',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:9,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'7px 14px',outline:'none',width:200}}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:18,alignItems:'start'}}>

          {/* Lista clienti */}
          <div style={{...glassCard,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'rgba(11,18,32,0.5)',borderBottom:'1px solid rgba(100,160,255,0.1)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <input type="checkbox" checked={selectati.size===filtered.length&&filtered.length>0}
                  onChange={toggleAll} style={{cursor:'pointer'}}/>
                <span style={{fontSize:12,color:'rgba(159,215,255,0.6)',fontWeight:600}}>
                  {loading?'Se încarcă...':`${filtered.length} clienți · ${selectati.size} selectați`}
                </span>
              </div>
              {selectati.size>0&&textFinal&&(
                <span style={{fontSize:11,color:'rgba(74,222,128,0.7)'}}>
                  ✓ {selectati.size} linkuri gata de deschis
                </span>
              )}
            </div>

            {filtered.map(r=>{
              const msg = applyTemplate(textFinal, r)
              const link = waLink(r.telefon_client||'', msg)
              const sel = selectati.has(r.id)
              return(
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid rgba(100,160,255,0.05)',background:sel?'rgba(77,163,255,0.05)':'transparent'}}>
                  <input type="checkbox" checked={sel}
                    onChange={()=>{ const n=new Set(selectati); sel?n.delete(r.id):n.add(r.id); setSelectati(n) }}
                    style={{cursor:'pointer',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>{r.nume_client}</div>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>
                      {r.telefon_client} · {r.apartament?.nota||''} · {fmt(r.data_checkin)} → {fmt(r.data_checkout)}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button onClick={()=>copyPhone(r)} title="Copiază mesajul"
                      style={{padding:'5px 10px',borderRadius:7,border:'1px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(159,215,255,0.6)',fontSize:11,cursor:'pointer'}}>
                      {copied===r.id?'✓ Copiat':'📋'}
                    </button>
                    {r.telefon_client&&textFinal&&(
                      <a href={link} target="_blank" rel="noopener"
                        style={{padding:'5px 12px',borderRadius:7,border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:11,fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
            {!loading&&filtered.length===0&&(
              <div style={{padding:32,textAlign:'center' as const,color:'rgba(159,215,255,0.3)',fontSize:13}}>Niciun client găsit</div>
            )}
          </div>

          {/* Sablon mesaj */}
          <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
            <div style={{...glassCard,padding:16}}>
              <div style={{fontSize:11,fontWeight:600,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:10}}>Șablon mesaj</div>
              <div style={{display:'flex',flexDirection:'column' as const,gap:6,marginBottom:12}}>
                {SABLOANE.map(s=>(
                  <button key={s.key} onClick={()=>setSablon(s)}
                    style={{padding:'8px 12px',borderRadius:8,border:`1px solid ${sablon.key===s.key?'rgba(77,163,255,0.4)':'rgba(159,215,255,0.1)'}`,background:sablon.key===s.key?'rgba(77,163,255,0.12)':'transparent',color:sablon.key===s.key?'#7BC8FF':'rgba(159,215,255,0.5)',fontSize:12,fontWeight:500,cursor:'pointer',textAlign:'left' as const}}>
                    {s.label}
                  </button>
                ))}
              </div>
              {sablon.key==='custom'?(
                <textarea value={textCustom} onChange={e=>setTextCustom(e.target.value)}
                  placeholder="Scrie mesajul tău..." rows={8}
                  style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:9,color:'rgba(214,228,244,0.9)',fontSize:12,padding:'10px 12px',outline:'none',resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const}}/>
              ):(
                <div style={{background:'rgba(20,38,65,0.6)',border:'1px solid rgba(100,160,255,0.15)',borderRadius:9,padding:'10px 12px',fontSize:12,color:'rgba(214,228,244,0.7)',whiteSpace:'pre-wrap' as const,lineHeight:1.6}}>
                  {sablon.text}
                </div>
              )}
            </div>

            {/* Preview cu primul selectat */}
            {selectati.size>0&&textFinal&&(()=>{
              const firstId = Array.from(selectati)[0]
              const r = rezervari.find(x=>x.id===firstId)
              if(!r) return null
              const preview = applyTemplate(textFinal, r)
              return(
                <div style={{...glassCard,padding:16}}>
                  <div style={{fontSize:11,fontWeight:600,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:8}}>Preview — {r.nume_client}</div>
                  <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:9,padding:'10px 12px',fontSize:12,color:'rgba(214,228,244,0.8)',whiteSpace:'pre-wrap' as const,lineHeight:1.6}}>
                    {preview}
                  </div>
                </div>
              )
            })()}

            <div style={{fontSize:11,color:'rgba(159,215,255,0.3)',lineHeight:1.5,padding:'8px 4px'}}>
              <strong style={{color:'rgba(159,215,255,0.5)'}}>Variabile disponibile:</strong><br/>
              {'{nume}'} — prenumele clientului<br/>
              {'{apartament}'} — codul apartamentului<br/>
              {'{checkin}'} / {'{checkout}'} — datele sejurului
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
