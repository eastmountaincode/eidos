"use client";

import {
  BookOpen,
  Menu,
  MessageCircle,
  MessagesSquare,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AgentSettings } from "./AgentSettings";

const sections = [
  { href: "/", label: "Chat", Icon: MessageCircle },
  { href: "/messages", label: "Messages", Icon: MessagesSquare },
  { href: "/sources", label: "Sources", Icon: BookOpen },
];

export function EidosShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wordmark = (
    <Link
      aria-label="Eidos"
      className="eidos-v2-wordmark text-[26px] leading-none tracking-[-0.035em] text-foreground"
      href="/"
      onClick={() => setMenuOpen(false)}
    >
      Eidos
    </Link>
  );
  const navigation = (
    <>
      <nav aria-label="Main navigation" className="grid gap-0.5 px-2">
        {sections.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className={`flex h-8 items-center gap-2.5 rounded-sm px-2 text-[13px] ${pathname === href ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
          >
            <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-2">
        <Button
          data-settings-trigger
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 rounded-sm px-2 text-[13px] font-normal text-muted-foreground"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          <Settings2 className="size-4" strokeWidth={1.5} />
          Settings
        </Button>
      </div>
    </>
  );
  return (
    <div className="eidos-v2 flex h-dvh min-h-[320px] overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[176px] shrink-0 flex-col border-r border-border bg-[#f6f6f6] md:flex">
        <div className="flex h-14 items-center px-4">{wordmark}</div>
        {navigation}
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="eidos-settings w-[224px] gap-0 bg-[#f6f6f6]"
          aria-describedby={undefined}
        >
          <SheetHeader className="h-14 justify-center">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {wordmark}
          </SheetHeader>
          {navigation}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-2 md:hidden">
          <Button
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            variant="ghost"
            size="icon-sm"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          {wordmark}
          <Button
            data-settings-trigger
            aria-label="Settings"
            className="ml-auto"
            variant="ghost"
            size="icon-sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
          </Button>
        </header>
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          className="eidos-settings w-full gap-0 sm:max-w-[480px]"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                "[data-settings-trigger]",
              ),
            )
              .find((button) => button.getClientRects().length)
              ?.focus();
          }}
        >
          <SheetHeader className="h-12 shrink-0 justify-center border-b border-border py-0">
            <SheetTitle className="text-sm">Settings</SheetTitle>
          </SheetHeader>
          {settingsOpen && <AgentSettings />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
