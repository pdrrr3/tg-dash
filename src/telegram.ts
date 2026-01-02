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
    });
    this.targetBotUsername = targetBotUsername;
  }

  async connect(): Promise<void> {
    await this.client.connect();
    
    if (!(await this.client.checkAuthorization())) {
      throw new Error('Not authorized. Please authenticate first.');
    }
  }

  async sendPositionsCommand(): Promise<string> {
    try {
      // Get the bot entity
      const entity = await this.client.getEntity(this.targetBotUsername);
      
      // Get the last message ID before sending
      const messagesBefore = await this.client.getMessages(entity, { limit: 1 });
      const lastMessageId = messagesBefore.length > 0 ? messagesBefore[0].id : 0;
      
      // Send /positions command
      await this.client.sendMessage(entity, {
        message: '/positions',
      });

      // Wait for the response (poll for up to 30 seconds)
      // The bot may send "Loading..." first, then the actual data
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds
      const seenMessageIds = new Set<number>();
      
      while (Date.now() - startTime < timeout) {
        const messages = await this.client.getMessages(entity, {
          limit: 10, // Get more messages to find the actual data
        });

        // Find messages from the bot that are newer than our command
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
            
            // Skip loading messages - wait for the actual data
            if (msgText.includes('Loading') || msgText.includes('loading') || msgText.length < 50) {
              continue;
            }
            
            // This looks like the actual portfolio data
            return msgText;
          }
        }

        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // If we didn't find the data message, return the last message from bot (might be the data)
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
      throw new Error(`Failed to get positions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getSessionString(): string {
    return (this.client.session.save() as unknown as string);
  }

  async fetchHistoricalMessages(limit: number = 2000): Promise<Array<{ message: string; date: Date; id: number }>> {
    try {
      const entity = await this.client.getEntity(this.targetBotUsername);
      const messages = await this.client.getMessages(entity, { limit });
      
      // Filter messages from the bot that look like portfolio responses
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
          date: msg.date ? new Date(msg.date * 1000) : new Date(), // Telegram dates are Unix timestamps
          id: msg.id,
        });
        }
      }
      
      return portfolioMessages;
    } catch (error) {
      throw new Error(`Failed to fetch historical messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}

