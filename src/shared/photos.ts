import { z } from 'zod';
const webURL = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  });
export const photoSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  subject: z.string().min(1).max(200),
  pageUrl: webURL,
  pageTitle: z.string().max(500),
  imageUrl: webURL,
  alt: z.string().max(1000),
  context: z.string().max(2000),
  capturedAt: z.number(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.literal('pending'),
  format: z.literal('image/png'),
});
export type TravelPhoto = z.infer<typeof photoSchema>;
export function photosForActivity(
  activity: { photoIds?: string[]; location?: { name: string } },
  photos: TravelPhoto[],
) {
  return photos.filter(
    (photo) =>
      activity.photoIds?.includes(photo.id) ||
      (activity.location &&
        photo.subject.trim().normalize('NFKC').toLocaleLowerCase() ===
          activity.location.name.trim().normalize('NFKC').toLocaleLowerCase()),
  );
}
export interface PhotoCandidate {
  ref: number;
  pageUrl: string;
  pageTitle: string;
  imageUrl: string;
  alt: string;
  context: string;
  width: number;
  height: number;
}
export type ToolResult = string | { text: string; image?: { data: string; mimeType: 'image/png' } };
