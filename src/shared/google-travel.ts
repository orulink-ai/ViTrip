import { z } from 'zod';

const place = z.string().trim().min(1).max(500);
export const googleSearchSchema = z.object({ query: place }).strict();
export const googleMapsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('search'), query: place }).strict(),
  z
    .object({
      action: z.literal('directions'),
      origin: place,
      destination: place,
      travelmode: z.enum(['driving', 'walking', 'transit', 'bicycling', 'two-wheeler']).optional(),
    })
    .strict(),
]);

export function googleSearchURL(input: z.input<typeof googleSearchSchema>) {
  const { query } = googleSearchSchema.parse(input);
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.href;
}

/** Official Maps URLs open the real website without a Google API key. */
export function googleMapsURL(input: z.input<typeof googleMapsSchema>) {
  const args = googleMapsSchema.parse(input);
  const url = new URL(
    `https://www.google.com/maps/${args.action === 'search' ? 'search' : 'dir'}/`,
  );
  url.searchParams.set('api', '1');
  if (args.action === 'search') url.searchParams.set('query', args.query);
  else {
    url.searchParams.set('origin', args.origin);
    url.searchParams.set('destination', args.destination);
    if (args.travelmode) url.searchParams.set('travelmode', args.travelmode);
  }
  if (url.href.length > 2048) throw new Error('Google Maps 网址超过 2048 字符，请缩短地点或查询。');
  return url.href;
}
