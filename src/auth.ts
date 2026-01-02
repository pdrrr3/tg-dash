import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Helper script to authenticate with Telegram and get session string.
 * Run this once: npx ts-node src/auth.ts
 */
export async function authenticateTelegram(apiId: number, apiHash: string): Promise<string> {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<string>((resolve) => {
        rl.question('Enter your phone number (with country code, e.g., +1234567890): ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    },
    password: async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<string>((resolve) => {
        rl.question('Enter your 2FA password (if enabled): ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    },
    phoneCode: async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<string>((resolve) => {
        rl.question('Enter the code you received: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    },
    onError: (err) => {
      console.error('Authentication error:', err);
      throw err;
    },
  });

  const sessionString = (client.session as StringSession).save() as string;
  await client.disconnect();

  return sessionString;
}

// If run directly
if (require.main === module) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash) {
    console.error('Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file');
    process.exit(1);
  }

  authenticateTelegram(apiId, apiHash)
    .then((sessionString) => {
      console.log('\n✅ Authentication successful!');
      console.log('\nAdd this to your .env file:');
      console.log(`TELEGRAM_SESSION=${sessionString}`);
    })
    .catch((error) => {
      console.error('Authentication failed:', error);
      process.exit(1);
    });
}

