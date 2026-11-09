'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { errorMessage, uploadPublicImage } from '@/lib/api';
import { Button } from '@/components/ui/button';

const IMAGE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Uploads an image from the user's device to a PUBLIC blob (avatars or
 * service media) and hands the permanent CDN URL to `onChange`. Pasting a
 * URL remains available wherever a URL input sits beside this control.
 */
export function ImageUploadField({
  kind,
  value,
  onChange,
  hint,
  className,
}: {
  kind: 'avatar' | 'service-image';
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Unsupported image type', { description: 'Use PNG, JPEG or WebP.' });
      return;
    }
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      toast.error('Image too large', { description: 'Maximum 2 MB.' });
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadPublicImage(file, kind);
      onChange(url);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error('Upload failed', { description: errorMessage(err) });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded URL */}
            <img src={value} alt="" className="h-12 w-12 rounded-lg border border-primary/15 object-cover shadow-soft" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/25 bg-gradient-to-br from-primary/8 to-brand-fuchsia/5">
            <ImagePlus className="h-5 w-5 text-primary/50" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          {uploading ? 'Uploading…' : 'Upload image'}
        </Button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
