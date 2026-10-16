
'use strict';

const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

// ==============================
// CONFIGURATION
// ==============================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is missing!');
    process.exit(1);
}

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

const bot = new TelegramBot(TOKEN, { polling: false });

const COOLDOWN = 4 * 60 * 1000;
const XP_REWARD = 15;
const MAX_LEVEL = 100;

const cooldowns = new Map();

// ==============================
// WELCOME MESSAGE
// ==============================

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

// ==============================
// HELPERS
// ==============================

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function playerName(user) {
    if (user.username) {
        return '@' + user.username;
    }

    const name = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ');

    return name || 'بازیکن';
}

function isGroup(message) {
    return message.chat.type === 'group' ||
        message.chat.type === 'supergroup';
}

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

    let required = 8000;

    for (let current = 10; current < level; current++) {
        required += 2000 + 500 * (current - 10);
    }

    return required;
}

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

// ==============================
// DATABASE SETUP
// Does not delete existing balances
// ==============================

async function setupDatabase() {
    const createTableSQL = [
        'CREATE TABLE IF NOT EXISTS chaghal_players (',
        'user_id BIGINT NOT NULL PRIMARY KEY,',
        'username VARCHAR(255) DEFAULT NULL,',
        'balance BIGINT NOT NULL DEFAULT 0,',
        'last_chag_at BIGINT NOT NULL DEFAULT 0,',
        'level INT NOT NULL DEFAULT 1,',
        'xp BIGINT NOT NULL DEFAULT 0',
        ')'
    ].join(' ');

    await pool.query(createTableSQL);

    const result = await pool.query(
        'SHOW COLUMNS FROM chaghal_players'
    );

    const columns = result[0].map(function (column) {
        return column.Field;
    });

    if (!columns.includes('level')) {
        await pool.query(
            'ALTER TABLE chaghal_players ADD COLUMN level INT NOT NULL DEFAULT 1'
        );
    }

    if (!columns.includes('xp')) {
        await pool.query(
            'ALTER TABLE chaghal_players ADD COLUMN xp BIGINT NOT NULL DEFAULT 0'
        );
    }

    console.log('Chaghal database is ready!');
}

// ==============================
// PLAYER HELPERS
// ==============================

async function ensurePlayer(user) {
    const userId = String(user.id);

    await pool.query(
        'INSERT IGNORE INTO chaghal_players ' +
        '(user_id, username, balance, last_chag_at, level, xp) ' +
        'VALUES (?, ?, 0, 0, 1, 0)',
        [userId, user.username || null]
    );

    await pool.query(
        'UPDATE chaghal_players SET username = ? WHERE user_id = ?',
        [user.username || null, userId]
    );

    const result = await pool.query(
        'SELECT user_id, username, balance, last_chag_at, level, xp ' +
        'FROM chaghal_players WHERE user_id = ?',
        [userId]
    );

    return result[0][0];
}

// ==============================
// /START
// ==============================

bot.onText(/^\/start(?:@\w+)?(?:\s|$)/, async function (message) {
    try {
        await bot.sendMessage(message.chat.id, WELCOME);
    } catch (error) {
        console.error('Start error:', error.message);
    }
});

// ==============================
// MESSAGE HANDLER
// ==============================

