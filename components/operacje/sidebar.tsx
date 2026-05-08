'use client'

// components/operacje/sidebar.tsx
// Phase 1 Krok 1/5 — sidebar для (operacje) workspace.
// Mirror visual style of components/app-sidebar.tsx (dashboard) для smooth
// workspace switch у Krok 3, але slimmer scope (6 placeholder nav entries,
// no nested groups, no count badges за замовчуванням).
//
// Differentiator: amber "Operacje" badge у sidebar header — мінімальна
// visual cue для workspace identity, без overhead workspace switcher logic.

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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  HomeIcon,
  PackageIcon,
  UsersIcon,
  FileTextIcon,
  TruckIcon,
  CalendarIcon,
  ChevronUpIcon,
  SettingsIcon,
  LogOutIcon,
} from 'lucide-react'

// ─── Local nav types (intentionally NOT shared з app-sidebar.tsx) ──

interface NavLeaf {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeCount?: number
}

interface OperacjeSidebarProps {
  user: User
  /** Future-proof Phase 2 counts (zamówienia pending, faktury unpaid etc.).
   *  Phase 1 = empty default. */
  counts?: {
    zamowienia?: number
    faktury?: number
    wysylki?: number
    kalendarz?: number
  }
}

// ─── Path matcher (mirror app-sidebar logic) ───────────────────────

function matchesPath(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/') return false
  return pathname.startsWith(href + '/')
}

// ─── Nav row ───────────────────────────────────────────────────────

function NavItemRow({
  item,
  pathname,
}: {
  item: NavLeaf
  pathname: string
}) {
  const isActive = matchesPath(pathname, item.href)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
        <Link href={item.href}>
          <item.icon className="size-4" />
          <span>{item.name}</span>
          {item.badgeCount !== undefined && item.badgeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto h-5 min-w-[20px] justify-center bg-amber-100 px-1.5 text-[10px] text-amber-800"
            >
              {item.badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ─── OperacjeSidebar ───────────────────────────────────────────────

export function OperacjeSidebar({ user, counts = {} }: OperacjeSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const userInitials = user.email?.slice(0, 2).toUpperCase() || 'U'

  // 6 placeholder entries (Phase 1). Counts wired у Phase 2 коли є real
  // tables (zamowienia/faktury/wysylki).
  const topNav: NavLeaf[] = [
    { name: 'Pulpit', href: '/operacje/pulpit', icon: HomeIcon },
    {
      name: 'Zamówienia',
      href: '/operacje/zamowienia',
      icon: PackageIcon,
      badgeCount: counts.zamowienia,
    },
    { name: 'Klienci', href: '/operacje/klienci', icon: UsersIcon },
    {
      name: 'Faktury',
      href: '/operacje/faktury',
      icon: FileTextIcon,
      badgeCount: counts.faktury,
    },
    {
      name: 'Wysyłki',
      href: '/operacje/wysylki',
      icon: TruckIcon,
      badgeCount: counts.wysylki,
    },
    { name: 'Kalendarz', href: '/operacje/kalendarz', icon: CalendarIcon },
  ]

  return (
    <Sidebar collapsible="icon">
      <WorkspaceSwitcher
        current="operacje"
        userEmail={user.email ?? undefined}
      />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topNav.map((item) => (
                <NavItemRow key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
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
                  Wyloguj się
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
