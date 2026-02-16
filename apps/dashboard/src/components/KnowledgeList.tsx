import { formatDate } from "@/lib/format";

interface Knowledge {
  id: string;
  name: string;
  description: string | null;
  content: string;
  updatedAt: Date;
}

interface KnowledgeListProps {
  knowledge: Knowledge[];
}

export default function KnowledgeList({ knowledge }: KnowledgeListProps) {
  if (knowledge.length === 0) {
    return <p className="text-slate-400">No knowledge entries found</p>;
  }

  return (
    <div
      aria-label="ナレッジ一覧"
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {knowledge.map((item) => (
        <div
          key={item.id}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            {item.name}
          </h2>
          {item.description && (
            <p className="text-slate-500 text-sm mb-3">{item.description}</p>
          )}
          <div className="text-xs text-slate-400 mb-3">
            Updated: {formatDate(item.updatedAt)}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-blue-600 hover:underline font-medium">
              View Content
            </summary>
            <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto text-slate-600 text-xs">
              {item.content}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
