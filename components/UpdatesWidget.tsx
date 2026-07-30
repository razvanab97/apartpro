'use client'
import { useState } from 'react'
import { UPDATES } from '@/lib/updates'

export default function UpdatesWidget() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 150 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 44, left: 0, width: 300, maxHeight: 340, overflowY: 'auto',
          background: '#0B1220', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 12,
          padding: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(159,215,255,0.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Ultimele actualizări
          </div>
          {UPDATES.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: i < UPDATES.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <span style={{ color: '#4ADE80', fontSize: 13, flexShrink: 0 }}>✓</span>
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
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 20,
          border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(11,18,32,0.9)', color: '#4ADE80',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
        }}>
        🔔 {UPDATES.length} actualizări
      </button>
    </div>
  )
}
