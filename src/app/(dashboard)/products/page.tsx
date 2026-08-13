import { Suspense } from 'react'

import { ProductsScreen } from './ProductsScreen'
import { SkeletonCard } from '@/components/ui'

/**
 * `useSearchParams` in the child must sit inside a Suspense boundary,
 * otherwise the production build fails during prerendering.
 */
export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="stack stack-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      }
    >
      <ProductsScreen />
    </Suspense>
  )
}
