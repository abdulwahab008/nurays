/** The photos every rider application needs, in the order the application form asks for them. */
export const RIDER_DOCUMENT_TYPES = ['cnic_front', 'cnic_back', 'license'] as const;

export interface RiderDocumentRow {
  type: string;
  /** When the newest copy was sent; null when none is on file. */
  uploadedAt: string | null;
}

/** One row per document: the required ones always (sent or not), then anything else on file, newest copy of each. */
export function riderDocumentRows(documents: ReadonlyArray<{ type: string; uploadedAt: string }>): RiderDocumentRow[] {
  const newest = new Map<string, string>();
  for (const d of documents) {
    const seen = newest.get(d.type);
    if (!seen || Date.parse(d.uploadedAt) > Date.parse(seen)) newest.set(d.type, d.uploadedAt);
  }
  const required: string[] = [...RIDER_DOCUMENT_TYPES];
  const others = [...newest.keys()].filter((type) => !required.includes(type));
  return [...required, ...others].map((type) => ({ type, uploadedAt: newest.get(type) ?? null }));
}
