'use client'
// PR 029: /tatakelola = governance/CMS landing (Form PE, master data, integrasi, manajemen akses). Login required.
import AreaHub from '@/components/layout/AreaHub'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function TatakelolaHubPage() {
  const { t } = useTranslation()
  return <AreaHub area="tatakelola" selfHref="/tatakelola" title={t('skdr.access.tatakelolaTitle')} subtitle={t('skdr.access.tatakelolaSubtitle')} />
}
