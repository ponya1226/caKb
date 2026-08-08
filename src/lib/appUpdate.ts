const MODULE_SCRIPT_PATTERN = /<script\b[^>]*\btype=["']module["'][^>]*>/gi;
const SCRIPT_SOURCE_PATTERN = /\bsrc=["']([^"']+)["']/i;

export function findEntryScriptUrl(html: string, pageUrl: string): string | null {
  const moduleScripts = html.match(MODULE_SCRIPT_PATTERN) ?? [];

  for (const script of moduleScripts) {
    const source = script.match(SCRIPT_SOURCE_PATTERN)?.[1];
    if (source) {
      return new URL(source, pageUrl).href;
    }
  }

  return null;
}

export function hasEntryScriptChanged(currentScriptUrl: string, latestHtml: string, pageUrl: string): boolean {
  const latestScriptUrl = findEntryScriptUrl(latestHtml, pageUrl);
  return latestScriptUrl !== null && latestScriptUrl !== currentScriptUrl;
}
