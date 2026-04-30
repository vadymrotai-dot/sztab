// components/clients/section-action-link.tsx
// Sprint S4 Phase 1D — small accordion-section action link (server-safe).
// Used in summary headers for actions like "Pobierz z KRS", "+ Dodaj
// kontakt". Pure <a> element — accordion-section already wraps в a
// stopPropagation div, so we can stay on server side and avoid a
// client component for each link.

interface Props {
  label: string
  href: string
  /** When true, render з accent color (primary blue). */
  primary?: boolean
}

export function SectionActionLink({ label, href, primary = false }: Props) {
  const colorClass = primary
    ? 'text-[#4F46E5] hover:underline'
    : 'text-[#555] hover:text-[#0A0A0A] hover:underline'
  return (
    <a
      href={href}
      className={`text-[12px] whitespace-nowrap ${colorClass}`}
    >
      {label}
    </a>
  )
}
