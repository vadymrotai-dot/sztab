import { redirect } from 'next/navigation'

// Legacy route — manual product creation now happens via the modal on
// /products. Kept as a permanent redirect so old browser bookmarks /
// links from emails / Bitrix imports keep working.
export default function NewProductLegacyRedirect() {
  redirect('/products')
}
