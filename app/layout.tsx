import type { Metadata } from 'next'
import './globals.css'
import Layout from '@/components/Layout'

export const metadata: Metadata = {
  title: 'ApartPro — Administrare Apartamente',
  description: 'Platformă de administrare apartamente în regim hotelier',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body style={{ background: '#F0E8DC', minHeight: '100vh' }}>
        <div style={{
          position: 'fixed', inset: 0, zIndex: -1,
          background: 'linear-gradient(135deg, #EAE0D4 0%, #F0EAE0 35%, #E8EFF5 70%, #D6EAF3 100%)',
        }} />
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
