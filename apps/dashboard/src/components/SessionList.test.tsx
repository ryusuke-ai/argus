import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import SessionList from "./SessionList";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("SessionList", () => {
  it("should display 'No sessions found' when sessions is empty", () => {
    render(<SessionList sessions={[]} />);
    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  it("should display sessions when provided", () => {
    const sessions = [
      {
        id: "1",
        sessionId: "session-abc",
        slackChannel: "#general",
        slackThreadTs: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
      {
        id: "2",
        sessionId: "session-def",
        slackChannel: null,
        slackThreadTs: null,
        createdAt: new Date("2024-01-03T00:00:00Z"),
        updatedAt: new Date("2024-01-04T00:00:00Z"),
      },
    ];

    render(<SessionList sessions={sessions} />);

    expect(screen.getByText("session-abc")).toBeInTheDocument();
    expect(screen.getByText("session-def")).toBeInTheDocument();
    expect(screen.getByText("Channel: #general")).toBeInTheDocument();
  });

  it("should link each session to its detail page", () => {
    const sessions = [
      {
        id: "abc-123",
        sessionId: "session-abc",
        slackChannel: null,
        slackThreadTs: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    render(<SessionList sessions={sessions} />);

    const link = screen.getByText("session-abc").closest("a");
    expect(link).toHaveAttribute("href", "/sessions/abc-123");
  });

  it("should display 'New Session' when sessionId is empty", () => {
    const sessions = [
      {
        id: "1",
        sessionId: "",
        slackChannel: null,
        slackThreadTs: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    render(<SessionList sessions={sessions} />);
    expect(screen.getByText("New Session")).toBeInTheDocument();
  });
});
