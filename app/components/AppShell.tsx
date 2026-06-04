"use client";

import { MessageSquareText, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Messages", Icon: MessageSquareText },
  { href: "/tools", label: "Tools & Skills", Icon: Wrench },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-bg text-ink md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-10 bg-sidebar px-3.5 py-4 text-white md:min-h-screen">
        <div className="border-b border-white/10 px-2.5 pb-4 pt-1">
          <h1
            className="block w-full whitespace-nowrap text-[40px] font-bold leading-[1.05]"
            style={{ fontFamily: "\"Vaxen Rounded\", \"VaxenRounded\", ui-sans-serif, system-ui, sans-serif" }}
          >
            Eidos
          </h1>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto md:grid">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.Icon;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold ${
                  isActive ? "bg-white/10" : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                <span className="grid size-5 place-items-center rounded border border-white/20 text-[11px] text-white/70">
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
