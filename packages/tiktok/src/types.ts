export interface TiktokTokens {
  accessToken: string;
  refreshToken: string;
  expiry: Date;
  openId: string;
  scopes: string;
}

export interface TiktokUploadResult {
  success: boolean;
  publishId?: string;
  privacyLevel?: string;
  error?: string;
}

export interface TiktokPublishStatusResult {
  status: "processing" | "publish_complete" | "failed";
  publishId: string;
  error?: string;
}

export interface TiktokCreatorInfo {
  creatorAvatarUrl: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface PublishVideoByUrlInput {
  videoUrl: string;
  title?: string;
  privacyLevel?: string;
}
