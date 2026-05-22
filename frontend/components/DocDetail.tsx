'use client';

import { DocumentInfo } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  processing: 'OCR 진행 중',
  classifying: '분류 진행 중',
  indexing: '청킹·임베딩·색인 진행 중',
  ready: '준비 완료',
  error: '오류',
};

function StatusBadge({ status }: { status: string }) {
  const dotCls =
    status === 'ready'
      ? 'bg-green-sem'
      : status === 'error'
      ? 'bg-red-sem'
      : 'bg-kp animate-pulse-dot';

  const badgeCls =
    status === 'error'
      ? 'border-red-sem/25 text-red-dark'
      : 'border-border-main text-ink';

  return (
    <span className={`inline-flex items-center gap-[7px] rounded-lg border bg-white px-2.5 py-1 font-ui text-[13px] font-medium shadow-whisper ${badgeCls}`}>
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${dotCls}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function DocDetail({ doc }: { doc: DocumentInfo }) {
  const c = doc.classification;

  return (
    <section className="border-b border-border-main bg-white px-10 pb-7 pt-8">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-ui text-xs font-semibold text-cool">문서</span>
        <span className="rounded-lg bg-secondary-bg px-2.5 py-1 font-mono text-xs font-medium text-cool">
          {doc.doc_id}
        </span>
      </div>

      <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-ink">
        {doc.filename}
      </h1>

      <div className="mt-3.5">
        <StatusBadge status={doc.status} />
      </div>

      {doc.status === 'error' && doc.error && (
        <div className="mt-3.5 rounded-[12px] border border-red-sem/20 bg-red-bg px-3.5 py-3 font-ui text-[13px] text-red-dark">
          {doc.error}
        </div>
      )}

      {(c || doc.chunk_count != null) && (
        <div className="mt-5 flex flex-wrap gap-8 border-t border-border-soft pt-[18px]">
          {c && (
            <>
              <div>
                <div className="mb-1.5 font-ui text-xs font-medium text-silver">카테고리</div>
                <div className="flex items-baseline gap-2.5">
                  <span className="inline-block rounded-lg border border-border-main bg-white px-3 py-1 font-display text-base font-semibold text-ink shadow-whisper">
                    {c.category}
                  </span>
                  <span className="font-ui text-sm font-medium text-silver">
                    {(c.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              {c.category_code && (
                <div>
                  <div className="mb-1.5 font-ui text-xs font-medium text-silver">분류 코드</div>
                  <div className="font-display text-[22px] font-semibold tracking-tight text-ink">
                    {c.category_code}
                  </div>
                </div>
              )}
            </>
          )}
          {doc.chunk_count != null && (
            <>
              <div>
                <div className="mb-1.5 font-ui text-xs font-medium text-silver">청크 수</div>
                <div className="font-display text-[22px] font-semibold tracking-tight text-ink">
                  {doc.chunk_count}
                </div>
              </div>
              {doc.full_text_length != null && (
                <div>
                  <div className="mb-1.5 font-ui text-xs font-medium text-silver">전체 텍스트</div>
                  <div className="font-display text-[22px] font-semibold tracking-tight text-ink">
                    {doc.full_text_length.toLocaleString()}
                    <span className="ml-2.5 text-sm font-medium text-silver">자</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {c?.reason && (
        <div className="mt-[18px] rounded-[10px] border border-border-soft bg-bg-sunken px-4 py-3.5 text-sm leading-relaxed text-ink">
          <div className="mb-1.5 font-ui text-[11px] font-semibold uppercase tracking-wider text-silver">
            분류 사유
          </div>
          {c.reason}
        </div>
      )}
    </section>
  );
}
