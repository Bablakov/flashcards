import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NativeBridge } from "@/components/NativeBridge";

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

const themeBootstrap = `
(function(){
  try {
    var stored = localStorage.getItem('flashcards.theme');
    var t = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var c = document.documentElement.classList;
    c.remove('theme-light','dark');
    c.add(t === 'light' ? 'theme-light' : 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-bg-base text-text-primary">
        <ThemeProvider>
          <NativeBridge />
          <div className="mx-auto flex min-h-screen max-w-3xl flex-col">{children}</div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
