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

const STATUS_LABEL_SHORT: Record<string, string> = {
  processing: 'OCR 중',
  classifying: '분류 중',
  indexing: '색인 중',
  ready: '준비 완료',
  error: '오류',
};

export default function DocList({ docs, selectedId, onSelect, onDelete, onRefresh }: Props) {
  useEffect(() => {
    const pending = docs.some((d) => d.status !== 'ready' && d.status !== 'error');
    if (!pending) return;
    const t = setInterval(onRefresh, 1500);
    return () => clearInterval(t);
  }, [docs, onRefresh]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-4">
        <span className="font-ui text-xs font-semibold text-cool">문서</span>
        <span className="font-ui text-xs font-medium text-silver">· {docs.length}개</span>
      </div>

      {docs.length === 0 ? (
        <div className="px-5 font-ui text-[13px] text-silver">
          아직 업로드된 문서가 없습니다
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-5">
          {docs.map((d) => {
            const active = d.doc_id === selectedId;
            const indicatorCls =
              d.status === 'ready'
                ? 'bg-green-sem'
                : d.status === 'error'
                ? 'bg-red-sem'
                : 'bg-kp animate-pulse-dot';

            return (
              <div
                key={d.doc_id}
                onClick={() => onSelect(d.doc_id)}
                className={`group relative grid cursor-pointer grid-cols-[14px_1fr_auto] items-center gap-3 rounded-[10px] px-2.5 py-3 transition-colors
                  ${active ? 'bg-bg-sunken shadow-[inset_3px_0_0_#7132f5]' : 'hover:bg-bg-sunken'}`}
              >
                <span className={`ml-0.5 h-2 w-2 rounded-full ${indicatorCls}`} />
                <div className="min-w-0">
                  <div className={`truncate font-ui text-sm text-ink ${active ? 'font-semibold' : 'font-medium'}`}>
                    {d.filename}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-ui text-xs text-silver">
                    <span>{STATUS_LABEL_SHORT[d.status] ?? d.status}</span>
                    {d.classification && (
                      <span className="rounded-[5px] border border-border-main bg-white px-1.5 py-px text-[11px] font-medium text-ink">
                        {d.classification.category}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm('삭제하시겠습니까?')) return;
                    try {
                      await deleteDocument(d.doc_id);
                      onDelete(d.doc_id);
                    } catch (err) {
                      alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }}
                  className="rounded-md bg-secondary-bg px-2 py-1 font-ui text-[11px] font-medium text-cool opacity-0 transition-opacity hover:bg-red-bg hover:text-red-sem group-hover:opacity-100"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
