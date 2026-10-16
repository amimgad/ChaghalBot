
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing!');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true
});

const welcomeMessage = `🦆 *به دنیای چاقال خوش اومدی!* 💸

سلام رفیق! 👋😈
اینجا قراره از صفر شروع کنی، پولدار بشی، دارایی جمع کنی و توی دنیای چاقال پیشرفت کنی!

💰 *امکانات چاقال:*

▫️ 💵 کسب درآمد و جمع‌آوری پول
▫️ 💼 شغل‌های مختلف و درآمدزایی
▫️ 🏠 خرید خونه و ساخت زندگی مجازی
▫️ 🚘 خرید ماشین و جمع‌آوری دارایی
▫️ 📈 افزایش سطح و پیشرفت
▫️ 🎲 اتفاقات تصادفی و سرگرمی
▫️ 🏆 رقابت با بقیه و رسیدن به رتبه‌های برتر

📌 *برای شروع:*
دستورهای بات رو بررسی کن و ماجراجویی خودت رو شروع کن!

📢 *کانال رسمی چاقال‌سیتی:*
https://t.me/ChaghalCity

🔥 پول جمع کن، پیشرفت کن و به ثروتمندترین بازیکن چاقال تبدیل شو! 🦆💸`;

bot.onText(/^\/start(?:@\w+)?(?:\s+.*)?$/, (msg) => {
    bot.sendMessage(msg.chat.id, welcomeMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });
});

bot.onText(/^\/help(?:@\w+)?$/, (msg) => {
    const helpMessage = `🦆 *راهنمای ربات چاقال*

💸 به دنیای چاقال خوش اومدی!

قابلیت‌های اقتصادی ربات در حال آماده‌سازی هستن و به‌زودی اضافه می‌شن.

📢 کانال رسمی:
https://t.me/ChaghalCity`;

    bot.sendMessage(msg.chat.id, helpMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });
});

bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
});

console.log('🦆 ChaghalBot is running!');

