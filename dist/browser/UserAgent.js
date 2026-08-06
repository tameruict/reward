"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAgentManager = void 0;
const urls_1 = require("../constants/urls");
class UserAgentManager {
    bot;
    static NOT_A_BRAND_VERSION = '99';
    constructor(bot) {
        this.bot = bot;
    }
    async getUserAgent(isMobile) {
        // Mobile device (model + Android version) is derived deterministically
        // per account, so the browser UA stays stable across runs and matches
        // the app-call user-agent for the same account.
        const device = this.bot.mobileDevice;
        const androidVersion = isMobile ? device.androidVersion : 0;
        const system = this.getSystemComponents(isMobile, androidVersion);
        const app = await this.getAppComponents(isMobile);
        const uaTemplate = isMobile
            ? `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}`
            : `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`;
        const platformVersion = isMobile ? `${androidVersion}.0.0` : `${Math.floor(Math.random() * 15) + 1}.0.0`;
        // Keep the UA-CH platform aligned with the UA string's OS token
        const desktopPlatform = process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : 'Windows';
        const model = isMobile ? device.model : '';
        const uaMetadata = {
            isMobile,
            platform: isMobile ? 'Android' : desktopPlatform,
            fullVersionList: [
                { brand: 'Not/A)Brand', version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0` },
                { brand: 'Microsoft Edge', version: app['edge_version'] },
                { brand: 'Chromium', version: app['chrome_version'] }
            ],
            brands: [
                { brand: 'Not/A)Brand', version: UserAgentManager.NOT_A_BRAND_VERSION },
                { brand: 'Microsoft Edge', version: app['edge_major_version'] },
                { brand: 'Chromium', version: app['chrome_major_version'] }
            ],
            platformVersion,
            architecture: isMobile ? '' : 'x86',
            bitness: isMobile ? '' : '64',
            model
        };
        return { userAgent: uaTemplate, userAgentMetadata: uaMetadata };
    }
    async getChromeVersion(isMobile) {
        try {
            const request = {
                url: urls_1.URLs.userAgent.chromeVersions,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            const response = await this.bot.http.request(request);
            const data = response.data;
            return data.channels.Stable.version;
        }
        catch (error) {
            this.bot.logger.error(isMobile, 'USERAGENT-CHROME-VERSION', `An error occurred: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async getEdgeVersions(isMobile) {
        try {
            const request = {
                url: urls_1.URLs.edge.products,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            const response = await this.bot.http.request(request);
            const data = response.data;
            const stable = data.find(x => x.Product == 'Stable');
            return {
                android: stable.Releases.find(x => x.Platform == 'Android')?.ProductVersion,
                windows: stable.Releases.find(x => x.Platform == 'Windows' && x.Architecture == 'x64')?.ProductVersion
            };
        }
        catch (error) {
            this.bot.logger.error(isMobile, 'USERAGENT-EDGE-VERSION', `An error occurred: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    getSystemComponents(mobile, androidVersion = 13) {
        if (mobile) {
            return `Linux; Android ${androidVersion}; K`;
        }
        switch (process.platform) {
            case 'darwin':
                return 'Macintosh; Intel Mac OS X 10_15_7';
            case 'linux':
                return 'X11; Linux x86_64';
            default:
                return 'Windows NT 10.0; Win64; x64';
        }
    }
    async getAppComponents(isMobile) {
        const versions = await this.getEdgeVersions(isMobile);
        const edgeVersion = isMobile ? versions.android : versions.windows;
        const edgeMajorVersion = edgeVersion?.split('.')[0];
        const chromeVersion = await this.getChromeVersion(isMobile);
        const chromeMajorVersion = chromeVersion?.split('.')[0];
        const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`;
        return {
            not_a_brand_version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0`,
            not_a_brand_major_version: UserAgentManager.NOT_A_BRAND_VERSION,
            edge_version: edgeVersion,
            edge_major_version: edgeMajorVersion,
            chrome_version: chromeVersion,
            chrome_major_version: chromeMajorVersion,
            chrome_reduced_version: chromeReducedVersion
        };
    }
    async updateFingerprintUserAgent(fingerprint, isMobile) {
        try {
            const userAgentData = await this.getUserAgent(isMobile);
            const componentData = await this.getAppComponents(isMobile);
            const meta = userAgentData.userAgentMetadata;
            //@ts-expect-error Errors due it not exactly matching
            fingerprint.fingerprint.navigator.userAgentData = meta;
            fingerprint.fingerprint.navigator.userAgent = userAgentData.userAgent;
            fingerprint.fingerprint.navigator.appVersion = userAgentData.userAgent.replace(`${fingerprint.fingerprint.navigator.appCodeName}/`, '');
            fingerprint.headers['user-agent'] = userAgentData.userAgent;
            fingerprint.headers['sec-ch-ua'] =
                `"Microsoft Edge";v="${componentData.edge_major_version}", "Not=A?Brand";v="${componentData.not_a_brand_major_version}", "Chromium";v="${componentData.chrome_major_version}"`;
            fingerprint.headers['sec-ch-ua-full-version-list'] =
                `"Microsoft Edge";v="${componentData.edge_version}", "Not=A?Brand";v="${componentData.not_a_brand_version}", "Chromium";v="${componentData.chrome_version}"`;
            fingerprint.headers['sec-ch-ua-mobile'] = meta.isMobile ? '?1' : '?0';
            fingerprint.headers['sec-ch-ua-platform'] = `"${meta.platform}"`;
            fingerprint.headers['sec-ch-ua-platform-version'] = `"${meta.platformVersion}"`;
            fingerprint.headers['sec-ch-ua-arch'] = `"${meta.architecture}"`;
            fingerprint.headers['sec-ch-ua-bitness'] = `"${meta.bitness}"`;
            fingerprint.headers['sec-ch-ua-model'] = `"${meta.model}"`;
            /*
            Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0
            sec-ch-ua-full-version-list: "Microsoft Edge";v="129.0.2792.84", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
            sec-ch-ua: "Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"
    
            Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
            "Google Chrome";v="129.0.6668.90", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
            */
            return fingerprint;
        }
        catch (error) {
            this.bot.logger.error(isMobile, 'USER-AGENT-UPDATE', `An error occurred: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
exports.UserAgentManager = UserAgentManager;
//# sourceMappingURL=UserAgent.js.map