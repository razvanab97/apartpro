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
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
