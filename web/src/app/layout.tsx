import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FirebaseProvider } from "@/components/FirebaseProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "S-Link Admin",
  description: "S-Link operations console for administrators",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FirebaseProvider>{children}</FirebaseProvider>
      </body>
    </html>
  );
}
