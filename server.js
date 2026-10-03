require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const {
  ensureStore, readJson, writeJson,
} = require('./store');
const { buildSystemPrompt, callLLM } = require('./llm');
const googleService = require('./google');
const { sendTelegram } = require('./telegram');

ensureStore();
const app = express();
const port = Number(process.env.PORT) || 3000;
const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const allowedIntents = new Set([
  'create_event', 'list_events', 'create_reminder', 'list_reminders',
  'search_drive', 'list_drive', 'send_telegram', 'show_history', 'chat',
]);
const intentAliases = {
  create_calendar_event: 'create_event', add_event: 'create_event', schedule_event: 'create_event', calendar_event: 'create_event',
  get_events: 'list_events', calendar_events: 'list_events', list_calendar_events: 'list_events', upcoming_events: 'list_events',
  add_reminder: 'create_reminder', set_reminder: 'create_reminder', reminder: 'create_reminder', create_local_reminder: 'create_reminder',
  get_reminders: 'list_reminders', reminders: 'list_reminders', show_reminders: 'list_reminders',
  find_file: 'search_drive', search_files: 'search_drive', find_document: 'search_drive', search: 'search_drive',
  find: 'search_drive', search_drive_files: 'search_drive', drive_search: 'search_drive',
  list_files: 'list_drive', list_drive_files: 'list_drive', get_drive_files: 'list_drive', browse_drive: 'list_drive', drive_list: 'list_drive',
  send_message: 'send_telegram', send_telegram_message: 'send_telegram', telegram_message: 'send_telegram', message_contact: 'send_telegram',
  history: 'show_history', action_history: 'show_history', get_history: 'show_history', list_history: 'show_history',
  converse: 'chat', respond: 'chat', talk: 'chat',
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

function googleConnected() {
  if (!googleService.isConfigured()) return false;
  const tokens = readJson('tokens.json');
  return Boolean(tokens.access_token || tokens.refresh_token);
}

function checkGoogleSession(error) {
  const message = error.message || '';
  if (/Google session expired|invalid_grant|status code 401/i.test(message)) {
    return 'Google session expired. Click LINK GOOGLE to re-authenticate.';
  }
  return message || 'Google request failed.';
}

function normalizeIntents(payload) {
  if (!payload || !Array.isArray(payload.actions)) return payload;
  return {
    ...payload,
    actions: payload.actions.map((action) => {
      if (!action || typeof action.intent !== 'string') return action;
      const rawIntent = action.intent;
      const normalized = rawIntent.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const intent = allowedIntents.has(normalized) ? normalized : intentAliases[normalized];
      if (!intent) console.error('Unrecognised LLM intent:', rawIntent);
      return intent ? { ...action, intent } : action;
    }),
  };
}

function validDateTime(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(new Date(value).getTime());
}

function localDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

function contactMatch(name) {
  const contacts = readJson('contacts.json');
  const key = Object.keys(contacts).find((contactName) => contactName.toLowerCase() === name.toLowerCase());
  return key ? { name: key, chatId: contacts[key] } : null;
}

function parseActions(payload) {
  if (!payload || !Array.isArray(payload.actions) || typeof payload.reply !== 'string') {
    throw new Error('The assistant returned an unexpected response. Please try again.');
  }
  for (const action of payload.actions) {
    if (!action || !allowedIntents.has(action.intent)) throw new Error('The assistant returned an unsupported action. Please try again.');
  }
}

function actionClarification(actions) {
  for (const action of actions) {
    if (action.intent === 'create_event') {
      if (typeof action.title !== 'string' || !action.title.trim()) return 'What should I call the calendar event?';
      if (!validDateTime(action.start)) return 'What date and time should I schedule the event?';
    }
    if (action.intent === 'create_reminder') {
      if (typeof action.text !== 'string' || !action.text.trim()) return 'What should I remind you about?';
      if (!validDateTime(action.time)) return 'When should I remind you?';
    }
    if (action.intent === 'search_drive' && (typeof action.query !== 'string' || !action.query.trim())) return 'What should I search for in Drive?';
    if (action.intent === 'send_telegram') {
      if (typeof action.recipient !== 'string' || !action.recipient.trim()) return 'Who should receive the Telegram message?';
      if (!contactMatch(action.recipient)) return `I don't have ${action.recipient} as a Telegram contact. Add them in COMMS first.`;
      if (typeof action.message !== 'string' || !action.message.trim()) return `What message should I send to ${action.recipient}?`;
    }
  }
  return null;
}

function deriveBeforeReminder(actions, userText) {
  const match = userText.match(/(\d+)\s*(minute|min|hour|hr)s?\s+before\s+(?:it|the event|that)/i);
  const event = actions.find((action) => action.intent === 'create_event' && validDateTime(action.start));
  const reminder = actions.find((action) => action.intent === 'create_reminder');
  if (!match || !event || !reminder) return;
  const multiplier = /hour|hr/i.test(match[2]) ? 60 : 1;
  reminder.time = new Date(new Date(event.start).getTime() - Number(match[1]) * multiplier * 60 * 1000).toISOString();
}

async function executeAction(action) {
  const { intent } = action;
  try {
    if (intent === 'create_event') {
      if (typeof action.title !== 'string' || !action.title.trim() || !validDateTime(action.start)) throw new Error('An event title and valid start time are required.');
      const event = await googleService.createEvent({ ...action, title: action.title.trim() });
      return { intent, status: 'success', message: `Calendar event created: ${event.summary || action.title}.`, data: event, refresh: 'calendar' };
    }
    if (intent === 'list_events') {
      const events = await googleService.listEvents();
      return { intent, status: 'success', message: `Found ${events.length} upcoming calendar event${events.length === 1 ? '' : 's'}.`, data: events, refresh: 'calendar' };
    }
    if (intent === 'create_reminder') {
      if (typeof action.text !== 'string' || !action.text.trim() || !validDateTime(action.time)) throw new Error('A reminder and valid time are required.');
      const reminder = { id: crypto.randomUUID(), text: action.text.trim(), time: new Date(action.time).toISOString(), done: false };
      const reminders = readJson('reminders.json');
      reminders.push(reminder);
      writeJson('reminders.json', reminders);
      return { intent, status: 'success', message: `Reminder set for ${new Date(reminder.time).toLocaleString('en-US', { timeZone: timezone })}.`, data: reminder, refresh: 'reminders' };
    }
    if (intent === 'list_reminders') {
      const reminders = readJson('reminders.json');
      const today = localDateKey(new Date());
      const data = (action.filter === 'today' ? reminders.filter((reminder) => localDateKey(new Date(reminder.time)) === today) : reminders)
        .sort((a, b) => new Date(a.time) - new Date(b.time));
      return { intent, status: 'success', message: `There ${data.length === 1 ? 'is' : 'are'} ${data.length} reminder${data.length === 1 ? '' : 's'}.`, data, refresh: 'reminders' };
    }
    if (intent === 'search_drive') {
      if (typeof action.query !== 'string' || !action.query.trim()) throw new Error('A Drive search query is required.');
      const files = await googleService.searchDrive(action.query.trim());
      const message = files.length
        ? `Found ${files.length} Drive item${files.length === 1 ? '' : 's'}.`
        : `No files matching '${action.query.trim()}' found in your Drive.`;
      return { intent, status: 'success', message, data: files, refresh: 'drive' };
    }
    if (intent === 'list_drive') {
      const files = await googleService.listDriveFiles(typeof action.folder === 'string' && action.folder.trim() ? action.folder.trim() : 'root');
      return { intent, status: 'success', message: `Loaded ${files.length} Drive item${files.length === 1 ? '' : 's'}.`, data: files, refresh: 'drive' };
    }
    if (intent === 'send_telegram') {
      if (typeof action.recipient !== 'string' || typeof action.message !== 'string' || !action.message.trim()) throw new Error('A known recipient and message text are required.');
      const recipient = contactMatch(action.recipient);
      if (!recipient) throw new Error(`Unknown Telegram contact “${action.recipient}”. Add this contact in the COMMS tab first.`);
      return {
        intent, status: 'needs_confirm', message: `Confirm sending a Telegram message to ${recipient.name}.`,
        data: { recipient: recipient.name, message: action.message.trim() },
        action: { intent, recipient: recipient.name, message: action.message.trim() }, refresh: 'comms',
      };
    }
    if (intent === 'show_history') {
      const data = readJson('history.json').sort((a, b) => new Date(b.time) - new Date(a.time));
      return { intent, status: 'success', message: `Showing ${data.length} recent action${data.length === 1 ? '' : 's'}.`, data, refresh: 'comms' };
    }
    return { intent: 'chat', status: 'success', message: typeof action.reply === 'string' ? action.reply : 'At your service.', data: null };
  } catch (error) {
    const message = intent.startsWith('create_event') || intent === 'list_events' || intent.includes('drive')
      ? checkGoogleSession(error) : error.message;
    return { intent, status: 'error', message: message || 'Action failed.', data: null, refresh: intent === 'send_telegram' ? 'comms' : undefined };
  }
}

app.get('/auth', (req, res) => {
  try {
    if (!googleService.isConfigured()) throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.');
    res.redirect(googleService.googleAuthUrl());
  }
  catch (error) { apiError(res, 503, error.message); }
});

app.get('/oauth2callback', async (req, res) => {
  if (typeof req.query.code !== 'string') return res.status(400).send('Google authorization code is missing.');
  try {
    await googleService.exchangeCode(req.query.code);
    res.redirect('/');
  } catch (error) {
    res.status(500).send(`Google authorization failed: ${checkGoogleSession(error)}`);
  }
});

app.get('/api/status', (req, res) => {
  res.json({ online: true, google: googleConnected(), telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN), llm: Boolean(process.env.LLM_API_KEY) });
});

