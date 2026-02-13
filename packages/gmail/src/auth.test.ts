import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  refreshTokenIfNeeded,
  loadTokens,
  saveTokens,
} from "./auth.js";

// googleapis モック
const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

function MockOAuth2() {
  return {
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    setCredentials: mockSetCredentials,
    refreshAccessToken: mockRefreshAccessToken,
  };
}

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

// DB モック
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockValues = vi.fn();

vi.mock("@argus/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockWhere,
      }),
    }),
    insert: () => ({
      values: mockValues,
    }),
  },
  gmailTokens: {
    email: "email",
    accessToken: "access_token",
    refreshToken: "refresh_token",
    tokenExpiry: "token_expiry",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

describe("gmail auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GMAIL_CLIENT_ID", "test-client-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GMAIL_REDIRECT_URI", "http://localhost:3950/api/gmail/callback");
    vi.stubEnv("GMAIL_ADDRESS", "test@gmail.com");
  });

  describe("getAuthUrl", () => {
    it("should return a URL string", () => {
      const expectedUrl = "https://accounts.google.com/o/oauth2/v2/auth?test=1";
      mockGenerateAuthUrl.mockReturnValue(expectedUrl);

      const url = getAuthUrl();

      expect(url).toBe(expectedUrl);
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube",
        ],
        prompt: "consent",
      });
    });
  });

  describe("createOAuth2Client", () => {
    it("should throw if GMAIL_CLIENT_ID is not set", () => {
      vi.stubEnv("GMAIL_CLIENT_ID", "");

      expect(() => createOAuth2Client()).toThrow(
        "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set",
      );
    });

    it("should throw if GMAIL_CLIENT_SECRET is not set", () => {
      vi.stubEnv("GMAIL_CLIENT_SECRET", "");

      expect(() => createOAuth2Client()).toThrow(
        "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set",
      );
    });
  });

  describe("handleCallback", () => {
    it("should obtain tokens and save to DB", async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expiry_date: Date.now() + 3600 * 1000,
        },
      });
      // saveTokens: select -> empty -> insert
      mockLimit.mockResolvedValue([]);
      mockValues.mockResolvedValue(undefined);

      const result = await handleCallback("auth-code-123");

      expect(mockGetToken).toHaveBeenCalledWith("auth-code-123");
      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(result.expiry).toBeInstanceOf(Date);
      expect(mockValues).toHaveBeenCalled();
    });

    it("should throw if tokens are incomplete", async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: "token",
          refresh_token: null,
        },
      });

      await expect(handleCallback("bad-code")).rejects.toThrow(
        "Failed to obtain tokens from Google",
      );
    });
  });

  describe("refreshTokenIfNeeded", () => {
    it("should return existing token if not expired", async () => {
      const futureExpiry = new Date(Date.now() + 30 * 60 * 1000);
      mockLimit.mockResolvedValue([
        {
          accessToken: "valid-access-token",
          refreshToken: "valid-refresh-token",
          tokenExpiry: futureExpiry,
        },
      ]);

      const token = await refreshTokenIfNeeded();

      expect(token).toBe("valid-access-token");
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it("should refresh token if expired", async () => {
      const pastExpiry = new Date(Date.now() - 60 * 1000);
      // loadTokens: 期限切れトークンを返す
      mockLimit.mockResolvedValueOnce([
        {
          accessToken: "expired-access-token",
          refreshToken: "stored-refresh-token",
          tokenExpiry: pastExpiry,
        },
      ]);

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "refreshed-access-token",
          expiry_date: Date.now() + 3600 * 1000,
        },
      });

      // saveTokens: select (既存チェック) -> existing -> update
      mockLimit.mockResolvedValueOnce([{ email: "test@gmail.com" }]);
      mockWhere.mockResolvedValueOnce(undefined);

      const token = await refreshTokenIfNeeded();

      expect(token).toBe("refreshed-access-token");
      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockSetCredentials).toHaveBeenCalledWith({
        refresh_token: "stored-refresh-token",
      });
    });

    it("should throw if no tokens stored", async () => {
      mockLimit.mockResolvedValue([]);

      await expect(refreshTokenIfNeeded()).rejects.toThrow(
        "No Gmail tokens found. Please authenticate first.",
      );
    });
  });

  describe("loadTokens", () => {
    it("should return null when no tokens exist", async () => {
      mockLimit.mockResolvedValue([]);

      const result = await loadTokens();

      expect(result).toBeNull();
    });

    it("should return tokens when they exist", async () => {
      const expiry = new Date();
      mockLimit.mockResolvedValue([
        {
          accessToken: "stored-access",
          refreshToken: "stored-refresh",
          tokenExpiry: expiry,
        },
      ]);

      const result = await loadTokens();

      expect(result).toEqual({
        accessToken: "stored-access",
        refreshToken: "stored-refresh",
        expiry,
      });
    });
  });
});
