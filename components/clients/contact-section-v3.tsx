'use client'

// components/clients/contact-section-v3.tsx
// Sprint TYDZIEN2.T2.4.B (28.05.2026) — multi-row firm contact methods.
// Replaces ContactSectionV2 (single email/phone/website cascade).
// T2.4.C1 (28.05.2026) — interactive: per-row delete + ⭐ toggle primary,
// per-section "+ Dodaj {kind}" inline form. useTransition optimistic + revert.
//
// Reads з client_contact_methods (T2.4.A seeded 664 rows). Group by kind:
//   📧 Email | 📞 Telefon | 🌐 WWW | 🔗 Social (facebook/instagram/linkedin)
//   + ⭐ primary marker, source badges, optional label badges.
//
// Edit value/label → T2.4.C2 окремо.

import { useState, useTransition } from 'react'
import {
  MailIcon,
  PhoneIcon,
  GlobeIcon,
  FacebookIcon,
  InstagramIcon,
  LinkIcon,
  StarIcon,
  Trash2Icon,
  PlusIcon,
  PencilIcon,
  Loader2Icon,
} from 'lucide-react'

import {
  deleteContactMethod,
  setPrimaryContactMethod,
} from '@/app/actions/contact-methods'

import { ContactMethodForm, type ContactMethodKind } from './contact-method-form'

export interface ContactMethod {
  id: string
  kind: string
  value: string
  label: string | null
  is_primary: boolean
  source: string
  created_at: string
}

interface Props {
  clientId: string
  methods: ContactMethod[]
}

// Display order — emails first, phones next, web, then socials, other last.
// Always render all sections (allow "+ Dodaj" navet якщо list pusty).
const KIND_ORDER: ContactMethodKind[] = [
  'email',
  'phone',
  'website',
  'facebook',
  'instagram',
  'linkedin',
  'other',
]

const KIND_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Telefon',
  website: 'WWW',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  other: 'Inne',
}

function kindIcon(kind: string): React.ReactNode {
  const cls = 'size-4 text-[#888]'
  switch (kind) {
    case 'email':
      return <MailIcon className={cls} />
    case 'phone':
      return <PhoneIcon className={cls} />
    case 'website':
      return <GlobeIcon className={cls} />
    case 'facebook':
      return <FacebookIcon className={cls} />
    case 'instagram':
      return <InstagramIcon className={cls} />
    default:
      return <LinkIcon className={cls} />
  }
}

function SourceBadge({ source }: { source: string }) {
  const cls =
    source === 'KRS'
      ? 'bg-[#DCFCE7] text-[#15803D]'
      : source === 'WWW' || source === 'website_scrape'
        ? 'bg-[#DBEAFE] text-[#1E40AF]'
        : source === 'apify_gmaps'
          ? 'bg-[#FEF3C7] text-[#92400E]'
          : source === 'tavily_brand'
            ? 'bg-[#F3E8FF] text-[#6B21A8]'
            : source === 'manual'
              ? 'bg-[#FFE4E6] text-[#9F1239]'
              : 'bg-[#F5F5F5] text-[#555]' // migration_seed + fallback
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {source}
    </span>
  )
}

function LabelBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-[#E0E7FF] px-1.5 py-0.5 text-[10px] font-medium text-[#3730A3]">
      {label}
    </span>
  )
}

function isUrlKind(kind: string): boolean {
  return kind === 'website' || kind === 'facebook' || kind === 'instagram' || kind === 'linkedin'
}

function renderValue(kind: string, value: string): React.ReactNode {
  if (kind === 'email') {
    return (
      <a href={`mailto:${value}`} className="hover:underline">
        {value}
      </a>
    )
  }
  if (kind === 'phone') {
    return (
      <a href={`tel:${value}`} className="font-mono hover:underline">
        {value}
      </a>
    )
  }
  if (isUrlKind(kind)) {
    const href = value.startsWith('http') ? value : `https://${value}`
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate hover:underline"
      >
        {value}
      </a>
    )
  }
  return <span>{value}</span>
}

interface MethodRowProps {
  m: ContactMethod
  busy: boolean
  /** Sprint T2.4.C2 — gdy true, hide ⭐/✏/🗑 icons (row jest w edit mode,
   *  form ниже rendered → user unikne accidental delete / star toggle). */
  isEditing: boolean
  onToggleStar: () => void
  onEdit: () => void
  onDelete: () => void
}

