const DAY_CATEGORIES = [
  "discussion", // 日
  "tips", // 月
  "news", // 火
  "experience", // 水
  "code", // 木
  "summary", // 金
  "tips", // 土
];

export function getCategoryForDay(dayOfWeek: number): string {
  return DAY_CATEGORIES[dayOfWeek] || "tips";
}

/**
 * 1日に複数投稿する場合のカテゴリリストを返す。
 * primary カテゴリ + 曜日ベースでローテーションした補助カテゴリ。
 */
export function getCategoriesForDay(
  dayOfWeek: number,
  count: number,
): string[] {
  const primary = DAY_CATEGORIES[dayOfWeek] || "tips";
  if (count <= 1) return [primary];
  const allCategories = [
    "discussion",
    "tips",
    "news",
    "experience",
    "code",
    "summary",
  ];
  const remaining = allCategories.filter((c) => c !== primary);
  const result = [primary];
  for (let i = 0; result.length < count && i < remaining.length; i++) {
    result.push(remaining[(dayOfWeek + i) % remaining.length]);
  }
  return result;
}

/**
 * 曜日に基づいて YouTube 動画フォーマットを返す。
 * 土日 = short（Shorts）、その他 = standard
 */
export function getYouTubeFormat(dayOfWeek: number): "standard" | "short" {
  if (dayOfWeek === 0 || dayOfWeek === 6) return "short";
  return "standard";
}

export function getPlatformLabel(platform: string): string {
  switch (platform) {
    case "x":
      return "X";
    case "qiita":
      return "Qiita";
    case "zenn":
      return "Zenn";
    case "note":
      return "note";
    case "youtube":
      return "YouTube";
    case "threads":
      return "Threads";
    case "tiktok":
      return "TikTok";
    case "github":
      return "GitHub";
    case "instagram":
      return "Instagram";
    case "podcast":
      return "Podcast";
    default:
      return platform;
  }
}
