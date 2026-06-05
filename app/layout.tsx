import type { Metadata } from 'next'
import './globals.css'
import Layout from '@/components/Layout'

export const metadata: Metadata = {
  title: 'XapartPro — AB Homes Iași',
  description: 'Platforma de administrare apartamente in regim hotelier',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo.jpg', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'XapartPro',
  },
  themeColor: '#0A1628',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
        <link rel="manifest" href="/manifest.json"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="ApartPro"/>
        <meta name="theme-color" content="#0A1628"/>
      </head>
      <body style={{background:'#060E1A'}}>
        <div style={{position:'fixed',inset:0,zIndex:-2,background:'linear-gradient(160deg,#040C18 0%,#071220 40%,#0A1828 100%)'}}/>
        <div style={{position:'fixed',top:'-15%',right:'-5%',width:'50%',height:'65%',zIndex:-1,background:'radial-gradient(ellipse,rgba(77,163,255,0.13) 0%,transparent 68%)',pointerEvents:'none'}}/>
        <div style={{position:'fixed',bottom:'-20%',left:'-8%',width:'45%',height:'55%',zIndex:-1,background:'radial-gradient(ellipse,rgba(37,99,235,0.10) 0%,transparent 68%)',pointerEvents:'none'}}/>
        <div style={{position:'fixed',top:'35%',left:'30%',width:'40%',height:'40%',zIndex:-1,background:'radial-gradient(ellipse,rgba(159,215,255,0.05) 0%,transparent 70%)',pointerEvents:'none'}}/>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
