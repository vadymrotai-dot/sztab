// components/portal/product-thumb.tsx — placeholder zdjęcia produktu.
// products NIE ma dziś kolumny na zdjęcie → to CZYSTO wizualny placeholder
// (brak infrastruktury zdjęć; realne foto = osobna przyszła faza).
// Spójny wygląd w dwóch miejscach: krok Produkty (size='sm', tylko ikona)
// i pasek "Twoje częste zakupy" (size='card', ikona + tekst).

// Inline SVG (bez zależności od konkretnej ikony lucide — zero ryzyka
// missing-export na buildzie). Prosty glif "obraz z ukośnikiem".
function ImgIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

const LABEL = 'Zdjęcie tymczasowo niedostępne'

export function ProductThumb({ size = 'sm' }: { size?: 'sm' | 'card' | 'lg' }) {
  if (size === 'lg') {
    // Powiększona miniatura (card-style rzędu produktu) — 76×76, icon-only.
    return (
      <div
        className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg border border-[#e4e9ef] bg-[#f5f7fa] text-slate-400"
        role="img"
        aria-label={LABEL}
        title={LABEL}
      >
        <ImgIcon className="h-7 w-7" />
      </div>
    )
  }
  if (size === 'card') {
    return (
      <div
        className="flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded-md border border-[#e4e9ef] bg-[#f5f7fa] text-slate-400"
        role="img"
        aria-label={LABEL}
      >
        <ImgIcon className="h-5 w-5" />
        <span className="px-2 text-center text-[10px] leading-tight">{LABEL}</span>
      </div>
    )
  }
  // size='sm' — mała miniatura w rzędzie produktu (tekst jako title/aria).
  return (
    <div
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-md border border-[#e4e9ef] bg-[#f5f7fa] text-slate-400"
      role="img"
      aria-label={LABEL}
      title={LABEL}
    >
      <ImgIcon className="h-5 w-5" />
    </div>
  )
}
