const { google } = require('googleapis');
const { Readable } = require('stream');
const { readJson, writeJson } = require('./store');

const timezone = () => process.env.TIMEZONE || 'Asia/Kolkata';

function getOAuthClient() {
  console.log('Google OAuth config lengths:', JSON.stringify({
    clientIdLength: process.env.GOOGLE_CLIENT_ID?.length || 0,
    clientSecretLength: process.env.GOOGLE_CLIENT_SECRET?.length || 0,
  }));
  console.log('Google OAuth2 client lifecycle: created lazily on each getOAuthClient() call; not cached.');
  if (!isConfigured()) {
    throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.');
  }
  const oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
  );
  const savedTokens = readJson('tokens.json');
  if (savedTokens.access_token || savedTokens.refresh_token) oauthClient.setCredentials(savedTokens);
  oauthClient.on('tokens', (tokens) => {
    const previous = readJson('tokens.json');
    writeJson('tokens.json', { ...previous, ...tokens });
  });
  return oauthClient;
}

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function googleAuthUrl() {
  const auth = getOAuthClient();
  return auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive'],
  });
}

async function exchangeCode(code) {
  const auth = getOAuthClient();
  let tokenResponse;
  try {
    tokenResponse = await auth.getToken(code);
  } catch (error) {
    console.error('Google OAuth getToken response data:', JSON.stringify(error.response?.data ?? null));
    throw error;
  }
  const { tokens } = tokenResponse;
  auth.setCredentials(tokens);
  writeJson('tokens.json', tokens);
}

function calendarApi() {
  return google.calendar({ version: 'v3', auth: getOAuthClient() });
}

function driveApi() {
  return google.drive({ version: 'v3', auth: getOAuthClient() });
}

function normalizeGoogleError(error) {
  const status = error.code || error.response?.status;
  const message = error.message || '';
  if (status === 401 || /invalid_grant/i.test(message)) {
    return new Error('Google session expired. Click LINK GOOGLE to re-authenticate.');
  }
  return error;
}

async function createEvent({ title, start, end, description }) {
  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      throw new Error('Event start/end time is invalid.');
    }
    const result = await calendarApi().events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description: description || undefined,
        start: { dateTime: startDate.toISOString(), timeZone: timezone() },
        end: { dateTime: endDate.toISOString(), timeZone: timezone() },
      },
    });
    return result.data;
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

async function listEvents() {
  try {
    const result = await calendarApi().events.list({
      calendarId: 'primary', timeMin: new Date().toISOString(), maxResults: 10,
      singleEvents: true, orderBy: 'startTime',
    });
    return result.data.items || [];
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

async function listFolders() {
  try {
    const result = await driveApi().files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id,name,parents)', orderBy: 'name', pageSize: 1000,
    });
    return result.data.files || [];
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

async function listDriveFiles(folderId = 'root') {
  try {
    const api = driveApi();
    const result = await api.files.list({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,parents,modifiedTime,webViewLink)',
      orderBy: 'folder,name', pageSize: 100,
    });
    const folders = await listFolders();
    const names = new Map(folders.map((folder) => [folder.id, folder.name]));
    return (result.data.files || []).map((file) => ({ ...file, parentName: names.get(file.parents?.[0]) || 'My Drive' }));
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

async function searchDrive(query) {
  try {
    const api = driveApi();
    const escaped = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const conditions = [`name contains '${escaped}' and trashed = false`, `fullText contains '${escaped}' and trashed = false`];
    const results = await Promise.all(conditions.map((q) => api.files.list({
      q, fields: 'files(id,name,mimeType,parents,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc', pageSize: 25,
    })));
    const unique = new Map(results.flatMap((item) => item.data.files || []).map((file) => [file.id, file]));
    const folders = await listFolders();
    const names = new Map(folders.map((folder) => [folder.id, folder.name]));
    return [...unique.values()].map((file) => ({ ...file, parentName: names.get(file.parents?.[0]) || 'My Drive' }));
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

async function uploadDriveFile(file, { folderId = 'root', newFolderName } = {}) {
  try {
    const api = driveApi();
    let parent = folderId;
    if (newFolderName) {
      const createdFolder = await api.files.create({
        requestBody: { name: newFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [folderId] },
        fields: 'id,name,webViewLink',
      });
      parent = createdFolder.data.id;
    }
    const uploaded = await api.files.create({
      requestBody: { name: file.originalname, parents: [parent] },
      media: { mimeType: file.mimetype || 'application/octet-stream', body: Readable.from(file.buffer) },
      fields: 'id,name,mimeType,webViewLink,modifiedTime,parents',
    });
    return uploaded.data;
  } catch (error) {
    throw normalizeGoogleError(error);
  }
}

module.exports = {
  isConfigured, getOAuthClient, googleAuthUrl, exchangeCode,
  createEvent, listEvents, listFolders, listDriveFiles, searchDrive, uploadDriveFile,
};