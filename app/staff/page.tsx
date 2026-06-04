'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const STAFF_CODE = '1111'
const PAD = (n:number) => String(n).padStart(2,'0')
const FMT = (d:string) => { try { const dt=new Date(d); return `${PAD(dt.getDate())}.${PAD(dt.getMonth()+1)}` } catch { return d } }
const TODAY = () => new Date().toISOString().slice(0,10)

type Status = 'liber' | 'inceput' | 'gata'

export default function StaffPage() {
  const [autentificat, setAutentificat] = useState(false)
  const [cod, setCod] = useState('')
  const [codErr, setCodErr] = useState(false)
  const [date, setDate] = useState(TODAY())
  const [apartamente, setApartamente] = useState<any[]>([])
  const [checkouts, setCheckouts] = useState<any[]>([])
  const [checkins, setCheckins] = useState<any[]>([])
  const [statusuri, setStatusuri] = useState<Record<string,{status:Status,ora?:string,oraGata?:string}>>({})
  const [loading, setLoading] = useState(false)
  const [notif, setNotif] = useState<string|null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('staff_auth')
    if (saved === STAFF_CODE) setAutentificat(true)
  }, [])

  useEffect(() => {
    if (autentificat) loadDate()
  }, [autentificat, date])

  async function login() {
    if (cod === STAFF_CODE) {
      localStorage.setItem('staff_auth', cod)
      setAutentificat(true)
      setCodErr(false)
    } else {
      setCodErr(true)
      setCod('')
    }
  }

  async function loadDate() {
    setLoading(true)
    // Apartamente active
    const { data: apts } = await supabase.from('apartamente')
      .select('id,nota,nume,adresa').eq('status','activ').order('nota')

    // Checkout-uri in ziua selectata
    const { data: co } = await supabase.from('rezervari')
      .select('id,apartament_id,nume_client,data_checkin,data_checkout,nr_nopti')
      .eq('data_checkout', date)
      .neq('status_rezervare','anulata')

    // Checkin-uri in ziua selectata
    const { data: ci } = await supabase.from('rezervari')
      .select('id,apartament_id,nume_client,data_checkin,data_checkout')
      .eq('data_checkin', date)
      .neq('status_rezervare','anulata')

    // Statusuri curatenie din DB
    const { data: st } = await supabase.from('curatenie_status')
      .select('*').eq('data', date)

    const stMap: Record<string,any> = {}
    ;(st||[]).forEach((s:any) => { stMap[s.apartament_id] = s })

    setApartamente(apts||[])
    setCheckouts(co||[])
    setCheckins(ci||[])

    // Rebuild statusuri
    const newStatus: Record<string,{status:Status,ora?:string,oraGata?:string}> = {}
    ;(apts||[]).forEach((apt:any) => {
      const s = stMap[apt.id]
      if (s) newStatus[apt.id] = { status: s.status, ora: s.ora_inceput, oraGata: s.ora_gata }
    })
    setStatusuri(newStatus)
    setLoading(false)
  }

  async function setStatus(aptId: string, status: Status) {
    const now = new Date()
    const ora = `${PAD(now.getHours())}:${PAD(now.getMinutes())}`
    const apt = apartamente.find(a => a.id === aptId)
    const aptLabel = apt?.nota || apt?.nume || aptId

    const update: any = { status }
    if (status === 'inceput') update.ora_inceput = ora
    if (status === 'gata') update.ora_gata = ora

    // Upsert in curatenie_status
    const { error } = await supabase.from('curatenie_status').upsert({
      apartament_id: aptId,
      data: date,
      ...update,
    }, { onConflict: 'apartament_id,data' })

    if (!error) {
      setStatusuri(prev => ({ ...prev, [aptId]: { ...prev[aptId], status, ...(status==='inceput'?{ora}:{}), ...(status==='gata'?{oraGata:ora}:{}) } }))

      // Notificare prin DB (AB Homes poate vedea in timp real)
      const msg = status === 'inceput'
        ? `🧹 Curățenie începută la ${aptLabel} (${ora})`
        : `✅ Curățenie gata la ${aptLabel} (${ora})`
      setNotif(msg)
      setTimeout(() => setNotif(null), 3000)

      // Salveaza notificarea
      await supabase.from('notificari').insert({
        mesaj: msg, tip: 'curatenie', citit: false,
        data: new Date().toISOString(),
      })
    }
  }

  // UI Login
  if (!autentificat) {
    return (
      <div style={{minHeight:'100vh',background:'#0A1628',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
        <div style={{background:'rgba(11,28,52,0.95)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:20,padding:'40px 32px',width:300,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:16}}>🧹</div>
          <div style={{fontSize:22,fontWeight:700,color:'#E8F4FF',marginBottom:6}}>AB Homes</div>
          <div style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:32}}>Curățenie & Pregătire</div>

          <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:20}}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{width:16,height:16,borderRadius:'50%',background:cod.length>=i?'#4ADE80':'rgba(159,215,255,0.15)',transition:'all .2s'}}/>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
            {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i) => (
              <button key={i} onClick={()=>{
                if(k==='⌫') setCod(c=>c.slice(0,-1))
                else if(k!=='' && cod.length<4) setCod(c=>c+k)
              }}
                style={{padding:'16px',borderRadius:12,border:'1px solid rgba(100,160,255,0.15)',background:k===''?'transparent':'rgba(20,40,70,0.8)',color:'#E8F4FF',fontSize:18,fontWeight:600,cursor:k===''?'default':'pointer',opacity:k===''?0:1}}>
                {k}
              </button>
            ))}
          </div>

          <button onClick={login} disabled={cod.length<4}
            style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:cod.length===4?'#22C55E':'rgba(159,215,255,0.08)',color:cod.length===4?'#fff':'rgba(159,215,255,0.3)',fontSize:15,fontWeight:700,cursor:cod.length===4?'pointer':'not-allowed',transition:'all .2s'}}>
            Intră
          </button>

          {codErr && <div style={{marginTop:12,color:'#F87171',fontSize:13}}>Cod greșit. Încearcă din nou.</div>}
        </div>
      </div>
    )
  }

  // UI Principal
  const coIds = new Set((checkouts).map((r:any)=>r.apartament_id))
  const ciIds = new Set((checkins).map((r:any)=>r.apartament_id))

  // Apartamente care necesita curatenie = au checkout azi
  const deCuratat = apartamente.filter(a => coIds.has(a.id))
  const restul = apartamente.filter(a => !coIds.has(a.id))

  const nrGata = deCuratat.filter(a => statusuri[a.id]?.status === 'gata').length
  const total = deCuratat.length

  return (
    <div style={{minHeight:'100vh',background:'#080F1E',fontFamily:'system-ui,sans-serif',paddingBottom:40}}>

      {/* Notificare */}
      {notif && (
        <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:'rgba(34,197,94,0.95)',color:'#fff',padding:'10px 20px',borderRadius:12,fontSize:13,fontWeight:600,zIndex:999,boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          {notif}
        </div>
      )}

      {/* Header */}
      <div style={{background:'rgba(11,22,42,0.95)',borderBottom:'1px solid rgba(100,160,255,0.1)',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:'#E8F4FF'}}>🧹 Curățenie</div>
          <div style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>AB Homes Iași</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:13,fontWeight:600,color:nrGata===total&&total>0?'#4ADE80':'#FCD34D'}}>
            {nrGata}/{total} gata
          </div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{background:'transparent',border:'none',color:'rgba(159,215,255,0.5)',fontSize:11,outline:'none',cursor:'pointer'}}/>
        </div>
      </div>

      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>

        {/* Progress */}
        {total > 0 && (
          <div style={{background:'rgba(11,22,42,0.6)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:12,padding:'12px 14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.6)'}}>Progres zi</span>
              <span style={{fontSize:12,fontWeight:700,color:nrGata===total?'#4ADE80':'#FCD34D'}}>{Math.round(nrGata/total*100)}%</span>
            </div>
            <div style={{height:6,background:'rgba(159,215,255,0.1)',borderRadius:3}}>
              <div style={{height:'100%',borderRadius:3,background:'linear-gradient(90deg,#22C55E,#4ADE80)',width:`${total>0?nrGata/total*100:0}%`,transition:'width .4s'}}/>
            </div>
          </div>
        )}

        {/* Apartamente de curatat */}
        {deCuratat.length > 0 && (
          <>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(248,113,113,0.7)',textTransform:'uppercase',letterSpacing:'.07em',marginTop:4}}>
              🔄 Checkout azi — de curățat ({deCuratat.length})
            </div>
            {deCuratat.map(apt => {
              const st = statusuri[apt.id]
              const areCheckin = ciIds.has(apt.id)
              const checkinRez = checkins.find((r:any)=>r.apartament_id===apt.id)
              const checkoutRez = checkouts.find((r:any)=>r.apartament_id===apt.id)
              const isGata = st?.status === 'gata'
              const isInceput = st?.status === 'inceput'

              return (
                <div key={apt.id} style={{background:isGata?'rgba(34,197,94,0.08)':isInceput?'rgba(251,146,60,0.08)':'rgba(11,22,42,0.7)',border:`1px solid ${isGata?'rgba(34,197,94,0.3)':isInceput?'rgba(251,146,60,0.3)':'rgba(100,160,255,0.12)'}`,borderRadius:14,padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:15,fontWeight:700,color:'#E8F4FF'}}>{apt.nota}</span>
                        <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>{apt.nume}</span>
                        {areCheckin && (
                          <span style={{fontSize:10,padding:'2px 7px',borderRadius:5,background:'rgba(252,211,77,0.15)',border:'1px solid rgba(252,211,77,0.3)',color:'#FCD34D',fontWeight:700}}>
                            ⚡ Checkin azi
                          </span>
                        )}
                      </div>
                      {checkoutRez && (
                        <div style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:3}}>
                          Checkout: {checkoutRez.nume_client} · {checkoutRez.nr_nopti} nopți
                        </div>
                      )}
                      {checkinRez && (
                        <div style={{fontSize:11,color:'#FCD34D',marginTop:2}}>
                          Checkin: {checkinRez.nume_client}
                        </div>
                      )}
                      {(st?.ora||st?.oraGata) && (
                        <div style={{fontSize:11,color:isGata?'#4ADE80':'#FB923C',marginTop:4}}>
                          {isInceput && st?.ora && `▶ Început: ${st.ora}`}
                          {isGata && `✓ Gata: ${st?.oraGata}`}{isGata && st?.ora && ` (început: ${st.ora})`}
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:isGata?20:isInceput?18:16}}>
                      {isGata?'✅':isInceput?'🧹':'⏳'}
                    </div>
                  </div>

                  {/* Butoane */}
                  <div style={{display:'flex',gap:8}}>
                    {!isInceput && !isGata && (
                      <button onClick={()=>setStatus(apt.id,'inceput')}
                        style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#FB923C',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                        ▶ Începe curățenia
                      </button>
                    )}
                    {isInceput && (
                      <button onClick={()=>setStatus(apt.id,'gata')}
                        style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#22C55E',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                        ✅ Gata!
                      </button>
                    )}
                    {isGata && (
                      <button onClick={()=>setStatus(apt.id,'inceput')}
                        style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid rgba(251,146,60,0.3)',background:'transparent',color:'#FB923C',fontSize:12,cursor:'pointer'}}>
                        ↩ Reîncepe
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* Restul apartamentelor */}
        {restul.length > 0 && (
          <>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(74,222,128,0.6)',textTransform:'uppercase',letterSpacing:'.07em',marginTop:8}}>
              ✓ Fără checkout azi ({restul.length})
            </div>
            {restul.map(apt => {
              const areCheckin = ciIds.has(apt.id)
              const checkinRez = checkins.find((r:any)=>r.apartament_id===apt.id)
              return (
                <div key={apt.id} style={{background:'rgba(11,22,42,0.4)',border:'1px solid rgba(100,160,255,0.07)',borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:'rgba(159,215,255,0.7)',minWidth:48}}>{apt.nota}</span>
                  <span style={{fontSize:12,color:'rgba(159,215,255,0.4)',flex:1}}>{apt.nume}</span>
                  {areCheckin && (
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:5,background:'rgba(252,211,77,0.1)',border:'1px solid rgba(252,211,77,0.25)',color:'#FCD34D'}}>
                      Checkin azi — {checkinRez?.nume_client?.split(' ')[0]}
                    </span>
                  )}
                  {!areCheckin && <span style={{fontSize:18}}>🟢</span>}
                </div>
              )
            })}
          </>
        )}

        {loading && (
          <div style={{textAlign:'center',color:'rgba(159,215,255,0.4)',padding:32,fontSize:13}}>Se încarcă...</div>
        )}

        <button onClick={()=>{localStorage.removeItem('staff_auth');setAutentificat(false)}}
          style={{marginTop:20,padding:'10px',borderRadius:10,border:'1px solid rgba(159,215,255,0.1)',background:'transparent',color:'rgba(159,215,255,0.3)',fontSize:12,cursor:'pointer'}}>
          Deconectare
        </button>
      </div>
    </div>
  )
}
