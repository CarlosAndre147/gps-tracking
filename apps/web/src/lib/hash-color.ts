/** Hue 0–359 estável a partir de uma string (ex.: userId). */
export function stringToHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function hslFromUserId(userId: string, saturation = 70, lightness = 45): string {
  const hue = stringToHue(userId);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

/** Cor estável a partir do nome (lista lateral / avatar). */
export function hslFromName(name: string, saturation = 70, lightness = 45): string {
  const hue = stringToHue(name.trim() || " ");
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function initialFromName(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return t[0]!.toLocaleUpperCase("pt-BR");
}
