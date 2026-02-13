import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Navigation from "./Navigation";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Navigation", () => {
  it("should render all navigation links", () => {
    render(<Navigation />);

    const homeLink = screen.getByText("Home");
    const sessionsLink = screen.getByText("Sessions");
    const knowledgeLink = screen.getByText("Knowledge");
    const agentsLink = screen.getByText("Agents");
    const filesLink = screen.getByText("Files");

    expect(homeLink.closest("a")).toHaveAttribute("href", "/");
    expect(sessionsLink.closest("a")).toHaveAttribute("href", "/sessions");
    expect(knowledgeLink.closest("a")).toHaveAttribute("href", "/knowledge");
    expect(agentsLink.closest("a")).toHaveAttribute("href", "/agents");
    expect(filesLink.closest("a")).toHaveAttribute("href", "/files");
  });

  it("should render a nav element", () => {
    const { container } = render(<Navigation />);
    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
  });
});
