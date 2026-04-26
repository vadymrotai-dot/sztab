export * from './types'
export * from './validation'
export * from './excel-parser'
export { Importer } from './base'
export {
  SupplierPriceListImporter,
  type ImportedProductDraft,
} from './supplier-price-list'

import { SupplierPriceListImporter } from './supplier-price-list'

export const IMPORTER_REGISTRY = {
  'supplier-price-list': SupplierPriceListImporter,
} as const

export type ImporterKey = keyof typeof IMPORTER_REGISTRY