app.post('/api/command', async (req, res) => {
  const { text, turns = [] } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return apiError(res, 400, 'Command text is required.');
  if (!Array.isArray(turns) || turns.length > 12 || turns.some((turn) => !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.text !== 'string')) {
    return apiError(res, 400, 'Conversation context is invalid.');
  }
  if (!process.env.LLM_API_KEY) return apiError(res, 503, 'LLM_API_KEY is not configured. Add it to .env to enable commands.');
  try {
    const context = turns.slice(-8).map((turn) => `${turn.role === 'user' ? 'User' : 'JARVIS'}: ${turn.text}`).join('\n');
    const userText = context ? `Recent conversation:\n${context}\n\nLatest user message: ${text.trim()}` : text.trim();
    const now = new Date();
    const localDateTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(now);
    const rawParsed = await callLLM(buildSystemPrompt({
      localDateTime, timezone, contactNames: Object.keys(readJson('contacts.json')),
    }), userText);
    console.log('Raw LLM JSON:', JSON.stringify(rawParsed));
    const parsed = normalizeIntents(rawParsed);
    parseActions(parsed);
    const requiredClarification = actionClarification(parsed.actions);
    if (requiredClarification) return res.json({ reply: requiredClarification, clarification: requiredClarification, results: [] });
    if (typeof parsed.clarification === 'string' && parsed.clarification.trim()) {
      if (parsed.actions.length) return apiError(res, 502, 'Assistant must not execute actions while asking a clarification question.');
      return res.json({ reply: parsed.clarification.trim(), clarification: parsed.clarification.trim(), results: [] });
    }
    deriveBeforeReminder(parsed.actions, text);
    const results = [];
    for (const action of parsed.actions) results.push(await executeAction(action));
    res.json({ reply: parsed.reply, results });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Command processing failed.' });
  }
});

