# J.A.R.V.I.S: Tony Stark's Personal AI Assistant

> A web-based command centre where plain-English commands trigger **real** actions on Google Calendar, Google Drive and Telegram, plus a local reminder system, all inside a Doomsday-themed Stark HUD.

**Team:** Linkeldin Park

**Live app:** https://jarvis-siliconmaze.onrender.com/
---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Judge Quick Path (5 minutes)](#2-judge-quick-path-5-minutes)
3. [Rubric Coverage Map](#3-rubric-coverage-map)
4. [Screenshots](#4-screenshots)
5. [Architecture](#5-architecture)
6. [Setup From Scratch](#6-setup-from-scratch)
7. [Deployment (Render)](#7-deployment-render)
8. [Usage Guide and Example Commands](#8-usage-guide-and-example-commands)
9. [How the Hard Parts Work](#9-how-the-hard-parts-work)
10. [API Reference](#10-api-reference)
11. [Project Structure](#11-project-structure)
12. [Error Handling Matrix](#12-error-handling-matrix)
13. [Security Notes](#13-security-notes)
14. [Known Limitations](#14-known-limitations)
15. [Troubleshooting](#15-troubleshooting)
16. [Tech Stack](#16-tech-stack)

---

## 1. What It Does

Tony types a command. JARVIS works out what he means, asks a follow-up question if something is missing, and then performs the action through a real integration. The right preview tab updates immediately so the result can be verified without leaving the page.

| Capability | Integration | Real or local? |
|---|---|---|
| Create and view calendar events | Google Calendar API | **Real** |
| Upload files, create folders, browse and search Drive | Google Drive API | **Real** |
| Send messages to contacts | Telegram Bot API | **Real** |
| Personal reminders | Local JSON store | Local (by design, shown separately from events) |
| Natural-language understanding | Google Gemini (REST) | **Real** |
| Multi-step commands, queue/interrupt, confirmations | Application logic | n/a |

Nothing is mocked. Events appear in the actual Google Calendar, files land in the actual Drive, and messages arrive in the actual Telegram chat.

---

## 2. Judge Quick Path (5 minutes)

Pick whichever path suits you.

### Path A: Watch the demo
Open the demo video linked at the top. It shows every test command below running end to end, with verification in the real Google and Telegram apps.

### Path B: Use the live app
1. Open https://jarvis-siliconmaze.onrender.com/ (the free tier may take up to a minute to wake up if it has been idle).
2. Click **LINK GOOGLE** and sign in with the demo account given in the submission notes.
3. On the "Google hasn't verified this app" screen, choose **Advanced → Go to JARVIS** and approve all permissions.
4. Run the six verification commands below.

### Path C: Run it yourself
1. Follow [Setup From Scratch](#6-setup-from-scratch) (about 15 minutes, mostly creating credentials).
2. Run `npm start` and open http://localhost:3000.
3. Click **LINK GOOGLE** and sign in with a Google account that is listed as a test user.
4. Run the six verification commands below.

### The six verification commands

| # | Command | Expected result |
|---|---|---|
| 1 | `Schedule a meeting with Bruce tomorrow at 4 PM` | Event appears in the CALENDAR tab and in real Google Calendar |
| 2 | `Remind me to check the Mark 50 at 7 PM` | Orange bell item in the REMINDERS tab, visually distinct from events |
| 3 | Use the DRIVE tab: choose a file, type a new folder name, upload | Progress bar, success message, folder and file visible in real Drive |
| 4 | `Find the reactor design report` | Result list with name, type, folder, modified time and an OPEN link |
| 5 | `Send Bruce a message saying the experiment is postponed` | CONFIRM/CANCEL card, then a message in Telegram and a COMMS history entry |
| 6 | `Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before, and message Bruce about it` | Three steps run in order. Preview updates after each. Reminder is at 5:30 PM |

> **Note on Google sign-in:** the OAuth app is in *Testing* mode, so only listed test users can sign in. Use the demo account from the submission notes. To use your own Google account, send us the address and we will add it, or create your own OAuth client following the setup guide.

### Extra checks worth trying
- `Schedule a meeting` with no time. JARVIS should ask a clarifying question.
- `Send Thor a message saying hi`. JARVIS should explain that the contact is unknown.
- Send two commands rapidly. Try both the **QUEUE** and **INTERRUPT** modes.
- Shrink the window under 800px to see the mobile stacked layout.

---

## 3. Rubric Coverage Map

| Task | Requirement | Where to see it |
|---|---|---|
| **1.1** Command centre (15) | Chat area, input, responses, split-screen Live Preview Pane, online indicator, responsive HUD | Main screen: chat on the left, tabbed preview on the right, pulsing **ONLINE** dot, GOOGLE/TELEGRAM/LLM chips in the header |
| **1.2** Commands and queuing (20) | Intent routing, clarification, queue or interrupt | LLM returns structured intents. Missing info triggers a question. **QUEUE / INTERRUPT** toggle under the input |
| **2.1** Calendar (20) | Create events, title/date/time/description, upcoming events in the pane, clarification | `create_event`, `list_events`. CALENDAR tab refreshes right after creation |
| **2.2** Reminders (20) | Create and list reminders, distinct from events, shown in the pane | REMINDERS tab (orange bell) vs CALENDAR tab (blue). Banner alert when a reminder time passes |
| **3.1** Drive upload (25) | Pick a file, choose or create a folder, upload to real Drive, progress, live pane, failure handling | DRIVE tab: file picker, folder dropdown (default My Drive), "create new folder" box, real progress bar, file/folder list |
| **3.2** Drive search (20) | Name, type, folder, modified time, open link | `search_drive` results in the DRIVE tab |
| **4.1** Telegram send (20) | Identify recipient, generate message, clarify, send, report status | `send_telegram` with contact lookup, confirmation card and clear success/failure |
| **4.2** History (15) | Recipient, summary, time, status, marked as JARVIS | COMMS tab history. Every entry is tagged `performedBy: JARVIS` |
| **5.1** Unified flow (20) | Multi-step commands in order, queue handling, per-step preview updates | One sentence yields multiple actions, executed sequentially. The pane switches and refreshes after each step |
| **5.2** Confirmation and errors (15) | No silent failures, confirmation for consequential actions | Telegram sends need CONFIRM. See the [error matrix](#12-error-handling-matrix) |
| **5.3** Polish (10) | HUD design, typography, animations, states, history | Orbitron/Rajdhani type, corner-bracket panels, scanlines, processing animation, colour-coded success/error/pending |

---

## 4. Screenshots

> Add screenshots to a `/docs` folder and reference them here.

| View | Image |
|---|---|
| Command centre (desktop) | `docs/command-centre.png` |
| Multi-step command mid-execution | `docs/multi-step.png` |
| Confirmation card | `docs/confirm.png` |
| Drive upload with progress | `docs/drive-upload.png` |
| Mobile layout | `docs/mobile.png` |

---

## 5. Architecture

```
┌────────────────────────── Browser (public/) ──────────────────────────┐
│  Chat console  ──►  client queue (QUEUE / INTERRUPT)                   │
│  Preview pane: CALENDAR | REMINDERS | DRIVE | COMMS                    │
└───────────────┬────────────────────────────────────────────────────────┘
                │ POST /api/command { text, recent turns }
                ▼
┌────────────────────────── Express server ─────────────────────────────┐
│ 1. llm.js        Send text + current date/time/timezone + contacts     │
│                  to Gemini. Get JSON back:                             │
│                  { actions[], clarification, reply }                   │
│ 2. server.js     If clarification, return the question, run nothing    │
│                  Otherwise run actions sequentially, each in try/catch │
│ 3. Dispatch                                                            │
│     create_event / list_events / search_drive / list_drive ► google.js │
│     create_reminder / list_reminders / show_history        ► store.js  │
│     send_telegram ► returns needs_confirm ► /api/execute ► telegram.js │
│ 4. Respond { reply, results[ {status, message, data, refresh} ] }      │
└───────────────┬────────────────────────────────────────────────────────┘
                ▼
   Google Calendar / Drive APIs   ·   Telegram Bot API   ·   data/*.json
```

**Design decisions**

- **One pipeline for everything.** Every capability is an *intent* in the same JSON schema, so single, multi-step and clarification flows all use the same code path.
- **LLM isolated behind one function.** `callLLM(systemPrompt, userText)` in `llm.js`, so the provider can be swapped without touching anything else.
- **The model never executes anything.** It only produces structured JSON. The server validates intents and runs the actions, so a bad model response cannot cause an unintended side effect.
- **No database.** State (tokens, reminders, history, contacts) lives in small JSON files. This keeps setup to a single `npm start`.
- **No frontend build step.** Plain HTML, CSS and JS, so there is nothing to compile.

---

## 6. Setup From Scratch

**Prerequisites:** Node.js 18 or newer (for the built-in `fetch`) and npm.

### 6.1 Install

```bash
git clone https://github.com/shouryasharma22/JARVIS-siliconmaze
cd JARVIS-siliconmaze
npm install
cp .env.example .env
```

### 6.2 Google Calendar and Drive credentials

1. Go to https://console.cloud.google.com and create a project.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Google Drive API**.
3. Open **Google Auth Platform** (https://console.cloud.google.com/auth/overview):
   - Complete the setup wizard. Choose **External** as the audience.
   - **Audience → Test users → Add users**: add the Google account(s) that will sign in.
4. **Clients → Create client → Web application**.
   - **Authorized redirect URI:** `http://localhost:3000/oauth2callback` (exact, no trailing slash). If you deploy, add the deployed URI as a second entry.
5. Copy the **Client ID** and **Client secret** into `.env`.

### 6.3 Telegram bot

1. In Telegram, message **@BotFather**, send `/newbot` and follow the prompts. Copy the bot token.
2. Open your new bot and send it any message, such as `hello`.
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and find `"chat":{"id": 123456789 ...}`. That number is the **chat ID**.
4. Anyone you want JARVIS to message must send your bot a message first. Telegram bots cannot start conversations.

### 6.4 LLM key (Gemini)

1. Go to https://aistudio.google.com/apikey and create an API key.
2. In AI Studio, copy the exact model code of a **Flash** model.

### 6.5 Configure `.env`

```dotenv
PORT=3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
TELEGRAM_BOT_TOKEN=your-bot-token
LLM_API_KEY=your-gemini-api-key
LLM_MODEL=your-model-code
TIMEZONE=Asia/Kolkata
```

No quotes and no spaces around `=`. Change `TIMEZONE` to your own [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) so "tomorrow at 4 PM" resolves correctly.

### 6.6 Add contacts

Either edit `data/contacts.json`:

```json
{
  "bruce": "YOUR_TELEGRAM_CHAT_ID"
}
```

or use the contacts form in the **COMMS** tab. Names are matched case-insensitively. For testing, use your own chat ID so messages arrive on your phone.

### 6.7 Run

```bash
npm start
```

Expected startup log:

```
J.A.R.V.I.S online at http://localhost:3000
Integrations: Google configured, not linked | Telegram configured | Gemini configured
```

Open http://localhost:3000, click **LINK GOOGLE**, sign in, then choose **Advanced → Go to JARVIS (unsafe)** on the "Google hasn't verified this app" screen. This warning is normal for apps in Testing mode. Approve **all** requested permissions. The GOOGLE chip turns green and the startup log changes to "linked" on the next restart.

---

## 7. Deployment (Render)

The live app at https://jarvis-siliconmaze.onrender.com/ runs on Render as a Node web service.

| Setting | Value |
|---|---|
| Build command | `npm install` |
| Start command | `npm start` |
| Port | Read from `process.env.PORT` (assigned by Render) |
| `GOOGLE_REDIRECT_URI` | `https://jarvis-siliconmaze.onrender.com/oauth2callback` |
| Other variables | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `LLM_API_KEY`, `LLM_MODEL`, `TIMEZONE` |

- All environment variables are entered in the Render dashboard. `.env` and `data/` are never committed or deployed.
- The deployed redirect URI is registered as an authorized redirect URI on the Google OAuth client, alongside the localhost one.
- After a restart or redeploy, click **LINK GOOGLE** once to reconnect (see [Known Limitations](#14-known-limitations)).

To deploy your own copy: push the repo to GitHub, create a Render **Web Service** from it, set the variables above, then add `https://<your-app>.onrender.com/oauth2callback` in Google Console.

---

## 8. Usage Guide and Example Commands

### Calendar
- `Schedule a meeting with Bruce Banner tomorrow at 4 PM`
- `Set up a design review on Friday at 2 PM with the description Mark 50 armour`
- `What do I have scheduled for tomorrow?`

### Reminders
- `Remind me to check the Mark 50 at 7 PM`
- `Remind me tomorrow morning about the reactor test`
- `What reminders do I have today?`

### Drive
- Use the **DRIVE** tab to upload: choose a file, pick a folder or type a new folder name, then upload.
- `Find the reactor design report`
- `Show me what is in my Drive`

### Telegram
- `Send Bruce a message saying the experiment is postponed`
- `Show my message history`

### Multi-step
- `Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before, and send Bruce a Telegram message about it`

### Clarification examples
- `Schedule a meeting` → *"What time should I schedule it?"*
- `Send a message` → asks who and what to send

### Interface controls
- **QUEUE / INTERRUPT toggle:** when a command is running and you submit another, QUEUE appends it (the pending count is shown). INTERRUPT cancels the running request and starts the new one.
- **CONFIRM / CANCEL cards:** appear before sending Telegram messages.
- **Quick-command chips** under the input fill in sample commands.

---

## 9. How the Hard Parts Work

### Natural-language time resolution
Each request sends the model the current date, time, weekday and configured timezone. The model resolves phrases like "tomorrow at 5 PM" into absolute ISO datetimes. "Remind me 30 minutes before it" is computed from the start time of the event in the same request.

### Clarification flow
If a required field is missing (no time, unknown recipient, empty message), the model returns a `clarification` question with **no actions**. The frontend shows the question and sends the last few conversation turns with the next message so the follow-up has context.

### Multi-step execution
The model returns an ordered `actions` array. The server runs the actions one at a time, in order, and returns one result per step. The frontend renders each step as its own chat line and switches to and refreshes the relevant preview tab as each result comes in.

### Queue and interrupt
A client-side queue with a busy flag. In **QUEUE** mode, commands submitted while busy are appended and processed in order. In **INTERRUPT** mode, the in-flight request is aborted with `AbortController` and the new command starts immediately.

### Confirmation step
`send_telegram` is never executed directly from `/api/command`. It returns `needs_confirm`. Only after the user presses CONFIRM does the frontend call `/api/execute`.

### Token persistence
Google tokens are saved in `data/tokens.json`, loaded at startup and rewritten when Google refreshes them, so the account stays linked across restarts (where the host keeps its disk).

---

## 10. API Reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/status` | `{ online, google, telegram, llm }` for the header chips |
| GET | `/auth` | Start Google OAuth |
| GET | `/oauth2callback` | OAuth redirect target |
| POST | `/api/command` | Main entry point. Body `{ text, history }` |
| POST | `/api/execute` | Run a confirmed action (Telegram send) |
| GET | `/api/calendar` | Upcoming events |
| GET | `/api/reminders` | List reminders |
| POST | `/api/reminders/:id/done` | Mark a reminder done |
| DELETE | `/api/reminders/:id` | Delete a reminder |
| GET | `/api/drive/folders` | Folders for the upload dropdown |
| GET | `/api/drive/files?folderId=` | Files and folders (default: My Drive root) |
| POST | `/api/drive/upload` | Multipart upload: `file`, optional `folderId`, optional `newFolderName` |
| GET / POST | `/api/contacts` | Read or add Telegram contacts |
| GET | `/api/history` | Communication history, newest first |

**Command response shape**

```json
{
  "reply": "Right away, sir.",
  "results": [
    {
      "intent": "create_event",
      "status": "success",
      "message": "Event created: Stark team meeting, tomorrow 6:00 PM",
      "data": {},
      "refresh": "calendar"
    }
  ]
}
```

`status` is one of `success`, `error` or `needs_confirm`.

---

## 11. Project Structure

```
.
├── server.js          Express app, routes, command pipeline, action dispatcher
├── llm.js             callLLM(): the only file that talks to the model provider
├── google.js          OAuth client, Calendar and Drive helpers
├── telegram.js        Telegram sendMessage wrapper
├── store.js           JSON file read/write (reminders, history, contacts, tokens)
├── public/
│   ├── index.html     Layout: chat console and tabbed preview pane
│   ├── style.css      HUD theme, animations, responsive rules
│   └── app.js         Chat, queue, confirmations, tabs, upload, polling
├── data/              Runtime state (git-ignored): tokens, reminders, history, contacts
├── .env.example       Template for credentials
└── README.md
```

---

## 12. Error Handling Matrix

JARVIS is designed not to fail silently. Each failure produces a readable message in the chat and a red status.

| Situation | What the user sees |
|---|---|
| Google not linked | Prompt to click **LINK GOOGLE** |
| Google token expired or revoked (401 / `invalid_grant`) | "Google session expired. Click LINK GOOGLE to re-authenticate." |
| LLM key missing or provider error | Clear error from `/api/command` instead of a crash |
| LLM returns an unrecognised intent | "Unsupported action" message, with a normalisation layer for common variants |
| Missing time, recipient or message | A clarification question, with no partial action executed |
| Unknown Telegram contact | Message telling the user to add the contact |
| Telegram API failure | Error text shown, and the attempt is logged in history as failed |
| Calendar event creation fails | Error message with the reason, and no false success |
| Drive upload fails or no file chosen | Error in the upload panel, and the progress bar resets |
| Drive search finds nothing | A friendly "no matching files" success message, not an error |
| Consequential action (send message) | Confirmation card before anything is sent |

---

## 13. Security Notes

- All secrets live in `.env` locally and in the host's environment settings when deployed. `.env` is git-ignored, and no credentials are in the source.
- `data/` (OAuth tokens, contacts, history) is git-ignored.
- User text is HTML-escaped before it is inserted into the page (XSS protection).
- The model's output is treated as untrusted data: only whitelisted intents run, and messages require explicit confirmation.
- OAuth uses `access_type=offline` so a refresh token is stored on the server. Access can be revoked at https://myaccount.google.com/permissions at any time.
- The Drive scope is full `drive` access, which is required in order to list existing folders and upload into them. A narrower `drive.file` scope would not show pre-existing folders.
- The live demo uses a dedicated throwaway Google account that holds no personal data. Its credentials are provided only in the submission notes, not in this repository.

---

## 14. Known Limitations

Stated openly so judges are not surprised:

- **Single user per instance.** There are no accounts. Tokens and data are stored per running instance, so everyone using the live app shares one linked Google account and sees the same calendar, Drive and history.
- **Free-tier hosting.** The Render service sleeps after inactivity (the first load can be slow), and its disk is reset on restart or redeploy. After that, the Google link, reminders, history and contacts may need to be set up again (click **LINK GOOGLE** once).
- **Google app is in Testing mode.** Only listed test users can sign in, and refresh tokens for Testing apps can expire after about 7 days, which requires re-linking.
- **Reminders are local.** They are alerted by an in-page banner while the app is open (polling every 30 seconds). They are not pushed to the phone or synced to Google Tasks.
- **Telegram requires the recipient to message the bot first.** This is a Telegram platform rule. Contacts map a name to a chat ID.
- **Intent parsing depends on the LLM.** Unusual phrasing can occasionally produce a wrong or unsupported intent. The server normalises common variants and fails with a clear message otherwise.
- **JSON-file storage** is not intended for concurrent multi-user load.
- **No deletion or editing of calendar events or Drive files through chat.** This is intentional to limit the risk of destructive actions.

---

## 15. Troubleshooting

| Symptom | Fix |
|---|---|
| `/auth` shows "Google OAuth is not configured" | `.env` is missing or empty, or the server was not restarted after editing it. Stop with `Ctrl+C`, then `npm start` |
| `redirect_uri_mismatch` (local) | The redirect URI in Google Console must be exactly `http://localhost:3000/oauth2callback` |
| `redirect_uri_mismatch` (live app) | `GOOGLE_REDIRECT_URI` on the host and the URI in Google Console must both be exactly `https://jarvis-siliconmaze.onrender.com/oauth2callback` |
| "Access blocked" / "app is being tested" | The Google account is not in **Audience → Test users** |
| `invalid_client` after consenting | The client secret or ID is wrong or from a different client. Create a new secret and restart |
| Live app is slow on first load | The free tier is waking up. Wait up to a minute and reload |
| Live app lost its Google link | The host restarted and reset its disk. Click **LINK GOOGLE** again |
| Telegram `getUpdates` returns `"result": []` | Send your bot a regular message, then reload the link |
| "Chat not found" from Telegram | The recipient has not messaged the bot, or the chat ID is wrong |
| Dates land on the wrong day | Set `TIMEZONE` to your IANA timezone |
| Port 3000 already in use | `pkill -f "node server.js"` or change `PORT` in `.env` and the redirect URI to match |
| LLM returns 404 or "model not found" | Copy the exact model code from AI Studio into `LLM_MODEL` |

---

## 16. Tech Stack

- **Backend:** Node.js, Express, `googleapis`, `multer`, `dotenv`, `cors`
- **Frontend:** HTML, CSS and vanilla JavaScript (no build step)
- **AI:** Google Gemini via REST, behind a swappable `callLLM()` function
- **Integrations:** Google Calendar API, Google Drive API, Telegram Bot API
- **Hosting:** Render (Node web service)
- **Design:** Orbitron and Rajdhani, cyan (`#00e5ff`) and Doomsday red-orange (`#ff3d00`) on a near-black HUD with scanline overlay

---

*"Sometimes you gotta run before you can walk."* — Tony Stark
