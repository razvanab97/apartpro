'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import {
  LayoutDashboard, Building2, Users, CalendarCheck,
  Receipt, FileText, Settings, CheckSquare, TrendingUp
} from 'lucide-react'

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard', group: 'P' },
  { href: '/apartamente', icon: Building2, label: 'Apartamente', group: 'P' },
  { href: '/proprietari', icon: Users, label: 'Proprietari', group: 'P' },
  { href: '/rezervari', icon: CalendarCheck, label: 'Rezervări', group: 'P' },
  { href: '/cheltuieli', icon: Receipt, label: 'Cheltuieli', group: 'F' },
  { href: '/deconturi', icon: TrendingUp, label: 'Deconturi', group: 'F' },
  { href: '/rapoarte', icon: FileText, label: 'Rapoarte', group: 'F' },
  { href: '/taskuri', icon: CheckSquare, label: 'Task-uri', group: 'O' },
  { href: '/setari', icon: Settings, label: 'Setări', group: 'S' },
]

const groups: { key: string; label: string }[] = [
  { key: 'P', label: 'Principal' },
  { key: 'F', label: 'Financiar' },
  { key: 'O', label: 'Operațional' },
  { key: 'S', label: 'Sistem' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* COMPACT SIDEBAR — 188px */}
      <aside style={{
        width: 188,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'rgba(11,18,32,0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRight: '1px solid rgba(159,215,255,0.08)',
        position: 'relative',
      }}>
        {/* top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg,transparent,rgba(159,215,255,0.3),transparent)',
        }} />

        {/* Logo compact */}
        <div style={{
          padding: '16px 14px 13px',
          borderBottom: '1px solid rgba(159,215,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(77,163,255,0.16)',
            border: '1px solid rgba(159,215,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>🏢</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', letterSpacing: -0.3 }}>ApartPro</div>
            <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginTop: 1, fontFamily: 'monospace' }}>v1.0 · ERP</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(g => {
            const items = navItems.filter(i => i.group === g.key)
            return (
              <div key={g.key}>
                <div style={{
                  fontSize: 9, fontWeight: 600,
                  color: 'rgba(159,215,255,0.25)',
                  textTransform: 'uppercase', letterSpacing: '0.9px',
                  padding: '0 8px', marginBottom: 3,
                }}>{g.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map(({ href, icon: Icon, label }) => {
                    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                    return (
                      <Link key={href} href={href} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 9px', borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: active ? 500 : 400,
                        color: active ? '#FFFFFF' : 'rgba(159,215,255,0.48)',
                        background: active ? 'rgba(77,163,255,0.16)' : 'transparent',
                        border: active ? '1px solid rgba(159,215,255,0.16)' : '1px solid transparent',
                        textDecoration: 'none',
                        transition: 'all 0.12s',
                      }}>
                        <Icon size={14} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                        {label}
                        {active && <div style={{
                          marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                          background: '#4DA3FF', boxShadow: '0 0 6px rgba(77,163,255,0.9)',
                        }} />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User compact */}
        <div style={{ padding: '8px 8px 12px', borderTop: '1px solid rgba(159,215,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(77,163,255,0.16)',
              border: '1.5px solid rgba(159,215,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: '#4DA3FF', flexShrink: 0,
            }}>MA</div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>Mihai Andrei</div>
              <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', fontFamily: 'monospace' }}>ADMIN</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 20px',
      background: 'rgba(14,27,43,0.6)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(159,215,255,0.08)',
      position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
    }}>
      <div>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', letterSpacing: -0.2 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 11, marginTop: 1, color: 'rgba(159,215,255,0.4)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  )
}
