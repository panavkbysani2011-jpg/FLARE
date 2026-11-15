import { AssistantMessage, ChatThread } from '../types/psi';

export const CHAT_THREADS_STORAGE_KEY = 'psi_model_console_threads_v1';
export const ACTIVE_CHAT_THREAD_STORAGE_KEY = 'psi_model_console_active_thread_v1';

const MAX_STORED_THREADS = 40;

export function formatChatTimestamp(date: Date = new Date()): string {
  try {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Now';
  }
}

export function deriveChatThreadTitle(firstPrompt: string): string {
  const cleaned = firstPrompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New Chat';
  if (cleaned.length <= 46) return cleaned;
  return `${cleaned.slice(0, 43).trimEnd()}...`;
}

export function createChatThread(initialTitle = 'New Chat'): ChatThread {
  const now = Date.now();
  return {
    id: `thread-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: initialTitle,
    updatedAt: formatChatTimestamp(new Date(now)),
    updatedAtMs: now,
    messages: [],
  };
}

export function sortThreadsNewestFirst(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function loadChatThreads(): ChatThread[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(CHAT_THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (t): t is ChatThread =>
        Boolean(t) &&
        typeof t === 'object' &&
        typeof (t as ChatThread).id === 'string' &&
        typeof (t as ChatThread).title === 'string' &&
        Array.isArray((t as ChatThread).messages)
    );
    return sortThreadsNewestFirst(valid);
  } catch {
    return [];
  }
}

export function saveChatThreads(threads: ChatThread[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const sorted = sortThreadsNewestFirst(threads).slice(0, MAX_STORED_THREADS);
    window.localStorage.setItem(
      CHAT_THREADS_STORAGE_KEY,
      JSON.stringify(sorted)
    );
  } catch {
    // Ignore quota or storage restriction failures cleanly
  }
}

export function loadActiveChatThreadId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(ACTIVE_CHAT_THREAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveChatThreadId(threadId: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (threadId) {
      window.localStorage.setItem(ACTIVE_CHAT_THREAD_STORAGE_KEY, threadId);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_THREAD_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction failures
  }
}

export function appendMessagesToThread(
  threads: ChatThread[],
  threadId: string,
  newMessages: AssistantMessage[]
): ChatThread[] {
  const now = Date.now();
  const stamp = formatChatTimestamp(new Date(now));
  const exists = threads.some((t) => t.id === threadId);

  if (!exists) {
    const firstUser = newMessages.find((m) => m.role === 'user')?.text ?? 'New Chat';
    const created: ChatThread = {
      id: threadId,
      title: deriveChatThreadTitle(firstUser),
      updatedAt: stamp,
      updatedAtMs: now,
      messages: newMessages,
    };
    return sortThreadsNewestFirst([created, ...threads]);
  }

  return sortThreadsNewestFirst(
    threads.map((t) => {
      if (t.id !== threadId) return t;
      const merged = [...t.messages, ...newMessages];
      const shouldRetitle =
        t.title === 'New Chat' || t.messages.length === 0;
      const firstUser = merged.find((m) => m.role === 'user')?.text;
      return {
        ...t,
        title:
          shouldRetitle && firstUser
            ? deriveChatThreadTitle(firstUser)
            : t.title,
        updatedAt: stamp,
        updatedAtMs: now,
        messages: merged,
      };
    })
  );
}
