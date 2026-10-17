'use client';


import { ExternalLink } from '@/components/ExternalLink';
const DOCUMENT_LABELS: Record<string, string> = {
  cnic_front: 'CNIC (front)',
  cnic_back: 'CNIC (back)',
  license: 'Driving licence',
  kitchen_photo: 'Kitchen photo',
};

/** Verification documents: private files, opened through short-lived links. */
export default function DocumentList({ documents }: { documents: Array<{ id: string; type: string; url: string | null }> }) {
  if (documents.length === 0) return <p className="mt-3 text-xs text-gray-500">No documents uploaded.</p>;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="documents">
      {documents.map((d) =>
        d.url ? (
          <ExternalLink
            key={d.id}
            href={d.url}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            📄 {DOCUMENT_LABELS[d.type] ?? d.type}
          </ExternalLink>
        ) : null
      )}
    </div>
  );
}
