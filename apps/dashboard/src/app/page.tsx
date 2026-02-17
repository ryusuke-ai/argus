import Link from "next/link";
import QueryForm from "@/components/QueryForm";

export default function Home() {
  return (
    <main className="p-4 pt-16 md:p-8 md:pt-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
      <p className="text-slate-500 mb-8">AI Agent Harness</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <Link
          href="/sessions"
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition group"
        >
          <p className="text-sm font-medium text-slate-500 mb-1">Sessions</p>
          <p className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
            View all sessions →
          </p>
        </Link>
        <Link
          href="/knowledge"
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition group"
        >
          <p className="text-sm font-medium text-slate-500 mb-1">Knowledge</p>
          <p className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
            Browse knowledge base →
          </p>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Quick Query
        </h2>
        <QueryForm />
      </div>
    </main>
  );
}
