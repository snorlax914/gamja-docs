'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ChunkInfo,
  DocumentInfo,
  getDocumentChunks,
  getDocumentMarkdown,
} from '@/lib/api';

type Tab = 'markdown' | 'chunks';

const STAGES: { key: string; label: string }[] = [
  { key: 'processing', label: 'OCR' },
  { key: 'classifying', label: '분류' },
  { key: 'indexing', label: '청킹·임베딩·색인' },
  { key: 'ready', label: '완료' },
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
    return () => {
      cancelled = true;
    };
  }, [doc.doc_id, ready]);

  return (
    <div className="rounded-sm border border-stone-200 bg-white">
      <ProgressBar status={doc.status} />

      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <div className="flex gap-1">
          <TabButton active={tab === 'markdown'} onClick={() => setTab('markdown')}>
            full markdown
          </TabButton>
          <TabButton active={tab === 'chunks'} onClick={() => setTab('chunks')}>
            chunks {chunks && `· ${chunks.length}`}
          </TabButton>
        </div>
        {chunkMeta && (
          <div className="font-mono text-[10px] text-stone-400">
            chunk_size {chunkMeta.size} · overlap {chunkMeta.overlap}
          </div>
        )}
      </div>

      <div className="min-h-[280px] p-4">
        {!ready && (
          <div className="flex h-[280px] items-center justify-center text-center">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-stone-400">
                processing...
              </div>
              <p className="mt-2 text-sm text-stone-500">
                문서 처리가 끝나면 OCR 결과와 청크가 여기에 표시됩니다.
              </p>
            </div>
          </div>
        )}

        {ready && loading && (
          <div className="font-mono text-xs uppercase tracking-widest text-stone-400">
            loading...
          </div>
        )}

        {ready && err && (
          <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        {ready && !loading && !err && tab === 'markdown' && (
          <MarkdownView text={markdown ?? ''} />
        )}

        {ready && !loading && !err && tab === 'chunks' && (
          <ChunkList chunks={chunks ?? []} />
        )}
      </div>
    </div>
  );
}

function ProgressBar({ status }: { status: string }) {
  const isError = status === 'error';
  const cur = STAGE_ORDER[status] ?? -1;
  return (
    <div className="border-b border-stone-200 px-4 py-3">
      <div className="font-mono text-xs uppercase tracking-widest text-stone-500">
        pipeline
      </div>
      <ol className="mt-3 flex items-center gap-2">
        {STAGES.map((s, i) => {
          const done = !isError && cur > i;
          const active = !isError && cur === i;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                  isError && i === 0
                    ? 'bg-red-500 text-white'
                    : done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-stone-200 text-stone-500'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`truncate font-mono text-[10px] uppercase tracking-widest ${
                  isError
                    ? 'text-red-600'
                    : done || active
                    ? 'text-stone-800'
                    : 'text-stone-400'
                }`}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={`h-px flex-1 ${
                    done ? 'bg-emerald-300' : 'bg-stone-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      {isError && (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-red-600">
          pipeline failed
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition ${
        active
          ? 'bg-stone-900 text-white'
          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
      }`}
    >
      {children}
    </button>
  );
}

function MarkdownView({ text }: { text: string }) {
  const [raw, setRaw] = useState(false);
  if (!text)
    return (
      <div className="font-mono text-xs text-stone-400">(원문이 비어 있습니다)</div>
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] text-stone-400">
          {text.length.toLocaleString()} chars
        </div>
        <button
          onClick={() => setRaw((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-800"
        >
          {raw ? 'rendered' : 'raw'}
        </button>
      </div>
      <div className="max-h-[440px] overflow-auto rounded-sm border border-stone-200 bg-stone-50 p-4">
        {raw ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-stone-800">
            {text}
          </pre>
        ) : (
          <article className="prose-doc">{renderMarkdown(text)}</article>
        )}
      </div>
    </div>
  );
}

function ChunkList({ chunks }: { chunks: ChunkInfo[] }) {
  const totalChars = useMemo(
    () => chunks.reduce((s, c) => s + c.length, 0),
    [chunks],
  );
  if (chunks.length === 0)
    return (
      <div className="font-mono text-xs text-stone-400">(청크가 없습니다)</div>
    );
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] text-stone-400">
        {chunks.length} chunks · 평균 {Math.round(totalChars / chunks.length)} chars · 총{' '}
        {totalChars.toLocaleString()} chars
      </div>
      <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
        {chunks.map((c) => (
          <ChunkItem key={c.idx} chunk={c} />
        ))}
      </div>
    </div>
  );
}

function ChunkItem({ chunk }: { chunk: ChunkInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-sm border border-stone-200 bg-stone-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-amber-700">
            #{chunk.idx.toString().padStart(2, '0')}
          </span>
          <span className="line-clamp-1 text-xs text-stone-700">
            {chunk.text.slice(0, 120)}
          </span>
        </div>
        <span className="ml-3 shrink-0 font-mono text-[10px] text-stone-400">
          {chunk.length} chars {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap break-words border-t border-stone-200 px-3 py-2 font-mono text-[12px] leading-relaxed text-stone-800">
          {chunk.text}
        </pre>
      )}
    </div>
  );
}

/**
 * 매우 가벼운 마크다운 렌더러. 외부 라이브러리 도입을 피하려고 직접 구현했다.
 * 헤더 / 표 / 코드 펜스 / 리스트 / 수평선만 처리하고 그 외는 단락으로 보여준다.
 */
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
        <pre
          key={key++}
          className="my-2 overflow-auto rounded-sm bg-stone-900 p-3 font-mono text-[11px] text-stone-100"
        >
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const content = h[2];
      const cls =
        lvl === 1
          ? 'text-base font-bold text-stone-900 mt-3 mb-1'
          : lvl === 2
          ? 'text-sm font-bold text-stone-900 mt-3 mb-1'
          : 'text-sm font-semibold text-stone-700 mt-2 mb-1';
      out.push(
        <div key={key++} className={cls}>
          {content}
        </div>,
      );
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim()),
        );
        i++;
      }
      const isSep = (r: string[]) => r.every((c) => /^:?-+:?$/.test(c));
      const body = rows.filter((r) => !isSep(r));
      if (body.length > 0) {
        const [head, ...rest] = body;
        out.push(
          <table key={key++} className="my-2 w-full border-collapse text-xs">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th
                    key={j}
                    className="border border-stone-300 bg-stone-100 px-2 py-1 text-left font-semibold"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} className="border border-stone-300 px-2 py-1">
                      {c}
                    </td>
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
      out.push(<hr key={key++} className="my-3 border-stone-200" />);
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
        <ul key={key++} className="my-2 list-disc pl-5 text-sm text-stone-800">
          {items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].startsWith('```') &&
      !/^\s*\|.*\|\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-stone-800">
        {buf.join(' ')}
      </p>,
    );
  }

  return out;
}
