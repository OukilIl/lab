import { Suspense } from 'react'

import { StatListScreen } from './StatListScreen'
import { SkeletonCard } from '@/components/ui'

/**
 * The drill-down behind each dashboard stat, as `/list?view=…`.
 *
 * A query parameter rather than a dynamic segment so the static export needs
 * only one prerendered shell.
 */
export default function StatListPage() {
  return (
    <Suspense fallback={<SkeletonCard lines={4} />}>
      <StatListScreen />
    </Suspense>
  )
}
