'use client'
import Link from 'next/link'
import Chatbot from '@/components/Chatbot'
import { usePathname } from 'next/navigation'
import { ReactNode, useState } from 'react'
import {
  LayoutDashboard, Building2, Users, CalendarCheck, Inbox,
  Receipt, FileText, Settings, CheckSquare, TrendingUp,
  Upload, RefreshCw, CalendarDays, Menu, X, ChevronRight
, Zap } from 'lucide-react'

const navItems = [
  { href: '/',            icon: LayoutDashboard, label: 'Dashboard',      group: 'P', bottom: true },
  { href: '/rezervari',   icon: CalendarCheck,   label: 'Rezervări',      group: 'P', bottom: true },
  { href: '/inbox',       icon: Inbox,           label: 'Smart Booking',   group: 'P', bottom: false },
  { href: '/calendar',    icon: CalendarDays,    label: 'Calendar',       group: 'P', bottom: true },
  { href: '/taskuri',     icon: CheckSquare,     label: 'Task-uri',       group: 'O', bottom: true },
  { href: '/mesaje-masa', icon: Inbox,   label: 'Mesaje în masă', group: 'O', bottom: true },
  { href: '/curatenie',   icon: Zap,         label: 'Curățenie',      group: 'O', bottom: true },
  { href: '/apartamente', icon: Building2,       label: 'Apartamente',    group: 'P', bottom: false },
  { href: '/proprietari', icon: Users,           label: 'Proprietari',    group: 'P', bottom: false },
  { href: '/import',      icon: Upload,          label: 'Import Excel',   group: 'P', bottom: false },
  { href: '/sync',        icon: RefreshCw,       label: 'Sync 5starDesk', group: 'P', bottom: false },
  { href: '/cheltuieli',  icon: Receipt,         label: 'Cheltuieli',     group: 'F', bottom: false },
  { href: '/facturi',      icon: Receipt,         label: 'Facturi',        group: 'F', bottom: false },
  { href: '/preturi',     icon: TrendingUp,     label: 'Prețuri live',   group: 'F', bottom: false },
  { href: '/deconturi',   icon: TrendingUp,      label: 'Deconturi',      group: 'F', bottom: false },
  { href: '/rapoarte',    icon: FileText,        label: 'Rapoarte',       group: 'F', bottom: false },
  { href: '/rapoarte/booking', icon: TrendingUp,  label: 'Booking $',      group: 'F', bottom: false },
  { href: '/documente',        icon: FileText,        label: 'Documente',      group: 'F', bottom: false },
  { href: '/setari',      icon: Settings,        label: 'Setări',         group: 'S', bottom: false },
]

