'use client'

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
  SidebarMenuButton,
  SidebarMenuItem,
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
  KanbanIcon,
  FileTextIcon,
  PackageIcon,
  TruckIcon,
  CalculatorIcon,
  CheckSquareIcon,
  TargetIcon,
  CalendarCheckIcon,
  SettingsIcon,
  SparklesIcon,
  CrosshairIcon,
  AlertCircleIcon,
  SearchIcon,
  HandshakeIcon,
  BriefcaseIcon,
  CalendarIcon,
  LogOutIcon,
  ChevronUpIcon,
  CommandIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeCount?: number
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

function renderNav(items: NavItem[], pathname: string) {
  return items.map((item) => {
    const isExact = pathname === item.href
    const isSubsegment = pathname.startsWith(item.href + '/')
    const isActive = isExact || isSubsegment
    return (
      <SidebarMenuItem key={item.name}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
          <Link href={item.href}>
            <item.icon className="size-4" />
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
  })
}

export function AppSidebar({ user, prospectHotCount = 0, counts = {} }: AppSidebarProps) {
  // Sprint O Phase 1 — consolidated navigation: 5 main + Organizer + Ustawienia.
  // Sprint S2B Phase 1B — counter badges (Klienci 261, Sprzedaż 7, Produkty 35,
  // Handoff 29 у KOZAK pre-prod state).
  void prospectHotCount // surface badge moved into /clients tab у Phase 5
  const mainNav: NavItem[] = [
    { name: 'Dziś', href: '/pulpit/dzisiaj', icon: LayoutDashboardIcon },
    { name: 'Klienci', href: '/clients', icon: UsersIcon, badgeCount: counts.clients },
    { name: 'Sprzedaż', href: '/sprzedaz', icon: BriefcaseIcon, badgeCount: counts.deals },
    { name: 'Produkty', href: '/products', icon: PackageIcon, badgeCount: counts.products },
    { name: 'Dostawcy', href: '/suppliers', icon: TruckIcon },
  ]
  const utilNav: NavItem[] = [
    { name: 'Organizer', href: '/organizer', icon: CalendarIcon },
    { name: 'Ustawienia', href: '/settings', icon: SettingsIcon },
  ]
  const navigation: NavItem[] = [...mainNav, ...utilNav]
  // Suppress "unused import" TS warnings — icons retained для backward compat
  // routes (matches/intelligence/handoff still accessible via URL).
  void [
    KanbanIcon,
    FileTextIcon,
    SparklesIcon,
    CrosshairIcon,
    AlertCircleIcon,
    SearchIcon,
    HandshakeIcon,
    CheckSquareIcon,
    TargetIcon,
    CalendarCheckIcon,
    CalculatorIcon,
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
            <SidebarMenu>
              {renderNav(mainNav, pathname)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNav(utilNav, pathname)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
