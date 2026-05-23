const MAX_TITLE_LENGTH = 120;

export function truncateTitle(title: string, maxLength = MAX_TITLE_LENGTH): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1) + "\u2026";
}
