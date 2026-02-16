import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class MockS3Client {
      send = sendMock;
      constructor(public config: unknown) {}
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public input: unknown) {}
    },
    DeleteObjectCommand: class MockDeleteObjectCommand {
      constructor(public input: unknown) {}
    },
  };
});

vi.mock("node:fs", () => ({
  createReadStream: vi.fn().mockReturnValue("mock-stream"),
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-1234"),
}));

describe("R2 Storage Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_ACCOUNT_ID = "test-account-id";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_PUBLIC_URL = "https://media.example.com";
  });

  describe("uploadFile", () => {
    it("should upload a file and return the public URL", async () => {
      const { uploadFile } = await import("./client.js");

      const url = await uploadFile("/path/to/video.mp4");

      // Verify S3Client was called with correct config
      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentCommand = sendMock.mock.calls[0][0];
      expect(sentCommand.input).toEqual({
        Bucket: "test-bucket",
        Key: "test-uuid-1234.mp4",
        Body: "mock-stream",
        ContentType: "video/mp4",
        ContentLength: 1024,
      });

      expect(url).toBe("https://media.example.com/test-uuid-1234.mp4");
    });

    it("should use a custom key when provided", async () => {
      const { uploadFile } = await import("./client.js");

      const url = await uploadFile(
        "/path/to/video.mp4",
        "custom/path/video.mp4",
      );

      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentCommand = sendMock.mock.calls[0][0];
      expect(sentCommand.input).toEqual(
        expect.objectContaining({
          Key: "custom/path/video.mp4",
        }),
      );

      expect(url).toBe("https://media.example.com/custom/path/video.mp4");
    });

    it("should throw an error when credentials are not set", async () => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      delete process.env.R2_PUBLIC_URL;

      const { uploadFile } = await import("./client.js");

      await expect(uploadFile("/path/to/video.mp4")).rejects.toThrow(
        "[R2Storage] Missing required environment variables",
      );
    });
  });

  describe("deleteFile", () => {
    it("should delete a file with the correct key", async () => {
      const { deleteFile } = await import("./client.js");

      await deleteFile("some/file/key.mp4");

      expect(sendMock).toHaveBeenCalledTimes(1);
      const sentCommand = sendMock.mock.calls[0][0];
      expect(sentCommand.input).toEqual({
        Bucket: "test-bucket",
        Key: "some/file/key.mp4",
      });
    });
  });
});
