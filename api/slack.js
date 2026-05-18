require('dotenv').config();
const { App } = require('@slack/bolt');
const { VercelReceiver, createHandler } = require('@vercel/slack-bolt');
const { registerHandlers } = require('../src/index');

const receiver = new VercelReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true
});

registerHandlers(app);

const handler = createHandler(app, receiver);

module.exports = async (req) => {
  return handler(req);
};
