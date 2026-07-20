// Pure resolution logic for go-links. No chrome.* APIs so it can be unit-tested
// in Node and imported by the service worker.

/** Lowercase + trim a shortcut name for case-insensitive matching. */
export function normalizeName(name) {
  return String(name == null ? '' : name).trim().toLowerCase();
}

/** Pull the URL string out of a stored entry (string or {url}). */
export function entryUrl(entry) {
  if (!entry) return '';
  return typeof entry === 'string' ? entry : (entry.url || '');
}

/**
 * Parse free text (omnibox input or a go URL path) into a command and the
 * remaining arguments. The command is the first segment; everything after the
 * first slash or whitespace is the rest.
 *   "calendar"          -> { command: "calendar", rest: "" }
 *   "gh copilot cli"    -> { command: "gh", rest: "copilot cli" }
 *   "gh/copilot/cli"    -> { command: "gh", rest: "copilot/cli" }
 */
export function parseInput(input) {
  const text = String(input == null ? '' : input).trim().replace(/^\/+/, '');
  if (!text) return { command: '', rest: '' };
  const m = text.match(/^([^\s/]+)[\s/]+([\s\S]*)$/);
  if (m) return { command: m[1], rest: m[2].trim() };
  return { command: text, rest: '' };
}

/**
 * Parse a full URL whose host is `go` (e.g. http://go/gh/copilot) into
 * { command, rest }. Returns null if the URL is not a go-link.
 */
export function parseGoUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== 'go') return null;
  let path = u.pathname.replace(/^\/+/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw path if it is not valid percent-encoding */
  }
  const parsed = parseInput(path);
  // Preserve a typed query string as args when there is no path-based rest.
  if (!parsed.rest && u.search) {
    parsed.rest = u.search.replace(/^\?/, '');
  }
  return parsed;
}

/** Append extra path segments to a base URL, preserving its existing path. */
function appendPath(url, rest) {
  const extra = rest.replace(/^\/+/, '');
  try {
    const u = new URL(url);
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    u.pathname += extra;
    return u.toString();
  } catch {
    return url.replace(/\/+$/, '') + '/' + extra;
  }
}

/**
 * Resolve a command + rest against a shortcuts map to a destination URL.
 * - Lookup is case-insensitive.
 * - If the target URL contains `%s`, the rest is URL-encoded and substituted.
 * - Otherwise any rest is appended as a path segment.
 * Returns the destination URL string, or null when the command is unknown.
 */
export function resolve(command, rest, shortcuts) {
  const name = normalizeName(command);
  if (!name || !shortcuts) return null;
  const url = entryUrl(shortcuts[name]);
  if (!url) return null;
  if (url.includes('%s')) {
    return url.replace(/%s/g, encodeURIComponent(rest || ''));
  }
  if (rest) return appendPath(url, rest);
  return url;
}

/** Convenience: resolve directly from omnibox-style text. */
export function resolveText(text, shortcuts) {
  const { command, rest } = parseInput(text);
  return { command, rest, url: resolve(command, rest, shortcuts) };
}

/** Convenience: resolve directly from a go:// URL. */
export function resolveUrl(rawUrl, shortcuts) {
  const parsed = parseGoUrl(rawUrl);
  if (!parsed) return { command: '', rest: '', url: null };
  return { ...parsed, url: resolve(parsed.command, parsed.rest, shortcuts) };
}
