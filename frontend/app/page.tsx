'use client';

import { useCallback, useEffect, useState } from 'react';
import ChatPanel from '@/components/ChatPanel';
import DocDetail from '@/components/DocDetail';
import DocList from '@/components/DocList';
import ResultDashboard from '@/components/ResultDashboard';
import UploadZone from '@/components/UploadZone';
import { DocumentInfo, listDocuments } from '@/lib/api';

export default function Home() {
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listDocuments();
      setDocs(list);
      // 자동 선택: 아직 선택이 없고 ready 문서가 있으면 첫번째
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].doc_id);
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = docs.find((d) => d.doc_id === selectedId) ?? null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-baseline justify-between px-6 py-4">
          <div>
            <h1 className="font-mono text-lg font-bold tracking-tight text-stone-900">
              doc<span className="text-amber-700">·</span>rag
            </h1>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-stone-400">
              ocr → classify → retrieve → answer
            </p>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
            mvp · v0.1
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        {/* Left: upload + list */}
        <aside className="space-y-6">
          <UploadZone
            onUploaded={(id) => {
              setSelectedId(id);
              refresh();
            }}
          />
          <div className="rounded-sm border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">
                documents · {docs.length}
              </h2>
            </div>
            <DocList
              docs={docs}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={(id) => {
                if (selectedId === id) setSelectedId(null);
                refresh();
              }}
              onRefresh={refresh}
            />
          </div>
        </aside>

        {/* Right: detail + chat */}
        <section className="flex flex-col gap-6">
          {selected ? (
            <>
              <DocDetail doc={selected} />
              <ResultDashboard doc={selected} />
              <div className="min-h-[480px] flex-1">
                <ChatPanel
                  docId={selected.doc_id}
                  disabled={selected.status !== 'ready'}
                />
              </div>
            </>
          ) : (
            <div className="flex min-h-[600px] items-center justify-center rounded-sm border border-dashed border-stone-300 bg-white">
              <div className="text-center">
                <div className="font-mono text-xs uppercase tracking-widest text-stone-400">
                  no document selected
                </div>
                <p className="mt-2 text-sm text-stone-500">
                  왼쪽에서 문서를 업로드하거나 선택하세요.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
