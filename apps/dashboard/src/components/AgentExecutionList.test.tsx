import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentExecutionList from "./AgentExecutionList";

vi.mock("@argus/db/schema", () => ({}));

describe("AgentExecutionList", () => {
  it("should display empty message when executions is empty", () => {
    render(<AgentExecutionList executions={[]} />);
    expect(screen.getByText("No agent executions found.")).toBeInTheDocument();
  });

  it("should display executions when provided", () => {
    const executions = [
      {
        id: "1",
        agentId: "agent-001",
        sessionId: "session-1",
        status: "success",
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: new Date("2024-01-01T00:01:00Z"),
        durationMs: 60000,
        errorMessage: null,
        output: null,
      },
      {
        id: "2",
        agentId: "agent-002",
        sessionId: "session-2",
        status: "error",
        startedAt: new Date("2024-01-02T00:00:00Z"),
        completedAt: new Date("2024-01-02T00:00:30Z"),
        durationMs: 30000,
        errorMessage: "Something went wrong",
        output: null,
      },
    ];

    render(<AgentExecutionList executions={executions as any} />);

    expect(screen.getByText("agent-001")).toBeInTheDocument();
    expect(screen.getByText("agent-002")).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("Error: Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Duration: 60000ms")).toBeInTheDocument();
  });

  it("should apply green style for success status", () => {
    const executions = [
      {
        id: "1",
        agentId: "agent-001",
        sessionId: null,
        status: "success",
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: new Date("2024-01-01T00:01:00Z"),
        durationMs: 60000,
        errorMessage: null,
        output: null,
      },
    ];

    render(<AgentExecutionList executions={executions as any} />);

    const statusBadge = screen.getByText("success");
    expect(statusBadge.className).toContain("bg-emerald-50");
    expect(statusBadge.className).toContain("text-emerald-700");
  });

  it("should apply red style for error status", () => {
    const executions = [
      {
        id: "1",
        agentId: "agent-001",
        sessionId: null,
        status: "error",
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: null,
        durationMs: null,
        errorMessage: "Failed",
        output: null,
      },
    ];

    render(<AgentExecutionList executions={executions as any} />);

    const statusBadge = screen.getByText("error");
    expect(statusBadge.className).toContain("bg-red-50");
    expect(statusBadge.className).toContain("text-red-700");
  });

  it("should apply yellow style for other statuses", () => {
    const executions = [
      {
        id: "1",
        agentId: "agent-001",
        sessionId: null,
        status: "running",
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        output: null,
      },
    ];

    render(<AgentExecutionList executions={executions as any} />);

    const statusBadge = screen.getByText("running");
    expect(statusBadge.className).toContain("bg-amber-50");
    expect(statusBadge.className).toContain("text-amber-700");
  });

  it("should not display completed time when completedAt is null", () => {
    const executions = [
      {
        id: "1",
        agentId: "agent-001",
        sessionId: null,
        status: "running",
        startedAt: new Date("2024-01-01T00:00:00Z"),
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        output: null,
      },
    ];

    render(<AgentExecutionList executions={executions as any} />);

    expect(screen.queryByText(/Completed:/)).not.toBeInTheDocument();
  });
});