app.post('/api/execute', async (req, res) => {
  const action = req.body?.action;
  if (!action || action.intent !== 'send_telegram' || typeof action.recipient !== 'string' || typeof action.message !== 'string' || !action.message.trim()) {
    return apiError(res, 400, 'A valid confirmed Telegram action is required.');
  }
  const found = contactMatch(action.recipient);
  const attemptedAt = new Date().toISOString();
  let result;
  try {
    if (!found) throw new Error(`Unknown Telegram contact “${action.recipient}”. Add this contact in the COMMS tab first.`);
    const sent = await sendTelegram(found.chatId, action.message.trim());
    result = { intent: 'send_telegram', status: 'success', message: `Telegram message sent to ${found.name}.`, data: { messageId: sent.message_id, recipient: found.name }, refresh: 'comms' };
  } catch (error) {
    result = { intent: 'send_telegram', status: 'error', message: error.message || 'Telegram send failed.', data: null, refresh: 'comms' };
  }
  const history = readJson('history.json');
  history.push({
    id: crypto.randomUUID(), recipient: found?.name || action.recipient,
    summary: action.message.trim().slice(0, 240), time: attemptedAt,
    status: result.status, performedBy: 'JARVIS', ...(result.status === 'error' ? { error: result.message } : {}),
  });
  writeJson('history.json', history);
  res.json({ reply: result.message, results: [result] });
});

