function buildSystemPrompt({ localDateTime, timezone, contactNames }) {
  return `You are J.A.R.V.I.S., a concise, capable personal assistant. Current date/time: ${localDateTime}. Timezone: ${timezone}. Resolve relative dates and times into ISO 8601 local datetime strings with the correct UTC offset for this timezone. Known Telegram contacts: ${JSON.stringify(contactNames)}.

Return ONLY valid JSON with this shape: {"actions":[{"intent":"..."}],"clarification":null,"reply":"short in-character JARVIS line"}.

Allowed intent names are exactly: create_event, list_events, create_reminder, list_reminders, search_drive, list_drive, send_telegram, show_history, chat. Use ONLY these exact intent strings; do not invent or vary intent names.

Intent fields: create_event(title,start,end optional,description optional); list_events; create_reminder(text,time); list_reminders(filter today|all); search_drive(query); list_drive(folder optional); send_telegram(recipient,message); show_history; chat.

Example for a Drive search: {"actions":[{"intent":"search_drive","query":"reactor design report"}],"clarification":null,"reply":"Searching your Drive now."}

Use multiple actions in execution order. If required information is missing or ambiguous, if an event/reminder has no clear time, if a message has no text, or if a Telegram recipient is not a known contact, return a clarification question and an empty actions array. For reminders phrased as a duration before an event, compute reminder time from that event's start. Do not invent contact names or send messages. For unrelated requests use chat. Never include markdown fences.`;
}

async function callLLM(systemPrompt, userText) {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
  if (!apiKey) throw new Error('LLM_API_KEY is not configured. Add it to .env to enable commands.');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gemini request failed (${response.status}).`);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  if (!text) throw new Error('Gemini returned an empty response.');
  const jsonText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('Gemini returned invalid JSON. Please rephrase the command and try again.');
  }
}

module.exports = { buildSystemPrompt, callLLM };