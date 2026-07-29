import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AB Homes Curățenie',
  description: 'Administrare curățenie AB Homes',
  manifest: '/manifest-curatenie.json',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Curățenie',
  },
  themeColor: '#0A1628',
}

export default function CuratenieLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
