'use client'
// PR 057: /main-dashboard renders the unified Dasbor SKDR (Ringkasan Utama)
import DasborSkdrClient from '@/components/dasbor-skdr/DasborSkdrClient'

export default function MainDashboardPage() {
  return <DasborSkdrClient page="ringkasan" />
}
