// PR 042: Matriks Analisa (Dasbor Limited) - replaces the PR 029 placeholder. Login required (LIMITED_PREFIXES).
import { Suspense } from 'react'
import MatriksAnalisaClient from '@/components/analisa/MatriksAnalisaClient'

export default function MatriksAnalisaPage() {
  return (
    <div data-testid="limited-matriks-analisa">
      <Suspense fallback={null}><MatriksAnalisaClient /></Suspense>
    </div>
  )
}
