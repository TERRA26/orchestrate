/**
 * Generates a random 6-digit hex color string.
 *
 * @returns A color string in the format `#RRGGBB`, e.g. `#3a9f2c`.
 */
export function generateRandomHexColor(): string {
  const value = Math.floor(Math.random() * 0xffffff);
  return `#${value.toString(16).padStart(6, "0")}`;
}
