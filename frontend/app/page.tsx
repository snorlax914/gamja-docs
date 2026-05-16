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
    <div className="grid min-h-screen grid-rows-[64px_1fr]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-border-main bg-white px-8">
        <div className="flex items-center gap-2.5">
          <img src="/assets/gamja-icon.png" alt="gamja docs" className="h-9 w-[34px] object-contain" />
          <span className="font-display text-[19px] font-bold tracking-tight text-ink">
            gamja<span className="ml-1 font-medium text-silver">docs</span>
          </span>
        </div>
        <div className="flex-1" />
        <div className="rounded-lg bg-secondary-bg px-3 py-1.5 font-ui text-xs font-medium text-cool">
          mvp · v0.1
        </div>
      </header>

      {/* Body */}
      <div className="grid grid-cols-[340px_1fr] min-h-0">
        {/* Sidebar */}
        <aside className="sticky top-16 flex h-[calc(100vh-64px)] flex-col overflow-hidden border-r border-border-main bg-white">
          <UploadZone
            onUploaded={(id) => {
              setSelectedId(id);
              refresh();
            }}
          />
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
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-col bg-bg-sunken">
          {selected ? (
            <>
              <DocDetail doc={selected} />
              <ResultDashboard doc={selected} />
              <ChatPanel
                docId={selected.doc_id}
                disabled={selected.status !== 'ready'}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-silver">
              <div className="font-display text-[22px] font-semibold tracking-tight text-cool">
                선택된 문서가 없습니다
              </div>
              <div className="text-sm">왼쪽에서 문서를 업로드하거나 선택하세요</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
