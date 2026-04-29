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
}

export function AppSidebar({ user, prospectHotCount = 0 }: AppSidebarProps) {
  const navigation: NavItem[] = [
    { name: 'Dzis', href: '/dashboard', icon: LayoutDashboardIcon },
    { name: 'Klienci', href: '/clients', icon: UsersIcon },
    { name: 'Umowy', href: '/deals', icon: KanbanIcon },
    { name: 'Generator KP', href: '/kp-generator', icon: FileTextIcon },
    { name: 'Dostawcy', href: '/suppliers', icon: TruckIcon },
    { name: 'Produkty', href: '/products', icon: PackageIcon },
    { name: 'AI Discovery', href: '/intelligence', icon: SparklesIcon },
    { name: 'Intelligence Lookup', href: '/intelligence/lookup', icon: SearchIcon },
    {
      name: 'Prospekty',
      href: '/intelligence/prospects',
      icon: CrosshairIcon,
      badgeCount: prospectHotCount,
    },
    { name: 'Matche (TOP-100)', href: '/matches', icon: SparklesIcon },
    { name: 'Pre-Apify review', href: '/matches/review', icon: CheckSquareIcon },
    { name: 'Admin / Health', href: '/admin/health', icon: AlertCircleIcon },
    { name: 'Kalkulator', href: '/calculator', icon: CalculatorIcon },
    { name: 'Zadania', href: '/tasks', icon: CheckSquareIcon },
    { name: 'Cele', href: '/goals', icon: TargetIcon },
    { name: 'Nawyki', href: '/habits', icon: CalendarCheckIcon },
    { name: 'Ustawienia', href: '/settings', icon: SettingsIcon },
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
              {navigation.map((item) => {
                // Active matching: exact match OR pathname startsWith href.
                // Exception: /intelligence shouldn't capture /intelligence/prospects
                // (uses startsWith → both would match). Use exact-or-segment
                // boundary check instead.
                const isExact = pathname === item.href
                const isSubsegment =
                  item.href !== '/dashboard' &&
                  pathname.startsWith(item.href + '/')
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
              })}
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
