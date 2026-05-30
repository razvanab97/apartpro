'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { MessageCircle, Key, LogOut, Save, RotateCcw, Settings, Database, Info, Bell } from 'lucide-react'

const MSG_DEFAULTS: Record<string,string> = {
  checkin_confirmare: `Bună ziua, {nume}! 👋\n\nVă confirmăm rezervarea la *{apartament}* pentru data de *{data_checkin}*.\n\nVă așteptăm cu drag! La sosire, vă rugăm să ne anunțați și vă transmitem detaliile de acces.\n\nEchipa AB Homes Iași`,
  checkin_acces: `Bună ziua, {nume}! 🏠\n\nIată detaliile de acces pentru *{apartament}*:\n\n🔑 *Cod intrare bloc:* _completați_\n🚪 *Etaj / Apartament:* _completați_\n📱 *Cutia cu cheia:* _completați_ | Cod: _completați_\n\n📍 _adresa completă_\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași`,
  checkout: `Bună ziua, {nume}! 🌅\n\nVă reamintim că astăzi, *{data_checkout}*, este ziua check-out-ului din *{apartament}*.\n\n⏰ *Ora de check-out:* 11:00\n🔑 *Cheia:* vă rugăm să o lăsați în cutia de la ușă / recepție\n\nVă mulțumim că ați ales AB Homes Iași și sperăm să vă revedem curând! ⭐\nEchipa AB Homes`,
  reminder_checkin: `Bună ziua, {nume}! 😊\n\nVă reamintim că mâine, *{data_checkin}*, aveți rezervarea la *{apartament}*.\n\nNe bucurăm să vă avem oaspeți! Vă vom trimite detaliile de acces în ziua sosirii.\n\nEchipa AB Homes Iași`,
  review_request: `Bună ziua, {nume}! 🌟\n\nSperăm că ați avut o ședere plăcută la *{apartament}*!\n\nNe-ar face plăcere să lăsați un review pe platforma prin care ați rezervat.\n\nVă mulțumim și sperăm să vă revedem! 🙏\nEchipa AB Homes Iași`,
}

const MSG_META: Record<string,{label:string;icon:any;color:string;desc:string}> = {
  checkin_confirmare: { label:'Confirmare Check-in',   icon:MessageCircle, color:'#FCD34D', desc:'Trimis la confirmare sosire' },
  checkin_acces:      { label:'Date acces apartament', icon:Key,           color:'#4DA3FF', desc:'Trimis la sosire cu codul de intrare' },
  checkout:           { label:'Reminder Check-out',    icon:LogOut,        color:'#C084FC', desc:'Trimis în ziua plecării' },
  reminder_checkin:   { label:'Reminder zi anterioară',icon:Bell,          color:'#4ADE80', desc:'Trimis cu o zi înainte de sosire' },
  review_request:     { label:'Cerere review',         icon:MessageCircle, color:'#F97316', desc:'Trimis după check-out' },
}

const VARS = ['{nume}','{apartament}','{data_checkin}','{data_checkout}']

