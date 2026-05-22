// 모든 백엔드 호출은 /api 프록시를 통과 (next.config.mjs의 rewrites)

export type Classification = {
  category: string;
  category_code: string;
  confidence: number;
  reason: string;
};

export type DocumentInfo = {
  doc_id: string;
  filename: string;
  status: 'processing' | 'classifying' | 'indexing' | 'ready' | 'error';
  created_at: string;
  classification?: Classification;
  text_preview?: string;
  full_text_length?: number;
  chunk_count?: number;
  error?: string;
};

export async function uploadDocument(file: File): Promise<{ doc_id: string; filename: string; status: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch('/api/documents', { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocument(docId: string): Promise<DocumentInfo> {
  const res = await fetch(`/api/documents/${docId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocument(docId: string): Promise<void> {
  const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export type MarkdownResponse = {
  doc_id: string;
  markdown: string;
  length: number;
};

export type ChunkInfo = {
  idx: number;
  text: string;
  length: number;
};

export type ChunksResponse = {
  doc_id: string;
  count: number;
  chunk_size: number;
  chunk_overlap: number;
  chunks: ChunkInfo[];
};

export async function getDocumentMarkdown(docId: string): Promise<MarkdownResponse> {
  const res = await fetch(`/api/documents/${docId}/markdown`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocumentChunks(docId: string): Promise<ChunksResponse> {
  const res = await fetch(`/api/documents/${docId}/chunks`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type ChatSource = {
  chunk_idx: number | null;
  score: number;
  text: string;
  doc_id?: string | null;
  filename?: string | null;
};

export type ChatStreamHandlers = {
  onSources?: (sources: ChatSource[]) => void;
  onToken?: (token: string) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
};

/**
 * SSE 스트리밍을 fetch + ReadableStream으로 직접 파싱.
 * EventSource는 POST를 못 보내서 사용 안 함.
 */
export async function chatStream(
  docIds: string[] | null,
  question: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
) {
  // docIds 가 null 또는 빈 배열이면 전체 문서 대상으로 질의.
  const body: Record<string, unknown> = { question };
  if (docIds && docIds.length > 0) body.doc_ids = docIds;
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(await res.text().catch(() => 'request failed'));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE: \n\n으로 이벤트 구분
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let event = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trimStart();
        }
        if (!data) continue;

        try {
          if (event === 'sources') {
            handlers.onSources?.(JSON.parse(data));
          } else if (event === 'token') {
            const parsed = JSON.parse(data);
            handlers.onToken?.(parsed.t ?? '');
          } else if (event === 'done') {
            handlers.onDone?.();
          } else if (event === 'error') {
            const parsed = JSON.parse(data);
            handlers.onError?.(parsed.error ?? 'unknown');
          }
        } catch (e) {
          console.error('SSE parse error', e, data);
        }
      }
    }
  } catch (e) {
    // 스트림 도중 끊김(연결 리셋 등) — 문서 전환에 의한 abort는 무시
    if ((e as { name?: string })?.name === 'AbortError') return;
    console.error('chat stream error', e);
    handlers.onError?.(e instanceof Error ? e.message : String(e));
    return;
  }
  handlers.onDone?.();
}
