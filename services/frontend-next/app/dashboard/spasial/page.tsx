'use client'
// PR 029: Dasbor Limited placeholder (menu only for now; real feature postponed). Login required.
import UnderDevelopment from '@/components/UnderDevelopment'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function SpasialPage() {
  const { t } = useTranslation()
  return <div data-testid="limited-spasial"><UnderDevelopment description={t('skdr.access.spasialDesc')} /></div>
}
