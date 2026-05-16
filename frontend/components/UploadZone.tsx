'use client';

import { useRef, useState } from 'react';
import { uploadDocument } from '@/lib/api';

type Props = { onUploaded: (docId: string) => void };

export default function UploadZone({ onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const res = await uploadDocument(file);
      onUploaded(res.doc_id);
    } catch (e: any) {
      setErr(e?.message ?? '업로드 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-sm border-2 border-dashed p-10 text-center transition-all
          ${dragOver ? 'border-amber-600 bg-amber-50' : 'border-stone-300 bg-white hover:border-stone-400'}
          ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff,.webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="font-mono text-xs uppercase tracking-widest text-stone-500">
          {busy ? 'uploading...' : 'drop file or click'}
        </div>
        <div className="mt-3 text-lg font-medium text-stone-800">문서를 업로드하세요</div>
        <div className="mt-1 text-sm text-stone-500">PDF · PNG · JPG · TIFF · WEBP (최대 20MB)</div>
      </div>
      {err && (
        <div className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
