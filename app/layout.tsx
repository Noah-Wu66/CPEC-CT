import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_SC } from "next/font/google";
import { AppThemeProvider } from "@/components/layout/app-theme-provider";
import "./globals.css";

const scrollbarScript = `
  (function(){
    var m=new WeakMap();
    document.addEventListener('scroll',function(e){
      var t=e.target;
      if(t===document||t===document.documentElement)t=document.documentElement;
      if(!t||!t.setAttribute)return;
      t.setAttribute('data-scrolling','');
      var p=m.get(t);
      if(p)clearTimeout(p);
      m.set(t,setTimeout(function(){
        t.removeAttribute('data-scrolling');
        m.delete(t);
      },800));
    },{capture:true,passive:true});
  })();
`;

const themeInitScript = `
  (() => {
    const savedThemeMode = localStorage.getItem('studio-theme-mode');
    const themeMode = ['light', 'dark', 'system'].includes(savedThemeMode) ? savedThemeMode : 'system';
    const resolvedTheme = themeMode === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : themeMode;
    document.documentElement.dataset.oaTheme = resolvedTheme;
    document.documentElement.dataset.oaThemeMode = themeMode;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.classList.toggle('dark-mode', resolvedTheme === 'dark');
  })();
`;

const bodyFont = Noto_Sans_SC({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "智创 AI 工作台",
  description: "AI 对话、音频工具与数据采集，AI 赋能数字融媒体创制"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: scrollbarScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={bodyFont.variable}>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
