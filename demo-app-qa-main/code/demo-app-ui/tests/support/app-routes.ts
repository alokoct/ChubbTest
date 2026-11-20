import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves whether a pathname is served by a page in the Next.js `app/` directory.
 *
 * Route groups such as `(authenticated)` do not appear in the URL, and dynamic
 * segments such as `[claimId]` match any single path segment. Used to assert that
 * in-app navigation targets real pages rather than hard-coded strings.
 */
const APP_DIR = path.resolve(__dirname, '../../app');
const PAGE_FILE_NAMES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];

const isRouteGroup = (segment: string) => segment.startsWith('(') && segment.endsWith(')');
const isDynamicSegment = (segment: string) => segment.startsWith('[') && segment.endsWith(']');

const childDirectories = (dir: string): string[] =>
  readdirSync(dir).filter((entry) => statSync(path.join(dir, entry)).isDirectory());

const hasPage = (dir: string) => PAGE_FILE_NAMES.some((file) => existsSync(path.join(dir, file)));

function matches(dir: string, remaining: string[]): boolean {
  const children = childDirectories(dir);

  // Route groups are transparent: descend without consuming a URL segment.
  if (children.filter(isRouteGroup).some((group) => matches(path.join(dir, group), remaining))) {
    return true;
  }

  if (remaining.length === 0) {
    return hasPage(dir);
  }

  const [head, ...tail] = remaining;
  return children
    .filter((child) => child === head || isDynamicSegment(child))
    .some((child) => matches(path.join(dir, child), tail));
}

export function isServedByAppRoute(urlPath: string): boolean {
  const pathname = urlPath.split(/[?#]/)[0];
  const segments = pathname.split('/').filter(Boolean);
  return matches(APP_DIR, segments);
}