"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  required?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptModal({
  open,
  title,
  description,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  placeholder = "",
  required = false,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
        <textarea
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="mt-4 min-h-24 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => {
              setValue("");
              onCancel();
            }}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              if (required && !value.trim()) return;
              onConfirm(value);
              setValue("");
            }}
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
