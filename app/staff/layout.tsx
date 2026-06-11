import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'AB Homes Staff',
  description: 'Curățenie & Pregătire',
  manifest: '/manifest-staff.json',
  icons: {
    icon: [
      { url: '/favicon-staff.svg', type: 'image/svg+xml' },
      { url: '/favicon-staff.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon-staff.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      touchAction: 'pan-y',
      overscrollBehavior: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
