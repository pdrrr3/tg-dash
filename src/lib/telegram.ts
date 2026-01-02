import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

export class TelegramPortfolioClient {
  private client: TelegramClient;
  private targetBotUsername: string;

  constructor(
    apiId: number,
    apiHash: string,
    sessionString: string,
    targetBotUsername: string
  ) {
    const session = new StringSession(sessionString);
    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      requestRetries: 5,
      floodSleepThreshold: 60,
      retryDelay: 2000,
    });
    this.targetBotUsername = targetBotUsername;
  }

  async connect(): Promise<void> {
    if (this.client.connected) {
      try {
        if (await this.client.checkAuthorization()) {
          return;
        }
      } catch {
        console.log('[TELEGRAM] Connection stale, reconnecting...');
      }
    }

    await this.client.connect();

    if (!(await this.client.checkAuthorization())) {
      throw new Error('Not authorized. Please authenticate first.');
    }
  }

  async ensureConnected(): Promise<void> {
    try {
      if (this.client.connected && (await this.client.checkAuthorization())) {
        return;
      }
    } catch {
      console.log('[TELEGRAM] Reconnecting...');
    }

    await this.connect();
  }

  async sendPositionsCommand(): Promise<string> {
    await this.ensureConnected();

    try {
      const entity = await this.client.getEntity(this.targetBotUsername);

      const messagesBefore = await this.client.getMessages(entity, { limit: 1 });
      const lastMessageId = messagesBefore.length > 0 ? messagesBefore[0].id : 0;

      await this.client.sendMessage(entity, {
        message: '/positions',
      });

      const startTime = Date.now();
      const timeout = 30000;
      const seenMessageIds = new Set<number>();

      while (Date.now() - startTime < timeout) {
        const messages = await this.client.getMessages(entity, {
          limit: 10,
        });

        for (const message of messages) {
          if (
            message.id > lastMessageId &&
            message.senderId &&
            message.senderId.toString() === entity.id.toString() &&
            message.message &&
            !seenMessageIds.has(message.id)
          ) {
            seenMessageIds.add(message.id);
            const msgText = message.message;

            if (
              msgText.includes('Loading') ||
              msgText.includes('loading') ||
              msgText.length < 50
            ) {
              continue;
            }

            return msgText;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const allMessages = await this.client.getMessages(entity, { limit: 10 });
      for (const message of allMessages) {
        if (
          message.id > lastMessageId &&
          message.senderId &&
          message.senderId.toString() === entity.id.toString() &&
          message.message
        ) {
          return message.message;
        }
      }

      throw new Error('Timeout waiting for bot response');
    } catch (error) {
      console.error('[TELEGRAM] Error in sendPositionsCommand:', error);
      throw new Error(
        `Failed to get positions: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      return !!this.client.connected && (await this.client.checkAuthorization());
    } catch {
      return false;
    }
  }

  getSessionString(): string {
    return this.client.session.save() as unknown as string;
  }

  async fetchHistoricalMessages(
    limit: number = 2000
  ): Promise<Array<{ message: string; date: Date; id: number }>> {
    await this.ensureConnected();

    try {
      const entity = await this.client.getEntity(this.targetBotUsername);
      const messages = await this.client.getMessages(entity, { limit });

      const portfolioMessages: Array<{ message: string; date: Date; id: number }> = [];

      for (const msg of messages) {
        if (
          msg.senderId &&
          msg.senderId.toString() === entity.id.toString() &&
          msg.message &&
          (msg.message.includes('Total Balance') || msg.message.includes('Positions('))
        ) {
          portfolioMessages.push({
            message: msg.message,
            date: msg.date ? new Date(msg.date * 1000) : new Date(),
            id: msg.id,
          });
        }
      }

      return portfolioMessages;
    } catch (error) {
      throw new Error(
        `Failed to fetch historical messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  // Expose underlying client for auth flow
  getClient(): TelegramClient {
    return this.client;
  }
}

// Singleton instance for server-side use
let telegramClient: TelegramPortfolioClient | null = null;

export function getTelegramClient(): TelegramPortfolioClient | null {
  return telegramClient;
}

export function setTelegramClient(client: TelegramPortfolioClient | null): void {
  telegramClient = client;
}

export async function initializeTelegramClient(): Promise<TelegramPortfolioClient | null> {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;
  const botUsername = process.env.TARGET_BOT_USERNAME;

  if (!apiId || !apiHash || !session || !botUsername) {
    console.log('[TELEGRAM] Missing credentials, skipping initialization');
    return null;
  }

  try {
    const client = new TelegramPortfolioClient(
      parseInt(apiId, 10),
      apiHash,
      session,
      botUsername
    );

    await client.connect();
    telegramClient = client;
    console.log('[TELEGRAM] Client initialized and connected');
    return client;
  } catch (error) {
    console.error('[TELEGRAM] Failed to initialize client:', error);
    return null;
  }
}
