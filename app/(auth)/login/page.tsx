import type { Route } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";

function readSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeReturnTo(value: string) {
  const parsed = value.trim();
  if (!parsed || !parsed.startsWith("/") || parsed.startsWith("//") || parsed.includes("://")) {
    return "/";
  }
  return parsed as Route;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const resolvedSearchParams = await searchParams;
  const returnTo = normalizeReturnTo(readSingleSearchParam(resolvedSearchParams.return_to));
  const initialMode = readSingleSearchParam(resolvedSearchParams.mode) === "register" ? "register" : "login";
  const current = await getCurrentUserFromCookies();

  if (current) {
    redirect(returnTo);
  }

  return <AuthForm returnTo={returnTo} initialMode={initialMode} />;
}
