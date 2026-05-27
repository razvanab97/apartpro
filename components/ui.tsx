'use client'
import { ReactNode, useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react'

// ---- Button ----
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

const variantStyles: Record<BtnVariant, string> = {
  primary: 'bg-[#4f7cff] border-[#4f7cff] text-white hover:bg-[#6e95ff] hover:border-[#6e95ff]',
  secondary: 'bg-[#1e2535] border-[#2a3350] text-[#8a9bc4] hover:bg-[#242d42] hover:text-[#e8edf8]',
  ghost: 'bg-transparent border-transparent text-[#8a9bc4] hover:bg-[#1e2535]',
  danger: 'bg-[#ff5b5b15] border-[#ff5b5b40] text-[#ff5b5b] hover:bg-[#ff5b5b25]',
  success: 'bg-[#2dd4a015] border-[#2dd4a040] text-[#2dd4a0] hover:bg-[#2dd4a025]',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

export function Button({
  variant = 'secondary', size = 'md', loading, icon, children, className = '', disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-[8px] border font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin flex-shrink-0" /> : icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

// ---- Badge ----
type BadgeColor = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'gray' | 'cyan'
const badgeColors: Record<BadgeColor, string> = {
  green: 'bg-[#2dd4a010] text-[#2dd4a0]',
  amber: 'bg-[#f5a62310] text-[#f5a623]',
  red: 'bg-[#ff5b5b10] text-[#ff5b5b]',
  blue: 'bg-[#4f7cff15] text-[#4f7cff]',
  purple: 'bg-[#a78bfa15] text-[#a78bfa]',
  gray: 'bg-[#2a3350] text-[#5a6b8a]',
  cyan: 'bg-[#38bdf810] text-[#38bdf8]',
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: BadgeColor }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColors[color]}`}>
      {children}
    </span>
  )
}

// ---- Card ----
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[#161b27] border border-[#2a3350] rounded-[14px] p-5 ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-[#e8edf8]">{children}</h3>
}

// ---- Stat Card ----
export function StatCard({
  label, value, sub, color = 'text-[#e8edf8]', icon,
}: {
  label: string; value: string | number; sub?: string; color?: string; icon?: ReactNode
}) {
  return (
    <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] p-5 hover:border-[#3a4a6a] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#5a6b8a] mb-2">{label}</p>
          <p className={`text-2xl font-bold font-mono tracking-tight ${color}`}>{value}</p>
          {sub && <p className="text-xs text-[#5a6b8a] mt-1">{sub}</p>}
        </div>
        {icon && <div className="flex-shrink-0">{icon}</div>}
      </div>
    </div>
  )
}

// ---- Modal ----
export function Modal({
  open, onClose, title, subtitle, children, width = 'max-w-lg',
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; width?: string
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-[#161b27] border border-[#3a4a6a] rounded-[20px] p-7 w-full ${width} mx-4 max-h-[90vh] overflow-y-auto relative animate-fadein`}>
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-7 h-7 flex items-center justify-center bg-[#1e2535] border border-[#2a3350] rounded-md text-[#8a9bc4] hover:bg-[#242d42] transition-colors"
        >
          <X size={13} />
        </button>
        <h2 className="text-lg font-semibold text-[#e8edf8] mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-[#5a6b8a] mb-6">{subtitle}</p>}
        {!subtitle && <div className="mb-6" />}
        {children}
      </div>
    </div>
  )
}

// ---- Form helpers ----
export function FormGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 ${className}`}>{children}</div>
}

export function FormRow({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }
  return <div className={`grid ${grid[cols]} gap-4`}>{children}</div>
}

// ---- Empty state ----
export function EmptyState({ icon, title, desc, action }: {
  icon?: ReactNode; title: string; desc?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 opacity-30">{icon}</div>}
      <p className="text-sm font-medium text-[#e8edf8] mb-1">{title}</p>
      {desc && <p className="text-xs text-[#5a6b8a] mb-4">{desc}</p>}
      {action}
    </div>
  )
}

// ---- Loading ----
export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-[#4f7cff]" />
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <LoadingSpinner size={28} />
    </div>
  )
}

// ---- Alert ----
export function Alert({ type, message }: { type: 'error' | 'success' | 'info'; message: string }) {
  const styles = {
    error: 'bg-[#ff5b5b10] border-[#ff5b5b30] text-[#ff5b5b]',
    success: 'bg-[#2dd4a010] border-[#2dd4a030] text-[#2dd4a0]',
    info: 'bg-[#4f7cff10] border-[#4f7cff30] text-[#4f7cff]',
  }
  const icons = {
    error: <AlertCircle size={15} />,
    success: <CheckCircle2 size={15} />,
    info: <Info size={15} />,
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm ${styles[type]}`}>
      {icons[type]}
      {message}
    </div>
  )
}

// ---- Toast (simple) ----
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
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-fadein">
      <Alert type={toast.type} message={toast.message} />
    </div>
  )
}

// ---- Channel badge ----
export function CanalBadge({ canal }: { canal: string }) {
  const styles: Record<string, string> = {
    booking: 'bg-[#4fa0ff15] text-[#4fa0ff]',
    airbnb: 'bg-[#ff585510] text-[#ff9a98]',
    direct: 'bg-[#2dd4a010] text-[#2dd4a0]',
    whatsapp: 'bg-[#25d36610] text-[#25d366]',
    telefon: 'bg-[#a78bfa15] text-[#a78bfa]',
    site: 'bg-[#f5a62315] text-[#f5a623]',
  }
  const labels: Record<string, string> = {
    booking: 'Booking', airbnb: 'Airbnb', direct: 'Direct',
    whatsapp: 'WhatsApp', telefon: 'Telefon', site: 'Site',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${styles[canal] || 'bg-[#2a3350] text-[#5a6b8a]'}`}>
      {labels[canal] || canal}
    </span>
  )
}

// ---- Status Decont badge ----
export function StatusDecont({ status }: { status: string }) {
  const map: Record<string, { label: string; color: BadgeColor }> = {
    nedecontat: { label: 'Nedecontat', color: 'gray' },
    inclus: { label: 'Inclus', color: 'amber' },
    decontat: { label: 'Decontat', color: 'green' },
  }
  const s = map[status] || { label: status, color: 'gray' as BadgeColor }
  return <Badge color={s.color}>{s.label}</Badge>
}

// ---- Confirm dialog ----
export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Șterge', loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void
  title: string; message: string; confirmLabel?: string; loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm">
      <p className="text-sm text-[#8a9bc4] mb-6">{message}</p>
      <div className="flex gap-3">
        <Button variant="danger" onClick={onConfirm} loading={loading} className="flex-1">
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onClose} className="flex-1">Anulează</Button>
      </div>
    </Modal>
  )
}
