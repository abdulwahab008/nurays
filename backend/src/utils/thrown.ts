/**
 * What the code reads from a caught value, without `catch (err: any)`: Prisma's error code and the unique
 * constraint it hit, an HTTP client's status, a message. Anything that was not an object reads as empty.
 */
export interface ThrownFields {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  meta?: { target?: unknown };
}

export const thrown = (err: unknown): ThrownFields => (err !== null && typeof err === 'object' ? (err as ThrownFields) : {});

/** The thrown value's own message, or `fallback` when it has none. */
export const thrownMessage = (err: unknown, fallback: string): string => {
  const message = thrown(err).message;
  return typeof message === 'string' ? message : fallback;
};
