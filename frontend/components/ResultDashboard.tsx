'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ChunkInfo,
  DocumentInfo,
  getDocumentChunks,
  getDocumentMarkdown,
} from '@/lib/api';

type Tab = 'markdown' | 'chunks';

const STAGES = [
  { key: 'ocr', name: 'OCR' },
  { key: 'classify', name: '분류' },
  { key: 'index', name: '청킹·임베딩' },
  { key: 'done', name: '완료' },
];

const STAGE_ORDER: Record<string, number> = {
  processing: 0,
  classifying: 1,
  indexing: 2,
  ready: 3,
  error: -1,
};

export default function ResultDashboard({ doc }: { doc: DocumentInfo }) {
  const [tab, setTab] = useState<Tab>('markdown');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[] | null>(null);
  const [chunkMeta, setChunkMeta] = useState<{ size: number; overlap: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = doc.status === 'ready';

  useEffect(() => {
    if (!ready) {
      setMarkdown(null);
      setChunks(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [md, ch] = await Promise.all([
          getDocumentMarkdown(doc.doc_id),
          getDocumentChunks(doc.doc_id),
        ]);
        if (cancelled) return;
        setMarkdown(md.markdown);
        setChunks(ch.chunks);
        setChunkMeta({ size: ch.chunk_size, overlap: ch.chunk_overlap });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [doc.doc_id, ready]);

  return (
    <section className="px-10 py-7 bg-bg-sunken">
      <div className="mb-[18px] flex items-baseline justify-between">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">결과 대시보드</h3>
        <span className="font-ui text-xs font-semibold text-cool">파이프라인</span>
      </div>

      <Pipeline status={doc.status} />

      <div className="overflow-hidden rounded-2xl border border-border-main bg-white shadow-subtle">
        {!ready ? (
          <div className="flex items-center justify-center py-[60px] text-center">
            <div className="flex items-center gap-2.5 font-ui text-sm text-silver">
              <span className="inline-block h-2.5 w-2.5 animate-pulse-dot rounded-full bg-kp" />
              처리 중... 결과가 준비되면 표시됩니다
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-[60px] text-center">
            <div className="flex items-center gap-2.5 font-ui text-sm text-silver">
              <span className="inline-block h-2.5 w-2.5 animate-pulse-dot rounded-full bg-kp" />
              결과 불러오는 중...
            </div>
          </div>
        ) : err ? (
          <div className="p-5">
            <div className="rounded-[12px] border border-red-sem/20 bg-red-bg px-3.5 py-3 text-sm text-red-dark">
              {err}
            </div>
          </div>
        ) : (
          <>
            {/* Tabs bar */}
            <div className="flex items-center border-b border-border-soft bg-white px-2 pt-1.5">
              <button
                onClick={() => setTab('markdown')}
                className={`mb-[-1px] border-b-2 px-4 py-2.5 font-ui text-sm font-medium transition ${
                  tab === 'markdown'
                    ? 'border-kp font-semibold text-kp'
                    : 'border-transparent text-cool hover:text-ink'
                }`}
              >
                마크다운 원문
              </button>
              <button
                onClick={() => setTab('chunks')}
                className={`mb-[-1px] border-b-2 px-4 py-2.5 font-ui text-sm font-medium transition ${
                  tab === 'chunks'
                    ? 'border-kp font-semibold text-kp'
                    : 'border-transparent text-cool hover:text-ink'
                }`}
              >
                청크 · {chunks?.length || 0}개
              </button>
              {chunkMeta && (
                <span className="ml-auto pr-3.5 font-ui text-xs font-medium text-silver">
                  chunk_size {chunkMeta.size} · overlap {chunkMeta.overlap}
                </span>
              )}
            </div>

            {/* Tab content */}
            <div className="p-5">
              {tab === 'markdown' && <MarkdownView text={markdown ?? ''} />}
              {tab === 'chunks' && <ChunkList chunks={chunks ?? []} />}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Pipeline({ status }: { status: string }) {
  const isError = status === 'error';
  const isReady = status === 'ready';
  const cur = STAGE_ORDER[status] ?? -1;

  return (
    <>
      <div className="mb-6 grid grid-cols-4 gap-3">
        {STAGES.map((s, i) => {
          let cls = 'border-border-main bg-white shadow-whisper';
          let statusText = '대기';
          let nameBefore: ReactNode = null;

          if (isError && i === 0) {
            cls = 'border-red-sem/40 bg-white';
            statusText = '실패';
            nameBefore = <span className="font-bold text-red-sem">✕</span>;
          } else if (isError) {
            statusText = '—';
          } else if (isReady) {
            cls = 'border-green-sem/30 bg-white';
            statusText = '완료';
            nameBefore = <span className="font-bold text-green-sem">✓</span>;
          } else if (i < cur) {
            cls = 'border-green-sem/30 bg-white';
            statusText = '완료';
            nameBefore = <span className="font-bold text-green-sem">✓</span>;
          } else if (i === cur) {
            cls = 'border-kp bg-white shadow-[0_0_0_3px_rgba(113,50,245,0.10)]';
            statusText = '진행 중';
            nameBefore = <span className="inline-block h-[9px] w-[9px] animate-pulse-dot rounded-full bg-kp" />;
          }

          return (
            <div key={s.key} className={`flex flex-col gap-2 rounded-[12px] border p-4 ${cls}`}>
              <div className="font-ui text-[11px] font-semibold uppercase tracking-wide text-silver">
                {i + 1}단계
              </div>
              <div className={`flex items-center gap-2 font-display text-base font-semibold tracking-tight ${
                i > cur && !isReady ? 'text-silver' : 'text-ink'
              }`}>
                {nameBefore}
                {s.name}
              </div>
              <div className={`font-ui text-xs font-medium ${
                isError && i === 0 ? 'font-semibold text-red-dark'
                  : (i <= cur || isReady) ? 'text-cool' : 'text-silver'
              }`}>
                {statusText}
              </div>
            </div>
          );
        })}
      </div>
      {isError && (
        <div className="-mt-3 mb-[18px] font-ui text-[13px] font-medium text-red-dark">
          ▲ 파이프라인 실패 — 첫 단계에서 오류 발생
        </div>
      )}
    </>
  );
}

function MarkdownView({ text }: { text: string }) {
  const [raw, setRaw] = useState(false);
  if (!text)
    return <div className="font-ui text-[13px] text-silver">(원문이 비어 있습니다)</div>;

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-ui text-[13px] font-medium text-cool">
          {text.length.toLocaleString()}자
        </div>
        <div className="inline-flex gap-0.5 rounded-[10px] border border-border-main bg-bg-sunken p-[3px]">
          <button
            onClick={() => setRaw(true)}
            className={`rounded-lg px-3.5 py-1.5 font-ui text-xs font-medium transition ${
              raw ? 'bg-white font-semibold text-ink shadow-whisper' : 'text-cool'
            }`}
          >
            원본
          </button>
          <button
            onClick={() => setRaw(false)}
            className={`rounded-lg px-3.5 py-1.5 font-ui text-xs font-medium transition ${
              !raw ? 'bg-white font-semibold text-ink shadow-whisper' : 'text-cool'
            }`}
          >
            렌더링
          </button>
        </div>
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-[10px] border border-border-soft bg-white p-5 text-sm leading-relaxed text-ink">
        {raw ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-ink">
            {text}
          </pre>
        ) : (
          <article>{renderMarkdown(text)}</article>
        )}
      </div>
    </div>
  );
}

function ChunkList({ chunks }: { chunks: ChunkInfo[] }) {
  const totalChars = useMemo(() => chunks.reduce((s, c) => s + c.length, 0), [chunks]);
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    const next = new Set(openSet);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setOpenSet(next);
  };

  if (chunks.length === 0)
    return <div className="font-ui text-[13px] text-silver">(청크가 없습니다)</div>;

  return (
    <div>
      <div className="mb-3.5 flex gap-6 rounded-[12px] bg-bg-sunken px-[18px] py-3.5 font-ui text-[13px] text-cool">
        <span>청크 <b className="font-display font-bold text-ink">{chunks.length}</b>개</span>
        <span>평균 <b className="font-display font-bold text-ink">{Math.round(totalChars / chunks.length)}</b>자</span>
        <span>총 <b className="font-display font-bold text-ink">{totalChars.toLocaleString()}</b>자</span>
      </div>
      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
        {chunks.map((c) => {
          const open = openSet.has(c.idx);
          return (
            <div key={c.idx} className={`shrink-0 overflow-hidden rounded-[10px] border transition-colors ${
              open ? 'border-kp/25 shadow-whisper' : 'border-border-soft hover:border-border-main'
            } bg-white`}>
              <button
                onClick={() => toggle(c.idx)}
                className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-left font-ui hover:bg-bg-sunken"
              >
                <span className="rounded-md bg-kp-subtle px-2 py-0.5 font-mono text-xs font-semibold text-kp">
                  #{c.idx.toString().padStart(2, '0')}
                </span>
                <span className="truncate text-[13px] text-cool">
                  {c.text.replace(/\n/g, ' ').slice(0, 110)}
                </span>
                <span className="font-mono text-[11px] text-silver">{c.length}자</span>
                <span className={`min-w-6 rounded-md px-2 py-0.5 text-center font-ui text-xs font-semibold ${
                  open ? 'bg-kp text-white' : 'bg-secondary-bg text-cool'
                }`}>
                  {open ? '−' : '+'}
                </span>
              </button>
              {open && (
                <div className="border-t border-border-soft bg-bg-sunken px-[18px] py-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
                  {c.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <pre key={key++} className="my-3 overflow-auto rounded-[10px] bg-[#1c1d22] p-3.5 font-mono text-[13px] text-[#ececef]">
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const content = h[2];
      const cls =
        lvl === 1 ? 'mt-[18px] mb-2.5 font-display text-[28px] font-bold tracking-tight text-ink'
        : lvl === 2 ? 'mt-[18px] mb-2.5 font-display text-[22px] font-bold tracking-tight text-ink'
        : 'mt-4 mb-2 font-display text-[17px] font-bold text-cool';
      out.push(<div key={key++} className={cls}>{content}</div>);
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(
          lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()),
        );
        i++;
      }
      const isSep = (r: string[]) => r.every((c) => /^:?-+:?$/.test(c));
      const body = rows.filter((r) => !isSep(r));
      if (body.length > 0) {
        const [head, ...rest] = body;
        out.push(
          <table key={key++} className="my-3 w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border border-border-main bg-bg-sunken px-3 py-2 text-left font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} className="border border-border-main px-3 py-2">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>,
        );
      }
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-4 border-border-main" />);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 list-disc pl-[22px]">
          {items.map((it, j) => <li key={j} className="my-1">{renderInline(it)}</li>)}
        </ul>,
      );
      continue;
    }

    if (line.startsWith('> ')) {
      out.push(
        <p key={key++} className="my-2 border-l-[3px] border-border-main pl-2.5 text-cool">
          {renderInline(line.slice(2))}
        </p>,
      );
      i++;
      continue;
    }

    if (!line.trim()) { i++; continue; }

    out.push(<p key={key++} className="my-2">{renderInline(line)}</p>);
    i++;
  }
  return out;
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}
