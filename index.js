
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing!');
}

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

const COOLDOWN_MS = 4 * 60 * 1000;

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

bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  try {
    await bot.sendMessage(
      msg.chat.id,
      '🦆 به چاقال خوش اومدی!\n\nبرای گرفتن سکه، ربات رو به گروهت اضافه کن و بنویس «چاق» 💸'
    );
  } catch (err) {
    console.error('Start error:', err.message);
  }
});

bot.on('message', async (msg) => {
  try {
    if (!msg.text || !msg.from || msg.from.is_bot) return;

    // فقط پیام دقیق «چاق» در گروه یا سوپرگروه
    if (!['group', 'supergroup'].includes(msg.chat.type)) return;
    if (msg.text.trim() !== 'چاق') return;

    const userId = String(msg.from.id);
    const username =
      msg.from.username ||
      [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') ||
      'Player';

    const now = Date.now();

    // ساخت بازیکن، اگر قبلاً ثبت نشده باشد
    await db.execute(
      `INSERT IGNORE INTO chaghal_players
       (user_id, username, balance, last_chag_at)
       VALUES (?, ?, 0, 0)`,
      [userId, username]
    );

    // دریافت یک‌باره موجودی و زمان آخرین دریافت
    const [rows] = await db.execute(
      'SELECT balance, last_chag_at FROM chaghal_players WHERE user_id = ?',
      [userId]
    );

    const player = rows[0];
    const elapsed = now - Number(player.last_chag_at);

    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;

      await bot.sendMessage(
        msg.chat.id,
        `⏳ ${msg.from.first_name || 'داش'}، هنوز وقت چاق‌کردن نرسیده!\n` +
        `🕒 ${minutes} دقیقه و ${seconds} ثانیه دیگه دوباره امتحان کن.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const reward = Math.floor(Math.random() * 11) + 20;

    // افزایش موجودی و ثبت زمان، در یک تراکنش
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [lockedRows] = await conn.execute(
        'SELECT balance, last_chag_at FROM chaghal_players WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      const lockedPlayer = lockedRows[0];
      const lockedElapsed = Date.now() - Number(lockedPlayer.last_chag_at);

      if (lockedElapsed < COOLDOWN_MS) {
        await conn.rollback();

        const remaining = Math.ceil((COOLDOWN_MS - lockedElapsed) / 1000);
        await bot.sendMessage(
          msg.chat.id,
          `⏳ هنوز باید ${Math.ceil(remaining / 60)} دقیقه صبر کنی!`,
          { reply_to_message_id: msg.message_id }
        );
        return;
      }

      await conn.execute(
        `UPDATE chaghal_players
         SET balance = balance + ?, last_chag_at = ?, username = ?
         WHERE user_id = ?`,
        [reward, Date.now(), username, userId]
      );

      const [updatedRows] = await conn.execute(
        'SELECT balance FROM chaghal_players WHERE user_id = ?',
        [userId]
      );

      await conn.commit();

      await bot.sendMessage(
        msg.chat.id,
        `🦆 آفرین ${msg.from.first_name || 'داش'}!\n\n` +
        `💸 سکه دریافتی: +${reward}\n` +
        `💰 موجودی کل: ${updatedRows[0].balance} سکه\n` +
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

