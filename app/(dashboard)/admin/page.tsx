// app/(dashboard)/admin/page.tsx
// Sprint S5B-3 — index page dla /admin. Zamiast 404 redirectuje до
// jedynej istniejącej subpage (health). Future subpages — extend tu jako
// link grid albo zostaw redirect dopóki tylko 1 subpage.

import { redirect } from 'next/navigation'

export default function AdminPage() {
  redirect('/admin/health')
}
