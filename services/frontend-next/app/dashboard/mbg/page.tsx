// PR 052b: /dashboard/mbg (opsional ?tab=) → /dashboard/mbg/{ringkasan|keracunan|pengawasan}.
import MbgLegacyRedirect from '@/components/dasbor-mbg/MbgLegacyRedirect'

export default function DashboardMbgIndexPage() {
  return <MbgLegacyRedirect />
}
