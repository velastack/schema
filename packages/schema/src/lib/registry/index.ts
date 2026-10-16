/**
 * `@velastack/schema/registry`: the schema gallery. velastack.dev lists it
 * and `vela create --schema <slug>` starts a project from an entry.
 */

export { gallery } from './schemas.js';
export { withUsers, type GallerySchema, type GallerySchemaCategory } from './define.js';

import { gallery } from './schemas.js';
import type { GallerySchema } from './define.js';

export const galleryBySlug: Record<string, GallerySchema> = Object.fromEntries(
	gallery.map((entry) => [entry.slug, entry])
);

export const CATEGORY_LABELS: Record<GallerySchema['category'], string> = {
	commerce: 'Commerce',
	bookings: 'Bookings',
	operations: 'Operations',
	content: 'Content',
	community: 'Community',
	finance: 'Finance'
};
