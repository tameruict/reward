/**
 * Shared types for account-lifecycle handling.
 *
 * When Microsoft signals that an account can no longer be used (suspended /
 * banned), the login flow throws an {@link AccountUnusableError}. The main run
 * loop catches it and — depending on config.accountLifecycle — persists a
 * `disabled` status (or hard-deletes the row) so the dead account is never
 * re-attacked on the next scheduled run.
 */
export type AccountUnusableReason = 'suspended' | 'locked';
export declare class AccountUnusableError extends Error {
    readonly email: string;
    readonly reason: AccountUnusableReason;
    constructor(email: string, reason: AccountUnusableReason, message?: string);
}
/**
 * Cross-module-safe type guard. `instanceof` alone can fail when the class is
 * duplicated across bundles/module instances, so we also match by name.
 */
export declare function isAccountUnusableError(error: unknown): error is AccountUnusableError;
//# sourceMappingURL=AccountLifecycle.d.ts.map