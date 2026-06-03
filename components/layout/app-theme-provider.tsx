"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const THEME_STORAGE_KEY = "studio-theme-mode";
const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
type ResolvedTheme = "light" | "dark";

interface AppThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (themeMode: ThemeMode) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const themeMode = document.documentElement.dataset.oaThemeMode;
  return THEME_MODES.includes(themeMode as ThemeMode) ? (themeMode as ThemeMode) : "system";
}

function getInitialResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.oaTheme === "dark" ? "dark" : "light";
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("AppThemeProvider 未挂载");
  }
  return context;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getInitialThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getInitialResolvedTheme);

  useEffect(() => {
    const savedThemeMode = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_MODES.includes(savedThemeMode as ThemeMode)) {
      setThemeModeState(savedThemeMode as ThemeMode);
    }
  }, []);

  useEffect(() => {
    if (themeMode !== "system") {
      setResolvedTheme(themeMode);
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setResolvedTheme(resolveSystemTheme());

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);

    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.oaTheme = resolvedTheme;
    root.dataset.oaThemeMode = themeMode;
    root.style.colorScheme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("dark-mode", resolvedTheme === "dark");
    document.body.classList.toggle("dark-mode", resolvedTheme === "dark");
  }, [resolvedTheme, themeMode]);

  const setThemeMode = useCallback((nextThemeMode: ThemeMode) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextThemeMode);
    setThemeModeState(nextThemeMode);
  }, []);

  const contextValue = useMemo(
    () => ({ themeMode, resolvedTheme, setThemeMode }),
    [resolvedTheme, setThemeMode, themeMode]
  );

  return <AppThemeContext.Provider value={contextValue}>{children}</AppThemeContext.Provider>;
}
