'use client'

// components/intelligence/sidebar.tsx
// Phase 1 Krok 2/5 — sidebar для (intelligence) workspace.
// Mirror visual style of components/operacje/sidebar.tsx для smooth
// workspace switch у Krok 3, але indigo theme замість amber.
//
// Differentiator: indigo "Intelligence" badge + BrainIcon у header.
// Active state: bg-indigo-100 / text-indigo-900 (vs operacje amber).
//
// Sidebar entries (per Vadym Krok 2 override):
//   - Pulpit + Discovery + Dopasowania + Analizy = NEW slugs (placeholder)
//   - Prospekti + Lookup NIP = existing EN slugs (Krok 4 буде move pages
//     до app/intelligence/* без rename URL).

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
  UsersIcon,
  SearchIcon,
  CompassIcon,
  Link2Icon,
  ListChecksIcon,
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

interface IntelligenceSidebarProps {
  user: User
  /** Future-proof Phase 2 counts (hot prospects, pending analyses).
   *  Phase 1 = empty default. */
  counts?: {
    prospects?: number
    analyses?: number
    matches?: number
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
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.name}
        className={
          isActive
            ? 'bg-indigo-100 text-indigo-900 data-[active=true]:bg-indigo-100 data-[active=true]:text-indigo-900 hover:bg-indigo-100 hover:text-indigo-900'
            : undefined
        }
      >
        <Link href={item.href}>
          <item.icon className="size-4" />
          <span>{item.name}</span>
          {item.badgeCount !== undefined && item.badgeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto h-5 min-w-[20px] justify-center bg-indigo-100 px-1.5 text-[10px] text-indigo-800"
            >
              {item.badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ─── IntelligenceSidebar ───────────────────────────────────────────

export function IntelligenceSidebar({
  user,
  counts = {},
}: IntelligenceSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const userInitials = user.email?.slice(0, 2).toUpperCase() || 'U'

  // 6 entries per Vadym Krok 2 override:
  //   2 з PL labels + EN slugs (existing routes — Krok 4 буде move pages
  //   до app/intelligence/* без URL rename).
  //   4 з PL slugs (placeholder, 404 до Krok 4).
  const topNav: NavLeaf[] = [
    { name: 'Pulpit', href: '/intelligence/pulpit', icon: HomeIcon },
    {
      name: 'Prospekti',
      href: '/intelligence/prospects', // EN slug (existing route)
      icon: UsersIcon,
      badgeCount: counts.prospects,
    },
    {
      name: 'Lookup NIP',
      href: '/intelligence/lookup', // EN slug (existing route)
      icon: SearchIcon,
    },
    {
      name: 'Discovery',
      href: '/intelligence/discovery', // placeholder
      icon: CompassIcon,
    },
    {
      name: 'Dopasowania',
      href: '/intelligence/dopasowania', // placeholder
      icon: Link2Icon,
      badgeCount: counts.matches,
    },
    {
      name: 'Analizy',
      href: '/intelligence/analizy', // placeholder
      icon: ListChecksIcon,
      badgeCount: counts.analyses,
    },
  ]

  return (
    <Sidebar collapsible="icon">
      <WorkspaceSwitcher
        current="intelligence"
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
