'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CATEGORII_NOTIF, getNotifPrefs, setNotifPrefs } from '@/lib/notifPrefs'

const TIP_ICON: Record<string, string> = {
  curatenie: '🧹',
  eliberat: '🚪',
  task: '🔔',
  default: '📣',
}

const CATEGORII_CUNOSCUTE = CATEGORII_NOTIF.map(c => c.key)

async function syncPushPrefs(categorii: string[]) {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, categorii }),
    })
  } catch {}
}

function fmtRelativ(dataStr: string) {
  const diff = Date.now() - new Date(dataStr).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'acum'
  if (min < 60) return `acum ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`
  const z = Math.round(h / 24)
  return `acum ${z} ${z === 1 ? 'zi' : 'zile'}`
}

export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showSetari, setShowSetari] = useState(false)
  const [notif, setNotif] = useState<any[]>([])
  const [prefs, setPrefs] = useState<string[]>(() => getNotifPrefs())

  async function load() {
    const { data } = await supabase.from('notificari').select('*').order('data', { ascending: false }).limit(30)
    setNotif(data || [])
  }

  useEffect(() => {
    ;(async () => { await load() })()
    const i = setInterval(load, 30000)
    return () => clearInterval(i)
  }, [])

  function toggleCategorie(key: string) {
    setPrefs(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      const safe = next.length > 0 ? next : prev
      setNotifPrefs(safe)
      syncPushPrefs(safe)
      return safe
    })
  }

  const notifVizibile = notif.filter(n => !CATEGORII_CUNOSCUTE.includes(n.tip) || prefs.includes(n.tip))
  const unread = notifVizibile.filter(n => !n.citit)

  async function marcheazaCitit(id: string) {
    await supabase.from('notificari').update({ citit: true }).eq('id', id)
    setNotif(prev => prev.map(n => n.id === id ? { ...n, citit: true } : n))
  }

  async function marcheazaToateCitite() {
    const ids = unread.map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('notificari').update({ citit: true }).in('id', ids)
    setNotif(prev => prev.map(n => ({ ...n, citit: true })))
  }

  function onClickNotif(n: any) {
    if (!n.citit) marcheazaCitit(n.id)
    setOpen(false)
    if (n.url) router.push(n.url)
  }

  return (
    <div className="notif-bell-wrap" style={{ position: 'fixed', top: 16, right: 16, zIndex: 150 }}>
      <style>{`
        @media (max-width: 768px) {
          .notif-bell-wrap { top: 8px !important; right: 58px !important; }
        }
      `}</style>
      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#0B1220', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 12,
          boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0B1220' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Notificări</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {unread.length > 0 && (
                <button onClick={marcheazaToateCitite} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7BC8FF', fontSize: 11, fontWeight: 600 }}>
                  Marchează toate citite
                </button>
              )}
              <button onClick={() => setShowSetari(s => !s)} title="Alege categoriile de notificări"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showSetari ? '#7BC8FF' : 'rgba(159,215,255,0.5)', fontSize: 15, padding: 0, lineHeight: 1 }}>
                ⚙️
              </button>
            </div>
          </div>
          {showSetari && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 8 }}>Primesc notificări (clopoțel + push) doar pentru:</div>
              {CATEGORII_NOTIF.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 12, color: '#D6E4F4' }}>
                  <input type="checkbox" checked={prefs.includes(c.key)} onChange={() => toggleCategorie(c.key)}
                    style={{ width: 15, height: 15, accentColor: '#4DA3FF', cursor: 'pointer' }} />
                  <span>{c.icon} {c.label}</span>
                </label>
              ))}
            </div>
          )}
          {notifVizibile.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'rgba(159,215,255,0.3)' }}>Nicio notificare</div>
          ) : notifVizibile.map(n => (
            <div key={n.id} onClick={() => onClickNotif(n)}
              style={{ display: 'flex', gap: 10, padding: '11px 14px', cursor: n.url ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.04)', background: n.citit ? 'transparent' : 'rgba(77,163,255,0.06)' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{TIP_ICON[n.tip] || TIP_ICON.default}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: n.citit ? 'rgba(214,228,244,0.6)' : '#E8F4FF', fontWeight: n.citit ? 400 : 600, lineHeight: 1.4 }}>{n.mesaj}</div>
                <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)', marginTop: 2 }}>{fmtRelativ(n.data)}</div>
              </div>
              {!n.citit && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4DA3FF', flexShrink: 0, marginTop: 4 }}/>}
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', width: 38, height: 38, borderRadius: 10,
          border: '1px solid rgba(159,215,255,0.15)', background: 'rgba(11,18,32,0.9)', color: '#7BC8FF',
          cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)',
        }}>
        🔔
        {unread.length > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #0B1220' }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>
    </div>
  )
}
