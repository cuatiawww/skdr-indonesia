'use client'
// PR 016: MODE TV is not released yet — the nav item opens a clean "Sedang Dalam Pengembangan" page.
// The TV shell (AppShell tvMode) and any existing TV code stay untouched behind it.
import UnderDevelopment from '@/components/UnderDevelopment'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function TvPage() {
  const { t } = useTranslation()
  return <div data-testid="tv-under-development"><UnderDevelopment description={t('skdr.layout.tvDesc')} /></div>
}