bot.on('message', async function (message) {
    if (!message.from || message.from.is_bot || !message.text) {
        return;
    }

    if (!isGroup(message)) {
        return;
    }

    const text = message.text.trim();

    if (!['چاق', 'موجودی', 'لول', 'رنک'].includes(text)) {
        return;
    }

    const chatId = message.chat.id;
    const user = message.from;

    try {
        const player = await ensurePlayer(user);

        // ------------------------------
        // BALANCE
        // ------------------------------

        if (text === 'موجودی') {
            const reply = [
                '💰 کیف پول چاقال',
                '',
                '👤 بازیکن: ' + playerName(user),
                '💵 موجودی: ' + formatNumber(player.balance) + ' سکه',
                '🏦 بانک: 0 سکه',
                '💎 اشتراک: ندارد'
            ].join('\n');

            await bot.sendMessage(chatId, reply, {
                reply_to_message_id: message.message_id
            });

            return;
        }

        // ------------------------------
        // LEVEL
        // ------------------------------

        if (text === 'لول') {
            const level = Number(player.level) || 1;
            const xp = Number(player.xp) || 0;

            if (level >= MAX_LEVEL) {
                const reply = [
                    '📈 اطلاعات سطح',
                    '',
                    '👤 بازیکن: ' + playerName(user),
                    '⭐ لول: 100 / 100',
                    '✨ XP: ' + formatNumber(xp),
                    '👑 رتبه: ' + getRank(level),
                    '',
                    '🔥 به بالاترین لول رسیدی!'
                ].join('\n');

                await bot.sendMessage(chatId, reply, {
                    reply_to_message_id: message.message_id
                });

                return;
            }

            const required = xpRequired(level);
            const remaining = Math.max(0, required - xp);
            const progress = Math.min(
                10,
                Math.floor((xp / required) * 10)
            );

            const bar = '🟩'.repeat(progress) +
                '⬜'.repeat(10 - progress);

            const reply = [
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
            ].join('\n');

            await bot.sendMessage(chatId, reply, {
                reply_to_message_id: message.message_id
            });

            return;
        }

        // ------------------------------
        // RANK
        // ------------------------------

        if (text === 'رنک') {
            const level = Number(player.level) || 1;

            const reply = [
                '🏆 رتبه بازیکن',
                '',
                '👤 بازیکن: ' + playerName(user),
                '⭐ لول: ' + level + ' / ' + MAX_LEVEL,
                '🎖 رتبه: ' + getRank(level),
                '✨ XP: ' + formatNumber(player.xp)
            ].join('\n');

            await bot.sendMessage(chatId, reply, {
                reply_to_message_id: message.message_id
            });

            return;
        }

        // ------------------------------
        // CHAG
        // ------------------------------

        if (text === 'چاق') {
            const userId = String(user.id);
            const now = Date.now();
            const lastFromMemory = cooldowns.get(userId) || 0;
            const lastFromDatabase = Number(player.last_chag_at) || 0;
            const lastTime = Math.max(lastFromMemory, lastFromDatabase);
            const elapsed = now - lastTime;

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

            let reward = 0;
            let newBalance = 0;
            let newLevel = 1;
            let newXp = 0;
            let levelUp = false;

            try {
                await connection.beginTransaction();

                const result = await connection.query(
                    'SELECT balance, level, xp, last_chag_at ' +
                    'FROM chaghal_players WHERE user_id = ? FOR UPDATE',
                    [userId]
                );

                if (result[0].length === 0) {
                    throw new Error('Player not found');
                }

                const current = result[0][0];
                const transactionNow = Date.now();
                const databaseLastTime =
                    Number(current.last_chag_at) || 0;

                if (transactionNow - databaseLastTime < COOLDOWN) {
                    await connection.rollback();

                    const seconds = Math.ceil(
                        (COOLDOWN -
                            (transactionNow - databaseLastTime)) / 1000
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
                    'UPDATE chaghal_players ' +
                    'SET balance = ?, xp = ?, level = ?, ' +
                    'last_chag_at = ?, username = ? ' +
                    'WHERE user_id = ?',
                    [
                        newBalance,
                        newXp,
                        newLevel,
                        transactionNow,
                        user.username || null,
                        userId
                    ]
                );

                await connection.commit();
                cooldowns.set(userId, transactionNow);
            } catch (error) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error('Rollback error:', rollbackError.message);
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

            await bot.sendMessage(chatId, response.join('\n'), {
                reply_to_message_id: message.message_id
            });
        }
    } catch (error) {
        console.error('Message handler error:', error);

        try {
            await bot.sendMessage(
                chatId,
                '❌ یه خطا پیش اومد. لطفاً دوباره تلاش کن.'
            );
        } catch (sendError) {
            console.error('Send error:', sendError.message);
        }
    }
});

// ==============================
// STARTUP
// ==============================

async function start() {
    try {
        await setupDatabase();

        await bot.startPolling();

        console.log('🦆 ChaghalBot is running!');
    } catch (error) {
        console.error('Startup error:', error);
        process.exit(1);
    }
}

bot.on('polling_error', function (error) {
    console.error('Telegram polling error:', error.message);
});

start();
