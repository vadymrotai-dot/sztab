'use server'

import { revalidatePath } from 'next/cache'

// Invalidate the Next.js Router Cache for routes that surface deal
// data, so changes made inside DealModal (or Mark Done from the
// dashboard) show up the next time the user navigates back to those
// routes — without waiting for the default 30s cache window.
export async function revalidateDealRoutes() {
  revalidatePath('/deals')
  revalidatePath('/dashboard')
  revalidatePath('/clients', 'layout')
}
