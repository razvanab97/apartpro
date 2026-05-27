'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import {
  LayoutDashboard, Building2, Users, CalendarCheck, Receipt,
  FileText, Settings, CheckSquare, TrendingUp, Sparkles
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'Principal' },
  { href: '/apartamente', label: 'Apartamente', icon: Building2, group: 'Principal' },
  { href: '/proprietari', label: 'Proprietari', icon: Users, group: 'Principal' },
  { href: '/rezervari', label: 'Rezervări', icon: CalendarCheck, group: 'Principal' },
  { href: '/cheltuieli', label: 'Cheltuieli', icon: Receipt, group: 'Financiar' },
  { href: '/deconturi', label: 'Deconturi', icon: TrendingUp, group: 'Financiar' },
  { href: '/rapoarte', label: 'Rapoarte', icon: FileText, group: 'Financiar' },
  { href: '/taskuri', label: 'Task-uri', icon: CheckSquare, group: 'Operațional' },
  { href: '/setari', label: 'Setări', icon: Settings, group: 'Sistem' },
]

const groups = ['Principal', 'Financiar', 'Operațional', 'Sistem']

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <aside style={{
        width: 228,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'rgba(22,44,66,0.88)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(46,118,163,0.35)',
              border: '1px solid rgba(46,118,163,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>🏢</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#EAF2F8', letterSpacing: -0.3 }}>ApartPro</div>
              <div style={{ fontSize: 10, color: 'rgba(138,175,200,0.7)', marginTop: 1 }}>Regim hotelier · ERP</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(group => {
            const items = navItems.filter(i => i.group === group)
            if (!items.length) return null
            return (
              <div key={group}>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(138,175,200,0.5)', textTransform: 'uppercase', letterSpacing: '0.9px', padding: '0 10px', marginBottom: 4 }}>
                  {group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map(({ href, label, icon: Icon }) => {
                    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                    return (
                      <Link key={href} href={href} style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '8px 10px', borderRadius: 9,
                        fontSize: 13,
                        fontWeight: active ? 500 : 400,
                        color: active ? '#7EC8E3' : 'rgba(138,175,200,0.75)',
                        background: active ? 'rgba(46,118,163,0.22)' : 'transparent',
                        border: active ? '1px solid rgba(46,118,163,0.25)' : '1px solid transparent',
                        textDecoration: 'none',
                        transition: 'all 0.12s',
                      }}>
                        <Icon size={15} style={{ flexShrink: 0 }} />
                        {label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(46,118,163,0.25)',
              border: '1.5px solid rgba(46,118,163,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: '#7EC8E3', flexShrink: 0,
            }}>MA</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#D6EAF3' }}>Administrator</div>
              <div style={{ fontSize: 10, color: 'rgba(138,175,200,0.5)' }}>ApartPro</div>
            </div>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 24px',
      background: 'rgba(250,240,230,0.65)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.6)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.2 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, marginTop: 2, color: 'var(--text3)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  )
}
