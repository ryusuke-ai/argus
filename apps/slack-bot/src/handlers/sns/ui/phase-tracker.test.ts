import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @argus/db
// ---------------------------------------------------------------------------

const mockReturning = vi.fn().mockResolvedValue([{ id: "test-post-id" }]);
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

const mockSelectWhere = vi.fn().mockResolvedValue([
  {
    id: "test-post-id",
    phaseArtifacts: { research: { trend: "AI" } },
  },
]);
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock("@argus/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
  snsPosts: { id: "id" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import {
  createGeneratingPost,
  updatePhaseProgress,
  finalizePost,
  createSaveCallback,
} from "./phase-tracker.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("phase-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default resolved values
    mockReturning.mockResolvedValue([{ id: "test-post-id" }]);
    mockSelectWhere.mockResolvedValue([
      {
        id: "test-post-id",
        phaseArtifacts: { research: { trend: "AI" } },
      },
    ]);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // createGeneratingPost
  // -------------------------------------------------------------------------

  it('createGeneratingPost should insert with status "generating"', async () => {
    await createGeneratingPost("x", "single", "#sns-channel");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      platform: "x",
      postType: "single",
      content: {},
      status: "generating",
      currentPhase: "research",
      phaseArtifacts: {},
      slackChannel: "#sns-channel",
    });
  });

  it("createGeneratingPost should return the post id", async () => {
    const id = await createGeneratingPost("threads", "single", "#ch");
    expect(id).toBe("test-post-id");
  });

  // -------------------------------------------------------------------------
  // updatePhaseProgress
  // -------------------------------------------------------------------------

  it("updatePhaseProgress should update phase_artifacts and current_phase", async () => {
    const structureOutput = { sections: ["intro", "body"] };
    await updatePhaseProgress("test-post-id", "structure", structureOutput);

    // Should first SELECT the existing record
    expect(mockSelect).toHaveBeenCalledTimes(1);

    // Should UPDATE with merged artifacts
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.currentPhase).toBe("structure");
    expect(setArg.phaseArtifacts).toEqual({
      research: { trend: "AI" },
      structure: { sections: ["intro", "body"] },
    });
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it("updatePhaseProgress should skip update if post not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await updatePhaseProgress("non-existent", "research", {});

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // finalizePost
  // -------------------------------------------------------------------------

  it('finalizePost should set status to "proposed" and current_phase to "completed"', async () => {
    const finalContent = { title: "Final Article", body: "Content here" };
    await finalizePost("test-post-id", finalContent);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.status).toBe("proposed");
    expect(setArg.currentPhase).toBe("completed");
    expect(setArg.content).toEqual(finalContent);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // createSaveCallback
  // -------------------------------------------------------------------------

  it("createSaveCallback should return a function that calls updatePhaseProgress", async () => {
    const callback = createSaveCallback("test-post-id");
    expect(typeof callback).toBe("function");

    const phaseOutput = { topics: ["AI", "LLM"] };
    await callback("x", "research", phaseOutput);

    // updatePhaseProgress internally calls select then update
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.currentPhase).toBe("research");
    expect(setArg.phaseArtifacts).toMatchObject({
      research: { topics: ["AI", "LLM"] },
    });
  });
});
