'use client'

import React from 'react'
import LandingNavbar from '@/components/landing/LandingNavbar'
import LandingHero from '@/components/landing/LandingHero'
import LandingAbout from '@/components/landing/LandingAbout'
import LandingDiseases from '@/components/landing/LandingDiseases'
import LandingRapidResponse from '@/components/landing/LandingRapidResponse'
import LandingStats from '@/components/landing/LandingStats'
import LandingFooter from '@/components/landing/LandingFooter'
import LandingModals from '@/components/landing/LandingModals'

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-slate-800" data-testid="skdr-landing-page">
      <LandingNavbar />
      <LandingHero />
      <LandingAbout />
      <LandingDiseases />
      <LandingRapidResponse />
      <LandingStats />
      <LandingFooter />
      <LandingModals />
    </main>
  )
}
