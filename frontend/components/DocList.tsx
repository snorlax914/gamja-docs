'use client';

import { useEffect } from 'react';
import { DocumentInfo, deleteDocument } from '@/lib/api';

type Props = {
  docs: DocumentInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  processing: '처리 중 · OCR',
  classifying: '처리 중 · 분류',
  indexing: '처리 중 · 색인',
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

export default function DocList({ docs, selectedId, onSelect, onDelete, onRefresh }: Props) {
  // 처리 중인 문서가 있으면 폴링
  useEffect(() => {
    const pending = docs.some((d) => d.status !== 'ready' && d.status !== 'error');
    if (!pending) return;
    const t = setInterval(onRefresh, 1500);
    return () => clearInterval(t);
  }, [docs, onRefresh]);

  if (docs.length === 0) {
    return (
      <div className="px-4 py-8 text-center font-mono text-xs uppercase tracking-widest text-stone-400">
        no documents yet
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-200">
      {docs.map((d) => {
        const active = d.doc_id === selectedId;
        return (
          <li key={d.doc_id} className="group relative">
            <button
              onClick={() => onSelect(d.doc_id)}
              className={`flex w-full items-start gap-3 px-4 py-3 pr-10 text-left transition-colors
                ${active ? 'bg-amber-50' : 'hover:bg-stone-100'}`}
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_COLOR[d.status] ?? 'bg-stone-400'} ${
                  d.status !== 'ready' && d.status !== 'error' ? 'animate-pulse' : ''
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-800">{d.filename}</div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">
                  <span>{STATUS_LABEL[d.status] ?? d.status}</span>
                  {d.classification && (
                    <>
                      <span>·</span>
                      <span className="text-amber-700">{d.classification.category}</span>
                    </>
                  )}
                </div>
              </div>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (confirm('삭제하시겠습니까?')) {
                  await deleteDocument(d.doc_id);
                  onDelete(d.doc_id);
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="delete"
            >
              <span className="font-mono text-xs text-stone-400 hover:text-red-600">×</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
