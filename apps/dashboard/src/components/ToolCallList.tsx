"use client";

import type { Task } from "@argus/db/schema";

interface Props {
  toolCalls: Task[];
}

export default function ToolCallList({ toolCalls }: Props) {
  if (toolCalls.length === 0) {
    return <p className="text-gray-500 text-sm">No tool calls recorded</p>;
  }

  const totalDuration = toolCalls.reduce(
    (sum, t) => sum + (t.durationMs ?? 0),
    0,
  );
  const successCount = toolCalls.filter((t) => t.status === "success").length;

  return (
    <div>
      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
        <p>
          Total: <span className="font-semibold">{toolCalls.length}</span> calls
        </p>
        <p>
          Success:{" "}
          <span className="font-semibold text-green-700">{successCount}</span> /{" "}
          {toolCalls.length}
        </p>
        {totalDuration > 0 && (
          <p>
            Duration:{" "}
            <span className="font-semibold">
              {(totalDuration / 1000).toFixed(1)}s
            </span>
          </p>
        )}
      </div>
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {toolCalls.map((call) => (
          <details
            key={call.id}
            className="border rounded p-2 text-sm bg-white"
          >
            <summary className="flex justify-between items-center cursor-pointer">
              <span className="font-mono font-semibold">{call.toolName}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  call.status === "success"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {call.status}
              </span>
            </summary>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              {call.durationMs != null && <p>Duration: {call.durationMs}ms</p>}
              {call.toolInput != null && (
                <div>
                  <p className="font-semibold text-gray-700">Input:</p>
                  <pre className="bg-gray-50 p-1 rounded overflow-x-auto">
                    {JSON.stringify(call.toolInput, null, 2)}
                  </pre>
                </div>
              )}
              {call.toolResult != null && (
                <div>
                  <p className="font-semibold text-gray-700">Result:</p>
                  <pre className="bg-gray-50 p-1 rounded overflow-x-auto max-h-40">
                    {JSON.stringify(call.toolResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
