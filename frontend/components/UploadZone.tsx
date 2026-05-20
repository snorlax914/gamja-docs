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
    <div className="border-b border-border-soft p-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-[12px] border-[1.5px] border-dashed px-5 py-7 text-center transition-all
          ${dragOver
            ? 'border-solid border-kp bg-kp-subtle shadow-[0_0_0_4px_rgba(113,50,245,0.08)]'
            : busy
            ? 'pointer-events-none border-solid border-kp bg-white'
            : err
            ? 'border-red-sem bg-red-bg'
            : 'border-border-main bg-white hover:border-kp hover:bg-kp-tint'
          }`}
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

        <div className={`mb-2.5 font-ui text-xs font-medium ${
          dragOver ? 'font-semibold text-kp'
            : busy ? 'font-semibold text-kp'
            : err ? 'font-semibold text-red-sem'
            : 'text-silver'
        }`}>
          {dragOver ? '여기에 놓으세요' : busy ? '업로드 중...' : err ? '업로드 실패' : '파일을 드래그하거나 클릭'}
        </div>

        <div className="font-display text-[17px] font-semibold tracking-tight text-ink">
          문서를 업로드하세요
        </div>
        <div className="mt-1.5 font-ui text-xs text-silver">
          pdf · png · jpg · bmp · tiff · webp · 최대 20mb
        </div>

        {busy && (
          <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-border-soft">
            <div className="h-full animate-indeterminate rounded-full bg-kp" />
          </div>
        )}

        {err && (
          <div className="mt-2.5 rounded-lg border border-red-sem/30 bg-white px-2.5 py-2 text-left font-ui text-xs text-red-sem">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
