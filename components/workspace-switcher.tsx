'use client'

// components/workspace-switcher.tsx
// Phase 1 Krok 3/5 — clickable workspace switcher для sidebar header.
// Replaces static SidebarHeader блок у operacje + intelligence sidebars.
//
// Behavior:
//   - Trigger: SidebarMenuButton size="lg" з theme-driven icon container,
//     "Sztab" + workspace badge, tagline, ChevronsUpDownIcon на ml-auto
//   - DropdownMenuContent: 2 items (Operacje first, Intelligence second)
//   - Per item: mini icon (size-6) + label badge + tagline + CheckIcon
//     якщо item.id === current
//   - onClick: await setWorkspace(target) → router.push(href)
//
// Self-wraps <SidebarHeader> — caller замінює existing header block 1:1.
//
// Pattern reference: shadcn sidebar-07 team-switcher example, спрощений
// до 2 stałe options (no add-team flow).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import {
  ClipboardListIcon,
  BrainIcon,
  ChevronsUpDownIcon,
  CheckIcon,
} from 'lucide-react'

import { setWorkspace, type WorkspaceId } from '@/lib/workspace/switch'

// ─── Theme map ──────────────────────────────────────────────────

interface WorkspaceMeta {
  iconBg: string
  iconText: string
  Icon: React.ComponentType<{ className?: string }>
  badge: string
  badgeBg: string
  tagline: string
  href: string
}

const WORKSPACE_META: Record<WorkspaceId, WorkspaceMeta> = {
  operacje: {
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    Icon: ClipboardListIcon,
    badge: 'Operacje',
    badgeBg: 'bg-amber-500',
    tagline: 'Codzienna operacyjka',
    href: '/operacje/pulpit',
  },
  intelligence: {
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-700',
    Icon: BrainIcon,
    badge: 'Intelligence',
    badgeBg: 'bg-indigo-500',
    tagline: 'Analiza i dopasowania',
    href: '/intelligence/pulpit',
  },
}

const WORKSPACE_ORDER: WorkspaceId[] = ['operacje', 'intelligence']

// ─── Props ──────────────────────────────────────────────────────

interface Props {
  current: WorkspaceId
  /** Reserved для future (multi-user workspace permissions). NIE used у Krok 3. */
  userEmail?: string
}

// ─── Component ──────────────────────────────────────────────────

export function WorkspaceSwitcher({ current, userEmail }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  // userEmail — pass-through future-proofing, not used in Krok 3 UI.
  void userEmail

  const currentMeta = WORKSPACE_META[current]
  const CurrentIcon = currentMeta.Icon

  function handleSelect(target: WorkspaceId) {
    if (target === current) {
      setOpen(false)
      return
    }
    setOpen(false)
    startTransition(async () => {
      await setWorkspace(target)
      router.push(WORKSPACE_META[target].href)
    })
  }

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                disabled={isPending}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div
                  className={`flex aspect-square size-8 items-center justify-center rounded-lg ${currentMeta.iconBg} ${currentMeta.iconText}`}
                >
                  <CurrentIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    Sztab
                    <Badge
                      className={`h-4 ${currentMeta.badgeBg} px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider text-white hover:${currentMeta.badgeBg}`}
                    >
                      {currentMeta.badge}
                    </Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {currentMeta.tagline}
                  </span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={4}
              className="min-w-56 rounded-lg"
            >
              {WORKSPACE_ORDER.map((id) => {
                const meta = WORKSPACE_META[id]
                const ItemIcon = meta.Icon
                const isCurrent = id === current
                return (
                  <DropdownMenuItem
                    key={id}
                    onSelect={() => handleSelect(id)}
                    className="gap-2.5 py-2"
                  >
                    <div
                      className={`flex aspect-square size-6 items-center justify-center rounded-md ${meta.iconBg} ${meta.iconText}`}
                    >
                      <ItemIcon className="size-3.5" />
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">
                        {meta.badge}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {meta.tagline}
                      </span>
                    </div>
                    {isCurrent && (
                      <CheckIcon className="ml-auto size-4 text-foreground" />
                    )}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}
