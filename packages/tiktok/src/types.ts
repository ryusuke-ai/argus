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
  status: string;
  publishId: string;
  failReason?: string;
  publicPostId?: number[];
  error?: string;
}

export interface TiktokCreatorInfo {
  creatorAvatarUrl: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface DirectPostInput {
  videoUrl: string;
  title?: string;
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  isAigc?: boolean;
}

export interface PublishVideoByUrlInput {
  videoUrl: string;
  title?: string;
  privacyLevel?: string;
}
