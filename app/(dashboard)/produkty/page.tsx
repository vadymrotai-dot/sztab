// app/(dashboard)/produkty/page.tsx
// Sprint S2B Phase 5 — Polish-language alias for /products. Redirect server-side.

import { redirect } from 'next/navigation'

export default function ProduktyAlias() {
  redirect('/products')
}
