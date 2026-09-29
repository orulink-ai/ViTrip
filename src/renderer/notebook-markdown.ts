import { notebookAssetPattern, notebookAssetSource } from '../shared/notebook-media';
import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';
import { notebookPhotoId } from '../shared/notebook-artifacts';
import { referenceUrlTransform } from './link-url';

export function notebookUrlTransform(url: string, key: string): string {
  if (key === 'src')
    return notebookAssetSource(url) || notebookPhotoId(url) || /^https?:\/\//.test(url) ? url : '';
  return referenceUrlTransform(url);
}
const sanitizer = defaultRehypePlugins.sanitize;
if (!Array.isArray(sanitizer)) throw new Error('Streamdown sanitizer configuration unavailable');
const schema = sanitizer[1] as { protocols: Record<string, string[]> };
interface Node {
  type: string;
  tagName?: string;
  properties?: { src?: unknown };
  children?: Node[];
}
// An image component is a figure. Avoid nesting block content inside a Markdown paragraph.
function localImageSources() {
  return (tree: Node) => {
    function visit(node: Node) {
      const src = node.properties?.src;
      if (node.tagName === 'img' && typeof src === 'string' && notebookAssetSource(src))
        node.properties!.src = `vitrip-asset:${notebookAssetSource(src)!.slice(7, -4)}`;
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
function imageParagraphs() {
  return (tree: Node) => {
    function visit(node: Node) {
      if (node.tagName === 'p' && node.children?.some((child) => child.tagName === 'img'))
        node.tagName = 'div';
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
export const notebookRehypePlugins: StreamdownProps['rehypePlugins'] = [
  defaultRehypePlugins.raw,
  [
    sanitizer[0],
    {
      ...schema,
      protocols: {
        ...schema.protocols,
        href: [...schema.protocols.href, 'vitrip'],
        src: [...(schema.protocols.src ?? []), 'vitrip-photo'],
      },
    },
  ],
  localImageSources,
  defaultRehypePlugins.harden,
  imageParagraphs,
];
