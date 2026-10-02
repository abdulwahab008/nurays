'use client';

import { useRef, useState } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';

type Kind = 'document' | 'cover';

const ENDPOINT: Record<Kind, { url: string; field: string }> = {
  // Private: only admins (and the uploader) can open it, through short-lived links.
  document: { url: '/upload/documents', field: 'file' },
  // Public storefront photo, resized.
  cover: { url: '/upload/cover', field: 'cover' },
};

interface Props {
  kind: Kind;
  label: string;
  hint?: string;
  /** The stored reference (private:... or a public URL) once uploaded. */
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
  /** Shown instead of the empty state when a file is already on file from before. */
  onFileText?: string;
  testId?: string;
}

/**
 * Pick a photo (or PDF, for documents) and upload it straight away. The form only ever holds
 * the stored reference, never a link typed in by hand.
 */
export default function FileUploadField({ kind, label, hint, value, onChange, required, onFileText, testId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++attempt.current;
    setError(null);
    setFileName(file.name);
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append(ENDPOINT[kind].field, file);
      const res = await apiClient.post(ENDPOINT[kind].url, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (mine !== attempt.current) return;
      const data = res.data?.data;
      onChange(kind === 'document' ? data?.ref ?? data?.url ?? null : data?.url ?? null);
    } catch (err) {
      if (mine !== attempt.current) return;
      setError(apiErrorMessage(err, 'Upload failed. Please try again.'));
      setPreview(null);
      setFileName(null);
      onChange(null);
    } finally {
      if (mine === attempt.current) setUploading(false);
    }
  };

  const clear = () => {
    attempt.current++;
    setPreview(null);
    setFileName(null);
    setError(null);
    setUploading(false);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div data-testid={testId}>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      <div className={`rounded-xl border-2 border-dashed p-3 flex items-center gap-3 ${error ? 'border-rose-300 bg-rose-50' : value ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xl">{value || onFileText ? '📄' : '⬆️'}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {uploading ? 'Uploading…' : value ? fileName ?? 'Uploaded' : onFileText ?? 'No file chosen'}
          </p>
          <p className="text-xs text-slate-500">{error ?? hint ?? (kind === 'document' ? 'Photo or PDF, up to 10 MB. Only Nuray staff can see it.' : 'A photo, up to 8 MB.')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {value || onFileText ? 'Replace' : 'Choose file'}
          </button>
          {value && (
            <button type="button" onClick={clear} className="px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800">
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={kind === 'document' ? 'image/*,application/pdf' : 'image/*'}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
