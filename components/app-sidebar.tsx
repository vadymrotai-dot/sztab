'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
// Phase 2 Krok 1.E (09.05.2026) — replace static SidebarHeader з shared
// WorkspaceSwitcher (3-ий workspace 'sztab' added). Bridge до /operacje +
// /intelligence через ту саму DropdownMenu.
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboardIcon,
  UsersIcon,
  PackageIcon,
  TruckIcon,
  CalendarIcon,
  SettingsIcon,
  BriefcaseIcon,
  LogOutIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  SearchIcon,
  TagIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface NavLeaf {
  name: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  badgeCount?: number
  /** Sprint S-CLEAN (13.05.2026) — disabled state з tooltip "Wkrótce
   *  dostępne". Item renders as non-clickable button без <Link> wrapper.
   *  Use для routes які ще не shipped OR temporarily hidden з primary nav. */
  disabled?: boolean
}

interface NavGroup {
  /** Top-level label, also clickable navigation target. */
  name: string
  /** Default route коли клікнеш na title text. */
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeCount?: number
  /** Sub-items shown гdy group expanded. */
  items: NavLeaf[]
  /** Sprint S-CLEAN — disable PARENT button only; sub-items remain active. */
  disabled?: boolean
}

type NavEntry = NavLeaf | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry && Array.isArray((entry as NavGroup).items)
}

interface AppSidebarProps {
  user: User
  prospectHotCount?: number
  /** Sprint S2B Phase 1B — counter badges на sidebar nav. */
  counts?: {
    clients?: number
    deals?: number
    products?: number
  }
}

/** True gdy current pathname matches an item exactly або як parent. */
function matchesPath(pathname: string, href: string): boolean {
  if (pathname === href) return true
  // Special case '/' — never treat як prefix.
  if (href === '/') return false
  return pathname.startsWith(href + '/')
}

