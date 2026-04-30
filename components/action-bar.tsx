'use client'

// components/action-bar.tsx
// Sprint S4 Phase 1A — generic action bar для primary/secondary/menu actions.
// Used у /clients/[id], /deals/[id], etc. Single primary indigo button +
// row of secondary outline buttons + ⋯ overflow dropdown.

import * as React from 'react'
import { MoreHorizontalIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ActionItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void | Promise<void>
  href?: string
  disabled?: boolean
  loading?: boolean
  /** Visual treatment. 'primary' = filled indigo. 'secondary' = outline. */
  variant?: 'primary' | 'secondary'
  title?: string
}

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void | Promise<void>
  href?: string
  disabled?: boolean
  /** 'destructive' = red text dla destructive actions like Usuń. */
  variant?: 'default' | 'destructive'
  /** When true, render a separator BEFORE this item. */
  separatorBefore?: boolean
}

interface Props {
  primary?: ActionItem
  actions?: ActionItem[]
  menu?: MenuItem[]
  className?: string
}

function renderActionButton(item: ActionItem, isPrimary: boolean) {
  const inner = (
    <>
      {item.loading ? (
        <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
      ) : item.icon ? (
        <span className="mr-1.5 inline-flex items-center">{item.icon}</span>
      ) : null}
      {item.label}
    </>
  )
  const variantProp: 'default' | 'outline' = isPrimary ? 'default' : 'outline'

  if (item.href) {
    return (
      <Button
        size="sm"
        variant={variantProp}
        disabled={item.disabled || item.loading}
        title={item.title}
        asChild
      >
        <a href={item.href}>{inner}</a>
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant={variantProp}
      disabled={item.disabled || item.loading}
      title={item.title}
      onClick={item.onClick}
    >
      {inner}
    </Button>
  )
}

export function ActionBar({ primary, actions = [], menu = [], className = '' }: Props) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {primary && renderActionButton(primary, true)}
      {actions.map((action, idx) => (
        <React.Fragment key={`${action.label}-${idx}`}>
          {renderActionButton(action, false)}
        </React.Fragment>
      ))}
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label="Więcej akcji">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {menu.map((item, idx) => (
              <React.Fragment key={`${item.label}-${idx}`}>
                {item.separatorBefore && <DropdownMenuSeparator />}
                {item.href && !item.disabled ? (
                  <DropdownMenuItem
                    asChild
                    variant={item.variant === 'destructive' ? 'destructive' : 'default'}
                  >
                    <a href={item.href}>
                      {item.icon && <span className="mr-1">{item.icon}</span>}
                      {item.label}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={item.disabled}
                    variant={item.variant === 'destructive' ? 'destructive' : 'default'}
                    onClick={item.onClick}
                  >
                    {item.icon && <span className="mr-1">{item.icon}</span>}
                    {item.label}
                  </DropdownMenuItem>
                )}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
