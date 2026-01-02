"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateTelegram = authenticateTelegram;
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const readline = __importStar(require("readline"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * Helper script to authenticate with Telegram and get session string.
 * Run this once: npx ts-node src/auth.ts
 */
async function authenticateTelegram(apiId, apiHash) {
    const session = new sessions_1.StringSession('');
    const client = new telegram_1.TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });
    await client.start({
        phoneNumber: async () => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            return new Promise((resolve) => {
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
            return new Promise((resolve) => {
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
            return new Promise((resolve) => {
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
    const sessionString = client.session.save();
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
