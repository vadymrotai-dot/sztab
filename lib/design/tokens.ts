// lib/design/tokens.ts
// Sprint S2B Phase 1A — central design tokens. Used з Tailwind arbitrary
// values (e.g. text-[var(--sztab-text-primary)]) і w inline styles.
//
// Tailwind config NIE rebuild — tokens exposed via CSS variables (see
// app/globals.css) i imported here для type-safe references.

export const tokens = {
  colors: {
    bg: {
      canvas: '#FAFAF7',
      card: '#FFFFFF',
      sidebar: '#15151A',
      sidebarHover: '#25252D',
    },
    primary: '#4F46E5',
    success: '#00A656',
    warning: '#F59E0B',
    danger: '#DC2626',
    border: '#E5E1D8',
    borderLight: '#F0EDE5',
    text: {
      primary: '#0A0A0A',
      secondary: '#555555',
      muted: '#888888',
    },
  },
  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  typography: {
    h1: { size: '22px', weight: 500 },
    h2: { size: '18px', weight: 500 },
    body: { size: '13px', weight: 400 },
    caption: { size: '12px', weight: 400 },
    meta: {
      size: '10px',
      weight: 400,
      letterSpacing: '0.4px',
      textTransform: 'uppercase' as const,
    },
  },
} as const

export type Tokens = typeof tokens
