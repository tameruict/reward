import type { BrowserContext } from 'patchright';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
export interface LoadedSession {
    storageState: StorageState | null;
    fingerprint: BrowserFingerprintWithHeaders | null;
    updatedAt: number;
}
export declare function loadSession(sessionPath: string, email: string, isMobile: boolean, maxAgeMs?: number): LoadedSession | null;
export declare function saveStorageState(sessionPath: string, email: string, isMobile: boolean, storageState: StorageState): void;
export declare function saveFingerprint(sessionPath: string, email: string, isMobile: boolean, fingerprint: BrowserFingerprintWithHeaders): void;
export declare function deleteSession(sessionPath: string, email: string, isMobile: boolean): void;
export declare function closeSessionStore(): void;
//# sourceMappingURL=SessionStore.d.ts.map