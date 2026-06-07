"use client";

import { MessageSquareText, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Messages", mobileLabel: "Messages", Icon: MessageSquareText },
  { href: "/mantra", label: "Mantra", mobileLabel: "Mantra", Icon: Sparkles },
  { href: "/tools", label: "Tools & Skills", mobileLabel: "Tools", Icon: Wrench },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-bg text-ink md:grid md:h-screen md:grid-cols-[236px_minmax(0,1fr)] md:overflow-hidden">
      <aside className="sticky top-0 z-10 bg-sidebar px-4 py-3 text-white md:h-screen md:overflow-y-auto md:px-3.5 md:py-4">
        <div className="border-b border-white/10 px-1 pb-3 pt-1 md:px-2.5 md:pb-4">
          <h1
            className="block w-full whitespace-nowrap text-[34px] font-bold leading-[1.05] md:text-[40px]"
            style={{ fontFamily: "\"Vaxen Rounded\", \"VaxenRounded\", ui-sans-serif, system-ui, sans-serif" }}
          >
            Eidos
          </h1>
        </div>
        <nav className="mt-3 grid grid-cols-3 gap-2 md:mt-5 md:grid-cols-1 md:gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.Icon;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-left text-[13px] font-semibold md:w-full md:justify-start md:gap-2 md:px-2.5 md:text-sm ${
                  isActive ? "bg-white/10" : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                <span className="grid size-5 place-items-center rounded border border-white/20 text-[11px] text-white/70">
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>
                <span className="truncate md:hidden">{item.mobileLabel}</span>
                <span className="hidden truncate md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 p-3.5 md:h-screen md:overflow-y-auto md:p-6">{children}</main>
    </div>
  );
}
