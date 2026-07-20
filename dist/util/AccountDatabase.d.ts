import type { Account } from '../interface/Account';
export declare function resolveAccountsDbPath(projectRoot: string): string;
export declare function ensureAccountsDatabase(dbPath: string): void;
export declare function loadAccountsFromDatabase(projectRoot: string): Account[] | null;
//# sourceMappingURL=AccountDatabase.d.ts.map