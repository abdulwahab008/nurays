import { z } from 'zod';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const detectCommunityQuerySchema = z.object({ lat, lng });
export const detectCommunityBodySchema = z.object({ latitude: lat, longitude: lng });
export const setPrimaryCommunitySchema = z.object({ communityId: z.string().uuid() });
