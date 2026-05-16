'use client';

import { useEffect, useRef, useState } from 'react';
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

  // 문서 바뀌면 대화 초기화
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

  return (
    <div className="flex h-full flex-col rounded-sm border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">chat</h2>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-stone-400">
                ask anything
              </div>
              <p className="mt-2 text-sm text-stone-500">
                업로드한 문서 내용을 바탕으로 답변해 드립니다.
              </p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={disabled ? '문서가 준비되면 질문할 수 있습니다' : '질문을 입력하세요...'}
            disabled={disabled || busy}
            rows={2}
            className="flex-1 resize-none rounded-sm border border-stone-300 bg-stone-50 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={disabled || busy || !input.trim()}
            className="rounded-sm bg-stone-900 px-4 py-2 font-mono text-xs uppercase tracking-widest text-white transition hover:bg-stone-700 disabled:bg-stone-300"
          >
            {busy ? '...' : 'send'}
          </button>
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-stone-400">enter to send · shift+enter for newline</div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-sm bg-stone-900 px-4 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-amber-700">AI</div>
      <div className="flex-1">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
          {message.content}
          {message.streaming && <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-stone-600 align-middle" />}
        </div>
        {message.sources && message.sources.length > 0 && !message.streaming && (
          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-600">
              sources · {message.sources.length}
            </summary>
            <div className="mt-2 space-y-2">
              {message.sources.map((s, i) => (
                <div key={i} className="rounded-sm border border-stone-200 bg-stone-50 p-2">
                  <div className="font-mono text-[10px] text-stone-500">
                    chunk #{s.chunk_idx} · score {s.score.toFixed(3)}
                  </div>
                  <div className="mt-1 line-clamp-3 text-xs text-stone-700">{s.text}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
