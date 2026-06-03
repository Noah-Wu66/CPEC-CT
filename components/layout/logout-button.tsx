"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const label = loading ? "退出中" : "退出登录";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      disabled={loading}
      onClick={() => {
        setLoading(true);
        window.location.href = "/api/auth/logout";
      }}
      className="w-11 px-0 text-muted-foreground hover:text-foreground md:w-auto md:px-3"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden md:inline">{loading ? "..." : "退出"}</span>
    </Button>
  );
}
