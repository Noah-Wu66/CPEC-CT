import type { ReactNode } from "react";
import { Suspense } from "react";

function AuthLayoutFallback() {
  return <div className="auth-shell" />;
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AuthLayoutFallback />}>
      <div className="auth-shell">{children}</div>
    </Suspense>
  );
}
