"use client";

import { ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { chatModels, chatSettingsLabel, type ChatSettings } from '../../../shared/chat-settings.mjs';

export function ChatModelPicker({ settings, disabled, onChange }: {
  settings: ChatSettings;
  disabled: boolean;
  onChange: (settings: ChatSettings) => void;
}) {
  const selected = chatModels.find((model) => model.id === settings.model);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="sm" disabled={disabled}
        aria-label={`Model and speed: ${chatSettingsLabel(settings)}`}
        className="h-8 gap-1 px-2 text-[12px] font-normal text-muted-foreground">
        {selected?.shortLabel || 'Model'}
        {settings.speed === 'fast' ? <Zap aria-hidden="true" className="size-3" /> : null}
        <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent aria-label="Model and speed" align="start" side="top" collisionPadding={12} className="w-56">
      <DropdownMenuLabel className="px-3 py-1.5 text-[11px] text-muted-foreground">Model</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label="Model" value={settings.model} onValueChange={(model) => onChange({ ...settings, model })}>
        {chatModels.map((model) => <DropdownMenuRadioItem key={model.id} value={model.id} onSelect={(event) => event.preventDefault()}>{model.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator className="my-1 h-px bg-border" />
      <DropdownMenuLabel className="px-3 py-1.5 text-[11px] text-muted-foreground">Speed</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label="Speed" value={settings.speed} onValueChange={(speed) => onChange({ ...settings, speed: speed as ChatSettings['speed'] })}>
        <DropdownMenuRadioItem value="standard" onSelect={(event) => event.preventDefault()}>Standard</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="fast" onSelect={(event) => event.preventDefault()}>
          Fast <span className="ml-auto text-[11px] text-muted-foreground">More usage</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
