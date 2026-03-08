const WORKSPACE_IMPORT_TRACKING_KEY = "buildrootz:workspace:import:v1";
const WORKSPACE_IMPORT_TRACKING_VERSION = 1 as const;
const MAX_FINGERPRINTS_PER_STATE = 20;

type UserImportTrackingState = {
  importedFingerprints: string[];
  dismissedFingerprints: string[];
  updatedAt: number;
};

type WorkspaceImportTrackingState = {
  version: typeof WORKSPACE_IMPORT_TRACKING_VERSION;
  users: Record<string, UserImportTrackingState>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFingerprintList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const next = value.trim();
    if (!next) continue;
    unique.add(next);
  }
  return Array.from(unique).slice(0, MAX_FINGERPRINTS_PER_STATE);
}

function getEmptyTrackingState(): WorkspaceImportTrackingState {
  return {
    version: WORKSPACE_IMPORT_TRACKING_VERSION,
    users: {},
  };
}

function sanitizeUserTrackingState(value: unknown): UserImportTrackingState {
  if (!isPlainObject(value)) {
    return {
      importedFingerprints: [],
      dismissedFingerprints: [],
      updatedAt: Date.now(),
    };
  }

  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : Date.now();

  return {
    importedFingerprints: sanitizeFingerprintList(value.importedFingerprints),
    dismissedFingerprints: sanitizeFingerprintList(value.dismissedFingerprints),
    updatedAt,
  };
}

function sanitizeTrackingState(value: unknown): WorkspaceImportTrackingState {
  if (!isPlainObject(value) || !isPlainObject(value.users)) return getEmptyTrackingState();

  const users: Record<string, UserImportTrackingState> = {};
  for (const [userId, userState] of Object.entries(value.users)) {
    if (!userId.trim()) continue;
    users[userId] = sanitizeUserTrackingState(userState);
  }

  return {
    version: WORKSPACE_IMPORT_TRACKING_VERSION,
    users,
  };
}

function readTrackingState(): WorkspaceImportTrackingState {
  if (typeof window === "undefined") return getEmptyTrackingState();
  try {
    const raw = window.localStorage.getItem(WORKSPACE_IMPORT_TRACKING_KEY);
    if (!raw) return getEmptyTrackingState();
    return sanitizeTrackingState(JSON.parse(raw) as unknown);
  } catch {
    return getEmptyTrackingState();
  }
}

function writeTrackingState(state: WorkspaceImportTrackingState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_IMPORT_TRACKING_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage exceptions.
  }
}

function upsertFingerprint(
  fingerprints: string[],
  fingerprint: string,
): string[] {
  const clean = fingerprint.trim();
  if (!clean) return fingerprints;
  const next = [clean, ...fingerprints.filter((value) => value !== clean)];
  return next.slice(0, MAX_FINGERPRINTS_PER_STATE);
}

function updateUserState(
  userId: string,
  updater: (current: UserImportTrackingState) => UserImportTrackingState,
): void {
  const cleanUserId = userId.trim();
  if (!cleanUserId) return;

  const state = readTrackingState();
  const currentUserState = sanitizeUserTrackingState(state.users[cleanUserId]);
  state.users[cleanUserId] = updater(currentUserState);
  writeTrackingState(state);
}

export function hasSeenWorkspaceImportFingerprint(userId: string, fingerprint: string): boolean {
  const cleanUserId = userId.trim();
  const cleanFingerprint = fingerprint.trim();
  if (!cleanUserId || !cleanFingerprint) return false;

  const state = readTrackingState();
  const userState = sanitizeUserTrackingState(state.users[cleanUserId]);
  return (
    userState.importedFingerprints.includes(cleanFingerprint) ||
    userState.dismissedFingerprints.includes(cleanFingerprint)
  );
}

export function markWorkspaceImportDismissed(userId: string, fingerprint: string): void {
  updateUserState(userId, (current) => ({
    ...current,
    dismissedFingerprints: upsertFingerprint(current.dismissedFingerprints, fingerprint),
    updatedAt: Date.now(),
  }));
}

export function markWorkspaceImportCompleted(userId: string, fingerprint: string): void {
  updateUserState(userId, (current) => ({
    ...current,
    importedFingerprints: upsertFingerprint(current.importedFingerprints, fingerprint),
    dismissedFingerprints: current.dismissedFingerprints.filter((value) => value !== fingerprint),
    updatedAt: Date.now(),
  }));
}
