
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing');
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

const COOLDOWN = 4 * 60 * 1000;
const XP_REWARD = 15;
const MAX_LEVEL = 100;

// XP لازم برای رفتن از لول فعلی به لول بعدی
function xpRequired(level) {
  if (level >= MAX_LEVEL) return 0;

  if (level <= 8) {
    return 50 * Math.pow(2, level - 1);
  }

  if (level === 9) return 6500;
  if (level === 10) return 8000;

  // بعد از لول ۱۱، مقدار XP هر مرحله
  // به ترتیب ۲۰۰۰، ۲۵۰۰، ۳۰۰۰ و ... بیشتر می‌شود.
  let required = 8000;

  for (let current = 10; current < level; current++) {
    required += 2000 + 500 * (current - 10);
  }

  return required;
}

// رنک مخصوص هر بازه لول
function getRank(level) {
  if (level >= 100) return '👑 فرمانروای چاقال';
  if (level >= 91) return '🌌 تایتان';
  if (level >= 81) return '⚡ اسطوره';
  if (level >= 71) return '🐉 افسانه‌ای';
  if (level >= 61) return '💰 سرمایه‌دار';
  if (level >= 51) return '👑 رئیس';
  if (level >= 41) return '🔥 استاد';
  if (level >= 31) return '💎 نخبه';
  if (level >= 21) return '🥇 حرفه‌ای';
  if (level >= 11) return '🥈 تلاشگر';
  if (level >= 6) return '🥉 مبتدی';
  return '🪶 تازه‌وارد';
}

