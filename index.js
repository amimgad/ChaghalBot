
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'سلام! 👋\n\nبه ربات چاقال خوش اومدی ❤️\n\nبرای استفاده از بات، ربات رو به گروهت اضافه کن و ادمینش کن!'
  );
});

bot.on('polling_error', (error) => {
  console.error('Telegram error:', error.message);
});

console.log('ChaghalBot is running!');
