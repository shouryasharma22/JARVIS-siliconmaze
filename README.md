# J.A.R.V.I.S Operations Console

A local personal-assistant console for Google Calendar, Google Drive, Telegram, and locally stored reminders. The interface is plain HTML, CSS, and JavaScript; the server uses Express and persists local state as JSON under `data/`.

## Requirements

- Node.js 18 or newer (the server uses the built-in `fetch` API)
- npm
- A Google Cloud project, Telegram bot, and Gemini API key for the corresponding integrations

## Setup

1. Install the dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the credentials described below. Keep `.env` private; it is ignored by Git.
3. Start the app with `npm start`.
4. Open [http://localhost:3000](http://localhost:3000). The local JSON files and `data/` directory are created automatically on first startup.

The app can start without credentials. Local reminders and the console remain available; unconfigured integrations report their missing settings in the status chips or action response.

## Google Calendar And Drive

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable the **Google Calendar API** and **Google Drive API**.
2. Configure the OAuth consent screen. While the app is in testing mode, add your Google account as a test user.
3. Create an OAuth client ID of type **Web application**. Add `http://localhost:3000/oauth2callback` as an authorized redirect URI.
4. Put the OAuth client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Set `GOOGLE_REDIRECT_URI` to the same callback URL.
5. Use **LINK GOOGLE** in the app and approve the requested Calendar and full Drive scopes. Tokens are stored in `data/tokens.json`.

Drive access is full Drive scope so existing folders can be listed and selected for uploads. Treat the local token file as a credential.

## Telegram

1. Start a chat with [@BotFather](https://t.me/BotFather), create a bot, and put its token in `TELEGRAM_BOT_TOKEN`.
2. Open a chat with the bot and send it a message. Obtain the numeric chat ID from the bot's `getUpdates` endpoint or a trusted Telegram chat-ID utility.
3. In the app's **COMMS** tab, add the contact name and numeric chat ID. Names are matched case-insensitively.
4. Ask JARVIS to send a message. It will present a confirmation card; the message is sent only after **CONFIRM**.

Each attempted send is recorded in `data/history.json`. Telegram bots generally cannot initiate a private conversation until the recipient has started the bot.

## Gemini

Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey), then set `LLM_API_KEY` in `.env`. `LLM_MODEL` defaults to `gemini-2.0-flash` and can be changed to a model available to your key. Natural-language command parsing is disabled with a clear API error until the key is configured.

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | unset |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | unset |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/oauth2callback` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | unset |
| `LLM_API_KEY` | Gemini API key | unset |
| `LLM_MODEL` | Gemini model name | `gemini-2.0-flash` |
| `TIMEZONE` | Assistant scheduling timezone | `Asia/Kolkata` |

## Example Commands

- “Schedule a design review tomorrow at 3 PM for one hour.”
- “Remind me to send the report at 5 PM today.”
- “Put a reminder 30 minutes before my planning meeting tomorrow at 10 AM.”
- “What is on my calendar today?”
- “List all my reminders.”
- “Search Drive for the project brief.”
- “Send Bruce a Telegram message saying I will be ten minutes late.”
- “Show my recent action history.”

Reminders are stored locally in `data/reminders.json`; their in-page alert is checked every 30 seconds while the app is open. Calendar, Drive, and Telegram requests require their corresponding credentials and Google authorization.