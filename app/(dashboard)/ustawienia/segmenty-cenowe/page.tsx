// app/(dashboard)/ustawienia/segmenty-cenowe/page.tsx
// Faza 1 DAGOLD — strona przeniesiona do /ceny/segmenty (sekcja "Ceny").
// Stały redirect (308) ze starego adresu — bez martwego linku i duplikatu.

import { permanentRedirect } from 'next/navigation'

export default function LegacySegmentyRedirect() {
  permanentRedirect('/ceny/segmenty')
}
