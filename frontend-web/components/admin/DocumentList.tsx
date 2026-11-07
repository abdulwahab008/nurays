'use client';

import { FileText } from 'lucide-react';
import { ExternalLink } from '@/components/ExternalLink';

const DOCUMENT_LABELS: Record<string, string> = {
  cnic_front: 'CNIC (front)',
  cnic_back: 'CNIC (back)',
  license: 'Driving licence',
  kitchen_photo: 'Kitchen photo',
};

/** Verification documents: private files, opened through short-lived links. */
export default function DocumentList({ documents }: { documents: Array<{ id: string; type: string; url: string | null }> }) {
  if (documents.length === 0) return <p className="mt-3 text-xs text-muted">No documents uploaded.</p>;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="documents">
      {documents.map((d) =>
        d.url ? (
          <ExternalLink
            key={d.id}
            href={d.url}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 rounded-lg border border-line text-xs font-medium text-ink hover:bg-raised"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {DOCUMENT_LABELS[d.type] ?? d.type}
          </ExternalLink>
        ) : null
      )}
    </div>
  );
}
