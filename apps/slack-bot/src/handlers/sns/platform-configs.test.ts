import { describe, it, expect } from "vitest";
import {
  ALL_CONFIGS,
  LONG_FORM_CONFIGS,
  SHORT_FORM_CONFIGS,
} from "./platform-configs.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("platform-configs", () => {
  it("should define 4 phases for all long-form platforms", () => {
    for (const [name, config] of Object.entries(LONG_FORM_CONFIGS)) {
      expect(config.phases).toHaveLength(4);
      expect(config.phases.map((p) => p.name)).toEqual([
        "research",
        "structure",
        "content",
        "optimize",
      ]);
      // Verify platform matches key
      expect(config.platform).toBe(name);
    }
  });

  it("should define 2 phases for all short-form platforms", () => {
    for (const [name, config] of Object.entries(SHORT_FORM_CONFIGS)) {
      expect(config.phases).toHaveLength(2);
      expect(config.phases.map((p) => p.name)).toEqual([
        "research",
        "generate",
      ]);
      expect(config.platform).toBe(name);
    }
  });

  it("should enable WebSearch only in first phase", () => {
    for (const [name, config] of Object.entries(ALL_CONFIGS)) {
      expect(config.phases[0].allowWebSearch).toBe(true);
      for (let i = 1; i < config.phases.length; i++) {
        expect(
          config.phases[i].allowWebSearch,
          `${name} phase ${i} should have allowWebSearch=false`,
        ).toBe(false);
      }
    }
  });

  it("should have correct inputFromPhase dependencies for 4-phase configs", () => {
    for (const config of Object.values(LONG_FORM_CONFIGS)) {
      expect(config.phases[0].inputFromPhase).toBeUndefined();
      expect(config.phases[1].inputFromPhase).toBe("research");
      expect(config.phases[2].inputFromPhase).toBe("structure");
      expect(config.phases[3].inputFromPhase).toBe("content");
    }
  });

  it("should have correct inputFromPhase dependencies for 2-phase configs", () => {
    for (const config of Object.values(SHORT_FORM_CONFIGS)) {
      expect(config.phases[0].inputFromPhase).toBeUndefined();
      expect(config.phases[1].inputFromPhase).toBe("research");
    }
  });

  it("should use .claude/skills/ paths for all prompt files", () => {
    for (const config of Object.values(ALL_CONFIGS)) {
      expect(config.systemPromptPath).toMatch(/^\.claude\/skills\//);
      for (const phase of config.phases) {
        expect(phase.promptPath).toMatch(/^\.claude\/skills\//);
        if (phase.schemaPath) {
          expect(phase.schemaPath).toMatch(/^\.claude\/skills\//);
        }
      }
    }
  });

  it("should have unique platform names", () => {
    const keys = Object.keys(ALL_CONFIGS);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);

    // Also verify config count: 7 long-form + 3 short-form = 10
    expect(Object.keys(LONG_FORM_CONFIGS)).toHaveLength(7);
    expect(Object.keys(SHORT_FORM_CONFIGS)).toHaveLength(3);
    expect(keys).toHaveLength(10);
  });
});
