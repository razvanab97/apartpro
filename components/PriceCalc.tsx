'use client'
import { useState } from 'react'
import { Modal, FormGroup, FormRow } from '@/components/ui'
import { Calculator, X } from 'lucide-react'

function nightsBetween(a: string, b: string): number {
  if (!a || !b) return 0
  const n = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  return n > 0 ? n : 0
}

export default function PriceCalc() {
  const [open, setOpen] = useState(false)
  const [checkin, setCheckin] = useState('')
  const [checkout, setCheckout] = useState('')
  const [pretNoapte, setPretNoapte] = useState('')
  const [moneda, setMoneda] = useState<'RON' | 'EUR'>('RON')

  const nopti = nightsBetween(checkin, checkout)
  const total = nopti * (Number(pretNoapte) || 0)

  return (
    <>
      <div style={{ position: 'fixed', bottom: 24, right: 90, zIndex: 998 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Calculator preț"
          style={{
            width: 54, height: 54, borderRadius: '50%',
            background: open ? 'rgba(14,27,43,0.9)' : 'rgba(77,163,255,0.9)',
            border: '2px solid rgba(159,215,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#FFFFFF',
            boxShadow: '0 4px 20px rgba(77,163,255,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {open ? <X size={22} /> : <Calculator size={22} />}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Calculator preț" subtitle="Perioadă → nopți → preț final" width="380px">
        <FormRow cols={2}>
          <FormGroup>
            <label>Check-in</label>
            <input type="date" value={checkin} onChange={e => setCheckin(e.target.value)} />
          </FormGroup>
          <FormGroup>
            <label>Check-out</label>
            <input type="date" value={checkout} min={checkin || undefined} onChange={e => setCheckout(e.target.value)} />
          </FormGroup>
        </FormRow>

        <div style={{
          textAlign: 'center', padding: '14px 0', margin: '4px 0 18px',
          borderTop: '1px solid rgba(159,215,255,0.1)', borderBottom: '1px solid rgba(159,215,255,0.1)',
        }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF' }}>{nopti}</div>
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{nopti === 1 ? 'noapte' : 'nopți'}</div>
        </div>

        <FormRow cols={2}>
          <FormGroup>
            <label>Preț / noapte</label>
            <input type="number" inputMode="decimal" placeholder="0" value={pretNoapte} onChange={e => setPretNoapte(e.target.value)} />
          </FormGroup>
          <FormGroup>
            <label>Monedă</label>
            <select value={moneda} onChange={e => setMoneda(e.target.value as 'RON' | 'EUR')}>
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
            </select>
          </FormGroup>
        </FormRow>

        <div style={{
          marginTop: 8, padding: '16px', borderRadius: 12,
          background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(77,163,255,0.25)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 4 }}>Preț final</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>
            {total.toLocaleString('ro-RO')} {moneda}
          </div>
        </div>
      </Modal>
    </>
  )
}
