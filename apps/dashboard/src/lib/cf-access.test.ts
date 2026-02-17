import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCfAccessConfig, getJwksUrl } from "./cf-access.js";

describe("cf-access", () => {
  describe("getCfAccessConfig", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("両方の環境変数が設定されている場合は設定オブジェクトを返す", () => {
      vi.stubEnv("CF_ACCESS_TEAM_NAME", "my-team");
      vi.stubEnv("CF_ACCESS_AUD", "my-aud-tag");

      const config = getCfAccessConfig();
      expect(config).toEqual({
        teamName: "my-team",
        aud: "my-aud-tag",
      });
    });

    it("CF_ACCESS_TEAM_NAME が未設定の場合は null を返す", () => {
      vi.stubEnv("CF_ACCESS_TEAM_NAME", "");
      vi.stubEnv("CF_ACCESS_AUD", "my-aud-tag");

      const config = getCfAccessConfig();
      expect(config).toBeNull();
    });

    it("CF_ACCESS_AUD が未設定の場合は null を返す", () => {
      vi.stubEnv("CF_ACCESS_TEAM_NAME", "my-team");
      vi.stubEnv("CF_ACCESS_AUD", "");

      const config = getCfAccessConfig();
      expect(config).toBeNull();
    });

    it("両方とも未設定の場合は null を返す", () => {
      vi.stubEnv("CF_ACCESS_TEAM_NAME", "");
      vi.stubEnv("CF_ACCESS_AUD", "");

      const config = getCfAccessConfig();
      expect(config).toBeNull();
    });
  });

  describe("getJwksUrl", () => {
    it("正しい JWKS URL を生成する", () => {
      const url = getJwksUrl("my-team");
      expect(url.toString()).toBe(
        "https://my-team.cloudflareaccess.com/cdn-cgi/access/certs",
      );
    });
  });
});
