import { SettingsProvider } from "@/lib/settings-context"
import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import LayoutContent from "@/components/layout/LayoutContent"
import { LanguageProvider } from "@/lib/i18n/LanguageContext"
import idDict from '@/locales/id.json'

// Use locally-bundled font files so Docker build works without internet access.
// Files were downloaded from Google Fonts (Roboto v51, Latin subset).
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

// SKDR: metadata text from the language file (default locale id).
export const metadata: Metadata = {
  title: idDict.skdr.meta.title,
  description: idDict.skdr.meta.description,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${roboto.variable} font-roboto antialiased`} suppressHydrationWarning>
        <SettingsProvider><LanguageProvider>
          <LayoutContent>{children}</LayoutContent>
        </LanguageProvider></SettingsProvider>
      </body>
    </html>
  )
}
