const state = {
  queue: [],
  busy: false,
  mode: 'queue',
  controller: null,
  turns: [],
  alertedReminders: new Set(),
  status: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const log = $('#message-log');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function addMessage(text, type = 'assistant', stamp) {
  const message = document.createElement('article');
  message.className = `message ${type}-message`;
  const label = document.createElement('span');
  label.className = 'message-stamp';
  label.textContent = stamp || (type === 'user' ? 'OPERATOR // YOU' : type === 'success' ? 'ACTION // COMPLETE' : type === 'error' ? 'ACTION // FAILED' : type === 'pending' ? 'ACTION // AWAITING CONFIRMATION' : 'J.A.R.V.I.S // RESPONSE');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  message.append(label, paragraph);
  log.append(message);
  log.scrollTop = log.scrollHeight;
  return message;
}

function addConfirmation(result) {
  const card = document.createElement('article');
  card.className = 'confirmation-card';
  const title = document.createElement('strong');
  title.textContent = 'CONFIRM ACTION';
  const description = document.createElement('p');
  description.textContent = `Send to ${result.data.recipient}: “${result.data.message}”`;
  const actions = document.createElement('div');
  actions.className = 'confirm-actions';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.textContent = 'CONFIRM';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'CANCEL';
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    addMessage(`Sending Telegram message to ${result.data.recipient}...`, 'pending');
    try {
      const response = await api('/api/execute', { method: 'POST', body: JSON.stringify({ action: result.action }) });
      for (const step of response.results || []) await showResult(step);
    } catch (error) {
      addMessage(error.message, 'error');
    }
    card.remove();
  });
  cancel.addEventListener('click', () => {
    confirm.disabled = true;
    cancel.disabled = true;
    addMessage('Action cancelled.', 'assistant');
    card.remove();
  });
  actions.append(confirm, cancel);
  card.append(title, description, actions);
  log.append(card);
  log.scrollTop = log.scrollHeight;
}

function formatDate(dateValue, options = {}) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'TIME UNAVAILABLE';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...options }).format(date);
}

function makeEmpty(target, text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  target.replaceChildren(empty);
}

function makeDataItem({ className = '', symbol = '', title, detail = '', trailing = '', url, actions }) {
  const item = document.createElement('article');
  item.className = `data-item ${className}`.trim();
  if (symbol) {
    const mark = document.createElement('span');
    mark.className = className.includes('reminder') ? 'event-mark reminder-mark' : className.includes('drive') ? 'drive-symbol' : 'event-mark';
    mark.textContent = symbol;
    item.append(mark);
  }
  const copy = document.createElement('div');
  copy.className = 'item-copy';
  const heading = document.createElement('strong');
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = title;
    heading.append(link);
  } else {
    heading.textContent = title;
  }
  copy.append(heading);
  if (detail) {
    const description = document.createElement('span');
    description.textContent = detail;
    copy.append(description);
  }
  item.append(copy);
  if (actions) {
    item.append(actions);
  } else if (trailing) {
    const aside = document.createElement('span');
    aside.className = 'item-trailing';
    aside.textContent = trailing;
    item.append(aside);
  }
  return item;
}

