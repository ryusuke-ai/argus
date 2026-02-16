import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import KnowledgeList from "./KnowledgeList";

describe("KnowledgeList", () => {
  it("should display 'No knowledge entries found' when knowledge is empty", () => {
    render(<KnowledgeList knowledge={[]} />);
    expect(screen.getByText("No knowledge entries found")).toBeInTheDocument();
  });

  it("should display knowledge cards when provided", () => {
    const knowledge = [
      {
        id: "1",
        name: "API Documentation",
        description: "How to use our API",
        content: "GET /api/v1/...",
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "2",
        name: "Setup Guide",
        description: null,
        content: "Step 1: Install...",
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    render(<KnowledgeList knowledge={knowledge} />);

    expect(screen.getByText("API Documentation")).toBeInTheDocument();
    expect(screen.getByText("How to use our API")).toBeInTheDocument();
    expect(screen.getByText("Setup Guide")).toBeInTheDocument();
  });

  it("should not render description when it is null", () => {
    const knowledge = [
      {
        id: "1",
        name: "No Description Item",
        description: null,
        content: "Some content",
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      },
    ];

    render(<KnowledgeList knowledge={knowledge} />);

    expect(screen.getByText("No Description Item")).toBeInTheDocument();
    // The description paragraph should not be in the document
    const card = screen.getByText("No Description Item").closest("div");
    const paragraphs = card?.querySelectorAll("p.text-gray-600");
    expect(paragraphs?.length ?? 0).toBe(0);
  });

  it("should have a 'View Content' toggle for each item", () => {
    const knowledge = [
      {
        id: "1",
        name: "Item 1",
        description: null,
        content: "Content for item 1",
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "2",
        name: "Item 2",
        description: "Desc",
        content: "Content for item 2",
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    render(<KnowledgeList knowledge={knowledge} />);

    const viewContentButtons = screen.getAllByText("View Content");
    expect(viewContentButtons).toHaveLength(2);
  });
});
