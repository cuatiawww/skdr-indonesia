// PR 044: Spasial (Dasbor Limited) - replaces the PR 029 placeholder. Login required (LIMITED_PREFIXES).
import { Suspense } from 'react'
import SpasialClient from '@/components/spasial/SpasialClient'

export default function SpasialPage() {
  return (
    <div data-testid="limited-spasial">
      <Suspense fallback={null}><SpasialClient /></Suspense>
    </div>
  )
}
