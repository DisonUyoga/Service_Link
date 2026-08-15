"use client";

type Props = {
  active: boolean;
  label?: string;
};

/** Full-console busy overlay so admin actions never look frozen. */
export function AdminBusyOverlay({ active, label = "Working…" }: Props) {
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[220px] max-w-sm items-center gap-3 rounded-2xl border border-white/70 bg-white px-5 py-4 shadow-2xl">
        <span
          className="h-9 w-9 shrink-0 animate-spin rounded-full border-[3px] border-slate-200 border-t-[var(--brand)]"
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-[var(--muted)]">Please wait a moment</p>
        </div>
      </div>
    </div>
  );
}
