import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import { SettingsProvider } from '@/lib/settings-context'

const roboto = localFont({
  src: [
    { path: '../public/fonts/Roboto-300.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/Roboto-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Roboto-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Roboto-700.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/Roboto-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-roboto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SKDR Indonesia',
  description: 'Case reporting form and surveillance dashboard',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${roboto.variable} font-roboto antialiased`} suppressHydrationWarning>
        <SettingsProvider>
          <AppShell>{children}</AppShell>
        </SettingsProvider>
      </body>
    </html>
  )
}
