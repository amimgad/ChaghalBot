```javascript
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

// ===============================
// تنظیمات ربات
// ===============================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is missing!');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
    polling: true
});

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ===============================
// تنظیمات اقتصادی و لول
// ===============================

const COOLDOWN = 4 * 60 * 1000;
const XP_REWARD = 15;
const MAX_LEVEL = 100;

const cooldowns = new Map();

// ===============================
// محاسبه XP موردنیاز
// ===============================

function xpRequired(level) {
    if (level >= MAX_LEVEL) {
        return 0;
    }

    if (level <= 8) {
        return 50 * Math.pow(2, level - 1);
    }

    if (level === 9) {
        return 6500;
    }

    if (level === 10) {
        return 8000;
    }

    let xp = 8000;

    for (let current = 10; current < level; current++) {
        xp += 2000 + 500 * (current - 10);
    }

    return xp;
}

// ===============================
// عنوان هر لول
// ===============================

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

// ===============================
// ابزارهای کمکی
// ===============================

function formatNumber(number) {
    return Number(number || 0).toLocaleString('en-US');
}

function playerName(from) {
    if (from.username) {
        return '@' + from.username;
    }

    const name = [from.first_name, from.last_name]
        .filter(Boolean)
        .join(' ');

    return name || 'بازیکن';
}

function isGroup(message) {
    return (
        message.chat.type === 'group' ||
        message.chat.type === 'supergroup'
    );
}

// ===============================
// پیام خوشامدگویی
// بدون بک‌تیک چندخطی
// ===============================

const WELCOME = [
    '🦆 به دنیای چاقال خوش اومدی! 💸',
    '',
    'سلام رفیق! 👋😈',
    '',
    'اینجا قراره از صفر شروع کنی، پولدار بشی، دارایی جمع کنی و توی دنیای چاقال پیشرفت کنی! 💰',
    '',
    'امکانات چاقال:',
    '',
    '▫️ 💵 کسب درآمد و جمع‌آوری پول',
    '▫️ 💼 شغل‌های مختلف و درآمدزایی',
    '▫️ 🏠 خرید خونه و ساخت زندگی مجازی',
    '▫️ 🚘 خرید ماشین و جمع‌آوری دارایی',
    '▫️ 📈 افزایش سطح و پیشرفت',
    '▫️ 🎲 اتفاقات تصادفی و سرگرمی',
    '▫️ 🏆 رقابت با بقیه بازیکن‌ها',
    '',
    '🔥 این فقط شروع ماجراست؛ قراره کلی امکانات خفن به چاقال اضافه بشه!',
    '',
    '📢 کانال رسمی چاقال:',
    'https://t.me/ChaghalCity',
    '',
    '💚 آماده‌ای وارد دنیای چاقال بشی؟'
].join('\n');

// ===============================
// ساخت جدول دیتابیس
// موجودی قبلی حفظ می‌شود
// ===============================

async function setupDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chaghal_players (
            user_id BIGINT NOT NULL PRIMARY KEY,
            username VARCHAR(255) DEFAULT NULL,
            balance BIGINT NOT NULL DEFAULT 0,
            last_chag_at BIGINT NOT NULL DEFAULT 0,
            level INT NOT NULL DEFAULT 1,
            xp BIGINT NOT NULL DEFAULT 0
        )
    `);

    const [columns] = await pool.query(`
        SHOW COLUMNS FROM chaghal_players
    `);

    const columnNames = columns.map(column => column.Field);

    if (!columnNames.includes('level')) {
        await pool.query(`
            ALTER TABLE chaghal_players
            ADD COLUMN level INT NOT NULL DEFAULT 1
        `);
    }

    if (!columnNames.includes('xp')) {
        await pool.query(`
            ALTER TABLE chaghal_players
            ADD COLUMN xp BIGINT NOT NULL DEFAULT 0
        `);
    }

    console.log('Chaghal database is ready!');
}

// ===============================
// ثبت یا دریافت بازیکن
// ===============================

async function ensurePlayer(from) {
    await pool.query(
        `
        INSERT IGNORE INTO chaghal_players
            (user_id, username, balance, last_chag_at, level, xp)
        VALUES (?, ?, 0, 0, 1, 0)
        `,
        [String(from.id), from.username || null]
    );

    await pool.query(
        `
        UPDATE chaghal_players
        SET username = ?
        WHERE user_id = ?
        `,
        [from.username || null, String(from.id)]
    );

    const [rows] = await pool.query(
        `
        SELECT user_id, username, balance, last_chag_at, level, xp
        FROM chaghal_players
        WHERE user_id = ?
        `,
        [String(from.id)]
    );

    return rows[0];
}