const groups = [
  { key: 'P', label: 'Principal' },
  { key: 'F', label: 'Financiar' },
  { key: 'O', label: 'Operațional' },
  { key: 'S', label: 'Sistem' },
]

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{
      padding: '12px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)',
      background: 'rgba(11,18,32,0.6)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, flexWrap: 'wrap', gap: 8,
    }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const bottomItems = navItems.filter(i => i.bottom)

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'auto', position: 'relative' }}>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside style={{
        width: 188, flexShrink: 0, display: 'flex', flexDirection: 'column',
        height: '100dvh', background: 'rgba(11,18,32,0.85)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        borderRight: '1px solid rgba(159,215,255,0.08)',
      }} className="desktop-sidebar">
        {/* Logo */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid rgba(159,215,255,0.07)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(77,163,255,0.16)', border: '1px solid rgba(159,215,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏢</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>ApartPro</div>
            <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', fontFamily: 'monospace' }}>AB Homes Iași</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(g => {
            const items = navItems.filter(i => i.group === g.key)
            if (!items.length) return null
            return (
              <div key={g.key}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(159,215,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 8px', marginBottom: 4 }}>{g.label}</div>
                {items.map(item => {
                  const active = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, marginBottom: 1, background: active ? 'rgba(77,163,255,0.15)' : 'transparent', color: active ? '#FFFFFF' : 'rgba(159,215,255,0.55)', transition: 'all 0.12s' }}>
                      <item.icon size={15} style={{ flexShrink: 0, color: active ? '#4DA3FF' : 'inherit' }}/>
                      <span style={{ fontSize: 12, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                      {active && <ChevronRight size={10} style={{ marginLeft: 'auto', color: '#4DA3FF' }}/>}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(159,215,255,0.07)', fontSize: 10, color: 'rgba(159,215,255,0.25)' }}>
          Razvan Abunei · Admin
        </div>
      </aside>

      {/* ── MOBILE HEADER ── */}
      <div style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(11,18,32,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(159,215,255,0.1)',
        padding: '12px 16px', alignItems: 'center', justifyContent: 'space-between',
        height: 52,
      }} className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🏢</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>ApartPro</span>
        </div>
        <button onClick={() => setMobileMenuOpen(o => !o)} style={{
          background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(159,215,255,0.15)',
          borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: 'rgba(159,215,255,0.8)',
        }}>
          {mobileMenuOpen ? <X size={18}/> : <Menu size={18}/>}
        </button>
      </div>

      {/* ── MOBILE DRAWER ── */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setMobileMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 52, left: 0, bottom: 0, width: '75vw', maxWidth: 280,
            background: 'rgba(11,18,32,0.98)', backdropFilter: 'blur(40px)',
            borderRight: '1px solid rgba(159,215,255,0.1)',
            overflowY: 'auto', padding: '12px 10px',
            display: 'flex', flexDirection: 'column', gap: 12,
            animation: 'slideIn 0.2s ease',
          }} onClick={e => e.stopPropagation()}>
            {groups.map(g => {
              const items = navItems.filter(i => i.group === g.key)
              if (!items.length) return null
              return (
                <div key={g.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 10px', marginBottom: 4 }}>{g.label}</div>
                  {items.map(item => {
                    const active = pathname === item.href
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 10, marginBottom: 2, background: active ? 'rgba(77,163,255,0.18)' : 'transparent', color: active ? '#FFFFFF' : 'rgba(159,215,255,0.6)' }}>
                        <item.icon size={17} style={{ color: active ? '#4DA3FF' : 'inherit', flexShrink: 0 }}/>
                        <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minWidth: 0 }} className="main-content">
        {children}
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: 'rgba(11,18,32,0.97)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(159,215,255,0.1)',
        padding: '6px 0 env(safe-area-inset-bottom, 6px)',
        justifyContent: 'space-around', alignItems: 'center',
      }} className="mobile-bottom-nav">
        {bottomItems.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 12px', borderRadius: 10, minWidth: 56, transition: 'all 0.12s', color: active ? '#4DA3FF' : 'rgba(159,215,255,0.4)' }}>
              <div style={{ position: 'relative' }}>
                <item.icon size={20}/>
                {active && <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#4DA3FF' }}/>}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </Link>
          )
        })}
        {/* More button */}
        <button onClick={() => setMobileMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 12px', color: mobileMenuOpen ? '#4DA3FF' : 'rgba(159,215,255,0.4)', minWidth: 56 }}>
          <Menu size={20}/>
          <span style={{ fontSize: 10 }}>Mai mult</span>
        </button>
      </nav>

      <Chatbot/>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          .main-content { padding-top: 52px; padding-bottom: 72px; }
          @media (max-width: 768px) {
            .desktop-sidebar { display: none !important; }
            .mobile-header { display: flex !important; }
            .mobile-bottom-nav { display: flex !important; }
          }
          @media (min-width: 769px) {
            .mobile-header { display: none !important; }
            .mobile-bottom-nav { display: none !important; }
            .main-content { padding-top: 0 !important; padding-bottom: 0 !important; }
          }
        }
        @keyframes slideIn { from { transform: translateX(-100%) } to { transform: translateX(0) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
