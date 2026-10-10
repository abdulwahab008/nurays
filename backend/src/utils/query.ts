/**
 * A query-string value as one string. Express keeps a repeated key (?x=a&x=b) as an array, which
 * would reach Prisma or String methods and throw; anything that is not a single string is ignored.
 */
export const qstr = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
