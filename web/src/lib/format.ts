export function describeDirection(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  const names = ["the right", "the upper right", "above", "the upper left", "the left", "the lower left", "below", "the lower right"];
  return names[Math.round(d / 45) % 8];
}
