function findProviderControlMarkerIndex(text) {
  if (typeof text !== "string" || !text) return -1;
  return text.search(/<\s*\|?\s*DSML\s*\|/i);
}

export function stripProviderControlText(text) {
  if (typeof text !== "string" || !text) return "";
  const markerIndex = findProviderControlMarkerIndex(text);
  if (markerIndex < 0) return text;
  return text.slice(0, markerIndex).trimEnd();
}
