'use client';

import { useRef, useState, useEffect } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { defineMessages, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { joinMessages } from '@/lib/i18n/messages/join';
import { nativePlatform, type NativeWindow } from '@/lib/native-shell';
import { Camera, FileCheck2, FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Kind = 'document' | 'cover';

const cameraMessages = defineMessages({
  en: { takePhoto: 'Take photo' },
  ur: { takePhoto: 'تصویر کھینچیں' },
});

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
  const t = useT(joinMessages);
  const tc = useT(commonMessages);
  const tcam = useT(cameraMessages);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Android's web view only opens the camera for an input with a capture attribute, so the app gets a
  // second button for it. Browsers and the iPhone app already offer the camera in the normal picker.
  const [canCapture, setCanCapture] = useState(false);
  useEffect(() => {
    setCanCapture(nativePlatform(window as unknown as NativeWindow) === 'android');
  }, []);
  const [preview, setPreview] = useState<string | null>(null);
  // A preview is a blob: URL the browser keeps in memory until it is released.
  useEffect(
    () => () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview]
  );
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
      setError(apiErrorMessage(err, t('upload.failed')));
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
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const hasFile = !!(value || onFileText);
  const Icon = uploading ? Loader2 : value ? FileCheck2 : onFileText ? FileText : Upload;

  return (
    <div data-testid={testId}>
      <label className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      <div
        className={`flex items-center gap-3 rounded-xl border p-3 ${
          error ? 'border-red-700 bg-red-50' : value ? 'border-brand-600 bg-brand-soft' : 'border-dashed border-line-strong bg-surface'
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
            <Icon className={`h-5 w-5 ${uploading ? 'animate-spin' : ''} ${value ? 'text-brand-ink' : ''}`} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {uploading ? t('upload.uploading') : value ? fileName ?? t('upload.uploaded') : onFileText ?? t('upload.noFile')}
          </p>
          <p className={`text-sm ${error ? 'text-red-700' : 'text-muted'}`}>
            {error ?? hint ?? (kind === 'document' ? t('upload.docHint') : t('upload.coverHint'))}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canCapture && (
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading}>
              <Camera className="h-4 w-4" aria-hidden />
              {tcam('takePhoto')}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {hasFile ? t('upload.replace') : t('upload.choose')}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={clear} className="px-2 text-muted hover:bg-raised hover:text-ink">
              {tc('remove')}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={kind === 'document' ? 'image/*,application/pdf' : 'image/*'}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {canCapture && (
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        )}
      </div>
    </div>
  );
}
