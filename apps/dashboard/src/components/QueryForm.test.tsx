import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QueryForm from "./QueryForm";

describe("QueryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should render form elements", () => {
    render(<QueryForm />);

    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your message...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("should disable submit button when message is empty", () => {
    render(<QueryForm />);

    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
  });

  it("should enable submit button when message is entered", () => {
    render(<QueryForm />);

    const textarea = screen.getByPlaceholderText("Enter your message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeEnabled();
  });

  it("should show loading state during submission", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    render(<QueryForm />);

    const textarea = screen.getByPlaceholderText("Enter your message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Processing...")).toBeInTheDocument();
      expect(textarea).toBeDisabled();
    });
  });

  it("should display response on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "Agent response" }),
    } as Response);

    render(<QueryForm />);

    fireEvent.change(screen.getByPlaceholderText("Enter your message..."), {
      target: { value: "Hello" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Agent response")).toBeInTheDocument();
      expect(screen.getByText("Response:")).toBeInTheDocument();
    });
  });

  it("should clear message input after successful submission", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "Done" }),
    } as Response);

    render(<QueryForm />);

    const textarea = screen.getByPlaceholderText("Enter your message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("should display error from API response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Agent unavailable" }),
    } as Response);

    render(<QueryForm />);

    fireEvent.change(screen.getByPlaceholderText("Enter your message..."), {
      target: { value: "Hello" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Agent unavailable")).toBeInTheDocument();
    });
  });

  it("should display fallback error when API returns no error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<QueryForm />);

    fireEvent.change(screen.getByPlaceholderText("Enter your message..."), {
      target: { value: "Hello" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to query agent")).toBeInTheDocument();
    });
  });

  it("should display network error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

    render(<QueryForm />);

    fireEvent.change(screen.getByPlaceholderText("Enter your message..."), {
      target: { value: "Hello" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("should send correct request body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "OK" }),
    } as Response);

    render(<QueryForm />);

    fireEvent.change(screen.getByPlaceholderText("Enter your message..."), {
      target: { value: "Test query" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Test query" }),
      });
    });
  });
});
