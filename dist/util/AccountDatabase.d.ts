import type { Account } from '../interface/Account';
export declare function resolveAccountsDbPath(projectRoot: string): string;
export declare function ensureAccountsDatabase(dbPath: string): void;
export declare function loadAccountsFromDatabase(projectRoot: string): Account[] | null;
export type AccountDisableMode = 'disable' | 'delete';
export interface AccountDisableResult {
    /** true when a row was actually mutated (status flipped or row deleted) */
    persisted: boolean;
    /** false when the account is not stored in the DB (e.g. env-sourced) */
    inDatabase: boolean;
    mode: AccountDisableMode;
}
/**
 * Marks an account unusable in the accounts DB so it is excluded from every
 * future run (loadAccountsFromDatabase only returns 'ready'/'active' rows).
 *
 * - mode 'disable' (default, reversible): sets status = 'disabled'.
 * - mode 'delete' (irreversible): removes the row and records the email in
 *   deleted_accounts so a later import cannot silently re-add it.
 *
 * Safe to call for env-sourced accounts: it simply reports inDatabase=false.
 */
export declare function disableAccountInDatabase(projectRoot: string, email: string, mode: AccountDisableMode): AccountDisableResult;
//# sourceMappingURL=AccountDatabase.d.ts.map