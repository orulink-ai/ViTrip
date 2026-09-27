import { defaultUrlTransform } from 'react-markdown';
import { parseDeepLink } from '../shared/deep-link';
/** Keep Markdown's safe defaults; allow only our strictly validated local references. */
export function referenceUrlTransform(url: string): string {
  if (url.startsWith('vitrip://')) {
    try {
      parseDeepLink(url);
      return url;
    } catch {
      return '';
    }
  }
  return defaultUrlTransform(url);
}