function playerName(user) {
  return [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ') || 'بازیکن';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

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

  const [columns] = await db.query(
    'SHOW COLUMNS FROM chaghal_players'
  );

  const existingColumns = columns.map(column => column.Field);

  if (!existingColumns.includes('level')) {
    await db.query(`
      ALTER TABLE chaghal_players
      ADD COLUMN level INT NOT NULL DEFAULT 1
    `);
  }

  if (!existingColumns.includes('xp')) {
    await db.query(`
      ALTER TABLE chaghal_players
      ADD COLUMN xp BIGINT NOT NULL DEFAULT 0
    `);
  }

  console.log('🦆 Chaghal MySQL connected; level system ready!');
}

// خوش‌آمدگویی در پیوی
bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  try {
    await bot.sendMessage(msg.chat.id, WELCOME);
  } catch (err) {
    console.error('Welcome error:', err.message);
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || !msg.from || msg.from.is_bot) return;

  const text = msg.text.trim();
  const isGroup = ['group', 'supergroup'].includes(msg.chat.type);

  if (!isGroup) return;

  const userId = String(msg.from.id);
  const name = playerName(msg.from);
  const username = msg.from.username || name;

  try {
    // نمایش موجودی
    if (text === 'موجودی') {
      const [rows] = await db.execute(
        `SELECT balance FROM chaghal_players
         WHERE user_id = ?`,
        [userId]
      );

      const balance = rows.length ? rows[0].balance : 0;

      const message =
        `💰 **موجودی ${name}**\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🦆 **پول:** ${formatNumber(balance)} سکه\n` +
        `🏦 **سپرده بانک:** فعلاً 0\n` +
        `⭐️ **اشتراک:** فعلاً بدون اشتراک\n` +
        `━━━━━━━━━━━━━━━━━━━`;

      await bot.sendMessage(msg.chat.id, message, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown'
      });

      return;
    }

    // نمایش لول و XP
    if (text === 'لول') {
      const [rows] = await db.execute(
        `SELECT level, xp FROM chaghal_players
         WHERE user_id = ?`,
        [userId]
      );

      const level = rows.length ? Number(rows[0].level) : 1;
      const xp = rows.length ? Number(rows[0].xp) : 0;

      if (level >= MAX_LEVEL) {
        await bot.sendMessage(
          msg.chat.id,
          `👑 ${name} به بالاترین لول رسید!\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `⭐️ لول: 100\n` +
          `✨ XP: ${formatNumber(xp)}\n` +
          `🎖 رنک: ${getRank(100)}\n` +
          `🏆 بالاترین لول چاقال!\n` +
          `━━━━━━━━━━━━━━━━━━━`,
          { reply_to_message_id: msg.message_id }
        );
        return;
      }

      const required = xpRequired(level);
      const percent = Math.min(
        100,
        Math.floor((xp / required) * 100)
      );

      const filled = Math.floor(percent / 10);
      const bar = '🟩'.repeat(filled) +
                  '⬜'.repeat(10 - filled);

      await bot.sendMessage(
        msg.chat.id,
        `⭐️ وضعیت لول ${name}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🎖 رنک: ${getRank(level)}\n` +
        `⭐️ لول: ${level}\n` +
        `✨ XP: ${formatNumber(xp)} / ${formatNumber(required)}\n` +
        `${bar} ${percent}%\n` +
        `🎯 XP باقی‌مانده: ${formatNumber(required - xp)}\n` +
        `━━━━━━━━━━━━━━━━━━━`,
        { reply_to_message_id: msg.message_id }
      );

      return;
    }

    // نمایش رنک اختصاصی بر اساس لول
    if (text === 'رنک') {
      const [rows] = await db.execute(
        `SELECT level, xp FROM chaghal_players
         WHERE user_id = ?`,
        [userId]
      );

      const level = rows.length ? Number(rows[0].level) : 1;
      const xp = rows.length ? Number(rows[0].xp) : 0;

      await bot.sendMessage(
        msg.chat.id,
        `🏆 رنک ${name}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⭐️ لول: ${level}\n` +
        `✨ XP: ${formatNumber(xp)}\n` +
        `🎖 رنک: ${getRank(level)}\n` +
        `━━━━━━━━━━━━━━━━━━━`,
        { reply_to_message_id: msg.message_id }
      );

      return;
    }

    // فقط پیام دقیق «چاق» پاداش می‌گیرد.
    if (text !== 'چاق') return;

    await db.execute(
      `INSERT IGNORE INTO chaghal_players
       (user_id, username, balance, last_chag_at, level, xp)
       VALUES (?, ?, 0, 0, 1, 0)`,
      [userId, username]
    );

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT balance, last_chag_at, level, xp
         FROM chaghal_players
         WHERE user_id = ?
         FOR UPDATE`,
        [userId]
      );

      const player = rows[0];
      const now = Date.now();
      const elapsed = now - Number(player.last_chag_at);

      if (elapsed < COOLDOWN) {
        await conn.rollback();

        const remaining = Math.ceil(
          (COOLDOWN - elapsed) / 1000
        );

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        await bot.sendMessage(
          msg.chat.id,
          `⏳ ${name}، یکم صبر کن!\n` +
          `🕒 ${minutes} دقیقه و ${seconds} ثانیه دیگه دوباره بنویس «چاق».`,
          { reply_to_message_id: msg.message_id }
        );

        return;
      }

      const reward = Math.floor(Math.random() * 11) + 20;

      let level = Number(player.level);
      let xp = Number(player.xp);
      let levelUps = 0;
      let gainedXP = 0;

      if (level < MAX_LEVEL) {
        xp += XP_REWARD;
        gainedXP = XP_REWARD;

        while (level < MAX_LEVEL) {
          const required = xpRequired(level);

          if (xp < required) break;

          xp -= required;
          level++;
          levelUps++;
        }
      }

      await conn.execute(
        `UPDATE chaghal_players
         SET balance = balance + ?,
             last_chag_at = ?,
             username = ?,
             level = ?,
             xp = ?
         WHERE user_id = ?`,
        [reward, now, username, level, xp, userId]
      );

      const [updated] = await conn.execute(
        `SELECT balance FROM chaghal_players
         WHERE user_id = ?`,
        [userId]
      );

      await conn.commit();

      let reply =
        `🦆 دمت گرم ${name}!\n\n` +
        `💸 سکه گرفتی: +${reward}\n` +
        `✨ XP گرفتی: +${gainedXP}\n` +
        `⭐️ لول فعلی: ${level}\n` +
        `🎖 رنک: ${getRank(level)}\n` +
        `💰 موجودی کل: ${formatNumber(updated[0].balance)} سکه\n` +
        `⏳ دریافت بعدی: ۴ دقیقه دیگه`;

      if (levelUps > 0) {
        reply +=
          `\n\n🎉 تبریک! ${levelUps} لول ارتقا گرفتی!\n` +
          `🏆 لول جدیدت: ${level}\n` +
          `🎖 رنک جدید: ${getRank(level)}`;
      }

      if (level >= MAX_LEVEL) {
        reply += '\n👑 به بالاترین لول چاقال رسیدی!';
      }

      await bot.sendMessage(msg.chat.id, reply, {
        reply_to_message_id: msg.message_id
      });

    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {}

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
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();

}

start();
