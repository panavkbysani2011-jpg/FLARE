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

export function sanitizeStoredMessage(raw: unknown, fallbackId: string): AssistantMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Partial<AssistantMessage> & Record<string, unknown>;
  const role = msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'assistant';
  const id = typeof msg.id === 'string' && msg.id.trim() ? msg.id : fallbackId;
  const text =
    typeof msg.text === 'string'
      ? msg.text
      : msg.text != null
      ? String(msg.text)
      : '';
  const safeSteps = Array.isArray(msg.steps)
    ? msg.steps.map((s) => (typeof s === 'string' ? s : String(s ?? ''))).filter(Boolean)
    : undefined;
  const safeCitations = Array.isArray(msg.citations)
    ? msg.citations
        .map((c) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object') {
            const item = c as unknown as Record<string, unknown>;
            const psi =
              typeof item.psi_id === 'string' && item.psi_id ? item.psi_id : '';
            const src =
              typeof item.source_file === 'string' && item.source_file
                ? item.source_file
                : '';
            const excerpt =
              typeof item.excerpt === 'string' ? item.excerpt : '';
            return [psi, src, excerpt].filter(Boolean).join(' - ');
          }
          return '';
        })
        .filter((s) => s.length > 0)
    : undefined;

  const safeWhatIf = Array.isArray(msg.whatIfRows)
    ? msg.whatIfRows
        .filter((row) => row && typeof row === 'object')
        .map((row, idx) => {
          const r = row as unknown as Record<string, unknown>;
          const flame = Number(r.flameSpread_mms);
          const o2 = Number(r.O2_pct);
          const press = Number(r.P_psi);
          const grav = Number(r.g_eff);
          const flow = Number(r.Flow_ms);
          const thick = Number(r.Thickness_mm);
          const minSafe = Number(r.minSafeThickness_mm);
          const ignFlux = Number(r.ignitionFlux_Wm2);
          const rawOutcome = r.outcome ?? r.hazardStatus;
          const validOutcome: NonNullable<AssistantMessage['whatIfRows']>[number]['outcome'] =
            rawOutcome === 'Rapid Flame Spread' ||
            rawOutcome === 'Cool Flame Caution' ||
            rawOutcome === 'Self-Extinguishing'
              ? rawOutcome
              : 'Cool Flame Caution';
          const mat = r.material;
          const validMaterial: NonNullable<AssistantMessage['whatIfRows']>[number]['material'] =
            mat === 'PMMA' ||
            mat === 'SIBAL' ||
            mat === 'Cotton-Fiberglass' ||
            mat === 'PTFE' ||
            mat === 'Nomex'
              ? mat
              : 'PMMA';
          return {
            id:
              typeof r.id === 'string' && r.id ? r.id : `${id}-whatif-${idx}`,
            label: typeof r.label === 'string' ? r.label : 'Scenario',
            O2_pct: Number.isFinite(o2) ? o2 : 21,
            P_psi: Number.isFinite(press) ? press : 14.7,
            Flow_ms: Number.isFinite(flow) ? flow : 0.15,
            g_eff: Number.isFinite(grav) ? grav : 1,
            Thickness_mm: Number.isFinite(thick) ? thick : 2.0,
            material: validMaterial,
            ignitionFlux_Wm2: Number.isFinite(ignFlux) ? ignFlux : 25000,
            flameSpread_mms: Number.isFinite(flame) ? flame : 0,
            minSafeThickness_mm: Number.isFinite(minSafe) ? minSafe : 2.0,
            outcome: validOutcome,
          };
        })
    : undefined;

  const safeInlineChart =
    msg.inlineChart &&
    typeof msg.inlineChart === 'object' &&
    typeof ((msg.inlineChart as unknown) as Record<string, unknown>).vizMode ===
      'string'
      ? msg.inlineChart
      : undefined;

  return {
    ...msg,
    id,
    role,
    mode:
      msg.mode === 'what-if' ||
      msg.mode === 'risk-audit' ||
      msg.mode === 'literature' ||
      msg.mode === 'decoder'
        ? msg.mode
        : 'literature',
    text: text || (safeSteps && safeSteps[0]) || (role === 'user' ? 'Prompt' : 'Response loaded from archive.'),
    steps: safeSteps ?? (role === 'assistant' && text ? [text] : undefined),
    citations: safeCitations,
    whatIfRows: safeWhatIf,
    inlineChart: safeInlineChart,
    timestamp:
      typeof msg.timestamp === 'string' && msg.timestamp ? msg.timestamp : formatChatTimestamp(),
  };
}

export function sanitizeThreadList(raw: unknown): ChatThread[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw
    .filter(
      (t): t is ChatThread =>
        Boolean(t) &&
        typeof t === 'object' &&
        typeof (t as ChatThread).id === 'string' &&
        typeof (t as ChatThread).title === 'string' &&
        Array.isArray((t as ChatThread).messages)
    )
    .map((t, tIdx) => ({
      ...t,
      updatedAt:
        typeof t.updatedAt === 'string' && t.updatedAt
          ? t.updatedAt
          : formatChatTimestamp(),
      updatedAtMs:
        typeof t.updatedAtMs === 'number' && Number.isFinite(t.updatedAtMs)
          ? t.updatedAtMs
          : Date.now() - tIdx * 1000,
      messages: t.messages
        .map((m, mIdx) => sanitizeStoredMessage(m, `${t.id}-msg-${mIdx}`))
        .filter((m): m is AssistantMessage => m !== null),
    }));
  return sortThreadsNewestFirst(valid);
}

export function loadChatThreads(): ChatThread[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(CHAT_THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeThreadList(parsed);
  } catch {
    return [];
  }
}

export function saveChatThreads(threads: ChatThread[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const sanitized = sanitizeThreadList(threads).slice(0, MAX_STORED_THREADS);
    window.localStorage.setItem(
      CHAT_THREADS_STORAGE_KEY,
      JSON.stringify(sanitized)
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
