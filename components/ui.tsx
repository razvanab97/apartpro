'use client'
import { ReactNode, useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode; children?: ReactNode
}

const variantStyles: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' },
  secondary: { background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.7)', color: 'var(--text)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' },
  ghost: { background: 'transparent', border: '1px solid transparent', color: 'var(--text2)' },
  danger: { background: 'var(--danger-bg)', border: '1px solid rgba(184,84,80,0.3)', color: 'var(--danger)' },
  success: { background: 'var(--success-bg)', border: '1px solid rgba(135,169,135,0.3)', color: 'var(--verde-dark)' },
}
const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '5px 11px', fontSize: 12, gap: 5 },
  md: { padding: '8px 16px', fontSize: 13, gap: 7 },
  lg: { padding: '10px 20px', fontSize: 14, gap: 8 },
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className = '', disabled, style, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 10, fontFamily: 'inherit', fontWeight: 500,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.5 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s',
      ...variantStyles[variant], ...sizeStyles[size], ...style,
    }}>
      {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : icon && <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  )
}

type BadgeColor = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'gray' | 'teal'
const badgeStyles: Record<BadgeColor, React.CSSProperties> = {
  green: { background: 'var(--success-bg)', color: 'var(--verde-dark)' },
  amber: { background: 'var(--warning-bg)', color: 'var(--warning)' },
  red: { background: 'var(--danger-bg)', color: 'var(--danger)' },
  blue: { background: 'var(--info-bg)', color: 'var(--denim-dark)' },
  purple: { background: '#F0EBF8', color: '#5B3D8A' },
  gray: { background: 'rgba(46,118,163,0.08)', color: 'var(--text3)' },
  teal: { background: '#E0F4F0', color: '#2A7A6F' },
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: BadgeColor }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      ...badgeStyles[color],
    }}>{children}</span>
  )
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.75)',
      borderRadius: 16,
      padding: '20px',
      ...style,
    }}>{children}</div>
  )
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>{children}</div>
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{children}</h3>
}

export function StatCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color?: string; icon?: ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.75)',
      borderRadius: 14, padding: '16px 18px',
      transition: 'all 0.15s', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 7 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text)', letterSpacing: -0.8, lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{sub}</p>}
        </div>
        {icon && <div>{icon}</div>}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, width = '520px' }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; width?: string
}) {
  if (!open) return null
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(22,44,66,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'rgba(250,244,235,0.92)',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid rgba(255,255,255,0.8)',
        borderRadius: 20, padding: 28,
        width, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        animation: 'fadeIn 0.2s ease',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 18, right: 18,
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)',
          borderRadius: 7, cursor: 'pointer', color: 'var(--text2)', backdropFilter: 'blur(8px)',
        }}><X size={13} /></button>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>{subtitle}</p>}
        {!subtitle && <div style={{ marginBottom: 24 }} />}
        {children}
      </div>
    </div>
  )
}

export function FormGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>
}

export function FormRow({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const cols_map = { 2: 'repeat(2,1fr)', 3: 'repeat(3,1fr)', 4: 'repeat(4,1fr)' }
  return <div style={{ display: 'grid', gridTemplateColumns: cols_map[cols], gap: 16 }}>{children}</div>
}

export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
      {icon && <div style={{ marginBottom: 16, opacity: 0.25 }}>{icon}</div>}
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{title}</p>
      {desc && <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>{desc}</p>}
      {action}
    </div>
  )
}

export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
}

export function PageLoading() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><LoadingSpinner size={28} /></div>
}

export function Alert({ type, message }: { type: 'error' | 'success' | 'info'; message: string }) {
  const styles: Record<string, React.CSSProperties> = {
    error: { background: 'var(--danger-bg)', border: '1px solid rgba(184,84,80,0.25)', color: 'var(--danger)' },
    success: { background: 'var(--success-bg)', border: '1px solid rgba(135,169,135,0.3)', color: 'var(--verde-dark)' },
    info: { background: 'var(--info-bg)', border: '1px solid rgba(46,118,163,0.25)', color: 'var(--denim-dark)' },
  }
  const icons = { error: <AlertCircle size={15} />, success: <CheckCircle2 size={15} />, info: <Info size={15} /> }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, fontSize: 13, ...styles[type] }}>
      {icons[type]}{message}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null)
  const show = (type: 'error' | 'success' | 'info', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }
  return { toast, show }
}

export function Toast({ toast }: { toast: { type: 'error' | 'success' | 'info'; message: string } | null }) {
  if (!toast) return null
  return <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, animation: 'fadeIn 0.2s ease' }}><Alert type={toast.type} message={toast.message} /></div>
}

export function CanalBadge({ canal }: { canal: string }) {
  const styles: Record<string, React.CSSProperties> = {
    booking: { background: 'rgba(46,118,163,0.12)', color: 'var(--denim-dark)' },
    airbnb: { background: 'rgba(184,84,80,0.1)', color: '#8B3A37' },
    direct: { background: 'var(--success-bg)', color: 'var(--verde-dark)' },
    whatsapp: { background: 'rgba(82,190,128,0.12)', color: '#2D7A4F' },
    telefon: { background: 'rgba(139,100,195,0.1)', color: '#5B3D8A' },
    site: { background: 'var(--warning-bg)', color: 'var(--warning)' },
  }
  const labels: Record<string, string> = { booking: 'Booking', airbnb: 'Airbnb', direct: 'Direct', whatsapp: 'WhatsApp', telefon: 'Telefon', site: 'Site' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      fontSize: 10.5, fontWeight: 600, fontFamily: 'monospace',
      ...(styles[canal] || { background: 'rgba(46,118,163,0.08)', color: 'var(--text3)' }),
    }}>{labels[canal] || canal}</span>
  )
}

export function StatusDecont({ status }: { status: string }) {
  const map: Record<string, { label: string; color: BadgeColor }> = {
    nedecontat: { label: 'Nedecontat', color: 'gray' },
    inclus: { label: 'Inclus', color: 'amber' },
    decontat: { label: 'Decontat', color: 'green' },
  }
  const s = map[status] || { label: status, color: 'gray' as BadgeColor }
  return <Badge color={s.color}>{s.label}</Badge>
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Șterge', loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="400px">
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="danger" onClick={onConfirm} loading={loading} style={{ flex: 1 }}>{confirmLabel}</Button>
        <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Anulează</Button>
      </div>
    </Modal>
  )
}
