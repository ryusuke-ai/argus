import { db } from "@argus/db/client";
import { sessions, messages } from "@argus/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import SessionList from "@/components/SessionList";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const allSessions = await db
    .select({
      id: sessions.id,
      sessionId: sessions.sessionId,
      slackChannel: sessions.slackChannel,
      slackThreadTs: sessions.slackThreadTs,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: sql<number>`cast(count(${messages.id}) as int)`,
    })
    .from(sessions)
    .leftJoin(messages, eq(sessions.id, messages.sessionId))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.updatedAt))
    .limit(50);

  return (
    <main className="p-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Sessions</h1>
      <SessionList sessions={allSessions} />
    </main>
  );
}
