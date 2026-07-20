import type { Page } from 'patchright';
interface UnknownPageDiagnosticOptions {
    platform: 'mobile' | 'desktop';
}
export declare function errorDiagnostic(page: Page, error: Error): Promise<void>;
export declare function unknownPageDiagnostic(page: Page, { platform }: UnknownPageDiagnosticOptions): Promise<string | null>;
export {};
//# sourceMappingURL=ErrorDiagnostic.d.ts.map