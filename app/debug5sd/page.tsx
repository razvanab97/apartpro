'use client'
import { useEffect, useState } from 'react'

function fmt(d: Date) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate().toString().padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`
}

export default function DebugPage() {
  const [avail, setAvail] = useState<any>(null)
  const [rezervari, setRezervari] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function call5SD(actiune: string, params = {}) {
    const res = await fetch('/api/fivestar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actiune, ...params })
    })
    return res.json()
  }

  async function loadAll() {
    setLoading(true)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)
    const from = new Date(today); from.setDate(today.getDate()-60)
    const to = new Date(today); to.setDate(today.getDate()+120)
    const fmtDD = (d: Date) => `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`

    // get_avail - arata toate camerele
    const a = await call5SD('get_avail', { checkin: fmt(today), checkout: fmt(tomorrow) })
    setAvail(a)

    // incearca sa obtina rezervari
    for (const actiune of ['getrezervari','rezervari_lista','get_bookings']) {
      const r = await call5SD(actiune, {
        data_de_la: fmtDD(from), data_pana_la: fmtDD(to),
        data_de: from.toISOString().split('T')[0], data_pana: to.toISOString().split('T')[0],
        checkin: fmt(from), checkout: fmt(to),
      })
      if (r && r.ok !== 'false' && !r.mesaj?.includes('Eroare')) {
        setRezervari({ actiune, data: r })
        break
      }
      setRezervari({ actiune, data: r })
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const pre = (d: any) => (
    <pre style={{fontSize:11,color:'#9FD7FF',background:'rgba(0,0,0,0.3)',padding:12,borderRadius:8,overflow:'auto',maxHeight:400,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
      {JSON.stringify(d, null, 2)}
    </pre>
  )

  return (
    <div style={{padding:20,color:'#fff',fontFamily:'monospace'}}>
      <h2 style={{color:'#7BC8FF',marginBottom:16}}>Debug 5starDesk — Coduri camere</h2>
      {loading && <div style={{color:'#FCD34D'}}>Se incarca...</div>}

      <h3 style={{color:'#4ADE80',marginTop:20}}>get_avail (camere disponibile azi):</h3>
      {avail && <>
        {avail.camere ? (
          <table style={{borderCollapse:'collapse',width:'100%',marginBottom:16}}>
            <thead>
              <tr style={{background:'rgba(77,163,255,0.2)'}}>
                {['id_camera','nume_camera','pret_camera','ocupare_standard'].map(h=>(
                  <th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:11,color:'#7BC8FF'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {avail.camere.map((c:any,i:number)=>(
                <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                  <td style={{padding:'6px 10px',color:'#FCD34D',fontWeight:700}}>{c.id_camera}</td>
                  <td style={{padding:'6px 10px'}}>{c.nume_camera}</td>
                  <td style={{padding:'6px 10px'}}>{c.pret_camera} RON</td>
                  <td style={{padding:'6px 10px'}}>{c.ocupare_standard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : pre(avail)}
      </>}

      <h3 style={{color:'#4ADE80',marginTop:20}}>Rezervari ({rezervari?.actiune}):</h3>
      {rezervari && <>
        {/* Arata campurile din prima rezervare */}
        {(()=>{
          const rez = Array.isArray(rezervari.data) ? rezervari.data :
            rezervari.data?.rezervari || rezervari.data?.bookings || rezervari.data?.data
          if (Array.isArray(rez) && rez.length > 0) {
            return (
              <div>
                <div style={{color:'#FCD34D',marginBottom:8}}>
                  Total: {rez.length} rezervari | Campuri disponibile: <b>{Object.keys(rez[0]).join(', ')}</b>
                </div>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                  <thead>
                    <tr style={{background:'rgba(77,163,255,0.2)'}}>
                      {Object.keys(rez[0]).map(k=>(
                        <th key={k} style={{padding:'4px 8px',textAlign:'left',color:'#7BC8FF',whiteSpace:'nowrap'}}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rez.slice(0,10).map((r:any,i:number)=>(
                      <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                        {Object.values(r).map((v:any,j:number)=>(
                          <td key={j} style={{padding:'4px 8px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {String(v||'')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          return pre(rezervari.data)
        })()}
      </>}
    </div>
  )
}
