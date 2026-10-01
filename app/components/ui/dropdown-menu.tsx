"use client";

import * as React from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DropdownMenu = Primitive.Root;
const DropdownMenuTrigger = Primitive.Trigger;
const DropdownMenuRadioGroup = Primitive.RadioGroup;
const DropdownMenuLabel = Primitive.Label;
const DropdownMenuSeparator = Primitive.Separator;

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content sideOffset={sideOffset}
    className={cn('eidos-settings z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-32 overflow-y-auto rounded-md border border-border bg-background p-1 text-foreground shadow-md outline-none', className)} {...props} /></Primitive.Portal>;
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Primitive.RadioItem>) {
  return <Primitive.RadioItem className={cn('relative flex cursor-default select-none items-center rounded-sm py-2 pr-3 pl-8 text-[13px] outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center"><Primitive.ItemIndicator><Check className="size-3.5" /></Primitive.ItemIndicator></span>
    {children}
  </Primitive.RadioItem>;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator };
