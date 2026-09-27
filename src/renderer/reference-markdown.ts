import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';
const sanitizer = defaultRehypePlugins.sanitize;
if (!Array.isArray(sanitizer)) throw new Error('Streamdown sanitizer configuration unavailable');
const schema = sanitizer[1] as { protocols: Record<string, string[]> };
// Extend only anchor protocols, retaining the upstream HTML and image restrictions.
export const referenceRehypePlugins: StreamdownProps['rehypePlugins'] = [
  defaultRehypePlugins.raw,
  [
    sanitizer[0],
    { ...schema, protocols: { ...schema.protocols, href: [...schema.protocols.href, 'vitrip'] } },
  ],
  defaultRehypePlugins.harden,
];
