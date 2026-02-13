import Link from "next/link";

interface Session {
  id: string;
  sessionId: string;
  slackChannel: string | null;
  slackThreadTs: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

interface SessionListProps {
  sessions: Session[];
}

export default function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="text-slate-400">No sessions found</p>;
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/sessions/${session.id}`}
          className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-slate-800">
                {session.sessionId || "New Session"}
              </p>
              {session.slackChannel && (
                <p className="text-sm text-slate-500 mt-1">
                  Channel: {session.slackChannel}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-slate-400 space-y-1">
              <p>Updated: {session.updatedAt.toLocaleString()}</p>
              <p className="text-slate-500 font-medium">{session.messageCount} messages</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
