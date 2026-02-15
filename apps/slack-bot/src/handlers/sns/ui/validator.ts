export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

const HASHTAG_PATTERN = /#[^\s#]+/g;
const EXTERNAL_LINK_PATTERN = /https?:\/\/[^\s]+/;
const SHORTENED_URL_PATTERN = /(bit\.ly|t\.co|goo\.gl|tinyurl\.com)/i;

const NEGATIVE_WORDS = [
  "クソ",
  "ゴミ",
  "最悪",
  "死ね",
  "馬鹿",
  "バカ",
  "アホ",
  "うざい",
  "きもい",
  "消えろ",
];

function countHashtags(text: string): number {
  const matches = text.match(HASHTAG_PATTERN);
  return matches ? matches.length : 0;
}

function containsExternalLink(text: string): boolean {
  return EXTERNAL_LINK_PATTERN.test(text);
}

function containsShortenedUrl(text: string): boolean {
  return SHORTENED_URL_PATTERN.test(text);
}

function containsNegativeTone(text: string): boolean {
  return NEGATIVE_WORDS.some((word) => text.includes(word));
}

/**
 * Validate a single X post.
 * Used for standalone (non-thread) posts.
 */
export function validateXPost(text: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Error: empty text
  if (!text.trim()) {
    errors.push({
      code: "EMPTY_TEXT",
      message: "Post text is empty",
    });
  }

  // Error: exceeds 280 chars
  if (text.length > 280) {
    errors.push({
      code: "EXCEEDS_280_CHARS",
      message: `Post exceeds 280 characters (${text.length} chars)`,
    });
  }

  // Hashtag checks
  const hashtagCount = countHashtags(text);
  if (hashtagCount >= 3) {
    errors.push({
      code: "TOO_MANY_HASHTAGS",
      message: `Post contains ${hashtagCount} hashtags (3+ is spam risk)`,
    });
  } else if (hashtagCount === 2) {
    warnings.push({
      code: "EXCESSIVE_HASHTAGS",
      message: `Post contains 2 hashtags (recommended: 0-1 for optimal reach)`,
    });
  }

  // Warning: external link
  if (containsExternalLink(text)) {
    warnings.push({
      code: "CONTAINS_EXTERNAL_LINK",
      message:
        "Post contains an external link (Free=0% reach, Premium=-80%). Consider moving the link to a reply.",
    });
  }

  // Warning: shortened URL
  if (containsShortenedUrl(text)) {
    warnings.push({
      code: "CONTAINS_SHORTENED_URL",
      message:
        "Post contains a shortened URL (spam risk). Use full URLs instead.",
    });
  }

  // Warning: single post too long (over 200 chars, but within 280)
  if (text.length > 200 && text.length <= 280) {
    warnings.push({
      code: "SINGLE_POST_TOO_LONG",
      message:
        "Single post exceeds 200 characters (recommended: 100-200 chars for single posts)",
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(text)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message:
        "Post contains negative/aggressive expressions. Grok AI may suppress distribution.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate a thread (multiple posts).
 * Each post is validated individually with thread-specific rules,
 * and thread-level rules are applied.
 */
export interface ArticleValidationOptions {
  platform: "note" | "zenn" | "qiita";
  minChars: number;
  maxChars: number;
  maxTitleLength: number;
  maxTags: number;
}

const ARTICLE_PLATFORM_DEFAULTS: Record<string, ArticleValidationOptions> = {
  note: {
    platform: "note",
    minChars: 2000,
    maxChars: 5000,
    maxTitleLength: 100,
    maxTags: 10,
  },
  zenn: {
    platform: "zenn",
    minChars: 3000,
    maxChars: 10000,
    maxTitleLength: 70,
    maxTags: 5,
  },
  qiita: {
    platform: "qiita",
    minChars: 5000,
    maxChars: 15000,
    maxTitleLength: 36,
    maxTags: 5,
  },
};

/**
 * Validate an article (note, Zenn, Qiita).
 */
export function validateArticle(
  title: string,
  body: string,
  tags: Array<string | { name: string }>,
  platformOrOptions: string | ArticleValidationOptions,
): ValidationResult {
  const options =
    typeof platformOrOptions === "string"
      ? ARTICLE_PLATFORM_DEFAULTS[platformOrOptions]
      : platformOrOptions;

  if (!options) {
    return {
      valid: false,
      warnings: [],
      errors: [
        {
          code: "UNKNOWN_PLATFORM",
          message: `Unknown platform: ${platformOrOptions}`,
        },
      ],
    };
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Title checks
  if (!title.trim()) {
    errors.push({ code: "EMPTY_TITLE", message: "Article title is empty" });
  }
  if (title.length > options.maxTitleLength) {
    errors.push({
      code: "TITLE_TOO_LONG",
      message: `Title exceeds ${options.maxTitleLength} characters (${title.length} chars)`,
    });
  }

  // Body checks
  if (!body.trim()) {
    errors.push({ code: "EMPTY_BODY", message: "Article body is empty" });
  }
  if (body.length < options.minChars) {
    warnings.push({
      code: "BODY_TOO_SHORT",
      message: `Body is ${body.length} characters (recommended: ${options.minChars}+)`,
    });
  }
  if (body.length > options.maxChars) {
    warnings.push({
      code: "BODY_TOO_LONG",
      message: `Body is ${body.length} characters (recommended: under ${options.maxChars})`,
    });
  }

  // Tag checks
  if (tags.length > options.maxTags) {
    warnings.push({
      code: "TOO_MANY_TAGS",
      message: `Article has ${tags.length} tags (max: ${options.maxTags})`,
    });
  }

  // Negative tone
  if (containsNegativeTone(title) || containsNegativeTone(body)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message: "Article contains negative/aggressive expressions.",
    });
  }

  return { valid: errors.length === 0, warnings, errors };
}

export function validateThread(posts: string[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Thread-level: too many posts
  if (posts.length > 7) {
    warnings.push({
      code: "TOO_MANY_THREAD_POSTS",
      message: `Thread has ${posts.length} posts (recommended: 3-7 posts)`,
    });
  }

  // Validate each post with thread-specific rules
  for (let i = 0; i < posts.length; i++) {
    const text = posts[i];

    // Error: empty text
    if (!text.trim()) {
      errors.push({
        code: "EMPTY_TEXT",
        message: `Post ${i + 1}: text is empty`,
      });
    }

    // Error: exceeds 280 chars
    if (text.length > 280) {
      errors.push({
        code: "EXCEEDS_280_CHARS",
        message: `Post ${i + 1}: exceeds 280 characters (${text.length} chars)`,
      });
    }

    // Hashtag checks
    const hashtagCount = countHashtags(text);
    if (hashtagCount >= 3) {
      errors.push({
        code: "TOO_MANY_HASHTAGS",
        message: `Post ${i + 1}: contains ${hashtagCount} hashtags (3+ is spam risk)`,
      });
    } else if (hashtagCount === 2) {
      warnings.push({
        code: "EXCESSIVE_HASHTAGS",
        message: `Post ${i + 1}: contains 2 hashtags (recommended: 0-1 for optimal reach)`,
      });
    }

    // Warning: external link
    if (containsExternalLink(text)) {
      warnings.push({
        code: "CONTAINS_EXTERNAL_LINK",
        message: `Post ${i + 1}: contains an external link. Consider moving the link to a reply.`,
      });
    }

    // Warning: shortened URL
    if (containsShortenedUrl(text)) {
      warnings.push({
        code: "CONTAINS_SHORTENED_URL",
        message: `Post ${i + 1}: contains a shortened URL (spam risk). Use full URLs instead.`,
      });
    }

    // Warning: thread post too short (under 100 chars)
    if (text.trim().length > 0 && text.length < 100) {
      warnings.push({
        code: "THREAD_POST_TOO_SHORT",
        message: `Post ${i + 1}: under 100 characters (recommended: 200-280 chars for thread posts)`,
      });
    }

    // Warning: negative tone
    if (containsNegativeTone(text)) {
      warnings.push({
        code: "NEGATIVE_TONE_INDICATORS",
        message: `Post ${i + 1}: contains negative/aggressive expressions. Grok AI may suppress distribution.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Validate a Threads post.
 * Threads limits topic tags to 1 per post and discourages external links.
 */
export function validateThreadsPost(text: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Error: exceeds 500 chars
  if (text.length > 500) {
    errors.push({
      code: "EXCEEDS_500_CHARS",
      message: `Post exceeds 500 characters (${text.length} chars)`,
    });
  }

  // Error: external link (Threads discourages links in auto-posts)
  if (containsExternalLink(text)) {
    errors.push({
      code: "CONTAINS_EXTERNAL_LINK",
      message:
        "Post contains an external link. Threads penalizes posts with links in automated posting.",
    });
  }

  // Warning: text too short (under 100 chars)
  if (text.length < 100) {
    warnings.push({
      code: "TEXT_TOO_SHORT",
      message: `Post is ${text.length} characters (recommended: 100-300 chars)`,
    });
  }

  // Warning: text too long (over 300 chars but within 500)
  if (text.length > 300 && text.length <= 500) {
    warnings.push({
      code: "TEXT_TOO_LONG",
      message: `Post is ${text.length} characters (recommended: 100-300 chars)`,
    });
  }

  // Warning: 2+ hashtags (topic tags limited to 1 per post)
  const hashtagCount = countHashtags(text);
  if (hashtagCount >= 2) {
    warnings.push({
      code: "TOO_MANY_HASHTAGS",
      message: `Post contains ${hashtagCount} hashtags (Threads allows max 1 topic tag per post)`,
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(text)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message:
        "Post contains negative/aggressive expressions. This may reduce distribution.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate an Instagram post (image or reels).
 * Hashtag limit is 5 (as of Dec 2025). Total caption+hashtags must be under 2200 chars.
 */
export function validateInstagramPost(
  caption: string,
  hashtags: string[],
  type: "image" | "reels",
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const captionLimits =
    type === "image" ? { min: 200, max: 500 } : { min: 100, max: 300 };

  // Error: hashtags exceed 5
  if (hashtags.length > 5) {
    errors.push({
      code: "TOO_MANY_HASHTAGS",
      message: `Post has ${hashtags.length} hashtags (max: 5 since Dec 2025)`,
    });
  }

  // Error: combined caption+hashtags exceed 2200 chars
  const combined = caption + " " + hashtags.join(" ");
  if (combined.length > 2200) {
    errors.push({
      code: "EXCEEDS_2200_CHARS",
      message: `Caption + hashtags total ${combined.length} characters (max: 2200)`,
    });
  }

  // Warning: caption too short
  if (caption.length < captionLimits.min) {
    warnings.push({
      code: "CAPTION_TOO_SHORT",
      message: `Caption is ${caption.length} characters (recommended: ${captionLimits.min}-${captionLimits.max} for ${type})`,
    });
  }

  // Warning: caption too long
  if (caption.length > captionLimits.max) {
    warnings.push({
      code: "CAPTION_TOO_LONG",
      message: `Caption is ${caption.length} characters (recommended: ${captionLimits.min}-${captionLimits.max} for ${type})`,
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(caption)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message:
        "Caption contains negative/aggressive expressions. This may reduce distribution.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate TikTok video metadata.
 * Description max 2200 chars, hashtags max 5, duration 15-180 seconds recommended.
 */
export function validateTikTokMeta(
  description: string,
  hashtags: string[],
  duration: number,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Error: description exceeds 2200 chars
  if (description.length > 2200) {
    errors.push({
      code: "DESCRIPTION_TOO_LONG",
      message: `Description exceeds 2200 characters (${description.length} chars)`,
    });
  }

  // Warning: hashtags exceed 5
  if (hashtags.length > 5) {
    warnings.push({
      code: "TOO_MANY_HASHTAGS",
      message: `Video has ${hashtags.length} hashtags (recommended: max 5)`,
    });
  }

  // Warning: duration too short
  if (duration < 15) {
    warnings.push({
      code: "DURATION_TOO_SHORT",
      message: `Duration is ${duration}s (recommended: 15-180 seconds)`,
    });
  }

  // Warning: duration too long
  if (duration > 180) {
    warnings.push({
      code: "DURATION_TOO_LONG",
      message: `Duration is ${duration}s (recommended: 15-180 seconds)`,
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(description)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message:
        "Description contains negative/aggressive expressions. This may reduce distribution.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate YouTube video metadata.
 * Title max 100 chars (40-60 recommended), description max 5000 chars,
 * tags total chars max 500 (10-15 tags recommended).
 */
export function validateYouTubeMeta(
  title: string,
  description: string,
  tags: string[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Error: title exceeds 100 chars
  if (title.length > 100) {
    errors.push({
      code: "TITLE_TOO_LONG",
      message: `Title exceeds 100 characters (${title.length} chars)`,
    });
  }

  // Error: description exceeds 5000 chars
  if (description.length > 5000) {
    errors.push({
      code: "DESCRIPTION_TOO_LONG",
      message: `Description exceeds 5000 characters (${description.length} chars)`,
    });
  }

  // Error: total tag chars exceed 500
  const totalTagChars = tags.join("").length;
  if (totalTagChars > 500) {
    errors.push({
      code: "TAGS_TOTAL_TOO_LONG",
      message: `Total tag characters exceed 500 (${totalTagChars} chars)`,
    });
  }

  // Warning: title too short (under 40 chars)
  if (title.length < 40 && title.length <= 100) {
    warnings.push({
      code: "TITLE_TOO_SHORT",
      message: `Title is ${title.length} characters (recommended: 40-60 chars)`,
    });
  }

  // Warning: title too long (over 60 chars but within 100)
  if (title.length > 60 && title.length <= 100) {
    warnings.push({
      code: "TITLE_LENGTH_WARNING",
      message: `Title is ${title.length} characters (recommended: 40-60 chars)`,
    });
  }

  // Warning: too few tags (under 10)
  if (tags.length < 10) {
    warnings.push({
      code: "TOO_FEW_TAGS",
      message: `Video has ${tags.length} tags (recommended: 10-15)`,
    });
  }

  // Warning: too many tags (over 15)
  if (tags.length > 15) {
    warnings.push({
      code: "TOO_MANY_TAGS",
      message: `Video has ${tags.length} tags (recommended: 10-15)`,
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(title) || containsNegativeTone(description)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message:
        "Content contains negative/aggressive expressions. This may reduce distribution.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate podcast episode metadata.
 * Title max 40 chars (warning), description 200-400 recommended,
 * duration 15-30 minutes recommended.
 */
export function validatePodcastEpisode(
  title: string,
  description: string,
  duration: number,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Warning: title too long (over 40 chars)
  if (title.length > 40) {
    warnings.push({
      code: "TITLE_TOO_LONG",
      message: `Title is ${title.length} characters (recommended: max 40 chars)`,
    });
  }

  // Warning: description too short
  if (description.length < 200) {
    warnings.push({
      code: "DESCRIPTION_TOO_SHORT",
      message: `Description is ${description.length} characters (recommended: 200-400 chars)`,
    });
  }

  // Warning: description too long
  if (description.length > 400) {
    warnings.push({
      code: "DESCRIPTION_TOO_LONG",
      message: `Description is ${description.length} characters (recommended: 200-400 chars)`,
    });
  }

  // Warning: duration too short (under 15 minutes)
  if (duration < 15) {
    warnings.push({
      code: "DURATION_TOO_SHORT",
      message: `Duration is ${duration} minutes (recommended: 15-30 minutes)`,
    });
  }

  // Warning: duration too long (over 30 minutes)
  if (duration > 30) {
    warnings.push({
      code: "DURATION_TOO_LONG",
      message: `Duration is ${duration} minutes (recommended: 15-30 minutes)`,
    });
  }

  // Warning: negative tone
  if (containsNegativeTone(title) || containsNegativeTone(description)) {
    warnings.push({
      code: "NEGATIVE_TONE_INDICATORS",
      message: "Content contains negative/aggressive expressions.",
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate GitHub repository metadata.
 * Name should be kebab-case, description max 350 chars,
 * topics 5-10 recommended.
 */
export function validateGitHubRepo(
  name: string,
  description: string,
  topics: string[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Error: description exceeds 350 chars
  if (description.length > 350) {
    errors.push({
      code: "DESCRIPTION_TOO_LONG",
      message: `Description exceeds 350 characters (${description.length} chars)`,
    });
  }

  // Warning: name not kebab-case
  if (!KEBAB_CASE_PATTERN.test(name)) {
    warnings.push({
      code: "NAME_NOT_KEBAB_CASE",
      message: `Repository name "${name}" is not kebab-case (expected: lowercase with hyphens)`,
    });
  }

  // Warning: too few topics (under 5)
  if (topics.length < 5) {
    warnings.push({
      code: "TOO_FEW_TOPICS",
      message: `Repository has ${topics.length} topics (recommended: 5-10)`,
    });
  }

  // Warning: too many topics (over 10)
  if (topics.length > 10) {
    warnings.push({
      code: "TOO_MANY_TOPICS",
      message: `Repository has ${topics.length} topics (recommended: 5-10)`,
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
