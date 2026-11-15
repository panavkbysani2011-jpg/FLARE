import {
  AccountSession,
  AppSettings,
  ChatThread,
  ModelFeedbackCorrection,
  PsiRun,
  SavedUserAccountWorkspace,
  UserAdaptationProfile,
} from '../types/psi';
import { DEFAULT_APP_SETTINGS } from '../utils/themePreferences';
import {
  getOrCreateUserProfile,
  getVerifiedCorrections,
  saveUserProfile,
  USER_PROFILE_STORAGE_KEY,
  VERIFIED_CORRECTIONS_STORAGE_KEY,
} from './userAdaptation';
import {
  ACTIVE_CHAT_THREAD_STORAGE_KEY,
  CHAT_THREADS_STORAGE_KEY,
  createChatThread,
  loadChatThreads,
  saveActiveChatThreadId,
  saveChatThreads,
} from '../utils/chatStorage';

export const ACCOUNT_REGISTRY_STORAGE_KEY = 'psi_user_accounts_registry_v1';
export const ACTIVE_SESSION_STORAGE_KEY = 'psi_active_account_session_v1';
export const GUEST_SESSION_STORAGE_KEY = 'psi_guest_account_session_v1';

function normalizeFullName(rawName: string): string {
  return rawName.trim().replace(/\s+/g, ' ');
}

function getSafeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

function getSafeSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage
      ? window.sessionStorage
      : null;
  } catch {
    return null;
  }
}

/**
 * Generates a deterministic locked Researcher ID from a researcher's full name
 * in the form `RES-<INITIALS>-<4DIGITS>` (for example, `RES-AK-4821`).
 */
