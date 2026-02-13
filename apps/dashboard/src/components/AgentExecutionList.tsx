"use client";

import type { AgentExecution } from "@argus/db/schema";

interface Props {
  executions: AgentExecution[];
}

function extractCost(output: unknown): number | null {
  if (
    output &&
    typeof output === "object" &&
    "message" in output &&
    output.message &&
    typeof output.message === "object" &&
    "total_cost_usd" in output.message &&
    typeof output.message.total_cost_usd === "number"
  ) {
    return output.message.total_cost_usd;
  }
  return null;
}

export default function AgentExecutionList({ executions }: Props) {
  if (executions.length === 0) {
    return (
      <div className="text-slate-400 text-center py-8">
        No agent executions found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {executions.map((execution) => {
        const cost = extractCost(execution.output);
        return (
          <div
            key={execution.id}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-base font-semibold font-mono text-slate-800">
                {execution.agentId}
              </h3>
              <div className="flex items-center gap-2">
                {cost != null && cost > 0 && (
                  <span className="px-2 py-1 rounded-md text-xs bg-blue-50 text-blue-700 font-mono border border-blue-200">
                    ${cost.toFixed(4)}
                  </span>
                )}
                <span
                  className={`px-2 py-1 rounded-md text-xs font-medium ${
                    execution.status === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : execution.status === "error"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {execution.status}
                </span>
              </div>
            </div>
            <div className="text-sm text-slate-500 space-y-1">
              <p>Started: {new Date(execution.startedAt).toLocaleString()}</p>
              {execution.completedAt && (
                <p>
                  Completed:{" "}
                  {new Date(execution.completedAt).toLocaleString()}
                </p>
              )}
              {execution.durationMs && (
                <p>Duration: {execution.durationMs}ms</p>
              )}
              {execution.errorMessage && (
                <p className="text-red-600">Error: {execution.errorMessage}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
