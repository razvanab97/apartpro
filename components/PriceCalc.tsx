'use client'
import { useState } from 'react'
import { Modal, FormGroup, FormRow } from '@/components/ui'
import { Calculator, X, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, format, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { ro } from 'date-fns/locale'

const ZILE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function nightsBetween(a: string, b: string): number {
  if (!a || !b) return 0
  const n = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  return n > 0 ? n : 0
}

function RangeCalendar({ checkin, checkout, onPick }: {
  checkin: string; checkout: string; onPick: (checkin: string, checkout: string) => void
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(checkin ? new Date(checkin) : new Date()))

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  function pickDay(d: Date) {
    const iso = format(d, 'yyyy-MM-dd')
    if (!checkin || checkout) { onPick(iso, ''); return }
    if (iso <= checkin) { onPick(iso, ''); return }
    onPick(checkin, iso)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button type="button" onClick={() => setViewMonth(m => subMonths(m, 1))} style={{
          width: 28, height: 28, borderRadius: 8, background: 'rgba(159,215,255,0.08)',
          border: '1px solid rgba(159,215,255,0.15)', color: 'rgba(159,215,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', textTransform: 'capitalize' }}>
          {format(viewMonth, 'MMMM yyyy', { locale: ro })}
        </span>
        <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))} style={{
          width: 28, height: 28, borderRadius: 8, background: 'rgba(159,215,255,0.08)',
          border: '1px solid rgba(159,215,255,0.15)', color: 'rgba(159,215,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><ChevronRight size={14} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {ZILE.map((z, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.35)', padding: '4px 0' }}>{z}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd')
          const inMonth = isSameMonth(d, viewMonth)
          const isCheckin = iso === checkin
          const isCheckout = iso === checkout
          const inRange = checkin && checkout && iso > checkin && iso < checkout
          const endpoint = isCheckin || isCheckout
          return (
            <button
              key={iso}
              type="button"
              onClick={() => pickDay(d)}
              style={{
                position: 'relative', height: 34, border: 'none', cursor: 'pointer',
                background: endpoint ? '#4DA3FF' : inRange ? 'rgba(77,163,255,0.18)' : 'transparent',
                color: endpoint ? '#FFFFFF' : inMonth ? '#E8F4FF' : 'rgba(159,215,255,0.25)',
                fontSize: 12, fontWeight: endpoint ? 700 : 400,
                borderRadius: isCheckin ? '8px 0 0 8px' : isCheckout ? '0 8px 8px 0' : inRange ? 0 : 8,
                outline: isToday(d) && !endpoint ? '1px solid rgba(159,215,255,0.4)' : 'none',
                outlineOffset: -1,
              }}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PriceCalc() {
  const [open, setOpen] = useState(false)
  const [checkin, setCheckin] = useState('')
  const [checkout, setCheckout] = useState('')
  const [noptiInput, setNoptiInput] = useState('')
  const [mode, setMode] = useState<'perNoapte' | 'total'>('perNoapte')
  const [pretInput, setPretInput] = useState('')
  const [moneda, setMoneda] = useState<'RON' | 'EUR'>('RON')

  function onPickRange(a: string, b: string) {
    setCheckin(a); setCheckout(b)
    if (a && b) setNoptiInput(String(nightsBetween(a, b)))
  }

  const nopti = Number(noptiInput) || 0
  const pretVal = Number(pretInput) || 0
  const pretPerNoapte = mode === 'perNoapte' ? pretVal : (nopti > 0 ? pretVal / nopti : 0)
  const total = mode === 'perNoapte' ? pretVal * nopti : pretVal

  return (
    <>
      <div style={{ position: 'fixed', bottom: 88, right: 24, zIndex: 998 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Calculator preț"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: open ? 'rgba(14,27,43,0.9)' : 'rgba(77,163,255,0.9)',
            border: '2px solid rgba(159,215,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#FFFFFF',
            boxShadow: '0 4px 20px rgba(77,163,255,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {open ? <X size={16} /> : <Calculator size={16} />}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Calculator preț" subtitle="Alege perioada în calendar" width="420px">
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16,
        }}>
          <div style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'rgba(14,27,43,0.58)', border: '1px solid rgba(159,215,255,0.15)' }}>
            <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 2 }}>Check-in</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: checkin ? '#FFFFFF' : 'rgba(159,215,255,0.3)' }}>
              {checkin ? format(new Date(checkin), 'd MMM yyyy', { locale: ro }) : 'Alege data'}
            </div>
          </div>
          <div style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'rgba(14,27,43,0.58)', border: '1px solid rgba(159,215,255,0.15)' }}>
            <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 2 }}>Check-out</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: checkout ? '#FFFFFF' : 'rgba(159,215,255,0.3)' }}>
              {checkout ? format(new Date(checkout), 'd MMM yyyy', { locale: ro }) : 'Alege data'}
            </div>
          </div>
        </div>

        <RangeCalendar checkin={checkin} checkout={checkout} onPick={onPickRange} />

        <div style={{
          textAlign: 'center', padding: '14px 0', margin: '16px 0 18px',
          borderTop: '1px solid rgba(159,215,255,0.1)', borderBottom: '1px solid rgba(159,215,255,0.1)',
        }}>
          <input
            type="number" inputMode="numeric" placeholder="0" value={noptiInput}
            onChange={e => setNoptiInput(e.target.value)}
            style={{ width: 90, margin: '0 auto', textAlign: 'center', fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}
          />
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginTop: 6 }}>
            {nopti === 1 ? 'noapte' : 'nopți'} <span style={{ opacity: 0.6 }}>· poți edita manual</span>
          </div>
        </div>

        <FormRow cols={2}>
          <FormGroup>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ margin: 0 }}>{mode === 'perNoapte' ? 'Preț / noapte' : 'Preț total'}</label>
              <button
                type="button" title="Inversează calculul"
                onClick={() => { setMode(m => m === 'perNoapte' ? 'total' : 'perNoapte'); setPretInput('') }}
                style={{
                  width: 22, height: 22, borderRadius: 6, background: 'rgba(159,215,255,0.08)',
                  border: '1px solid rgba(159,215,255,0.15)', color: 'rgba(159,215,255,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  marginBottom: 5,
                }}
              ><ArrowLeftRight size={11} /></button>
            </div>
            <input type="number" inputMode="decimal" placeholder="0" value={pretInput} onChange={e => setPretInput(e.target.value)} />
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
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 4 }}>
            {mode === 'perNoapte' ? 'Preț final' : 'Preț / noapte'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>
            {mode === 'perNoapte'
              ? total.toLocaleString('ro-RO')
              : pretPerNoapte.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} {moneda}
          </div>
        </div>
      </Modal>
    </>
  )
}
