import 'dotenv/config';
import { App } from '@slack/bolt';
import { VercelReceiver, createHandler } from '@vercel/slack-bolt';
import { registerHandlers } from '../src/index.js';

const receiver = new VercelReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  signatureVerification: false
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
  tokenVerificationEnabled: false
});

registerHandlers(app);

const handler = createHandler(app, receiver);

export async function POST(req) {
  return handler(req);
}
