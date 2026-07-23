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
  LayersIcon,
  BanknoteIcon,
  ChevronUpIcon,
  SettingsIcon,
  LogOutIcon,
} from 'lucide-react'

interface NavLeaf {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
}

interface FbaSidebarProps {
  user: User
}

function matchesPath(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href !== '/fba/pulpit' && pathname.startsWith(href + '/')) return true
  return false
}

const NAV_ITEMS: NavLeaf[] = [
  { name: 'Pulpit', href: '/fba/pulpit', icon: HomeIcon },
  { name: 'Kampanie', href: '/fba/kampanie', icon: LayersIcon },
  { name: 'Leidy', href: '/fba/leidy', icon: UsersIcon },
  { name: 'Prowizje', href: '/fba/prowizje', icon: BanknoteIcon },
]

export function FbaSidebar({ user }: FbaSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const initials = (user.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2 py-3">
              <WorkspaceSwitcher current="fba" />
            </div>
            <div className="mb-2 px-3">
              <Badge className="w-full justify-center rounded-md bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold tracking-wide">
                FBA Leady
              </Badge>
            </div>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = matchesPath(pathname, item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild={!item.disabled}
                      isActive={active}
                      className={active ? 'bg-emerald-100 text-emerald-900' : ''}
                      disabled={item.disabled}
                    >
                      {item.disabled ? (
                        <span className="flex items-center gap-2 opacity-40 cursor-not-allowed">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </span>
                      ) : (
                        <Link href={item.href} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{user.email}</span>
                  <ChevronUpIcon className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Ustawienia
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOutIcon className="mr-2 h-4 w-4" />
                  Wyloguj
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
