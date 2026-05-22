'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChatSource, chatStream, DocumentInfo } from '@/lib/api';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  streaming?: boolean;
};

type Props = {
  docId: string;
  docs: DocumentInfo[];
};

export default function ChatPanel({ docId, docs }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // 질의 범위로 선택된 문서 ID 집합. 비어 있으면 "전체 문서" 로 해석.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set([docId]));
  const [scopeOpen, setScopeOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  // ready 문서만 선택지로 노출. 현재 포커스된 문서는 ready 가 아니더라도 표시(체크 불가).
  const readyDocs = useMemo(
    () => docs.filter((d) => d.status === 'ready'),
    [docs],
  );

  // 다른 문서로 포커스가 옮겨가면 그 문서를 기본 선택으로 reset
  // (이전에 다중 선택해 두었더라도, 문서 클릭이 명확한 의도 표현이라 보고 단일로 되돌림)
  useEffect(() => {
    setSelectedIds(new Set([docId]));
    setMessages([]);
    abortRef.current?.abort();
  }, [docId]);

  // popover 외부 클릭 시 닫기
  useEffect(() => {
    if (!scopeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setScopeOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [scopeOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(readyDocs.map((d) => d.doc_id)));
  }
  function clearAll() {
    setSelectedIds(new Set());
  }

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);

    setMessages((m) => [
      ...m,
      { role: 'user', content: q },
      { role: 'assistant', content: '', streaming: true },
    ]);

    const ac = new AbortController();
    abortRef.current = ac;

    // 선택이 비어 있으면 null 을 넘겨 전체 문서 검색을 요청한다.
    const targetIds = selectedIds.size === 0 ? null : Array.from(selectedIds);
    try {
      await chatStream(
        targetIds,
        q,
        {
          onSources: (sources) => {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], sources };
              return copy;
            });
          },
          onToken: (t) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + t };
              return copy;
            });
          },
          onDone: () => {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false };
              return copy;
            });
          },
          onError: (err) => {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                content: `[오류] ${err}`,
                streaming: false,
              };
              return copy;
            });
          },
        },
        ac.signal,
      );
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: `[오류] ${e instanceof Error ? e.message : String(e)}`,
          streaming: false,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  // 질의 가능 여부:
  // - 선택이 비어 있다(전체 모드)면 ready 문서가 1개라도 있어야 함
  // - 선택이 있으면 그 중 ready 인 문서가 1개라도 있어야 함
  const ready = useMemo(() => {
    if (selectedIds.size === 0) return readyDocs.length > 0;
    return readyDocs.some((d) => selectedIds.has(d.doc_id));
  }, [selectedIds, readyDocs]);
  const canSend = ready && !busy && input.trim().length > 0;

  // 헤더 라벨/상태 텍스트
  const scopeLabel =
    selectedIds.size === 0
      ? `전체 문서 (${readyDocs.length})`
      : selectedIds.size === 1
      ? '1개 문서'
      : `${selectedIds.size}개 문서`;
  const statusText = ready
    ? selectedIds.size === 0
      ? '준비됨 · 전체 문서 기반'
      : selectedIds.size === 1
      ? '준비됨 · 선택한 문서 기반'
      : `준비됨 · 선택된 ${selectedIds.size}개 문서 기반`
    : '문서 대기 중';

  return (
    <section className="flex min-h-[600px] flex-1 flex-col border-t border-border-main bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-10 py-[18px]">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">채팅</h3>
        <div className="flex items-center gap-3">
          <div ref={scopeRef} className="relative">
            <button
              type="button"
              onClick={() => setScopeOpen((v) => !v)}
              aria-expanded={scopeOpen}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-main bg-white px-3 py-1.5 font-ui text-[12px] font-semibold text-ink transition hover:border-kp hover:text-kp"
            >
              <span>범위 · {scopeLabel}</span>
              <span className={`text-[10px] transition-transform ${scopeOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {scopeOpen && (
              <div
                role="dialog"
                aria-label="질의 범위 선택"
                className="absolute right-0 top-[calc(100%+6px)] z-20 w-[320px] overflow-hidden rounded-[12px] border border-border-main bg-white shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-border-soft px-3.5 py-2.5">
                  <span className="font-ui text-[12px] font-semibold text-cool">
                    질의 대상 문서 선택
                  </span>
                  <div className="flex gap-2 font-ui text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={selectAll}
                      disabled={readyDocs.length === 0}
                      className="text-kp transition hover:text-kp-dark disabled:text-silver"
                    >
                      모두 선택
                    </button>
                    <span className="text-border-main">·</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-cool transition hover:text-ink"
                    >
                      해제
                    </button>
                  </div>
                </div>

                <div className="max-h-[260px] overflow-y-auto py-1">
                  {readyDocs.length === 0 ? (
                    <div className="px-4 py-6 text-center font-ui text-[12px] text-silver">
                      준비된 문서가 없습니다
                    </div>
                  ) : (
                    readyDocs.map((d) => {
                      const checked = selectedIds.has(d.doc_id);
                      return (
                        <label
                          key={d.doc_id}
                          className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 transition hover:bg-bg-sunken"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelected(d.doc_id)}
                            className="h-4 w-4 cursor-pointer accent-kp"
                          />
                          <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-ink">
                            {d.filename}
                          </span>
                          {d.classification?.category && (
                            <span className="shrink-0 rounded-md bg-kp-subtle px-2 py-0.5 font-ui text-[10px] font-semibold text-kp">
                              {d.classification.category}
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-border-soft bg-bg-sunken px-3.5 py-2 font-ui text-[11px] text-silver">
                  선택을 비우면 전체 문서를 대상으로 질의합니다.
                </div>
              </div>
            )}
          </div>
          <span className="font-ui text-[13px] font-medium text-silver">{statusText}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-10 py-7">
        {messages.length === 0 && (
          <div className="m-auto text-center text-silver">
            <div className="font-display text-[22px] font-semibold tracking-tight text-cool">
              무엇이든 물어보세요
            </div>
            <div className="mt-1.5 text-sm">
              {selectedIds.size === 0
                ? '업로드된 모든 문서를 대상으로 답변해 드립니다.'
                : selectedIds.size === 1
                ? '선택한 문서의 내용을 바탕으로 답변해 드립니다.'
                : `선택한 ${selectedIds.size}개 문서를 종합해 답변해 드립니다.`}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border-soft bg-white px-10 pb-6 pt-4">
        <div className={`grid grid-cols-[1fr_auto] items-end gap-2 rounded-[12px] border-[1.5px] p-2.5 pl-3.5 transition-all ${
          !ready ? 'border-border-main bg-bg-sunken' : 'border-border-main bg-white focus-within:border-kp focus-within:shadow-[0_0_0_4px_rgba(113,50,245,0.10)]'
        }`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) send();
              }
            }}
            placeholder={
              ready
                ? selectedIds.size === 0
                  ? '전체 문서에 대해 질문해 보세요...'
                  : selectedIds.size > 1
                  ? `선택된 ${selectedIds.size}개 문서에 대해 질문해 보세요...`
                  : '질문을 입력하세요...'
                : '문서가 준비되면 질문할 수 있습니다'
            }
            disabled={!ready || busy}
            rows={1}
            className="max-h-[160px] min-h-[26px] resize-none border-none bg-transparent py-1.5 font-ui text-[15px] leading-normal text-ink outline-none placeholder:text-silver"
          />
          <button
            onClick={() => { if (canSend) send(); }}
            disabled={!canSend}
            className="rounded-[12px] bg-kp px-5 py-2.5 font-ui text-sm font-semibold text-white transition hover:bg-kp-dark disabled:cursor-not-allowed disabled:bg-secondary-bg disabled:text-silver"
          >
            {busy ? '...' : '전송'}
          </button>
        </div>
        <div className="mt-2 flex gap-4 font-ui text-xs text-silver">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border-main bg-secondary-bg px-1.5 py-px text-[11px] font-semibold text-cool shadow-[0_1px_0_var(--border-main)]">Enter</kbd>
            전송
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border-main bg-secondary-bg px-1.5 py-px text-[11px] font-semibold text-cool shadow-[0_1px_0_var(--border-main)]">Shift</kbd>+<kbd className="rounded-md border border-border-main bg-secondary-bg px-1.5 py-px text-[11px] font-semibold text-cool shadow-[0_1px_0_var(--border-main)]">Enter</kbd>
            줄바꿈
          </span>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const waiting = message.streaming && !message.content;

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-[4px] bg-kp px-[18px] py-3 font-ui text-[15px] font-medium leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 self-start max-w-[86%]">
      {/* Avatar */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-visible ${waiting ? '' : ''}`}>
        <img
          src={waiting ? '/assets/potato-thinking.png' : '/assets/potato-answer.png'}
          alt={waiting ? 'thinking' : 'gamja'}
          className={`block object-contain ${waiting ? 'h-[50px] w-[50px] -ml-[5px] -mt-[6px]' : 'h-10 w-10'}`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.innerHTML = waiting ? '🤔' : '🥔';
          }}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {waiting ? (
          <div className="inline-flex items-center gap-2.5 rounded-2xl rounded-bl-[4px] bg-bg-sunken px-[18px] py-3 text-sm font-medium text-cool">
            <span>생각 중</span>
            <span className="inline-flex gap-1">
              <i className="inline-block h-1.5 w-1.5 animate-dots rounded-full bg-kp" />
              <i className="inline-block h-1.5 w-1.5 animate-dots rounded-full bg-kp [animation-delay:0.15s]" />
              <i className="inline-block h-1.5 w-1.5 animate-dots rounded-full bg-kp [animation-delay:0.3s]" />
            </span>
          </div>
        ) : (
          <div className={`rounded-2xl rounded-bl-[4px] px-[18px] py-3 font-ui text-[15px] leading-relaxed ${
            message.content.startsWith('[오류]') ? 'bg-red-bg text-red-dark' : 'bg-bg-sunken text-ink'
          }`}>
            {renderInline(message.content)}
            {message.streaming && (
              <span className="ml-0.5 animate-blink text-kp">▍</span>
            )}
          </div>
        )}

        {/* Sources */}
        {!message.streaming && message.sources && message.sources.length > 0 && (
          <div className={`mt-3 overflow-hidden rounded-[10px] border border-border-soft bg-bg-sunken ${sourcesOpen ? '' : ''}`}>
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left font-ui text-xs font-semibold text-cool"
            >
              <span className={`transition-transform ${sourcesOpen ? 'rotate-90' : ''}`}>▸</span>
              <span>출처 · {message.sources.length}개</span>
            </button>
            {sourcesOpen && (
              <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
                {message.sources.map((s, i) => (
                  <div key={i} className="grid grid-cols-[auto_auto_1fr] items-start gap-2.5 rounded-lg border border-border-soft bg-white px-3 py-2.5 text-[13px]">
                    <span className="rounded-md bg-kp-subtle px-[7px] py-0.5 font-mono text-[11px] font-semibold text-kp">
                      #{(s.chunk_idx ?? i).toString().padStart(2, '0')}
                    </span>
                    <span className="font-mono text-[11px] text-cool">
                      {s.score.toFixed(3)}
                    </span>
                    <div className="min-w-0 leading-normal text-cool">
                      {s.filename && (
                        <div className="mb-0.5 truncate font-ui text-[11px] font-semibold text-kp">
                          {s.filename}
                        </div>
                      )}
                      <div className="line-clamp-2">{s.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}
