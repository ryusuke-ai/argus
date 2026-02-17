import { db } from "@argus/db/client";
import { agentExecutions } from "@argus/db/schema";
import { desc } from "drizzle-orm";
import AgentExecutionList from "@/components/AgentExecutionList";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const executions = await db
    .select()
    .from(agentExecutions)
    .orderBy(desc(agentExecutions.startedAt))
    .limit(50);

  return (
    <main className="p-4 pt-16 md:p-8 md:pt-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        Agent Executions
      </h1>
      <AgentExecutionList executions={executions} />
    </main>
  );
}