app.get('/api/calendar', async (req, res) => {
  try { res.json({ events: await googleService.listEvents() }); }
  catch (error) { apiError(res, 503, checkGoogleSession(error)); }
});

app.get('/api/reminders', (req, res) => res.json({ reminders: readJson('reminders.json').sort((a, b) => new Date(a.time) - new Date(b.time)) }));
app.post('/api/reminders/:id/done', (req, res) => {
  const reminders = readJson('reminders.json');
  const reminder = reminders.find((item) => item.id === req.params.id);
  if (!reminder) return apiError(res, 404, 'Reminder not found.');
  reminder.done = true;
  writeJson('reminders.json', reminders);
  res.json({ reminder });
});
app.delete('/api/reminders/:id', (req, res) => {
  const reminders = readJson('reminders.json');
  const remaining = reminders.filter((item) => item.id !== req.params.id);
  if (remaining.length === reminders.length) return apiError(res, 404, 'Reminder not found.');
  writeJson('reminders.json', remaining);
  res.json({ success: true });
});

app.get('/api/drive/folders', async (req, res) => {
  try { res.json({ folders: await googleService.listFolders() }); }
  catch (error) { apiError(res, 503, checkGoogleSession(error)); }
});
app.get('/api/drive/files', async (req, res) => {
  if (req.query.folderId !== undefined && typeof req.query.folderId !== 'string') return apiError(res, 400, 'folderId must be a string.');
  try { res.json({ files: await googleService.listDriveFiles(req.query.folderId || 'root') }); }
  catch (error) { apiError(res, 503, checkGoogleSession(error)); }
});
app.get('/api/drive/search', async (req, res) => {
  if (typeof req.query.q !== 'string' || !req.query.q.trim()) return apiError(res, 400, 'Search query is required.');
  try { res.json({ files: await googleService.searchDrive(req.query.q.trim()) }); }
  catch (error) { apiError(res, 503, checkGoogleSession(error)); }
});
app.post('/api/drive/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return apiError(res, 400, 'Choose a file to upload.');
  const { folderId, newFolderName } = req.body || {};
  if (folderId !== undefined && typeof folderId !== 'string') return apiError(res, 400, 'folderId must be a string.');
  if (newFolderName !== undefined && (typeof newFolderName !== 'string' || newFolderName.length > 120)) return apiError(res, 400, 'Folder name must be 120 characters or fewer.');
  try {
    const file = await googleService.uploadDriveFile(req.file, { folderId: folderId || 'root', newFolderName: newFolderName?.trim() || undefined });
    res.json({ file, message: 'File uploaded to Google Drive.' });
  } catch (error) { apiError(res, 503, checkGoogleSession(error)); }
});

app.get('/api/contacts', (req, res) => res.json({ contacts: readJson('contacts.json') }));
app.post('/api/contacts', (req, res) => {
  const { name, chatId } = req.body || {};
  if (typeof name !== 'string' || !/^[\p{L}\p{N}_ -]{1,40}$/u.test(name.trim())) return apiError(res, 400, 'Contact name must be 1 to 40 letters, numbers, spaces, underscores, or hyphens.');
  if ((typeof chatId !== 'string' && typeof chatId !== 'number') || !/^-?\d{4,20}$/.test(String(chatId))) return apiError(res, 400, 'Telegram chat ID must be a numeric ID.');
  const contacts = readJson('contacts.json');
  contacts[name.trim().toLowerCase()] = String(chatId);
  writeJson('contacts.json', contacts);
  res.status(201).json({ contacts });
});
app.get('/api/history', (req, res) => res.json({ history: readJson('history.json').sort((a, b) => new Date(b.time) - new Date(a.time)) }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) return apiError(res, 400, error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 25 MB upload limit.' : error.message);
  if (error instanceof SyntaxError && error.status === 400) return apiError(res, 400, 'Request body must be valid JSON.');
  console.error('Request failed:', error.message);
  return apiError(res, 500, 'An unexpected server error occurred.');
});

app.listen(port, () => {
  console.log(`J.A.R.V.I.S online at http://localhost:${port}`);
  const googleConfigured = googleService.isConfigured();
  console.log(`Integrations: Google ${googleConfigured ? (googleConnected() ? 'linked' : 'configured, not linked') : 'not configured'} | Telegram ${process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured'} | Gemini ${process.env.LLM_API_KEY ? 'configured' : 'not configured'}`);
});