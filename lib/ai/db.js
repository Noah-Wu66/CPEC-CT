import { ensureMongoIndexes, getDb } from "@/lib/db";

export default async function dbConnect() {
  await ensureMongoIndexes();
  await getDb();
}