function setActiveTab(tabName) {
  $$('.tab-button').forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach((panel) => {
    const active = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function updateLastSync() {
  $('#last-sync').textContent = `SYNC ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

async function refreshCalendar() {
  const target = $('#calendar-list');
  if (state.status && !state.status.google) {
    makeEmpty(target, 'Link Google to load Calendar events.');
    return;
  }
  try {
    const { events } = await api('/api/calendar');
    if (!events.length) return makeEmpty(target, 'No upcoming events found.');
    target.replaceChildren(...events.map((event) => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime;
      const stamp = start ? new Date(start) : null;
      const day = stamp && !Number.isNaN(stamp.getTime()) ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(stamp).toUpperCase() : 'EVENT';
      const time = start ? formatDate(start, { dateStyle: undefined, timeStyle: 'short' }) : 'All day';
      return makeDataItem({ symbol: day, title: event.summary || '(Untitled event)', detail: `${time}${end ? ` — ${formatDate(end, { dateStyle: undefined, timeStyle: 'short' })}` : ''}${event.location ? ` · ${event.location}` : ''}`, trailing: 'CALENDAR' });
    }));
  } catch (error) {
    makeEmpty(target, error.message);
  }
  updateLastSync();
}

async function refreshReminders() {
  const target = $('#reminder-list');
  try {
    const { reminders } = await api('/api/reminders');
    const pending = reminders.filter((reminder) => !reminder.done).length;
    $('#reminder-count').textContent = String(pending);
    if (!reminders.length) return makeEmpty(target, 'No reminders yet.');
    target.replaceChildren(...reminders.map((reminder) => {
      const actions = document.createElement('div');
      actions.className = 'reminder-actions';
      if (!reminder.done) {
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'small-action';
        done.setAttribute('aria-label', `Mark ${reminder.text} done`);
        done.title = 'Mark done';
        done.textContent = '✓';
        done.addEventListener('click', async () => { await api(`/api/reminders/${encodeURIComponent(reminder.id)}/done`, { method: 'POST' }); await refreshReminders(); });
        actions.append(done);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small-action';
      remove.setAttribute('aria-label', `Delete ${reminder.text}`);
      remove.title = 'Delete';
      remove.textContent = '×';
      remove.addEventListener('click', async () => { await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, { method: 'DELETE' }); await refreshReminders(); });
      actions.append(remove);
      return makeDataItem({ className: `reminder-item${reminder.done ? ' done' : ''}`, symbol: '🔔', title: reminder.text, detail: formatDate(reminder.time), trailing: '', actions });
    }));
    checkDueReminders(reminders);
    updateLastSync();
  } catch (error) {
    makeEmpty(target, error.message);
  }
}

function checkDueReminders(reminders) {
  const due = reminders.find((reminder) => !reminder.done && new Date(reminder.time).getTime() <= Date.now() && !state.alertedReminders.has(reminder.id));
  if (!due) return;
  state.alertedReminders.add(due.id);
  $('#reminder-alert-text').textContent = due.text;
  $('#reminder-alert').classList.remove('hidden');
  setActiveTab('reminders');
}

function mimeLabel(mimeType = '') {
  if (mimeType === 'application/vnd.google-apps.folder') return 'FOLDER';
  if (mimeType === 'application/vnd.google-apps.document') return 'GOOGLE DOC';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'GOOGLE SHEET';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'SLIDES';
  const subtype = mimeType.split('/')[1] || 'file';
  return subtype.split(/[.+-]/)[0].toUpperCase().slice(0, 18);
}

function renderDriveFiles(files) {
  const target = $('#drive-list');
  if (!files.length) return makeEmpty(target, 'No Drive items found.');
  target.replaceChildren(...files.map((file) => makeDataItem({
    className: 'drive-item', symbol: file.mimeType === 'application/vnd.google-apps.folder' ? '▰' : '▱',
    title: file.name || 'Untitled', detail: mimeLabel(file.mimeType),
    trailing: `${file.parentName || 'My Drive'}\n${file.modifiedTime ? formatDate(file.modifiedTime, { dateStyle: 'short', timeStyle: undefined }) : ''}`,
    url: file.webViewLink,
  })));
}

async function refreshDrive() {
  if (state.status && !state.status.google) {
    makeEmpty($('#drive-list'), 'Link Google to browse or upload Drive files.');
    return;
  }
  try {
    const { files } = await api('/api/drive/files');
    renderDriveFiles(files);
  } catch (error) { makeEmpty($('#drive-list'), error.message); }
  try {
    const { folders } = await api('/api/drive/folders');
    const select = $('#upload-folder');
    const selected = select.value;
    select.replaceChildren(new Option('My Drive (default)', 'root'));
    folders.forEach((folder) => select.add(new Option(folder.name, folder.id)));
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  } catch (error) {
    $('#upload-feedback').textContent = error.message;
    $('#upload-feedback').className = 'form-feedback error';
  }
  updateLastSync();
}

async function refreshComms() {
  try {
    const [{ contacts }, { history }] = await Promise.all([api('/api/contacts'), api('/api/history')]);
    const contactList = $('#contact-list');
    const names = Object.keys(contacts);
    if (!names.length) makeEmpty(contactList, 'No Telegram contacts added.');
    else contactList.replaceChildren(...names.map((name) => {
      const tag = document.createElement('span');
      tag.className = 'contact-tag';
      tag.textContent = name;
      return tag;
    }));
    const target = $('#history-list');
    if (!history.length) makeEmpty(target, 'No transmissions logged.');
    else target.replaceChildren(...history.slice(0, 20).map((entry) => {
      const light = document.createElement('span');
      light.className = `history-light${entry.status === 'error' ? ' failed' : ''}`;
      return makeDataItem({ className: 'history-entry', title: `${entry.recipient}: ${entry.summary}`, detail: `${formatDate(entry.time)} · ${entry.performedBy}`, trailing: entry.status.toUpperCase(), actions: light });
    }));
  } catch (error) {
    makeEmpty($('#history-list'), error.message);
  }
  updateLastSync();
}

async function refreshFor(name) {
  if (!name) return;
  setActiveTab(name);
  if (name === 'calendar') await refreshCalendar();
  if (name === 'reminders') await refreshReminders();
  if (name === 'drive') await refreshDrive();
  if (name === 'comms') await refreshComms();
}

async function showResult(result) {
  if (result.status === 'needs_confirm') {
    addMessage(result.message, 'pending');
    addConfirmation(result);
  } else {
    addMessage(result.message || 'Action complete.', result.status === 'error' ? 'error' : 'success');
  }
  if (result.refresh) await refreshFor(result.refresh);
}

function updateQueueDisplay() {
  const count = state.queue.length;
  $('#queue-label').textContent = state.busy ? 'COMMAND ACTIVE' : count ? `${count} QUEUED` : 'QUEUE CLEAR';
  $('#queue-count').textContent = `${count} PENDING`;
  $('#queue-preview').classList.toggle('hidden', count === 0);
  $('#queue-preview').replaceChildren(...state.queue.map((command) => {
    const item = document.createElement('li');
    item.textContent = command;
    return item;
  }));
  $('.queue-light').style.background = state.busy ? 'var(--orange)' : 'var(--green)';
}

async function processCommand(text) {
  if (state.status && !state.status.llm) {
    addMessage('LLM_API_KEY is not configured. Add it to .env to enable commands.', 'error');
    return;
  }
  const controller = new AbortController();
  state.controller = controller;
  $('#processing-indicator').classList.remove('hidden');
  try {
    const response = await api('/api/command', {
      method: 'POST', signal: controller.signal,
      body: JSON.stringify({ text, turns: state.turns.slice(-8) }),
    });
    const assistantReply = response.clarification || response.reply;
    if (assistantReply) addMessage(assistantReply, 'assistant');
    state.turns.push({ role: 'user', text }, ...(assistantReply ? [{ role: 'assistant', text: assistantReply }] : []));
    state.turns = state.turns.slice(-12);
    for (const result of response.results || []) {
      if (result.intent !== 'chat') await showResult(result);
    }
  } catch (error) {
    if (error.name === 'AbortError') addMessage('Active request interrupted. Any action already completed on the server remains in effect.', 'pending');
    else addMessage(error.message, 'error');
  } finally {
    $('#processing-indicator').classList.add('hidden');
    state.controller = null;
  }
}

async function pumpQueue() {
  if (state.busy || !state.queue.length) return;
  state.busy = true;
  updateQueueDisplay();
  const command = state.queue.shift();
  updateQueueDisplay();
  await processCommand(command);
  state.busy = false;
  updateQueueDisplay();
  if (state.queue.length) pumpQueue();
}

function submitCommand(text) {
  if (state.busy && state.mode === 'interrupt') {
    state.queue.splice(0);
    state.queue.push(text);
    state.controller?.abort();
    addMessage(`Interrupt requested. Starting next: “${text}”`, 'pending', 'COMMAND // INTERRUPT');
  } else if (state.busy) {
    state.queue.push(text);
    addMessage(`Queued: “${text}”`, 'pending', 'COMMAND // QUEUED');
  } else {
    state.queue.push(text);
  }
  updateQueueDisplay();
  pumpQueue();
}

async function refreshStatus() {
  try {
    const status = await api('/api/status');
    const wasGoogleConnected = state.status?.google;
    state.status = status;
    for (const name of ['google', 'telegram', 'llm']) {
      const chip = $(`[data-status="${name}"]`);
      const ready = Boolean(status[name]);
      chip.classList.toggle('ready', ready);
      $('b', chip).textContent = ready ? 'READY' : 'OFFLINE';
    }
    $('#google-link').classList.toggle('hidden', status.google);
    if (!wasGoogleConnected && status.google) refreshFor($('.tab-button.active')?.dataset.tab || 'calendar');
  } catch (error) {
    addMessage(`Status link unavailable: ${error.message}`, 'error');
  }
}

$('#command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#command-input');
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  submitCommand(text);
});

$('#command-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#command-form').requestSubmit();
  }
});

$$('.mode-button').forEach((button) => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  $$('.mode-button').forEach((option) => {
    const selected = option === button;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
}));

$$('.tab-button').forEach((button) => button.addEventListener('click', () => refreshFor(button.dataset.tab)));
$$('[data-refresh]').forEach((button) => button.addEventListener('click', () => refreshFor(button.dataset.refresh)));
$$('.quick-chip').forEach((button) => button.addEventListener('click', () => {
  const input = $('#command-input');
  input.value = button.dataset.command;
  input.focus();
}));

$('#drive-search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('#drive-search-input').value.trim();
  if (!query) return;
  setActiveTab('drive');
  if (state.status && !state.status.google) {
    makeEmpty($('#drive-list'), 'Link Google to search Drive.');
    return;
  }
  try {
    const { files } = await api(`/api/drive/search?q=${encodeURIComponent(query)}`);
    renderDriveFiles(files);
    updateLastSync();
  } catch (error) { makeEmpty($('#drive-list'), error.message); }
});

$('#upload-file').addEventListener('change', () => {
  $('#file-label').textContent = $('#upload-file').files[0]?.name || 'SELECT A FILE';
});
$('#upload-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const file = $('#upload-file').files[0];
  if (!file) return;
  if (state.status && !state.status.google) {
    $('#upload-feedback').textContent = 'Link Google to upload files to Drive.';
    $('#upload-feedback').className = 'form-feedback error';
    return;
  }
  const data = new FormData();
  data.append('file', file);
  data.append('folderId', $('#upload-folder').value || 'root');
  if ($('#new-folder').value.trim()) data.append('newFolderName', $('#new-folder').value.trim());
  const progress = $('#upload-progress');
  const feedback = $('#upload-feedback');
  const bar = $('#upload-progress-bar');
  progress.classList.remove('hidden');
  feedback.textContent = 'Preparing upload...';
  feedback.className = 'form-feedback';
  const request = new XMLHttpRequest();
  request.open('POST', '/api/drive/upload');
  request.upload.addEventListener('progress', (progressEvent) => {
    if (!progressEvent.lengthComputable) return;
    const amount = Math.round((progressEvent.loaded / progressEvent.total) * 100);
    bar.style.width = `${amount}%`;
    $('#upload-progress-label').textContent = `${amount}%`;
    feedback.textContent = amount === 100 ? 'Transfer complete. Finalizing in Drive...' : `Uploading ${file.name}...`;
  });
  request.addEventListener('load', async () => {
    const payload = JSON.parse(request.responseText || '{}');
    if (request.status < 200 || request.status >= 300) {
      feedback.textContent = payload.error || `Upload failed (${request.status}).`;
      feedback.className = 'form-feedback error';
      return;
    }
    bar.style.width = '100%';
    $('#upload-progress-label').textContent = '100%';
    feedback.textContent = payload.file?.webViewLink ? `${payload.message} ${payload.file.webViewLink}` : payload.message;
    feedback.className = 'form-feedback success';
    $('#upload-form').reset();
    $('#file-label').textContent = 'SELECT A FILE';
    await refreshDrive();
  });
  request.addEventListener('error', () => {
    feedback.textContent = 'Upload failed. Check the network connection and try again.';
    feedback.className = 'form-feedback error';
  });
  request.send(data);
});

$('#contact-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#contact-name').value.trim();
  const chatId = $('#contact-chat-id').value.trim();
  try {
    await api('/api/contacts', { method: 'POST', body: JSON.stringify({ name, chatId }) });
    $('#contact-form').reset();
    await refreshComms();
    addMessage(`Contact ${name} is now available for Telegram.`, 'success');
  } catch (error) { addMessage(error.message, 'error'); }
});

$('#dismiss-alert').addEventListener('click', () => $('#reminder-alert').classList.add('hidden'));

function updateClock() {
  $('#clock-readout').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

async function initialize() {
  updateClock();
  await refreshStatus();
  await Promise.all([refreshCalendar(), refreshReminders(), refreshComms()]);
}

initialize();
setInterval(updateClock, 1000);
setInterval(refreshStatus, 30000);
setInterval(refreshReminders, 30000);