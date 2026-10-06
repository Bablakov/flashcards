import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NativeBridge } from "@/components/NativeBridge";
import { DesktopBridge } from "@/components/DesktopBridge";
import { UpdateBanner } from "@/components/UpdateBanner";
import { WebAppBridge } from "@/components/WebAppBridge";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Flashcards",
  description: "Редактор флешкарт с Git-синхронизацией",
  manifest: `${BASE}/manifest.json`,
  // «На экран Домой» на iPhone: своя иконка без прозрачных углов и запуск
  // без панелей Safari. Страница рисуется под часами — отступ даёт TopBar.
  icons: { apple: `${BASE}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Flashcards", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#171717",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  /* Экран занимает всю площадь, а нижняя панель сама отступает
     от жестовой полосы через env(safe-area-inset-bottom). */
  viewportFit: "cover",
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
          <DesktopBridge />
          <WebAppBridge />
          <UpdateBanner />
          {/* На телефоне колонка во всю ширину, на ПК — та же раскладка по центру,
              но на широком экране шире, чтобы списки шли в две колонки, а не
              оставляли половину монитора пустой. */}
          <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col lg:max-w-5xl">
            {children}
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