export default function SetariPage() {
  const [msgs, setMsgs]         = useState<Record<string,string>>({ ...MSG_DEFAULTS })
  const [savedMsgs, setSavedMsgs] = useState<Record<string,string>>({})
  const [activeTab, setActiveTab] = useState('checkin_confirmare')
  const [saving, setSaving]     = useState(false)
  const { toast, show }         = useToast()

  useEffect(() => { loadMsgs() }, [])

  async function loadMsgs() {
    const { data } = await supabase.from('setari').select('cheie,valoare').in('cheie', Object.keys(MSG_DEFAULTS))
    if (data?.length) {
      const loaded: Record<string,string> = {}
      data.forEach((r:any) => { loaded[r.cheie] = r.valoare })
      setMsgs(m => ({ ...m, ...loaded }))
      setSavedMsgs(loaded)
    }
  }

  async function saveMsg(key: string) {
    setSaving(true)
    const { error } = await supabase.from('setari').upsert({ cheie: key, valoare: msgs[key] }, { onConflict: 'cheie' })
    if (error) {
      // fallback: salvam in localStorage daca tabelul nu exista
      try { localStorage.setItem(`msg_${key}`, msgs[key]) } catch {}
      show('info', 'Salvat local (creează tabelul setari în Supabase pentru persistență)')
    } else {
      setSavedMsgs(s => ({ ...s, [key]: msgs[key] }))
      show('success', 'Mesaj salvat!')
    }
    setSaving(false)
  }

  function resetMsg(key: string) {
    setMsgs(m => ({ ...m, [key]: MSG_DEFAULTS[key] }))
  }

  function insertVar(key: string, v: string) {
    const ta = document.getElementById(`ta-${key}`) as HTMLTextAreaElement
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const newVal = msgs[key].slice(0,s) + v + msgs[key].slice(e)
    setMsgs(m => ({ ...m, [key]: newVal }))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s+v.length, s+v.length) }, 0)
  }

  const isDirty = (key:string) => msgs[key] !== (savedMsgs[key] ?? MSG_DEFAULTS[key])

  const glass: React.CSSProperties = {
    background:'rgba(20,38,65,0.6)', border:'1px solid rgba(100,160,255,0.15)',
    borderRadius:14, backdropFilter:'blur(12px)',
  }

  return (
    <>
      <PageHeader title="Setări" subtitle="Mesaje WhatsApp și configurare sistem"/>
      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 40px' }}>

        {/* ── Mesaje WhatsApp ── */}
        <div style={{ marginBottom:32 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <MessageCircle size={15} color="#4ADE80"/>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Mesaje WhatsApp</span>
            <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)', marginLeft:4 }}>Editează șabloanele trimise automat oaspeților</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'210px 1fr', gap:12 }}>
            {/* Tabs */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {Object.entries(MSG_META).map(([key, meta]) => {
                const Icon = meta.icon
                const active = activeTab === key
                const dirty = isDirty(key)
                return (
                  <button key={key} onClick={() => setActiveTab(key)} style={{
                    display:'flex', alignItems:'center', gap:9, padding:'10px 12px',
                    borderRadius:10, border:`1px solid ${active?meta.color+'40':'rgba(100,160,255,0.1)'}`,
                    background: active ? `${meta.color}12` : 'rgba(20,38,65,0.4)',
                    cursor:'pointer', textAlign:'left', transition:'all .15s',
                  }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:`${meta.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={13} color={meta.color}/>
                    </div>
                    <span style={{ fontSize:12, fontWeight:500, color:active?meta.color:'rgba(159,215,255,0.65)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{meta.label}</span>
                    {dirty && <div style={{ width:6, height:6, borderRadius:'50%', background:meta.color, flexShrink:0 }}/>}
                  </button>
                )
              })}
            </div>

            {/* Editor panel */}
            {Object.entries(MSG_META).map(([key, meta]) => {
              if (key !== activeTab) return null
              const Icon = meta.icon
              const dirty = isDirty(key)
              const preview = msgs[key]
                .replace(/{nume}/g,'Ion Popescu').replace(/{apartament}/g,'Airy Palas')
                .replace(/{data_checkin}/g,'29 Mai 2026').replace(/{data_checkout}/g,'31 Mai 2026')
              return (
                <div key={key} style={glass}>
                  {/* Header */}
                  <div style={{ padding:'13px 16px', borderBottom:'1px solid rgba(100,160,255,0.1)', display:'flex', alignItems:'center', gap:10 }}>
                    <Icon size={14} color={meta.color}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{meta.label}</div>
                      <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>{meta.desc}</div>
                    </div>
                  </div>
                  {/* Variabile */}
                  <div style={{ padding:'8px 16px', borderBottom:'1px solid rgba(100,160,255,0.07)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, color:'rgba(159,215,255,0.35)' }}>Inserează:</span>
                    {VARS.map(v => (
                      <button key={v} onClick={() => insertVar(key, v)} style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:'rgba(77,163,255,0.1)', border:'1px solid rgba(77,163,255,0.2)', color:'rgba(77,163,255,0.8)', cursor:'pointer', fontFamily:'monospace' }}>{v}</button>
                    ))}
                  </div>
                  <div style={{ padding:'14px 16px' }}>
                    {/* Textarea */}
                    <textarea id={`ta-${key}`} value={msgs[key]}
                      onChange={e => setMsgs(m => ({...m,[key]:e.target.value}))}
                      rows={10} style={{ width:'100%', background:'rgba(11,20,38,0.6)', border:'1px solid rgba(100,160,255,0.15)', borderRadius:8, color:'var(--text)', fontSize:13, lineHeight:1.75, padding:'12px 14px', outline:'none', resize:'vertical', fontFamily:'inherit' }}/>
                    {/* Preview */}
                    <div style={{ marginTop:10, padding:'10px 14px', background:'rgba(11,20,38,0.5)', borderRadius:8, border:'1px solid rgba(100,160,255,0.08)' }}>
                      <div style={{ fontSize:10, color:'rgba(159,215,255,0.3)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Preview cu date demo</div>
                      <div style={{ fontSize:12, color:'rgba(214,228,244,0.75)', lineHeight:1.75, whiteSpace:'pre-wrap' }}>{preview}</div>
                    </div>
                    {/* Actions */}
                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button onClick={() => saveMsg(key)} disabled={saving || !dirty} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:dirty?meta.color:'rgba(159,215,255,0.08)', color:dirty?'#0E1B2B':'rgba(159,215,255,0.3)', fontSize:13, fontWeight:600, cursor:dirty?'pointer':'not-allowed', transition:'all .15s', opacity:saving?0.7:1 }}>
                        <Save size={13}/>{saving?'Se salvează...':dirty?'Salvează':'Salvat ✓'}
                      </button>
                      <button onClick={() => resetMsg(key)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid rgba(159,215,255,0.15)', background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:12, cursor:'pointer' }}>
                        <RotateCcw size={12}/>Resetează
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Info sistem ── */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <Settings size={15} color="var(--accent-blue)"/>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Sistem</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={glass}>
              <div style={{ padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}><Database size={14} color="var(--accent-blue)"/><span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Conexiuni</span></div>
                {[{l:'Supabase PostgreSQL',s:'conectat',c:'#4ADE80'},{l:'Gemini AI Flash 1.5',s:'conectat',c:'#4ADE80'},{l:'5starDesk PMS',s:'conectat',c:'#4ADE80'},{l:'Vercel Deployment',s:'activ',c:'#4ADE80'}].map(x=>(
                  <div key={x.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(100,160,255,0.06)' }}>
                    <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>{x.l}</span>
                    <span style={{ fontSize:11, color:x.c, background:`${x.c}15`, padding:'2px 8px', borderRadius:5 }}>{x.s}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={glass}>
              <div style={{ padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}><Info size={14} color="var(--accent-blue)"/><span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Despre ApartPro</span></div>
                {[{l:'Versiune',v:'1.0.0'},{l:'Proprietar',v:'AB Homes Iași'},{l:'Contact',v:'+40 749 558 705'},{l:'Stack',v:'Next.js 14 + Supabase'}].map(x=>(
                  <div key={x.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(100,160,255,0.06)' }}>
                    <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>{x.l}</span>
                    <span style={{ fontSize:12, color:'var(--text)', fontWeight:500 }}>{x.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SQL helper */}
        <div style={{ marginTop:20, padding:'12px 16px', background:'rgba(252,211,77,0.06)', border:'1px solid rgba(252,211,77,0.2)', borderRadius:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#FCD34D', marginBottom:6 }}>⚠ Pentru a salva mesajele în baza de date, creează tabelul în Supabase SQL Editor:</div>
          <code style={{ fontSize:11, color:'rgba(214,228,244,0.7)', fontFamily:'monospace', whiteSpace:'pre-wrap', display:'block', lineHeight:1.6 }}>
{`CREATE TABLE IF NOT EXISTS setari (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cheie text UNIQUE NOT NULL,
  valoare text,
  created_at timestamptz DEFAULT now()
);`}
          </code>
        </div>

      </div>
      <Toast toast={toast}/>
    </>
  )
}
