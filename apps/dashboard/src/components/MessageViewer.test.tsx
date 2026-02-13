import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageViewer from "./MessageViewer";

describe("MessageViewer", () => {
  it("should display 'No messages yet' when messages is empty", () => {
    render(<MessageViewer messages={[]} />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("should display messages when provided", () => {
    const messages = [
      {
        id: "1",
        content: "Hello, how can I help?",
        role: "assistant",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "2",
        content: "I need help with my project",
        role: "user",
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
    ];

    render(<MessageViewer messages={messages} />);

    expect(screen.getByText("Hello, how can I help?")).toBeInTheDocument();
    expect(screen.getByText("I need help with my project")).toBeInTheDocument();
  });

  it("should display role labels", () => {
    const messages = [
      {
        id: "1",
        content: "Hello",
        role: "assistant",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "2",
        content: "Hi",
        role: "user",
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
    ];

    render(<MessageViewer messages={messages} />);

    expect(screen.getByText("assistant")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
  });

  it("should apply different styles for user and assistant roles", () => {
    const messages = [
      {
        id: "1",
        content: "User message",
        role: "user",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "2",
        content: "Assistant message",
        role: "assistant",
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
    ];

    render(<MessageViewer messages={messages} />);

    // The role label is inside the outer message div that has the style classes
    const userRoleLabel = screen.getByText("user");
    const userMessage = userRoleLabel.closest(".bg-blue-50");
    const assistantRoleLabel = screen.getByText("assistant");
    const assistantMessage = assistantRoleLabel.closest(".bg-gray-50");

    expect(userMessage).not.toBeNull();
    expect(userMessage?.className).toContain("border-blue-500");
    expect(assistantMessage).not.toBeNull();
    expect(assistantMessage?.className).toContain("border-gray-500");
  });
});
