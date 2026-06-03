"use client";

import { useState } from "react";
import { BrandMark } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

type Mode = "login" | "register";

interface AuthFormProps {
  returnTo: string;
  initialMode: Mode;
}

export function AuthForm({ returnTo, initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister
        ? { email, password, displayName }
        : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(data?.message || "操作失败，请稍后再试");
        setLoading(false);
        return;
      }

      window.location.href = returnTo || "/";
    } catch {
      setError("网络异常，请稍后再试");
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-brand text-center">
        <BrandMark className="mx-auto mb-3 h-[54px] w-[54px] rounded-[14px] text-[28px]" />
        <h1 className="auth-title text-[24px]">{APP_NAME}</h1>
        <p className="mt-2 text-sm font-medium text-[var(--oa-muted)]">{APP_TAGLINE}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-[var(--radius-lg)] border border-border/80 bg-secondary/40 p-1">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-bold transition-all ${
            !isRegister
              ? "[background:var(--oa-primary-gradient)] text-primary-foreground shadow-sm"
              : "text-[var(--oa-muted)] hover:text-[var(--oa-ink)]"
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-bold transition-all ${
            isRegister
              ? "[background:var(--oa-primary-gradient)] text-primary-foreground shadow-sm"
              : "text-[var(--oa-muted)] hover:text-[var(--oa-ink)]"
          }`}
        >
          注册
        </button>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        {isRegister && (
          <div className="grid gap-2">
            <Label htmlFor="displayName">昵称</Label>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="nickname"
              placeholder="给自己起个名字"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "至少 8 位" : "请输入密码"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "处理中…" : isRegister ? "注册并进入" : "登录"}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-[var(--oa-muted)]">
        {isRegister ? (
          <>
            已有账号？
            <button type="button" className="ml-1 font-bold text-[var(--oa-blue)] hover:underline" onClick={() => switchMode("login")}>
              去登录
            </button>
          </>
        ) : (
          <>
            还没有账号？
            <button type="button" className="ml-1 font-bold text-[var(--oa-blue)] hover:underline" onClick={() => switchMode("register")}>
              立即注册
            </button>
          </>
        )}
      </p>
    </div>
  );
}