// ===============================
// دستور شروع
// ===============================

bot.onText(/^\/start(?:@\w+)?(?:\s|$)/, async (message) => {
    try {
        await bot.sendMessage(message.chat.id, WELCOME);
    } catch (error) {
        console.error('Start command error:', error.message);
    }
});

// ===============================
// دریافت پیام‌های گروه
// ===============================

bot.on('message', async (message) => {
    try {
        if (!message.from || message.from.is_bot) {
            return;
        }

        if (!message.text) {
            return;
        }

        if (!isGroup(message)) {
            return;
        }

        const text = message.text.trim();
        const user = message.from;
        const chatId = message.chat.id;

        // دستورات فقط در گروه
        if (!['چاق', 'موجودی', 'لول', 'رنک'].includes(text)) {
            return;
        }

        const player = await ensurePlayer(user);

        // ===============================
        // موجودی
        // ===============================

        if (text === 'موجودی') {
            await bot.sendMessage(
                chatId,
                [
                    '💰 کیف پول چاقال',
                    '',
                    '👤 بازیکن: ' + playerName(user),
                    '💵 موجودی: ' + formatNumber(player.balance) + ' سکه',
                    '🏦 بانک: 0 سکه',
                    '💎 اشتراک: ندارد'
                ].join('\n'),
                {
                    reply_to_message_id: message.message_id
                }
            );

            return;
        }

        // ===============================
        // لول و XP
        // ===============================

        if (text === 'لول') {
            const level = Number(player.level) || 1;
            const xp = Number(player.xp) || 0;

            if (level >= MAX_LEVEL) {
                await bot.sendMessage(
                    chatId,
                    [
                        '📈 اطلاعات سطح',
                        '',
                        '👤 بازیکن: ' + playerName(user),
                        '⭐ لول: 100 / 100',
                        '✨ XP: ' + formatNumber(xp),
                        '👑 رتبه: ' + getRank(level),
                        '',
                        '🔥 به بالاترین لول رسیدی!'
                    ].join('\n'),
                    {
                        reply_to_message_id: message.message_id
                    }
                );

                return;
            }

            const required = xpRequired(level);
            const remaining = Math.max(0, required - xp);
            const progress = required > 0
                ? Math.min(10, Math.floor((xp / required) * 10))
                : 10;

            const bar = '🟩'.repeat(progress) +
                '⬜'.repeat(10 - progress);

            await bot.sendMessage(
                chatId,
                [
                    '📈 اطلاعات سطح',
                    '',
                    '👤 بازیکن: ' + playerName(user),
                    '⭐ لول: ' + level + ' / ' + MAX_LEVEL,
                    '✨ XP: ' + formatNumber(xp) +
                        ' / ' + formatNumber(required),
                    '',
                    bar,
                    '',
                    '🎯 XP تا لول بعدی: ' + formatNumber(remaining),
                    '🏆 رتبه: ' + getRank(level)
                ].join('\n'),
                {
                    reply_to_message_id: message.message_id
                }
            );

            return;
        }

        // ===============================
        // رتبه
        // ===============================

        if (text === 'رنک') {
            const level = Number(player.level) || 1;

            await bot.sendMessage(
                chatId,
                [
                    '🏆 رتبه بازیکن',
                    '',
                    '👤 بازیکن: ' + playerName(user),
                    '⭐ لول: ' + level + ' / ' + MAX_LEVEL,
                    '🎖 رتبه: ' + getRank(level),
                    '✨ XP: ' + formatNumber(player.xp)
                ].join('\n'),
                {
                    reply_to_message_id: message.message_id
                }
            );

            return;
        }

        // ===============================
        // دستور چاق
        // ===============================

        if (text === 'چاق') {
            const now = Date.now();
            const cooldownKey = String(user.id);
            const lastTime = Number(player.last_chag_at) || 0;
            const previousCooldown = cooldowns.get(cooldownKey) || 0;
            const effectiveLastTime = Math.max(
                lastTime,
                previousCooldown
            );

            const elapsed = now - effectiveLastTime;

            if (elapsed < COOLDOWN) {
                const seconds = Math.ceil(
                    (COOLDOWN - elapsed) / 1000
                );

                const minutesLeft = Math.floor(seconds / 60);
                const secondsLeft = seconds % 60;

                await bot.sendMessage(
                    chatId,
                    '⏳ ' + playerName(user) +
                    '، برای چاق بعدی ' +
                    minutesLeft + ' دقیقه و ' +
                    secondsLeft + ' ثانیه صبر کن!',
                    {
                        reply_to_message_id: message.message_id
                    }
                );

                return;
            }

            const connection = await pool.getConnection();

            let reward;
            let newBalance;
            let newLevel;
            let newXp;
            let levelUp = false;

            try {
                await connection.beginTransaction();

                const [rows] = await connection.query(
                    `
                    SELECT balance, level, xp, last_chag_at
                    FROM chaghal_players
                    WHERE user_id = ?
                    FOR UPDATE
                    `,
                    [String(user.id)]
                );

                if (rows.length === 0) {
                    throw new Error('Player not found');
                }

                const current = rows[0];
                const transactionNow = Date.now();
                const databaseLastTime =
                    Number(current.last_chag_at) || 0;

                if (
                    transactionNow - databaseLastTime < COOLDOWN
                ) {
                    await connection.rollback();

                    const seconds = Math.ceil(
                        (
                            COOLDOWN -
                            (transactionNow - databaseLastTime)
                        ) / 1000
                    );

                    await bot.sendMessage(
                        chatId,
                        '⏳ هنوز باید ' + seconds +
                        ' ثانیه صبر کنی!',
                        {
                            reply_to_message_id: message.message_id
                        }
                    );

                    return;
                }

                reward = Math.floor(Math.random() * 11) + 20;

                newBalance = Number(current.balance) + reward;
                newLevel = Number(current.level) || 1;
                newXp = Number(current.xp) || 0;

                if (newLevel < MAX_LEVEL) {
                    newXp += XP_REWARD;

                    while (
                        newLevel < MAX_LEVEL &&
                        newXp >= xpRequired(newLevel)
                    ) {
                        newXp -= xpRequired(newLevel);
                        newLevel++;
                        levelUp = true;
                    }

                    if (newLevel >= MAX_LEVEL) {
                        newXp = 0;
                    }
                }

                await connection.query(
                    `
                    UPDATE chaghal_players
                    SET balance = ?,
                        xp = ?,
                        level = ?,
                        last_chag_at = ?,
                        username = ?
                    WHERE user_id = ?
                    `,
                    [
                        newBalance,
                        newXp,
                        newLevel,
                        transactionNow,
                        user.username || null,
                        String(user.id)
                    ]
                );

                await connection.commit();

                cooldowns.set(cooldownKey, transactionNow);
            } catch (error) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        'Rollback error:',
                        rollbackError.message
                    );
                }

                throw error;
            } finally {
                connection.release();
            }

            const response = [
                '💸 ' + playerName(user) + ' چاق زد!',
                '',
                '💰 درآمد: +' + formatNumber(reward) + ' سکه',
                '👛 موجودی جدید: ' + formatNumber(newBalance) + ' سکه',
                '✨ XP دریافتی: +' + XP_REWARD,
                '⭐ لول فعلی: ' + newLevel + ' / ' + MAX_LEVEL,
                '🏆 رتبه: ' + getRank(newLevel)
            ];

            if (levelUp) {
                response.push('');
                response.push('🎉 تبریک! لولت افزایش پیدا کرد!');
            }

            if (newLevel >= MAX_LEVEL) {
                response.push('');
                response.push('👑 به بالاترین لول چاقال رسیدی!');
            }

            await bot.sendMessage(
                chatId,
                response.join('\n'),
                {
                    reply_to_message_id: message.message_id
                }
            );
        }
    } catch (error) {
        console.error('Message handler error:', error);

        try {
            await bot.sendMessage(
                message.chat.id,
                '❌ یه خطا پیش اومد. لطفاً دوباره تلاش کن.'
            );
        } catch (sendError) {
            console.error('Error sending message:', sendError.message);
        }
    }
});

// ===============================
// مدیریت خطاهای تلگرام
// ===============================

bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
});

// ===============================
// راه‌اندازی ربات
// ===============================

async function start() {
    try {
        await setupDatabase();

        console.log('🦆 ChaghalBot is running!');
    } catch (error) {
        console.error('Startup error:', error);
        process.exit(1);
    }
}

start();
```
}

start();
