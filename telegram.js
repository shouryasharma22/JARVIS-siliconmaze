async function sendTelegram(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram is not configured. Add TELEGRAM_BOT_TOKEN to .env.');
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) throw new Error(payload.description || `Telegram request failed (${response.status}).`);
  return payload.result;
}

module.exports = { sendTelegram };