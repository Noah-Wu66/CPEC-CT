export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ validateRuntimeEnv }, { ensureMongoIndexes, getDb }, { ensureStorageReady }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/db"),
    import("@/lib/storage/server"),
  ]);
  validateRuntimeEnv();
  await Promise.all([
    ensureMongoIndexes(),
    getDb().then((db) => db.command({ ping: 1 })),
    ensureStorageReady(),
  ]);

  const { runRequiredStartupMigrations } = await import("@/lib/migrations/requiredStartupMigrations");
  await runRequiredStartupMigrations();
}
