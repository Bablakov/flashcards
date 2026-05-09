import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "Flashcards",
  description: "Редактор флешкарт с Git-синхронизацией",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-bg text-neutral-100">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
