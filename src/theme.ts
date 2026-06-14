export const COLOR_THEMES = [
  "dark",
  "light",
  "red-dark",
  "red-light",
  "blue-dark",
  "blue-light",
  "green-dark",
  "green-light"
] as const;

export type ColorThemeName = (typeof COLOR_THEMES)[number];

const COLOR_THEME_SET: ReadonlySet<string> = new Set(COLOR_THEMES);
const LEGACY_COLOR_THEME_ALIASES: Record<string, ColorThemeName> = {
  black: "light",
  white: "dark",
  blue: "blue-light",
  green: "green-light",
  red: "red-light",
  yellow: "light"
};
const REMOVABLE_COLOR_CLASSES = [...COLOR_THEMES, ...Object.keys(LEGACY_COLOR_THEME_ALIASES)];

export interface ApplyColorThemeOptions {
  defaultTheme?: ColorThemeName;
  target?: HTMLElement;
}

export interface ApplyColorThemeFromQueryOptions extends ApplyColorThemeOptions {
  paramName?: string;
}

export function normalizeColorTheme(
  value: string | null | undefined,
  fallback: ColorThemeName = "light"
): ColorThemeName {
  if (!value) {
    return fallback;
  }

  if (COLOR_THEME_SET.has(value)) {
    return value as ColorThemeName;
  }

  return LEGACY_COLOR_THEME_ALIASES[value] ?? fallback;
}

export function applyColorTheme(
  value: string | null | undefined,
  options: ApplyColorThemeOptions = {}
): ColorThemeName {
  const theme = normalizeColorTheme(value, options.defaultTheme);
  const target = options.target ?? globalThis.document?.body;

  target?.classList.remove(...REMOVABLE_COLOR_CLASSES);
  target?.classList.add(theme);

  return theme;
}

export function applyColorThemeFromQuery(
  options: ApplyColorThemeFromQueryOptions = {}
): ColorThemeName {
  const { paramName = "color" } = options;
  const value =
    typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get(paramName);

  return applyColorTheme(value, options);
}
