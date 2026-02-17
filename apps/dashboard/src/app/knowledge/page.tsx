import { db } from "@argus/db/client";
import { knowledges } from "@argus/db/schema";
import { desc } from "drizzle-orm";
import KnowledgeList from "@/components/KnowledgeList";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const allKnowledge = await db
    .select()
    .from(knowledges)
    .orderBy(desc(knowledges.updatedAt))
    .limit(50);

  return (
    <main className="p-4 pt-16 md:p-8 md:pt-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Knowledge Base</h1>
      <KnowledgeList knowledge={allKnowledge} />
    </main>
  );
}
