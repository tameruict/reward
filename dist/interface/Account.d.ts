export interface Account {
    accountId?: string;
    proxyId?: string | null;
    useProxy?: boolean;
    status?: 'ready' | 'active' | 'disabled' | 'running' | 'error' | 'cooldown' | string;
    slot?: number;
    email: string;
    password: string;
    totpSecret?: string;
    recoveryEmail: string;
    geoLocale: 'auto' | string;
    langCode: 'en' | string;
    proxy: AccountProxy;
    saveFingerprint: ConfigSaveFingerprint;
}
export interface AccountProxy {
    proxyHttp: boolean;
    url: string;
    port: number;
    password: string;
    username: string;
    /** Optional expected exit IP for this proxy (from the DB), used to detect rotation/transparency. */
    expectedEgressIp?: string;
}
export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}
//# sourceMappingURL=Account.d.ts.map