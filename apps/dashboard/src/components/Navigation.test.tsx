import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Navigation from "./Navigation.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("Navigation", () => {
  it("renders hamburger button on mobile", () => {
    render(<Navigation />);
    const button = screen.getByRole("button", { name: /メニュー/i });
    expect(button).toBeDefined();
  });

  it("opens mobile menu when hamburger is clicked", () => {
    render(<Navigation />);
    const button = screen.getByRole("button", { name: /メニュー/i });
    fireEvent.click(button);
    const overlay = screen.getByTestId("mobile-overlay");
    expect(overlay).toBeDefined();
  });

  it("closes mobile menu when overlay is clicked", () => {
    render(<Navigation />);
    const button = screen.getByRole("button", { name: /メニュー/i });
    fireEvent.click(button);
    const overlay = screen.getByTestId("mobile-overlay");
    fireEvent.click(overlay);
    expect(screen.queryByTestId("mobile-overlay")).toBeNull();
  });

  it("closes mobile menu when nav item is clicked", () => {
    render(<Navigation />);
    const button = screen.getByRole("button", { name: /メニュー/i });
    fireEvent.click(button);
    const sessionsLink = screen.getAllByText("Sessions")[0];
    fireEvent.click(sessionsLink);
    expect(screen.queryByTestId("mobile-overlay")).toBeNull();
  });
});
