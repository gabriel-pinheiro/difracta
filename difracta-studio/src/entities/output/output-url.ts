/** The Output page URL a display opens to pair with this Output. */
export function outputPageUrl(outputId: string): string {
  return `${location.origin}/output/?output=${encodeURIComponent(outputId)}`;
}
