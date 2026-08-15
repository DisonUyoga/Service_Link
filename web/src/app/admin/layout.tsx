import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S-Link Admin Console",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
