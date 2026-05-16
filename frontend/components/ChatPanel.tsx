'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { ChatSource, chatStream } from '@/lib/api';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  streaming?: boolean;
};

export default function ChatPanel({ docId, disabled }: { docId: string; disabled?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages([]);
    abortRef.current?.abort();
  }, [docId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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

    try {
      await chatStream(
        docId,
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

  const ready = !disabled;
  const canSend = ready && !busy && input.trim().length > 0;

  return (
    <section className="flex min-h-[600px] flex-1 flex-col border-t border-border-main bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-10 py-[18px]">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">채팅</h3>
        <span className="font-ui text-[13px] font-medium text-silver">
          {ready ? '준비됨 · 선택한 문서 기반' : '문서 대기 중'}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-10 py-7">
        {messages.length === 0 && (
          <div className="m-auto text-center text-silver">
            <div className="font-display text-[22px] font-semibold tracking-tight text-cool">
              무엇이든 물어보세요
            </div>
            <div className="mt-1.5 text-sm">업로드한 문서 내용을 바탕으로 답변해 드립니다.</div>
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
            placeholder={ready ? '질문을 입력하세요...' : '문서가 준비되면 질문할 수 있습니다'}
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
                    <span className="line-clamp-2 leading-normal text-cool">
                      {s.text}
                    </span>
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
