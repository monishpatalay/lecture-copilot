import Link from "next/link";

export type Pill = { key: string; text: string; href: string; active: boolean };

/** A row of links for choosing a course or a lecture; the choice lives in the URL. */
export function Pills({ label, items }: { label: string; items: Pill[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.active ? "true" : undefined}
              className={`block rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                item.active ? "bg-ink text-white" : "bg-card text-ink hover:bg-lavender"
              }`}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