export function generateResearcherIdFromName(rawName: string): string {
  const normalized = normalizeFullName(rawName);
  if (!normalized) return 'RES-GU-0000';

  const words = normalized
    .split(' ')
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter(Boolean);

  let initials = 'RS';
  if (words.length >= 2) {
    initials = `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    initials = words[0].slice(0, 2).toUpperCase();
  } else if (words.length === 1) {
    initials = `${words[0][0]}R`.toUpperCase();
  }

  const canonicalKey = normalized.toLowerCase();
  // Standard deterministic FNV-1a style hash mapped cleanly into 1000..9999
  let hash = 2166136261;
  for (let i = 0; i < canonicalKey.length; i += 1) {
    hash ^= canonicalKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const fourDigits = 1000 + (Math.abs(hash) % 9000);
  return `RES-${initials}-${fourDigits}`;
}

export function loadAccountRegistry(): Record<string, SavedUserAccountWorkspace> {
  const storage = getSafeLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(ACCOUNT_REGISTRY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, SavedUserAccountWorkspace>;
  } catch {
    return {};
  }
}

export function saveAccountRegistry(
  registry: Record<string, SavedUserAccountWorkspace>
): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(ACCOUNT_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // Ignore storage quota failures
  }
}

export function findSavedAccountByFullName(
  fullName: string
): SavedUserAccountWorkspace | null {
  const normalized = normalizeFullName(fullName);
  if (!normalized) return null;
  const candidateId = generateResearcherIdFromName(normalized);
  const registry = loadAccountRegistry();
  if (registry[candidateId]) {
    return registry[candidateId];
  }
  const targetLower = normalized.toLowerCase();
  const match = Object.values(registry).find(
    (entry) => normalizeFullName(entry.fullName).toLowerCase() === targetLower
  );
  return match ?? null;
}

export function loadSavedAccountById(
  researcherId: string
): SavedUserAccountWorkspace | null {
  const registry = loadAccountRegistry();
  return registry[researcherId] ?? null;
}

function buildDefaultWorkspaceForAccount(
  fullName: string,
  researcherId: string
): SavedUserAccountWorkspace {
  const freshThread = createChatThread('New Chat');
  const baseAdaptation: UserAdaptationProfile = {
    researcherId,
    explanationDepth: 'standard',
    fuelCounts: {},
    gravityCounts: {},
    chartCounts: { 'safety-map': 1 },
    preferredFuels: [],
    preferredGravities: [],
    preferredCharts: ['safety-map'],
    helpfulMessageIds: [],
    updatedAtUtc: new Date().toISOString(),
  };

  return {
    researcherId,
    fullName,
    email: '',
    bio: '',
    settings: {
      ...DEFAULT_APP_SETTINGS,
      customColors: {},
    },
    adaptationProfile: baseAdaptation,
    verifiedCorrections: [],
    chatThreads: [freshThread],
    activeChatThreadId: freshThread.id,
    customRuns: [],
    updatedAtUtc: new Date().toISOString(),
  };
}

/**
 * Synchronizes the global runtime storage mirrors (userAdaptation & chatStorage)
 * so existing inference / adaptation modules read the active signed-in user's state.
 */
export function syncRuntimeMirrorsFromWorkspace(
  workspace: SavedUserAccountWorkspace
): void {
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      storage.setItem(
        USER_PROFILE_STORAGE_KEY,
        JSON.stringify(workspace.adaptationProfile)
      );
      storage.setItem(
        VERIFIED_CORRECTIONS_STORAGE_KEY,
        JSON.stringify(workspace.verifiedCorrections)
      );
    } catch {
      // Ignore quota failures
    }
  }
  saveChatThreads(workspace.chatThreads);
  saveActiveChatThreadId(workspace.activeChatThreadId);
}

export function loadActiveSessionOnStartup(): {
  session: AccountSession | null;
  workspace: SavedUserAccountWorkspace | null;
} {
  const local = getSafeLocalStorage();
  if (local) {
    try {
      const raw = local.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AccountSession;
        if (parsed && parsed.mode === 'named' && parsed.researcherId) {
          const saved = loadSavedAccountById(parsed.researcherId);
          if (saved) {
            syncRuntimeMirrorsFromWorkspace(saved);
            return {
              session: {
                mode: 'named',
                fullName: saved.fullName,
                researcherId: saved.researcherId,
                isAuthenticated: true,
              },
              workspace: saved,
            };
          }
        }
      }
    } catch {
      // Fallback safely
    }
  }

  const sessionStore = getSafeSessionStorage();
  if (sessionStore) {
    try {
      const rawGuest = sessionStore.getItem(GUEST_SESSION_STORAGE_KEY);
      if (rawGuest) {
        const parsedGuest = JSON.parse(rawGuest) as SavedUserAccountWorkspace;
        if (parsedGuest && parsedGuest.researcherId) {
          syncRuntimeMirrorsFromWorkspace(parsedGuest);
          return {
            session: {
              mode: 'guest',
              fullName: 'Guest Researcher',
              researcherId: parsedGuest.researcherId,
              isAuthenticated: true,
            },
            workspace: parsedGuest,
          };
        }
      }
    } catch {
      // Ignore invalid guest JSON
    }
  }

  return { session: null, workspace: null };
}

export function signInWithFullName(fullName: string): {
  session: AccountSession;
  workspace: SavedUserAccountWorkspace;
  isReturning: boolean;
} {
  const normalized = normalizeFullName(fullName);
  const existing = findSavedAccountByFullName(normalized);
  const researcherId = existing
    ? existing.researcherId
    : generateResearcherIdFromName(normalized);

  const registry = loadAccountRegistry();
  const workspace: SavedUserAccountWorkspace = existing
    ? {
        ...existing,
        fullName: normalized,
        settings: {
          ...DEFAULT_APP_SETTINGS,
          ...existing.settings,
          customColors: {
            ...(existing.settings?.customColors ?? {}),
          },
        },
      }
    : buildDefaultWorkspaceForAccount(normalized, researcherId);

  registry[researcherId] = workspace;
  saveAccountRegistry(registry);

  const session: AccountSession = {
    mode: 'named',
    fullName: normalized,
    researcherId,
    isAuthenticated: true,
  };

  const local = getSafeLocalStorage();
  if (local) {
    try {
      local.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage error
    }
  }
  const sessionStore = getSafeSessionStorage();
  sessionStore?.removeItem(GUEST_SESSION_STORAGE_KEY);

  syncRuntimeMirrorsFromWorkspace(workspace);
  return { session, workspace, isReturning: Boolean(existing) };
}

export function startGuestSession(): {
  session: AccountSession;
  workspace: SavedUserAccountWorkspace;
} {
  const guestWorkspace = buildDefaultWorkspaceForAccount(
    'Guest Researcher',
    'GUEST-SESSION'
  );
  const session: AccountSession = {
    mode: 'guest',
    fullName: 'Guest Session',
    researcherId: 'GUEST-SESSION',
    isAuthenticated: true,
  };

  const local = getSafeLocalStorage();
  local?.removeItem(ACTIVE_SESSION_STORAGE_KEY);

  const sessionStore = getSafeSessionStorage();
  try {
    sessionStore?.setItem(
      GUEST_SESSION_STORAGE_KEY,
      JSON.stringify(guestWorkspace)
    );
  } catch {
    // Ignore storage error
  }

  syncRuntimeMirrorsFromWorkspace(guestWorkspace);
  return { session, workspace: guestWorkspace };
}

export function persistActiveUserWorkspace(
  session: AccountSession | null,
  patch: Partial<SavedUserAccountWorkspace>
): SavedUserAccountWorkspace | null {
  if (!session || !session.isAuthenticated) return null;

  const liveAdaptation = getOrCreateUserProfile();
  const liveCorrections: ModelFeedbackCorrection[] = getVerifiedCorrections();
  const liveThreads = loadChatThreads();

  if (session.mode === 'guest') {
    const sessionStore = getSafeSessionStorage();
    let current = buildDefaultWorkspaceForAccount(
      'Guest Researcher',
      'GUEST-SESSION'
    );
    try {
      const raw = sessionStore?.getItem(GUEST_SESSION_STORAGE_KEY);
      if (raw) {
        current = JSON.parse(raw) as SavedUserAccountWorkspace;
      }
    } catch {
      // keep default
    }
    const next: SavedUserAccountWorkspace = {
      ...current,
      ...patch,
      adaptationProfile: patch.adaptationProfile ?? liveAdaptation,
      verifiedCorrections: patch.verifiedCorrections ?? liveCorrections,
      chatThreads: patch.chatThreads ?? liveThreads,
      updatedAtUtc: new Date().toISOString(),
    };
    try {
      sessionStore?.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
    return next;
  }

  const registry = loadAccountRegistry();
  const current =
    registry[session.researcherId] ??
    buildDefaultWorkspaceForAccount(session.fullName, session.researcherId);

  const next: SavedUserAccountWorkspace = {
    ...current,
    ...patch,
    researcherId: session.researcherId,
    adaptationProfile: {
      ...(patch.adaptationProfile ?? liveAdaptation),
      researcherId: session.researcherId,
    },
    verifiedCorrections: patch.verifiedCorrections ?? liveCorrections,
    chatThreads: patch.chatThreads ?? liveThreads,
    updatedAtUtc: new Date().toISOString(),
  };
  registry[session.researcherId] = next;
  saveAccountRegistry(registry);
  return next;
}

export function updateActiveUserProfileDetails(
  session: AccountSession,
  updates: { fullName: string; email: string; bio: string },
  currentCustomRuns: PsiRun[]
): { session: AccountSession; workspace: SavedUserAccountWorkspace } {
  const cleanName = normalizeFullName(updates.fullName) || session.fullName;
  const cleanEmail = updates.email.trim();
  const cleanBio = updates.bio.trim();

  // If upgrading from Guest or renaming a named user, recalculate deterministic ID
  const newId =
    session.mode === 'guest' && cleanName === 'Guest Session'
      ? 'GUEST-SESSION'
      : generateResearcherIdFromName(cleanName);

  if (session.mode === 'guest' && newId === 'GUEST-SESSION') {
    const updated =
      persistActiveUserWorkspace(session, {
        fullName: cleanName,
        email: cleanEmail,
        bio: cleanBio,
        customRuns: currentCustomRuns,
      }) ?? buildDefaultWorkspaceForAccount(cleanName, 'GUEST-SESSION');
    return { session, workspace: updated };
  }

  const registry = loadAccountRegistry();
  const previous = registry[session.researcherId];
  const baseWorkspace =
    previous ??
    persistActiveUserWorkspace(session, {}) ??
    buildDefaultWorkspaceForAccount(cleanName, newId);

  const migratedWorkspace: SavedUserAccountWorkspace = {
    ...baseWorkspace,
    researcherId: newId,
    fullName: cleanName,
    email: cleanEmail,
    bio: cleanBio,
    customRuns: currentCustomRuns,
    adaptationProfile: {
      ...baseWorkspace.adaptationProfile,
      researcherId: newId,
    },
    updatedAtUtc: new Date().toISOString(),
  };

  if (session.mode === 'named' && previous && session.researcherId !== newId) {
    delete registry[session.researcherId];
  }
  registry[newId] = migratedWorkspace;
  saveAccountRegistry(registry);

  const nextSession: AccountSession = {
    mode: 'named',
    fullName: cleanName,
    researcherId: newId,
    isAuthenticated: true,
  };

  const local = getSafeLocalStorage();
  local?.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
  getSafeSessionStorage()?.removeItem(GUEST_SESSION_STORAGE_KEY);

  saveUserProfile(migratedWorkspace.adaptationProfile);
  syncRuntimeMirrorsFromWorkspace(migratedWorkspace);

  return { session: nextSession, workspace: migratedWorkspace };
}

export function clearChatHistoryForSession(
  session: AccountSession | null
): { threads: ChatThread[]; activeThreadId: string } {
  const fresh = createChatThread('New Chat');
  const nextThreads = [fresh];
  saveChatThreads(nextThreads);
  saveActiveChatThreadId(fresh.id);
  if (session) {
    persistActiveUserWorkspace(session, {
      chatThreads: nextThreads,
      activeChatThreadId: fresh.id,
    });
  }
  return { threads: nextThreads, activeThreadId: fresh.id };
}

export function signOutAccountSession(): void {
  const local = getSafeLocalStorage();
  if (local) {
    local.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    local.removeItem(CHAT_THREADS_STORAGE_KEY);
    local.removeItem(ACTIVE_CHAT_THREAD_STORAGE_KEY);
    local.removeItem(USER_PROFILE_STORAGE_KEY);
    local.removeItem(VERIFIED_CORRECTIONS_STORAGE_KEY);
  }
  const sessionStore = getSafeSessionStorage();
  sessionStore?.removeItem(GUEST_SESSION_STORAGE_KEY);
}

export function deleteNamedAccount(researcherId: string): void {
  const registry = loadAccountRegistry();
  if (registry[researcherId]) {
    delete registry[researcherId];
    saveAccountRegistry(registry);
  }
  signOutAccountSession();
}

export function updateSettingsForSession(
  session: AccountSession | null,
  settings: AppSettings
): SavedUserAccountWorkspace | null {
  if (!session) return null;
  return persistActiveUserWorkspace(session, { settings });
}
