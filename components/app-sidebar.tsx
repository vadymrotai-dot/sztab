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
  SidebarHeader,
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
  CommandIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface NavLeaf {
  name: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  badgeCount?: number
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
    handoff?: number
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
  const topNav: NavEntry[] = [
    { name: 'Dziś', href: '/pulpit/dzisiaj', icon: LayoutDashboardIcon },
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
        { name: 'Pikniko handoff', href: '/handoff/pikniko' },
      ],
    },
    { name: 'Produkty', href: '/produkty', icon: PackageIcon, badgeCount: counts.products },
    { name: 'Dostawcy', href: '/suppliers', icon: TruckIcon },
    { name: 'Organizer', href: '/organizer', icon: CalendarIcon },
    {
      name: 'Ustawienia',
      href: '/settings',
      icon: SettingsIcon,
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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <CommandIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Sztab CRM</span>
                  <span className="truncate text-xs text-muted-foreground">Personal CRM</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
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
