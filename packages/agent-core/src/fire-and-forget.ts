/**
 * Fire-and-forget: Promise を意図的に待たない場合に使用。
 * エラーが発生した場合は console.error でログを残す。
 */
export function fireAndForget(
  promise: Promise<unknown>,
  context?: string,
): void {
  promise.catch((error) => {
    console.error(`[FireAndForget]${context ? ` ${context}:` : ""}`, error);
  });
}
