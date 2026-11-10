// PR 037: Halaman awal portal SKDR menampilkan Landing Page (dari skdr-landing-page).
// Halaman Beranda surveilans terautentikasi dipindahkan ke /beranda (app/beranda/page.tsx).
import LandingPage from '@/components/landing/LandingPage'

export default function HomePage() {
  return <LandingPage />
}
