"use client";

type Props = {
  items: Array<{ label: string; value: string | number; hint?: string }>;
};

export function StatsRow({ items }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            {item.label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-[var(--muted)]">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
