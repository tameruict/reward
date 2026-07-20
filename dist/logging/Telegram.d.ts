import type { WebhookTelegramConfig } from '../interface/Config';
import type { LogLevel } from './Logger';
export declare function sendTelegram(config: WebhookTelegramConfig, content: string, level: LogLevel): Promise<void>;
export declare function flushTelegramQueue(timeoutMs?: number): Promise<void>;
//# sourceMappingURL=Telegram.d.ts.map