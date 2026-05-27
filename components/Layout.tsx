'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import {
  LayoutDashboard, Building2, Users, CalendarCheck, Receipt,
  FileText, Settings, CheckSquare, TrendingUp, LogOut
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/apartamente', label: 'Apartamente', icon: Building2 },
  { href: '/proprietari', label: 'Proprietari', icon: Users },
  { href: '/rezervari', label: 'Rezervări', icon: CalendarCheck },
  { href: '/cheltuieli', label: 'Cheltuieli', icon: Receipt },
  { href: '/deconturi', label: 'Deconturi', icon: TrendingUp },
  { href: '/rapoarte', label: 'Rapoarte', icon: FileText },
  { href: '/taskuri', label: 'Task-uri', icon: CheckSquare },
  { href: '/setari', label: 'Setări', icon: Settings },
]

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-base font-bold" style={{ color: 'var(--text)' }}>🏢 ApartPro</div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--text3)' }}>v1.0 · MVP</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={{
                  background: active ? 'rgba(79,124,255,0.12)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text2)',
                }}
              >
                <Icon size={16} className="flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ color: 'var(--text2)' }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{ background: 'rgba(79,124,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.3)' }}
            >
              MA
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>Administrator</div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>ApartPro</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

// Page header component
export function PageHeader({
  title, subtitle, actions
}: {
  title: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
      style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
    >
      <div>
        <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
