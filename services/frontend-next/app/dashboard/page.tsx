'use client'
// PR 029: /dashboard = Dasbor area landing (sidebar shows only dashboard menus: Dasbor + Dasbor Limited; all need login).
import AreaHub from '@/components/layout/AreaHub'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function DashboardHubPage() {
  const { t } = useTranslation()
  return <AreaHub area="dashboard" selfHref="/dashboard" title={t('skdr.access.dashboardTitle')} subtitle={t('skdr.access.dashboardSubtitle')} />
}
