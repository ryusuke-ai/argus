import { db } from "@argus/db/client";
import { sessions, messages, tasks } from "@argus/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import MessageViewer from "@/components/MessageViewer";
import ToolCallList from "@/components/ToolCallList";
import FeedbackForm from "@/components/FeedbackForm";
import Link from "next/link";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!session) {
    notFound();
  }

  const [sessionMessages, toolCalls] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, id))
      .orderBy(asc(messages.createdAt)),
    db
      .select()
      .from(tasks)
      .where(eq(tasks.sessionId, id))
      .orderBy(asc(tasks.createdAt)),
  ]);

  return (
    <main className="p-4 pt-16 md:p-8 md:pt-8 max-w-6xl">
      <Link
        href="/sessions"
        className="text-blue-600 hover:underline mb-4 inline-block text-sm"
      >
        ← Back to Sessions
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        {session.sessionId || "Session"}
      </h1>
      <div className="flex gap-4 text-sm text-slate-500 mb-8">
        {session.slackChannel && <span>Channel: {session.slackChannel}</span>}
        <span>Created: {formatDate(session.createdAt)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Messages
          </h2>
          <MessageViewer messages={sessionMessages} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Tool Calls
          </h2>
          <ToolCallList toolCalls={toolCalls} />
        </div>
      </div>

      {session.sessionId && <FeedbackForm sessionId={session.id} />}
    </main>
  );
}
