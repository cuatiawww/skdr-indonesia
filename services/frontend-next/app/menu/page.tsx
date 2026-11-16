'use client'
// PR 073: /menu = Landing page copying /dashboard with custom /menu sidebar
import AreaHub from '@/components/layout/AreaHub'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function MenuPage() {
  const { t } = useTranslation()
  return <AreaHub area="dashboard" selfHref="/menu" title={t('skdr.access.dashboardTitle')} subtitle={t('skdr.access.dashboardSubtitle')} />
}
