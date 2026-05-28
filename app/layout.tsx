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
        {/* Base navy background */}
        <div style={{
          position:'fixed',inset:0,zIndex:-2,
          background:'linear-gradient(160deg,#071220 0%,#0E1B2B 45%,#091524 100%)',
        }}/>
        {/* Glow orbs — light glass tones */}
        <div style={{
          position:'fixed',top:'-15%',right:'-5%',width:'50%',height:'65%',zIndex:-1,
          background:'radial-gradient(ellipse,rgba(77,163,255,0.11) 0%,transparent 68%)',
          pointerEvents:'none',
        }}/>
        <div style={{
          position:'fixed',bottom:'-20%',left:'-8%',width:'45%',height:'55%',zIndex:-1,
          background:'radial-gradient(ellipse,rgba(37,99,235,0.09) 0%,transparent 68%)',
          pointerEvents:'none',
        }}/>
        <div style={{
          position:'fixed',top:'38%',left:'32%',width:'38%',height:'38%',zIndex:-1,
          background:'radial-gradient(ellipse,rgba(159,215,255,0.04) 0%,transparent 70%)',
          pointerEvents:'none',
        }}/>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
