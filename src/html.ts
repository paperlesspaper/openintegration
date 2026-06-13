export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function attrs(input: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => {
      if (value === true) {
        return escapeHtml(key);
      }

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .join(" ");
}
