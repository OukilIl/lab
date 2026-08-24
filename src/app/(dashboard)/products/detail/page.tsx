import { Suspense } from 'react'

import { ProductDetailScreen } from './ProductDetailScreen'
import { SkeletonCard } from '@/components/ui'

/**
 * Addressed as `/products/detail?gtin=…` rather than a dynamic segment.
 *
 * A static export must enumerate every dynamic route at build time, but the
 * product list lives on the user's device — so there is nothing to enumerate.
 * A query parameter keeps one prerendered shell that works for any product.
 */
export default function ProductDetailPage() {
  return (
    <Suspense fallback={<SkeletonCard lines={5} />}>
      <ProductDetailScreen />
    </Suspense>
  )
}
