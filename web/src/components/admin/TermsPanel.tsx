"use client";

import { useState } from "react";
import { formatHumanLabel } from "@/lib/format";

export type TermsVersion = {
  id: number;
  version: string;
  title: string;
  body: string;
  audience: "all" | "customer" | "provider";
  published_at: string;
  is_current: boolean;
};

type Props = {
  terms: TermsVersion[];
  loading: boolean;
  onCreate: (data: {
    version: string;
    title: string;
    body: string;
    audience: "all" | "customer" | "provider";
    publish: boolean;
  }) => Promise<void>;
  onPublish: (id: number) => Promise<void>;
};

export function TermsPanel({ terms, loading, onCreate, onPublish }: Props) {
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("S-Link Terms of Service");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "customer" | "provider">("all");
  const [publish, setPublish] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-900">Terms & conditions</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Publish a version to make it available in mobile registration. Existing accepted versions remain auditable.
          </p>
        </div>
        <form
          className="mt-5 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate({ version, title, body, audience, publish }).then(() => {
              setVersion("");
              setBody("");
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Version</span>
              <input
                required
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="2026-09-v1"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Audience</span>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value as typeof audience)}
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
              >
                <option value="all">All users</option>
                <option value="customer">Clients only</option>
                <option value="provider">Providers only</option>
              </select>
            </label>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Terms text</span>
            <textarea
              required
              minLength={30}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the terms and conditions shown before account creation…"
              className="min-h-48 w-full rounded-xl border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
            />
            Make this the current version immediately
          </label>
          <button
            disabled={loading}
            className="w-fit rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save terms version
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="font-medium">Version history</h3>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {terms.map((item) => (
            <li key={item.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    {item.is_current ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Current
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {formatHumanLabel(item.audience)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.version} · {new Date(item.published_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    className="text-sm text-[var(--brand-dark)] hover:underline"
                  >
                    {expanded === item.id ? "Hide" : "View"}
                  </button>
                  {!item.is_current ? (
                    <button
                      disabled={loading}
                      onClick={() => void onPublish(item.id)}
                      className="text-sm text-[var(--success)] hover:underline disabled:opacity-50"
                    >
                      Publish
                    </button>
                  ) : null}
                </div>
              </div>
              {expanded === item.id ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  {item.body}
                </pre>
              ) : null}
            </li>
          ))}
          {terms.length === 0 ? (
            <li className="px-4 py-6 text-sm text-[var(--muted)]">No terms versions found.</li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