function MethodRow({ m, busy, isEditing, onToggleStar, onEdit, onDelete }: MethodRowProps) {
  return (
    <div className="group flex items-center gap-2 text-sm">
      <span className="shrink-0">{kindIcon(m.kind)}</span>
      {/* Star button — clickable, fills якщо primary. Tooltip via title attr.
          T2.4.C2 — hidden gdy editing (form renderowany poniżej). */}
      {!isEditing && (
        <button
          type="button"
          onClick={onToggleStar}
          disabled={busy || m.is_primary}
          title={m.is_primary ? 'Główny kontakt' : 'Ustaw jako główny'}
          className={`shrink-0 ${
            m.is_primary ? 'text-amber-500 cursor-default' : 'text-[#CCC] hover:text-amber-400'
          } disabled:opacity-50`}
        >
          <StarIcon className="size-3.5" fill={m.is_primary ? 'currentColor' : 'none'} />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate">{renderValue(m.kind, m.value)}</span>
      {m.label && <LabelBadge label={m.label} />}
      <SourceBadge source={m.source} />
      {/* Sprint T2.4.C2 — ✏ edit button + 🗑 delete. Both hover-revealed
          (group-hover:opacity-100). Hidden gdy editing (mutual exclusion). */}
      {!isEditing && (
        <>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            title="Edytuj"
            className="shrink-0 text-[#CCC] opacity-0 transition hover:text-indigo-600 group-hover:opacity-100 disabled:opacity-50"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="Usuń"
            className="shrink-0 text-[#CCC] opacity-0 transition hover:text-rose-600 group-hover:opacity-100 disabled:opacity-50"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

export function ContactSectionV3({ clientId, methods }: Props) {
  const [addingKind, setAddingKind] = useState<ContactMethodKind | null>(null)
  // Sprint T2.4.C2 — editingId for inline edit form. Mutual exclusion z
  // addingKind: открытие edit closes add and vice versa (only one form
  // at a time prevents UX confusion).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Group methods by kind
  const byKind = new Map<string, ContactMethod[]>()
  for (const m of methods) {
    const list = byKind.get(m.kind) ?? []
    list.push(m)
    byKind.set(m.kind, list)
  }

  function handleDelete(m: ContactMethod) {
    if (!window.confirm(`Usunąć ${KIND_LABEL[m.kind] ?? m.kind}: ${m.value.slice(0, 40)}?`)) return
    setError(null)
    setBusyId(m.id)
    startTransition(async () => {
      const result = await deleteContactMethod(m.id)
      setBusyId(null)
      if (!result.ok) setError(result.error)
    })
  }

  function handleSetPrimary(m: ContactMethod) {
    if (m.is_primary) return
    setError(null)
    setBusyId(m.id)
    startTransition(async () => {
      const result = await setPrimaryContactMethod(m.id)
      setBusyId(null)
      if (!result.ok) setError(result.error)
    })
  }

  // Sprint T2.4.C2 — open edit form for method. Mutual exclusion закриває
  // add form (якщо open). Toggle: повторний клік ✏ на тому ж row закриває.
  function handleEditOpen(m: ContactMethod) {
    setError(null)
    setAddingKind(null)
    setEditingId((curr) => (curr === m.id ? null : m.id))
  }

  // Always render всі sections з KIND_ORDER, navet з 0 rows (щоб + Dodaj
  // button у всіх kind dostępny). Hide 'linkedin' / 'other' якщо empty.
  const visibleKinds = KIND_ORDER.filter((k) => {
    if (byKind.has(k) && byKind.get(k)!.length > 0) return true
    // Show empty section dla "primary 4 kinds" (email, phone, website, facebook,
    // instagram) щоб user mógł + Dodaj. Hide linkedin/other якщо empty (rare).
    return k === 'email' || k === 'phone' || k === 'website' || k === 'facebook' || k === 'instagram'
  })

  return (
    <div className="space-y-3 text-sm">
      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {visibleKinds.map((kind) => {
        const rows = byKind.get(kind) ?? []
        const isAdding = addingKind === kind
        return (
          <div key={kind} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#888]">
                {kindIcon(kind)}
                <span>
                  {KIND_LABEL[kind] ?? kind} ({rows.length})
                </span>
              </div>
              {!isAdding && (
                <button
                  type="button"
                  onClick={() => {
                    // T2.4.C2 — open add closes edit (mutual exclusion).
                    setEditingId(null)
                    setAddingKind(kind)
                  }}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[10px] font-medium text-[#555] hover:bg-[#F5F5F5] disabled:opacity-50"
                >
                  <PlusIcon className="size-3" />
                  Dodaj
                </button>
              )}
            </div>
            <div className="space-y-1 pl-1">
              {rows.map((m) => {
                const isEditing = editingId === m.id
                return (
                  <div key={m.id} className="space-y-1.5">
                    <MethodRow
                      m={m}
                      busy={busyId === m.id || isPending}
                      isEditing={isEditing}
                      onToggleStar={() => handleSetPrimary(m)}
                      onEdit={() => handleEditOpen(m)}
                      onDelete={() => handleDelete(m)}
                    />
                    {isEditing && (
                      <ContactMethodForm
                        clientId={clientId}
                        kind={kind}
                        mode="edit"
                        methodId={m.id}
                        initialValue={m.value}
                        initialLabel={m.label}
                        onSuccess={() => setEditingId(null)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </div>
                )
              })}
              {rows.length === 0 && !isAdding && (
                <div className="text-xs italic text-[#AAA]">— brak —</div>
              )}
              {isAdding && (
                <ContactMethodForm
                  clientId={clientId}
                  kind={kind}
                  mode="add"
                  onSuccess={() => setAddingKind(null)}
                  onCancel={() => setAddingKind(null)}
                />
              )}
            </div>
          </div>
        )
      })}

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-[#888]">
          <Loader2Icon className="size-3 animate-spin" />
          Zapisuję...
        </div>
      )}
    </div>
  )
}
