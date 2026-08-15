"use client";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm">
      <span className="text-[var(--muted)]">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Previous
        </button>
        <span className="text-xs text-[var(--muted)]">
          Page {page} of {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
        </button>
      </div>
    </div>
  );
}
