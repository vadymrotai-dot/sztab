'use client'

// components/clients/client-notes-section.tsx
// Sprint TYDZIEN2.T2.5 (29.05.2026) — multi-row notatki dla klienta.
// Replaces legacy clients.notes single-field display.
//
// UI patterns mirror ContactSectionV3 (T2.4):
//   - editingId / isAdding mutual exclusion (тільки 1 form open w danym czasie)
//   - per-row hover ✏ edit + 🗑 delete (group-hover:opacity-100)
//   - useTransition busy state + error banner
//   - revalidatePath na server actions → list refetch automatic
//
// DISPLAY:
//   - Newest first (props.notes уже sorted DESC za created_at z server).
//   - Body whitespace-pre-wrap (NO Markdown).
//   - Relative time ("2 godziny temu") z date-fns/locale/pl, title=absolute
//     Europe/Warsaw timestamp.
//   - Badge "(edytowano)" gdy updated_at - created_at > 1s.

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { PencilIcon, Trash2Icon, PlusIcon, Loader2Icon } from 'lucide-react'

import { deleteClientNote } from '@/app/actions/client-notes'

import { ClientNoteForm } from './client-note-form'

export interface ClientNote {
  id: string
  body: string
  created_at: string
  updated_at: string
}

interface Props {
  clientId: string
  /** Sorted newest first (created_at DESC) z page query. */
  notes: ClientNote[]
}

function formatAbsolute(iso: string): string {
  // Europe/Warsaw fix dla React #418 hydration mismatch (T2-HYDRATION-FIX
  // pattern — server Node.js UTC vs browser Europe/Warsaw text mismatch).
  return new Date(iso).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function wasEdited(note: ClientNote): boolean {
  const delta =
    new Date(note.updated_at).getTime() - new Date(note.created_at).getTime()
  return delta > 1000
}

interface NoteRowProps {
  note: ClientNote
  busy: boolean
  /** Hide ✏/🗑 gdy editing (form renderowany poniżej). */
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
}

function NoteRow({ note, busy, isEditing, onEdit, onDelete }: NoteRowProps) {
  const edited = wasEdited(note)
  const relativeTime = formatDistanceToNow(new Date(note.created_at), {
    addSuffix: true,
    locale: pl,
  })

  return (
    <div className="group rounded border border-[#E5E1D8] bg-white p-3 space-y-1.5">
      {/* Body — pre-wrap zachowuje newlines + indentation z user paste. */}
      <div className="whitespace-pre-wrap text-sm text-[#222] leading-relaxed">
        {note.body}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F5F3EE]">
        <div className="flex items-center gap-2 text-[11px] text-[#888]">
          <span title={formatAbsolute(note.created_at)}>{relativeTime}</span>
          {edited && (
            <span
              className="text-[10px] italic text-[#AAA]"
              title={`Ostatnia edycja: ${formatAbsolute(note.updated_at)}`}
            >
              (edytowano)
            </span>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>
    </div>
  )
}

export function ClientNotesSection({ clientId, notes }: Props) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete(note: ClientNote) {
    const preview = note.body.slice(0, 60).replace(/\s+/g, ' ')
    if (!window.confirm(`Usunąć notatkę: "${preview}${note.body.length > 60 ? '...' : ''}"?`)) {
      return
    }
    setError(null)
    setBusyId(note.id)
    startTransition(async () => {
      const result = await deleteClientNote(note.id)
      setBusyId(null)
      if (!result.ok) setError(result.error)
    })
  }

  function handleEditOpen(note: ClientNote) {
    setError(null)
    // Mutual exclusion: open edit closes add.
    setIsAdding(false)
    setEditingId((curr) => (curr === note.id ? null : note.id))
  }

  function handleAddOpen() {
    setError(null)
    // Mutual exclusion: open add closes edit.
    setEditingId(null)
    setIsAdding(true)
  }

  return (
    <div className="space-y-2 text-sm">
      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Header: Dodaj button — hidden gdy add form open (mutex). */}
      {!isAdding && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleAddOpen}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#555] hover:bg-[#F5F5F5] disabled:opacity-50"
          >
            <PlusIcon className="size-3" />
            Dodaj notatkę
          </button>
        </div>
      )}

      {isAdding && (
        <ClientNoteForm
          clientId={clientId}
          mode="add"
          onSuccess={() => setIsAdding(false)}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {notes.length === 0 && !isAdding && (
        <div className="rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-4 text-center text-xs italic text-[#888]">
          Brak notatek
        </div>
      )}

      <div className="space-y-2">
        {notes.map((note) => {
          const isEditing = editingId === note.id
          return (
            <div key={note.id} className="space-y-1.5">
              <NoteRow
                note={note}
                busy={busyId === note.id || isPending}
                isEditing={isEditing}
                onEdit={() => handleEditOpen(note)}
                onDelete={() => handleDelete(note)}
              />
              {isEditing && (
                <ClientNoteForm
                  clientId={clientId}
                  mode="edit"
                  noteId={note.id}
                  initialBody={note.body}
                  onSuccess={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-[#888]">
          <Loader2Icon className="size-3 animate-spin" />
          Zapisuję...
        </div>
      )}
    </div>
  )
}
