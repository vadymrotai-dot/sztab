'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboardIcon,
  UsersIcon,
  KanbanIcon,
  FileTextIcon,
  PackageIcon,
  TruckIcon,
  CalculatorIcon,
  CheckSquareIcon,
  TargetIcon,
  CalendarCheckIcon,
  SettingsIcon,
  PlusIcon,
} from 'lucide-react'

const pages = [
  { name: 'Dzis', href: '/dashboard', icon: LayoutDashboardIcon },
  { name: 'Klienci', href: '/clients', icon: UsersIcon },
  { name: 'Umowy', href: '/deals', icon: KanbanIcon },
  { name: 'Generator KP', href: '/kp-generator', icon: FileTextIcon },
  { name: 'Dostawcy', href: '/suppliers', icon: TruckIcon },
  { name: 'Produkty', href: '/products', icon: PackageIcon },
  { name: 'Kalkulator', href: '/calculator', icon: CalculatorIcon },
  { name: 'Zadania', href: '/tasks', icon: CheckSquareIcon },
  { name: 'Cele', href: '/goals', icon: TargetIcon },
  { name: 'Nawyki', href: '/habits', icon: CalendarCheckIcon },
  { name: 'Ustawienia', href: '/settings', icon: SettingsIcon },
]

const quickActions = [
  { name: 'Nowy klient', href: '/clients?action=new', icon: PlusIcon },
  { name: 'Nowa umowa', href: '/deals?action=new', icon: PlusIcon },
  { name: 'Nowe zadanie', href: '/tasks?action=new', icon: PlusIcon },
  { name: 'Nowy cel', href: '/goals?action=new', icon: PlusIcon },
]

export function CommandBar() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Szukaj strony lub akcji..." />
      <CommandList>
        <CommandEmpty>Nie znaleziono wynikow.</CommandEmpty>
        <CommandGroup heading="Szybkie akcje">
          {quickActions.map((action) => (
            <CommandItem
              key={action.href}
              onSelect={() => runCommand(() => router.push(action.href))}
            >
              <action.icon className="mr-2 size-4" />
              {action.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Nawigacja">
          {pages.map((page) => (
            <CommandItem
              key={page.href}
              onSelect={() => runCommand(() => router.push(page.href))}
            >
              <page.icon className="mr-2 size-4" />
              {page.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
