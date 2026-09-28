"use client";

import { Menu, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// New sections can join this navigation as their pages are built.
const sections = [{ href: "/", label: "Chat", Icon: MessageCircle }];

export function EidosShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigation = (
    <>
      <div className="flex h-20 items-center justify-between px-6">
        <Link className="eidos-v2-wordmark text-[32px] leading-none tracking-[-0.035em] text-[#19382e]" href="/" onClick={() => setMenuOpen(false)}>
          Eidos
        </Link>
        <button
          aria-label="Close navigation"
          className="grid size-9 place-items-center rounded-xl text-[#69746d] hover:bg-white/70 md:hidden"
          onClick={() => setMenuOpen(false)}
          type="button"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="px-3 pt-5">
        <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#596b5e]">Workspace</p>
        <div className="grid gap-1">
          {sections.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${active ? "bg-white text-[#19382e] shadow-[0_1px_5px_rgba(34,47,38,0.05)]" : "text-[#637069] hover:bg-white/55 hover:text-[#19382e]"}`}
                href={href}
                key={href}
                onClick={() => setMenuOpen(false)}
              >
                <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );

  return (
    <div className="eidos-v2 flex h-dvh min-h-[480px] overflow-hidden bg-[#faf9f6] text-[#193129]">
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-[#e6e5de] bg-[#f1f0eb] md:flex">{navigation}</aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-[#10241d]/30" onClick={() => setMenuOpen(false)} type="button" />
          <aside className="relative flex h-full w-[min(82vw,290px)] flex-col bg-[#f1f0eb] shadow-2xl">{navigation}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e9e7df] bg-[#faf9f6] px-4 md:hidden">
          <button
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            className="grid size-9 place-items-center rounded-xl text-[#19382e] hover:bg-[#efeee8]"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            <Menu className="size-5" />
          </button>
          <Link className="eidos-v2-wordmark text-[26px] leading-none tracking-[-0.035em] text-[#19382e]" href="/">
            Eidos
          </Link>
        </header>
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
