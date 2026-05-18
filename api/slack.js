require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const { registerHandlers } = require('../src/index');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
  endpoints: '/api/slack'
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver
});

registerHandlers(app);

const expressApp = receiver.app;

module.exports = (req, res) => {
  expressApp(req, res);
};
