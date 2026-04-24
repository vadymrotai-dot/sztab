'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Contact } from '@/lib/types'
import { PlusIcon, MoreHorizontalIcon, PencilIcon, TrashIcon, MailIcon, PhoneIcon } from 'lucide-react'

interface ClientContactsProps {
  clientId: string
  contacts: Contact[]
}

export function ClientContacts({ clientId, contacts: initialContacts }: ClientContactsProps) {
  const [contacts, setContacts] = useState(initialContacts)
  const [open, setOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', notes: '' })
    setEditingContact(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    if (editingContact) {
      const { data, error } = await supabase
        .from('contacts')
        .update(formData)
        .eq('id', editingContact.id)
        .select()
        .single()

      if (!error && data) {
        setContacts(contacts.map((c) => (c.id === data.id ? data : c)))
      }
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...formData, client_id: clientId, owner_id: user.id })
        .select()
        .single()

      if (!error && data) {
        setContacts([data, ...contacts])
      }
    }

    setLoading(false)
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
    setFormData({
      name: contact.name,
      phone: contact.phone || '',
      email: contact.email || '',
      notes: contact.notes || '',
    })
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac ten kontakt?')) return

    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (!error) {
      setContacts(contacts.filter((c) => c.id !== id))
      router.refresh()
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="mr-2 size-4" />
              Dodaj kontakt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContact ? 'Edytuj kontakt' : 'Nowy kontakt'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Imie i nazwisko *</FieldLabel>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="phone">Telefon</FieldLabel>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="notes">Notatki</FieldLabel>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </Field>
              </FieldGroup>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner className="mr-2" /> : null}
                  {editingContact ? 'Zapisz' : 'Dodaj'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Brak kontaktow dla tego klienta
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{contact.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(contact)}>
                        <PencilIcon className="mr-2 size-4" />
                        Edytuj
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(contact.id)}
                      >
                        <TrashIcon className="mr-2 size-4" />
                        Usun
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <PhoneIcon className="size-4 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="hover:underline">
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <MailIcon className="size-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="hover:underline truncate">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{contact.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