function NavItemRow({ item, pathname }: { item: NavLeaf; pathname: string }) {
  const isActive = matchesPath(pathname, item.href)
  // Sprint S-CLEAN (13.05.2026) — disabled state: render bez <Link>, tooltip
  // "Wkrótce dostępne". `disabled` HTML attr + aria-disabled блокують click.
  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled aria-disabled tooltip="Wkrótce dostępne">
          {item.icon && <item.icon className="size-4" />}
          <span>{item.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
        <Link href={item.href}>
          {item.icon && <item.icon className="size-4" />}
          <span>{item.name}</span>
          {item.badgeCount !== undefined && item.badgeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto h-5 min-w-[20px] justify-center bg-emerald-100 px-1.5 text-[10px] text-emerald-800"
            >
              {item.badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function NavGroupRow({ group, pathname }: { group: NavGroup; pathname: string }) {
  // Group is "active" коли pathname matches title route OR any sub-item.
  const titleActive = matchesPath(pathname, group.href)
  const childActive = group.items.some((it) => matchesPath(pathname, it.href))
  const isActive = titleActive || childActive

  // Auto-expand коли pathname matches dowolny entry в grupi.
  // Toggling ручny через chevron overrides this until route changes.
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) setOpen(true)
    // Don't auto-collapse коли user manually opened — only auto-open
    // gdy route enters group.
  }, [isActive])

  function toggle() {
    setOpen((v) => !v)
  }

  return (
    <>
      <SidebarMenuItem>
        {/* Sprint S-CLEAN — disabled parent: button без <Link>, tooltip
            "Wkrótce dostępne". Sub-items remain active (chevron still
            visible). */}
        {group.disabled ? (
          <SidebarMenuButton disabled aria-disabled tooltip="Wkrótce dostępne">
            <group.icon className="size-4" />
            <span>{group.name}</span>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton asChild isActive={isActive} tooltip={group.name}>
            <Link href={group.href}>
              <group.icon className="size-4" />
              <span>{group.name}</span>
              {group.badgeCount !== undefined && group.badgeCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-auto mr-6 h-5 min-w-[20px] justify-center bg-emerald-100 px-1.5 text-[10px] text-emerald-800"
                >
                  {group.badgeCount}
                </Badge>
              )}
            </Link>
          </SidebarMenuButton>
        )}
        {/* Chevron jest SIBLINGiem SidebarMenuButton (не child Link!) —
            avoids nested-interactive HTML и blocks click bubbling до Link. */}
        <SidebarMenuAction
          onClick={toggle}
          aria-label={open ? `Zwiń ${group.name}` : `Rozwiń ${group.name}`}
          className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
        >
          <ChevronRightIcon className="size-3.5" />
        </SidebarMenuAction>
      </SidebarMenuItem>
      {open && (
        <SidebarMenuSub>
          {group.items.map((sub) => {
            const subActive = matchesPath(pathname, sub.href)
            return (
              <SidebarMenuSubItem key={sub.href}>
                <SidebarMenuSubButton asChild isActive={subActive}>
                  <Link href={sub.href}>
                    <span>{sub.name}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </SidebarMenuSub>
      )}
    </>
  )
}

function renderEntries(entries: NavEntry[], pathname: string) {
  return entries.map((entry) =>
    isGroup(entry) ? (
      <NavGroupRow key={entry.href} group={entry} pathname={pathname} />
    ) : (
      <NavItemRow key={entry.href} item={entry} pathname={pathname} />
    ),
  )
}

export function AppSidebar({ user, prospectHotCount = 0, counts = {} }: AppSidebarProps) {
  // Sprint S5A — nested sidebar. 7 top-level (4 simple + 3 collapsible),
  // sub-items hidden until group expanded. Auto-expand коли current route
  // matches dowolny sub-item.
  void prospectHotCount

  // Top-level entries — order matches Vadym spec.
  // Sprint S-CLEAN (13.05.2026) — disabled items mark routes hidden з primary
  // nav: LIVE pages still accessible via direct URL, footer dropdown, або
  // sub-items, але користувач НЕ кліка primary nav button. Pre-CzM cleanup.
  const topNav: NavEntry[] = [
    { name: 'Dziś', href: '/pulpit/dzisiaj', icon: LayoutDashboardIcon },
    {
      name: 'Szukanie firm',
      href: '/pulpit/szukaj',
      icon: SearchIcon,
      disabled: true, // S-CLEAN — route LIVE але hidden з primary workflow
    },
    {
      name: 'Klienci',
      href: '/clients',
      icon: UsersIcon,
      badgeCount: counts.clients,
      items: [
        { name: 'Wszyscy klienci', href: '/clients' },
        { name: 'Prospekti', href: '/intelligence/prospects' },
        { name: 'Lookup NIP', href: '/intelligence/lookup' },
        { name: 'AI Discovery', href: '/intelligence' },
      ],
    },
    {
      name: 'Sprzedaż',
      href: '/sprzedaz',
      icon: BriefcaseIcon,
      badgeCount: counts.deals,
      items: [
        { name: 'Pipeline', href: '/sprzedaz' },
        { name: 'Dopasowania', href: '/matches' },
        // Sprint S-CLEAN ETAP 2 (13.05.2026) — removed "Pikniko handoff"
        // sub-item. Route /handoff/pikniko видалено, table унифіковано
        // у /intelligence/cohorts.
      ],
    },
    { name: 'Produkty', href: '/produkty', icon: PackageIcon, badgeCount: counts.products },
    {
      // Faza 1 DAGOLD — dom całej administracji cenami. Sam "/ceny" nie ma
      // strony, więc klik w parent prowadzi do /ceny/segmenty; chevron rozwija
      // trzy sub-itemy (Marże / Segmenty / Klienci → segmenty).
      name: 'Ceny',
      href: '/ceny/segmenty',
      icon: TagIcon,
      items: [
        { name: 'Marże produktów', href: '/produkty/marze' },
        { name: 'Segmenty', href: '/ceny/segmenty' },
        { name: 'Klienci → segmenty', href: '/ceny/klienci' },
      ],
    },
    {
      name: 'Dostawcy',
      href: '/suppliers',
      icon: TruckIcon,
      disabled: true, // S-CLEAN — CRUD page LIVE але hidden з primary nav
    },
    { name: 'Organizer', href: '/organizer', icon: CalendarIcon },
    {
      name: 'Ustawienia',
      href: '/settings',
      icon: SettingsIcon,
      disabled: true, // S-CLEAN — parent button disabled; sub-items active
      items: [
        { name: 'Konfiguracja', href: '/settings' },
        { name: 'Admin Health', href: '/admin/health' },
      ],
    },
  ]

  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const userInitials = user.email?.slice(0, 2).toUpperCase() || 'U'

  return (
    <Sidebar collapsible="icon">
      {/* Phase 2 Krok 1.E (09.05.2026) — static SidebarHeader replaced з
          WorkspaceSwitcher; current="sztab" pins цей workspace. Self-wraps
          <SidebarHeader> internally. */}
      <WorkspaceSwitcher current="sztab" userEmail={user.email ?? undefined} />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderEntries(topNav, pathname)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                  <ChevronUpIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon className="mr-2 size-4" />
                    Ustawienia
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOutIcon className="mr-2 size-4" />
                  Wyloguj sie
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export function SidebarToggle() {
  return <SidebarTrigger className="-ml-1" />
}
