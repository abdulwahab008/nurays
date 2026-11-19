/**
 * What the code reads from a caught value, without `catch (err: any)`: Prisma's error code and the unique
 * constraint it hit, an HTTP client's status, a message. Anything that was not an object reads as empty.
 */
export interface ThrownFields {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  meta?: { target?: unknown; driverAdapterError?: { cause?: DriverCause } };
}

/** What PostgreSQL said, as Prisma 7's driver adapter passes it on in `meta.driverAdapterError.cause`. */
interface DriverCause {
  code?: unknown;
  originalCode?: unknown;
  constraint?: { index?: unknown; fields?: unknown };
}

export const thrown = (err: unknown): ThrownFields => (err !== null && typeof err === 'object' ? (err as ThrownFields) : {});

/**
 * The unique constraint a P2002 hit, as text to test against (an index name such as `orders_order_number_key`, or the
 * fields). Prisma 7 names it in the driver adapter's cause; `meta.target` is where older clients put it.
 */
export const uniqueTarget = (err: unknown): string => {
  const meta = thrown(err).meta;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  return [meta?.target, constraint?.index, constraint?.fields].flat().filter((v) => v != null).map(String).join(' ');
};

/** The PostgreSQL SQLSTATE behind a Prisma error (57014 for a cancelled statement), when there is one. */
export const sqlState = (err: unknown): string | undefined => {
  const cause = thrown(err).meta?.driverAdapterError?.cause;
  const code = cause?.originalCode ?? cause?.code;
  return typeof code === 'string' ? code : undefined;
};

/** The thrown value's own message, or `fallback` when it has none. */
export const thrownMessage = (err: unknown, fallback: string): string => {
  const message = thrown(err).message;
  return typeof message === 'string' ? message : fallback;
};
