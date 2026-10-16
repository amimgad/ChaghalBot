
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

const bot = new TelegramBot(TOKEN, { polling: true });

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5
});

const COOLDOWN = 4 * 60 * 1000;

const WELCOME = `🦆 به دنیای چاقال خوش اومدی! 💸

سلام رفیق! 👋😈

اینجا قراره از صفر شروع کنی، پولدار بشی، دارایی جمع کنی و توی دنیای چاقال پیشرفت کنی! 💰

امکانات چاقال:

▫️ 💵 کسب درآمد و جمع‌آوری پول
▫️ 💼 شغل‌های مختلف و درآمدزایی
▫️ 🏠 خرید خونه و ساخت زندگی مجازی
▫️ 🚘 خرید ماشین و جمع‌آوری دارایی
▫️ 📈 افزایش سطح و پیشرفت
▫️ 🎲 اتفاقات تصادفی و سرگرمی
▫️ 🏆 رقابت با بقیه بازیکن‌ها

🔥 این فقط شروع ماجراست؛ قراره کلی امکانات خفن به چاقال اضافه بشه!

📢 کانال رسمی چاقال:
https://t.me/ChaghalCity

💚 آماده‌ای وارد دنیای چاقال بشی؟`;

async function setupDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chaghal_players (
      user_id BIGINT NOT NULL PRIMARY KEY,
      username VARCHAR(255),
      balance BIGINT NOT NULL DEFAULT 0,
      last_chag_at BIGINT NOT NULL DEFAULT 0
    )
  `);
  console.log('Chaghal MySQL connected; table ready!');
}

// پیام خوش‌آمدگویی در پیوی
bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  try {
    await bot.sendMessage(msg.chat.id, WELCOME);
  } catch (err) {
    console.error('Welcome error:', err.message);
  }
});

// دستور مشاهده موجودی: «موجودی»
bot.on('message', async (msg) => {
  if (!msg.text || !msg.from || msg.from.is_bot) return;

  const text = msg.text.trim();
  const isGroup = ['group', 'supergroup'].includes(msg.chat.type);

  if (!isGroup) return;

  const userId = String(msg.from.id);
  const username = msg.from.username ||
    [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') ||
    'Player';

  try {
    
if (text === 'موجودی') {
  const [rows] = await db.execute(
    'SELECT balance FROM chaghal_players WHERE user_id = ?',
    [userId]
  );

  const balance = rows.length ? rows[0].balance : 0;
  const name = [msg.from.first_name, msg.from.last_name]
    .filter(Boolean)
    .join(' ');

  const message =
    `💰 **موجودی ${name || 'بازیکن'}**\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🦆 **پول:** ${balance} سکه\n` +
    `🏦 **سپرده بانک:** فعلاً 0\n` +
    `⭐️ **اشتراک:** فعلاً بدون اشتراک\n` +
    `━━━━━━━━━━━━━━━━━━━`;

  await bot.sendMessage(msg.chat.id, message, {
    reply_to_message_id: msg.message_id,
    parse_mode: 'Markdown'
  });

  return;
}


    if (text !== 'چاق') return;

    await db.execute(
      `INSERT IGNORE INTO chaghal_players
       (user_id, username, balance, last_chag_at)
       VALUES (?, ?, 0, 0)`,
      [userId, username]
    );

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        'SELECT balance, last_chag_at FROM chaghal_players WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      const player = rows[0];
      const now = Date.now();
      const elapsed = now - Number(player.last_chag_at);

      if (elapsed < COOLDOWN) {
        await conn.rollback();

        const remaining = Math.ceil((COOLDOWN - elapsed) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        await bot.sendMessage(
          msg.chat.id,
          `⏳ ${msg.from.first_name || 'داش'}، یکم صبر کن!\n` +
          `🕒 ${minutes} دقیقه و ${seconds} ثانیه دیگه دوباره بنویس «چاق».`,
          { reply_to_message_id: msg.message_id }
        );
        return;
      }

      const reward = Math.floor(Math.random() * 11) + 20;

      await conn.execute(
        `UPDATE chaghal_players
         SET balance = balance + ?, last_chag_at = ?, username = ?
         WHERE user_id = ?`,
        [reward, now, username, userId]
      );

      const [updated] = await conn.execute(
        'SELECT balance FROM chaghal_players WHERE user_id = ?',
        [userId]
      );

      await conn.commit();

      await bot.sendMessage(
        msg.chat.id,
        `🦆 دمت گرم ${msg.from.first_name || 'داش'}!\n\n` +
        `💸 سکه گرفتی: +${reward}\n` +
        `💰 موجودی کل: ${updated[0].balance} سکه\n` +
        `⏳ دریافت بعدی: ۴ دقیقه دیگه`,
        { reply_to_message_id: msg.message_id }
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Message handler error:', err.message);
  }
});

bot.on('polling_error', (err) => {
  console.error('Telegram polling error:', err.message);
});

async function start() {
  try {
    await setupDatabase();
    console.log('🦆 ChaghalBot is running!');
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  }
}

start();
