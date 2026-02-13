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
  note: { platform: "note", minChars: 2000, maxChars: 5000, maxTitleLength: 100, maxTags: 10 },
  zenn: { platform: "zenn", minChars: 3000, maxChars: 10000, maxTitleLength: 70, maxTags: 5 },
  qiita: { platform: "qiita", minChars: 5000, maxChars: 15000, maxTitleLength: 36, maxTags: 5 },
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
  const options = typeof platformOrOptions === "string"
    ? ARTICLE_PLATFORM_DEFAULTS[platformOrOptions]
    : platformOrOptions;

  if (!options) {
    return { valid: false, warnings: [], errors: [{ code: "UNKNOWN_PLATFORM", message: `Unknown platform: ${platformOrOptions}` }] };
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
