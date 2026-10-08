"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Lectures", href: "/", prefixes: ["/courses", "/lectures"], professorsOnly: false },
  { label: "Ask", href: "/ask", prefixes: ["/ask"], professorsOnly: false },
  { label: "Exam prep", href: "/exam-prep", prefixes: ["/exam-prep"], professorsOnly: false },
  { label: "Insights", href: "/insights", prefixes: ["/insights"], professorsOnly: true },
  { label: "Help", href: "/help", prefixes: ["/help"], professorsOnly: false },
];

export function NavLinks({ isProfessor }: { isProfessor: boolean }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 lg:flex-col">
      {NAV.filter((item) => isProfessor || !item.professorsOnly).map(({ label, href, prefixes }) => {
        const active = pathname === href || prefixes.some((prefix) => pathname.startsWith(prefix));
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/15 ${
                active ? "bg-white/10" : "text-white/60"
              }`}
            >
              <span aria-hidden className={`size-2 rounded-full ${active ? "bg-lime" : "bg-white/25"}`} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
