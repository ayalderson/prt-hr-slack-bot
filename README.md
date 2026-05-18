# PRt HR Slack Bot — Setup Guide

## What You Need
- A computer with [Node.js](https://nodejs.org) installed (version 18 or above)
- Your PRt Slack workspace admin access
- Your Airtable account (free)
- Your Google Sheet already published

---

## Step 1 — Install Node.js (if not already)

1. Go to [nodejs.org](https://nodejs.org)
2. Download and install the **LTS** version
3. Open Terminal and verify: `node -v` — should show v18 or higher

---

## Step 2 — Set Up Airtable

1. Go to [airtable.com](https://airtable.com) and sign in
2. Create a new **Base** called `PRt HR Bot`
3. Rename the default table to `FAQ`
4. Add these 3 columns (delete any default ones):

| Field Name | Field Type |
|------------|------------|
| `Question` | Single line text |
| `Answer` | Long text |
| `Keywords` | Single line text |

5. Import the FAQ data:
   - Click the **grid icon** (top left of table) → **Import data** → **CSV file**
   - Upload the `data/faq_seed.csv` file included in this project
   - This loads all 11 FAQs from the PRt handbook automatically

6. Get your **API Token**:
   - Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
   - Click **Create new token**
   - Name: `prt-bot`
   - Scope: add `data.records:read`
   - Access: select your `PRt HR Bot` base
   - Click **Create token** → copy the `pat...` value

7. Get your **Base ID**:
   - Open your base in Airtable
   - Look at the browser URL: `https://airtable.com/appXXXXXX/...`
   - Copy the `appXXXXXX` part

---

## Step 3 — Publish Your Google Sheet

1. Open **PRt Leave Log 2026** in Google Sheets
2. Click **File → Share → Publish to web**
3. Click **Publish** → OK
4. Done — no URL needed, the Sheet ID is already in the code

---

## Step 4 — Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App → From scratch**
3. Name: `PRt HR Bot`
4. Select your PRt Slack workspace → **Create App**

### Enable Socket Mode
- Left sidebar → **Socket Mode** → toggle ON
- Click **Generate Token**
- Token name: `prt-socket`
- Scope: `connections:write` (already there)
- Click **Generate** → copy the `xapp-...` token → save it

### Add Bot Permissions
- Left sidebar → **OAuth & Permissions**
- Scroll to **Bot Token Scopes** → click **Add an OAuth Scope**
- Add each of these one by one:
```
app_mentions:read
channels:history
chat:write
commands
groups:history
im:history
im:write
users:read
```

### Enable Events
- Left sidebar → **Event Subscriptions** → toggle ON
- Click **Subscribe to bot events** → **Add Bot User Event**
- Add these 3:
```
app_home_opened
app_mention
message.im
```
- Click **Save Changes**

### Enable App Home Tab
- Left sidebar → **App Home**
- Under **Show Tabs** → toggle ON **Home Tab**

### Add Slash Commands
- Left sidebar → **Slash Commands** → **Create New Command**
- Add these 3 commands (Request URL can be anything, e.g. `https://placeholder.com`):

| Command | Description |
|---------|-------------|
| `/leave-balance` | Check an employee's leave balance |
| `/faq` | Search FAQs or list all |
| `/wfh-violations` | WFH violations audit (HR only) |

### Install the App
- Left sidebar → **Install App**
- Click **Install to Workspace** → Allow
- Copy the **Bot User OAuth Token** (`xoxb-...`) → save it

### Get Signing Secret
- Left sidebar → **Basic Information**
- Scroll to **App Credentials** → copy **Signing Secret**

---

## Step 5 — Configure Your .env File

Open the `.env` file in this project folder and fill in your values:

```
SLACK_BOT_TOKEN=xoxb-...        ← from Install App page
SLACK_APP_TOKEN=xapp-...        ← from Socket Mode page
SLACK_SIGNING_SECRET=...        ← from Basic Information → App Credentials
AIRTABLE_API_KEY=pat...         ← from airtable.com/create/tokens
AIRTABLE_BASE_ID=app...         ← from your Airtable base URL
AIRTABLE_FAQ_TABLE=FAQ
GOOGLE_SHEET_ID=13_I82Hw8e4aRxDBel4X3C-TOo3Z0AKP6kQEs3eg0g8Q
```

---

## Step 6 — Run the Bot

Open Terminal, navigate to this project folder, then:

```bash
# Install dependencies (only needed once)
npm install

# Start the bot
npm start
```

You should see:
```
✅ PRt HR Slack Bot is running!
   Leave data: Google Sheets (live CSV)
   FAQ: Airtable (keyword matching)
   No AI API required
```

Leave this terminal window open — the bot runs as long as this is open.

---

## Step 7 — Test It in Slack

1. Open Slack → find **PRt HR Bot** in your Apps sidebar
2. Click the **Home** tab → you should see the dashboard with buttons
3. Send a DM to the bot: `balance Aya Mohammed`
4. Send a DM: `working hours`
5. Send a DM: `sick leave`
6. Try slash commands: `/faq resignation`
7. Try slash commands: `/leave-balance Ahmed Alaa`

---

## How to Keep It Running 24/7

By default the bot only runs while your Terminal is open. To run it permanently on a server or always-on machine:

```bash
# Install PM2 (process manager)
npm install -g pm2

# Start the bot with PM2
pm2 start src/index.js --name prt-hr-bot

# Save and auto-start on reboot
pm2 save
pm2 startup
```

---

## How to Update FAQs

Just edit the records directly in your Airtable `FAQ` table — add, edit, or delete rows anytime. The bot refreshes its FAQ cache every 10 minutes automatically.

---

## How to Update Leave Data

Just add rows to your Google Sheet as usual. The bot fetches live data and refreshes every 5 minutes automatically.

---

## File Structure

```
prt-slack-bot/
├── src/
│   ├── index.js          — Main bot: all Slack handlers & commands
│   ├── faqService.js     — Reads FAQs from Airtable, keyword matching
│   ├── leaveService.js   — Reads leave data from Google Sheets live
│   └── slackBlocks.js    — All Slack UI components (buttons, modals, cards)
├── data/
│   └── faq_seed.csv      — Import this into Airtable to set up FAQs
├── .env                  — Your credentials (never share this file)
├── .env.example          — Template showing what goes in .env
├── package.json          — Project dependencies
└── README.md             — This file
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot doesn't respond | Make sure `npm start` is running in terminal |
| "Invalid token" error | Double-check your `.env` values, no extra spaces |
| FAQ returns no results | Check Airtable table name is exactly `FAQ` |
| Leave data not loading | Make sure Google Sheet is published (Step 3) |
| Can't find bot in Slack | Search for `PRt HR Bot` in Slack's App section |

---

## Contact & Support

HR: aya.mohammed@prt.iq | 07703855388

*PRt HR Bot — شركة افق النجاح / PRt Agency*
