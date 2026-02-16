import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TikTokPostForm from "./TikTokPostForm";

const mockCreatorInfo = {
  success: true,
  creatorInfo: {
    creatorAvatarUrl: "https://example.com/avatar.jpg",
    creatorUsername: "testuser",
    creatorNickname: "Test User",
    privacyLevelOptions: [
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "FOLLOWER_OF_CREATOR",
      "SELF_ONLY",
    ],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoPostDurationSec: 600,
  },
};

describe("TikTokPostForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockCreatorInfo),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders creator info when loaded", async () => {
    render(<TikTokPostForm />);

    expect(await screen.findByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("@testuser")).toBeInTheDocument();
    expect(screen.getByAltText("Test User avatar")).toBeInTheDocument();
  });

  it("privacy dropdown has no default value", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    const select = screen.getByLabelText("Who can view this video");
    expect(select).toHaveValue("");
  });

  it("interaction checkboxes are unchecked by default", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    const commentCheckbox = screen.getByRole("checkbox", {
      name: /Allow comments/,
    });
    const duetCheckbox = screen.getByRole("checkbox", {
      name: /Allow duets/,
    });
    const stitchCheckbox = screen.getByRole("checkbox", {
      name: /Allow stitches/,
    });

    expect(commentCheckbox).not.toBeChecked();
    expect(duetCheckbox).not.toBeChecked();
    expect(stitchCheckbox).not.toBeChecked();
  });

  it("disclosure toggle is off by default", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("disables publish when disclosure on but no option selected", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    // Fill required fields: video URL and privacy level
    const videoInput = screen.getByLabelText("Video URL");
    fireEvent.change(videoInput, {
      target: { value: "https://example.com/video.mp4" },
    });

    const select = screen.getByLabelText("Who can view this video");
    fireEvent.change(select, { target: { value: "PUBLIC_TO_EVERYONE" } });

    // Turn on disclosure
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Should show warning about needing to select an option
    await waitFor(() => {
      expect(
        screen.getByText(/You need to indicate if your content promotes/),
      ).toBeInTheDocument();
    });

    // Publish button should be disabled
    const publishButton = screen.getByRole("button", {
      name: "Post to TikTok",
    });
    expect(publishButton).toBeDisabled();
  });

  it("disables SELF_ONLY when branded content is selected", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    // Turn on disclosure and select branded content
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    const brandedCheckbox = screen.getByRole("checkbox", {
      name: /Branded Content/,
    });
    fireEvent.click(brandedCheckbox);

    // SELF_ONLY option should be disabled
    const selfOnlyOption = screen.getByRole("option", {
      name: /Only me/,
    });
    expect(selfOnlyOption).toBeDisabled();
  });

  it("shows correct consent text based on disclosure options", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    // Turn on disclosure
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Select "Your Brand" -> shows "Promotional content"
    const yourBrandCheckbox = screen.getByRole("checkbox", {
      name: /Your Brand/,
    });
    fireEvent.click(yourBrandCheckbox);

    expect(screen.getByText(/Promotional content/)).toBeInTheDocument();

    // Uncheck "Your Brand" and check "Branded Content" -> shows "Paid partnership"
    fireEvent.click(yourBrandCheckbox);
    const brandedCheckbox = screen.getByRole("checkbox", {
      name: /Branded Content/,
    });
    fireEvent.click(brandedCheckbox);

    expect(screen.getByText(/Paid partnership/)).toBeInTheDocument();

    // Branded content also shows Branded Content Policy link
    expect(screen.getByText("Branded Content Policy")).toBeInTheDocument();
  });

  it("shows AI-generated content checkbox checked by default", async () => {
    render(<TikTokPostForm />);

    await screen.findByText("Test User");

    const aigcCheckbox = screen.getByRole("checkbox", {
      name: /This content is AI-generated/,
    });
    expect(aigcCheckbox).toBeChecked();
  });
});
