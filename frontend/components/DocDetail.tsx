'use client';

import { DocumentInfo } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  processing: 'OCR 진행 중',
  classifying: '분류 진행 중',
  indexing: '청킹·임베딩·색인 진행 중',
  ready: '준비 완료',
  error: '오류',
};

const STATUS_COLOR: Record<string, string> = {
  processing: 'bg-blue-500',
  classifying: 'bg-blue-500',
  indexing: 'bg-blue-500',
  ready: 'bg-emerald-500',
  error: 'bg-red-500',
};

export default function DocDetail({ doc }: { doc: DocumentInfo }) {
  const c = doc.classification;
  const pending = doc.status !== 'ready' && doc.status !== 'error';
  return (
    <div className="rounded-sm border border-stone-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">
          document
        </h2>
        <span className="font-mono text-[10px] text-stone-400">{doc.doc_id}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="text-base font-medium text-stone-900">{doc.filename}</div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white ${
            STATUS_COLOR[doc.status] ?? 'bg-stone-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full bg-white ${pending ? 'animate-pulse' : ''}`} />
          {STATUS_LABEL[doc.status] ?? doc.status}
        </span>
      </div>

      {doc.status === 'error' && (
        <div className="mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {doc.error || '처리 중 오류가 발생했습니다'}
        </div>
      )}

      {c && (
        <div className="mt-5 border-t border-stone-200 pt-4">
          <div className="font-mono text-xs uppercase tracking-widest text-stone-500">
            classification
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold text-amber-700">{c.category}</span>
            <span className="font-mono text-xs text-stone-500">
              confidence {(c.confidence * 100).toFixed(0)}%
            </span>
            <span className="font-mono text-[10px] text-stone-400">
              {c.category_code}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600">{c.reason}</p>
        </div>
      )}

      {doc.chunk_count != null && (
        <div className="mt-4 flex gap-6 font-mono text-xs text-stone-500">
          <span>chunks · {doc.chunk_count}</span>
          {doc.full_text_length != null && (
            <span>length · {doc.full_text_length.toLocaleString()} chars</span>
          )}
        </div>
      )}
    </div>
  );
}
