'use client'
import { useState } from 'react'
import { UPDATES } from '@/lib/updates'

// inline = in meniul „Mai mult” de pe telefon (acolo butonul plutitor acoperea continutul paginii, deci e ascuns sub 768px)
export default function UpdatesWidget({ inline }: { inline?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  if (inline) return (
    <div data-updates-inline style={{ borderTop: '1px solid rgba(159,215,255,0.08)', paddingTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.06)', color: '#4ADE80', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        🔔 {'Update ' + UPDATES.length}<span style={{ marginLeft: 'auto', fontWeight: 400, color: 'rgba(159,215,255,0.5)' }}>{open ? 'ascunde' : 'noutăți'}</span>
      </button>
      {open && <div style={{ marginTop: 6, maxHeight: 300, overflowY: 'auto' }}>
        {UPDATES.slice(0, 15).map((u, i) => (
          <div key={i} style={{ padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11.5, color: 'rgba(214,228,244,0.75)', lineHeight: 1.4 }}>
            <b style={{ color: '#4ADE80' }}>{'Update ' + (UPDATES.length - i)}</b> · {u.text}
          </div>
        ))}
      </div>}
    </div>
  )
  return (
    <div className="upd-flotant" style={{ position: 'fixed', bottom: 70, left: 12, zIndex: 150 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 40, left: 0, width: 300, maxHeight: 340, overflowY: 'auto',
          background: '#0B1220', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 12,
          padding: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(159,215,255,0.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Ultimele actualizări
          </div>
          {UPDATES.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: i < UPDATES.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', flexShrink: 0 }}>{'Update ' + (UPDATES.length - i)}</span>
              <div>
                <div style={{ fontSize: 12, color: '#E8F4FF', lineHeight: 1.4 }}>{u.text}</div>
                <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)', marginTop: 1 }}>{u.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '5px 8px', borderRadius: 10,
          border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(11,18,32,0.9)', color: '#4ADE80',
          fontSize: 9, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(10px)', lineHeight: 1.2,
        }}>
        <span style={{ fontSize: 12 }}>🔔</span>
        <span>{'Update ' + UPDATES.length}</span>
      </button>
    </div>
  )
}
