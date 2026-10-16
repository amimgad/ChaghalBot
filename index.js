
const TelegramBot = require("node-telegram-bot-api");
const mysql = require("mysql2/promise");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing!");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4"
});

const bot = new TelegramBot(token, { polling: false });

const CHAG_COOLDOWN = 4 * 60 * 1000;
const WORK_COOLDOWN = 60 * 1000;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const WHEEL_COOLDOWN = 60 * 60 * 1000;

const CHAG_XP = 15;
const JOB_XP = 20;
const MAX_LEVEL = 100;
const JOBS_PER_PAGE = 10;
const TOTAL_PAGES = 10;

const jobs = [
  ["جمع‌کننده زباله",20],["نظافتچی",30],["ظرف‌شور",40],
  ["کارگر ساده",50],["پخش‌کننده تراکت",60],["روزنامه‌رسان",70],
  ["کارگر انبار",80],["کارگر کارواش",100],["شاگرد مغازه",120],
  ["باغبان",150],["گارسون",180],["نانوا",200],["میوه‌فروش",220],
  ["صندوق‌دار",250],["پیک موتوری",300],["آرایشگر",350],
  ["خیاط",400],["نگهبان",450],["راننده تاکسی",500],
  ["فروشنده",550],["آشپز",600],["تعمیرکار دوچرخه",650],
  ["مکانیک",700],["برق‌کار",750],["لوله‌کش",800],
  ["جوشکار",900],["تعمیرکار موبایل",1000],
  ["تعمیرکار کامپیوتر",1100],["عکاس",1200],
  ["راننده کامیون",1300],["معلم",1400],["مترجم",1500],
  ["نویسنده",1600],["حسابدار",1800],["طراح گرافیک",2000],
  ["تدوینگر ویدئو",2200],["برنامه‌نویس مبتدی",2500],
  ["طراح سایت",2800],["بازاریاب",3000],["مدیر فروشگاه",3500],
  ["مهندس برق",4000],["مهندس عمران",4500],
  ["مهندس نرم‌افزار",5000],["معمار",5500],["داروساز",6000],
  ["پزشک",6500],["دندان‌پزشک",7000],["وکیل",7500],
  ["خلبان",8000],["جراح متخصص",9000],["مدیر رستوران",10000],
  ["مدیر هتل",11000],["مدیر کارخانه",12000],["مدیر بانک",13000],
  ["مربی فوتبال",14000],["فوتبالیست حرفه‌ای",15000],
  ["بازیگر مشهور",16000],["خواننده مشهور",17000],
  ["مجری تلویزیون",18000],["مهندس هوش مصنوعی",20000],
  ["صاحب کافه",22000],["صاحب کارواش",24000],
  ["صاحب تعمیرگاه",26000],["صاحب فروشگاه",28000],
  ["صاحب شرکت ساختمانی",30000],["صاحب رستوران زنجیره‌ای",32000],
  ["صاحب شرکت حمل‌ونقل",34000],["صاحب شرکت نرم‌افزاری",36000],
  ["صاحب هتل",38000],["مدیر شرکت بین‌المللی",40000],
  ["سرمایه‌گذار املاک",42000],["سازنده برج",44000],
  ["مالک مجتمع تجاری",46000],["مالک برند لباس",48000],
  ["مالک برند خودرو",50000],["مالک شرکت هواپیمایی",52000],
  ["مالک شرکت نفتی",54000],["سرمایه‌گذار بزرگ",56000],
  ["مالک شرکت فناوری",58000],["غول فناوری",60000],
  ["مالک بانک خصوصی",65000],["مالک شبکه تلویزیونی",70000],
  ["مالک شرکت فضایی",75000],["مالک شرکت رباتیک",80000],
  ["مالک شرکت هوش مصنوعی",85000],["سرمایه‌دار جهانی",90000],
  ["مالک شرکت انرژی",95000],["مالک برند جهانی",100000],
  ["سلطان تجارت",110000],["امپراتور اقتصادی",120000],
  ["ابرسرمایه‌دار",130000],["مالک امپراتوری صنعتی",140000],
  ["فرمانروای بازار",150000],["سلطان سرمایه‌گذاری",160000],
  ["مالک امپراتوری رسانه‌ای",170000],
  ["رئیس کنسرسیوم جهانی",180000],["ثروتمند افسانه‌ای",190000],
  ["سلطان چاقال",200000],["امپراتور چاقال",250000],
  ["فرمانروای چاقال",300000]
].map((job, index) => ({
  id: index + 1,
  name: job[0],
  salary: job[1],
  requiredLevel: index + 1
}));

function xpRequired(level) {
  if (level <= 8) return 50 * Math.pow(2, level - 1);
  if (level === 9) return 6500;
  if (level === 10) return 8000;

  return 8000 + (level - 10) * 2000 +
    (level - 10) * (level - 9) * 250;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getRank(level) {
  if (level >= 100) return "👑 فرمانروای چاقال";
  if (level >= 91) return "🌌 تایتان";
  if (level >= 81) return "⚡ اسطوره";
  if (level >= 71) return "🐉 افسانه‌ای";
  if (level >= 61) return "💰 سرمایه‌دار";
  if (level >= 51) return "👑 رئیس";
  if (level >= 41) return "🔥 استاد";
  if (level >= 31) return "💎 نخبه";
  if (level >= 21) return "🥇 حرفه‌ای";
  if (level >= 11) return "🥈 تلاشگر";
  if (level >= 6) return "🥉 مبتدی";
  return "🪶 تازه‌وارد";
}

function progressBar(xp, required) {
  const percent = required > 0 ? xp / required : 1;
  const filled = Math.max(0, Math.min(10, Math.floor(percent * 10)));
  return "🟩".repeat(filled) + "⬜".repeat(10 - filled);
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} ساعت و ${minutes} دقیقه`;
  if (minutes > 0) return `${minutes} دقیقه و ${seconds} ثانیه`;
  return `${seconds} ثانیه`;
}

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chaghal_players (
      user_id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      balance BIGINT NOT NULL DEFAULT 0,
      last_chag_at BIGINT NOT NULL DEFAULT 0,
      level INT NOT NULL DEFAULT 1,
      xp BIGINT NOT NULL DEFAULT 0,
      job_id INT DEFAULT NULL,
      last_work_at BIGINT NOT NULL DEFAULT 0,
      bank_balance BIGINT NOT NULL DEFAULT 0,
      last_daily_at BIGINT NOT NULL DEFAULT 0,
      last_wheel_at BIGINT NOT NULL DEFAULT 0
    )
  `);

  // ستون‌های جدید به جدول موجود اضافه می‌شوند.
  // ستون‌ها و داده‌های قبلی حذف یا بازنشانی نمی‌شوند.
  const columns = [
    ["level", "INT NOT NULL DEFAULT 1"],
    ["xp", "BIGINT NOT NULL DEFAULT 0"],
    ["job_id", "INT DEFAULT NULL"],
    ["last_chag_at", "BIGINT NOT NULL DEFAULT 0"],
    ["last_work_at", "BIGINT NOT NULL DEFAULT 0"],
    ["bank_balance", "BIGINT NOT NULL DEFAULT 0"],
    ["last_daily_at", "BIGINT NOT NULL DEFAULT 0"],
    ["last_wheel_at", "BIGINT NOT NULL DEFAULT 0"]
  ];

  for (const [name, definition] of columns) {
    try {
      await pool.query(
        `ALTER TABLE chaghal_players ADD COLUMN ${name} ${definition}`
      );
    } catch (error) {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  console.log("Chaghal database ready.");
}

async function getPlayer(user) {
  const id = String(user.id);
  const username = user.username || user.first_name || "Player";

  await pool.query(
    `INSERT INTO chaghal_players (user_id, username)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE username = VALUES(username)`,
    [id, username]
  );

  const [rows] = await pool.query(
    "SELECT * FROM chaghal_players WHERE user_id = ?",
    [id]
  );

  return rows[0];
}

async function addXP(userId, amount) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT level, xp FROM chaghal_players
       WHERE user_id = ? FOR UPDATE`,
      [String(userId)]
    );

    if (!rows.length) {
      await connection.rollback();
      return null;
    }

    const oldLevel = Number(rows[0].level) || 1;
    let level = oldLevel;
    let xp = (Number(rows[0].xp) || 0) + amount;

    while (level < MAX_LEVEL && xp >= xpRequired(level)) {
      xp -= xpRequired(level);
      level++;
    }

    if (level >= MAX_LEVEL) {
      level = MAX_LEVEL;
      xp = 0;
    }

    await connection.query(
      `UPDATE chaghal_players SET level = ?, xp = ?
       WHERE user_id = ?`,
      [level, xp, String(userId)]
    );

    await connection.commit();
    return { oldLevel, level, xp, leveledUp: level > oldLevel };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function notifyLevelUp(chatId, result) {
  if (!result?.leveledUp) return;

  await bot.sendMessage(
    chatId,
    [
      "🎉 تبریک! لولت بالا رفت!",
      "",
      `⭐ لول جدید: ${result.level} / ${MAX_LEVEL}`,
      `🏆 رتبه: ${getRank(result.level)}`
    ].join("\n")
  );
}

async function showProfile(chatId, user) {
  const player = await getPlayer(user);
  const level = Number(player.level) || 1;
  const xp = Number(player.xp) || 0;
  const needed = xpRequired(level);
  const username = user.username
    ? `@${user.username}`
    : (user.first_name || "بازیکن");

  const currentJob = jobs.find(
    job => job.id === Number(player.job_id)
  );

  const text = [
    "📈 اطلاعات سطح",
    "",
    `👤 بازیکن: ${escapeHTML(username)}`,
    `⭐ لول: ${level} / ${MAX_LEVEL}`,
    `✨ XP: ${fmt(xp)} / ${fmt(needed)}`,
    "",
    progressBar(xp, needed),
    "",
    `🎯 XP تا لول بعدی: ${fmt(Math.max(0, needed - xp))}`,
    `🏆 رتبه: ${getRank(level)}`,
    `💼 شغل: ${currentJob ? escapeHTML(currentJob.name) : "بدون شغل"}`
  ].join("\n");

  return bot.sendMessage(chatId, text, { parse_mode: "HTML" });
}

async function showBalance(chatId, user) {
  const player = await getPlayer(user);

  return bot.sendMessage(
    chatId,
    [
      "💰 اطلاعات مالی",
      "",
      `💵 پول: ${fmt(player.balance)} سکه`,
      `🏦 پول داخل بانک: ${fmt(player.bank_balance)} سکه`,
      "",
      "━━━━━━━━━━━━━━",
      "",
      `⭐ لول: ${player.level} / ${MAX_LEVEL}`,
      `🏆 رتبه: ${getRank(Number(player.level))}`
    ].join("\n")
  );
}

function jobKeyboard(page, player) {
  const level = Number(player.level) || 1;
  const selectedJob = Number(player.job_id) || 0;
  const pageJobs = jobs.slice(
    (page - 1) * JOBS_PER_PAGE,
    page * JOBS_PER_PAGE
  );

  const keyboard = pageJobs.map(job => {
    const unlocked = level >= job.requiredLevel;
    const selected = selectedJob === job.id;

    const label =
      `${selected ? "⭐ " : ""}${job.id}. ${job.name} | ${fmt(job.salary)} سکه` +
      (selected ? " | انتخاب‌شده" :
        unlocked ? "" : ` | 🔒 لول ${job.requiredLevel}`);

    return [{
      text: label,
      style: unlocked ? "success" : "danger",
      callback_data: unlocked
        ? `jobselect:${job.id}`
        : `joblocked:${job.id}`
    }];
  });

  const nav = [];

  if (page > 1) {
    nav.push({
      text: "⬅️ قبلی",
      callback_data: `jobpage:${page - 1}`
    });
  }

  nav.push({
    text: `${page}/${TOTAL_PAGES}`,
    callback_data: "jobnoop"
  });

  if (page < TOTAL_PAGES) {
    nav.push({
      text: "بعدی ➡️",
      callback_data: `jobpage:${page + 1}`
    });
  }

  keyboard.push(nav);
  return { inline_keyboard: keyboard };
}

async function showJobs(chatId, user, page, messageId = null) {
  const player = await getPlayer(user);
  const safePage = Math.max(1, Math.min(TOTAL_PAGES, page));
  const currentJob = jobs.find(
    job => job.id === Number(player.job_id)
  );

  const text = [
    "💼 <b>مرکز شغل‌های چاقال</b>",
    "",
    `👤 بازیکن: ${escapeHTML(user.first_name || "بازیکن")}`,
    `📊 لول فعلی: ${player.level}`,
    `💵 پول: ${fmt(player.balance)} سکه`,
    `🏦 پول داخل بانک: ${fmt(player.bank_balance)} سکه`,
    `💼 شغل فعلی: ${currentJob ? escapeHTML(currentJob.name) : "بدون شغل"}`,
    "",
    "🟩 سبز: قابل انتخاب",
    "🟥 قرمز: قفل‌شده",
    "⭐ شغل انتخاب‌شده",
    "",
    `📄 صفحه ${safePage} از ${TOTAL_PAGES}`,
    "برای انتخاب، روی شغل سبز بزن."
  ].join("\n");

  const options = {
    parse_mode: "HTML",
    reply_markup: jobKeyboard(safePage, player)
  };

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        ...options,
        chat_id: chatId,
        message_id: messageId
      });
    } catch (error) {
      if (!String(error.message).includes("message is not modified")) {
        console.error("Edit jobs menu error:", error.message);
      }
    }
  } else {
    await bot.sendMessage(chatId, text, options);
  }
}

async function doChag(chatId, user) {
  const player = await getPlayer(user);
  const now = Date.now();
  const last = Number(player.last_chag_at) || 0;
  const remaining = CHAG_COOLDOWN - (now - last);

  if (remaining > 0) {
    return bot.sendMessage(
      chatId,
      `⏳ داش، ${Math.ceil(remaining / 1000)} ثانیه دیگه دوباره امتحان کن!`
    );
  }

  const coins = Math.floor(Math.random() * 11) + 20;

  const [result] = await pool.query(
    `UPDATE chaghal_players
     SET balance = balance + ?, last_chag_at = ?
     WHERE user_id = ? AND last_chag_at = ?`,
    [coins, now, String(user.id), last]
  );

  if (!result.affectedRows) {
    return bot.sendMessage(chatId, "⏳ یه لحظه صبر کن و دوباره بزن!");
  }

  const updated = await addXP(user.id, CHAG_XP);
  const [rows] = await pool.query(
    "SELECT balance FROM chaghal_players WHERE user_id = ?",
    [String(user.id)]
  );

  await bot.sendMessage(
    chatId,
    [
      `🎉 تبریک چاقال! ${coins} سکه گرفتی!`,
      "",
      `💰 پول فعلی: ${fmt(rows[0].balance)} سکه`,
      "",
      `✨ XP: +${CHAG_XP} (مجموع XP: ${fmt(updated?.xp || 0)})`
    ].join("\n")
  );

  await notifyLevelUp(chatId, updated);
}

// پاداش روزانه و چرخ شانس
async function claimTimedReward(chatId, user, type) {
  const configs = {
    daily: {
      column: "last_daily_at",
      cooldown: DAILY_COOLDOWN,
      min: 20,
      max: 100,
      title: "🎁 پاداش روزانه",
      nextText: "۲۴ ساعت دیگه"
    },
    wheel: {
      column: "last_wheel_at",
      cooldown: WHEEL_COOLDOWN,
      min: 20,
      max: 500,
      title: "🎡 چرخ شانس",
      nextText: "یک ساعت دیگه"
    }
  };

  const config = configs[type];
  if (!config) return;

  await getPlayer(user);

  const now = Date.now();
  const coins =
    Math.floor(Math.random() * (config.max - config.min + 1)) +
    config.min;

  // UPDATE اتمیک است؛ درخواست هم‌زمان دوم نمی‌تواند جایزه بگیرد.
  const [result] = await pool.query(
    `UPDATE chaghal_players
     SET balance = balance + ?, ${config.column} = ?
     WHERE user_id = ?
       AND ${config.column} <= ?`,
    [
      coins,
      now,
      String(user.id),
      now - config.cooldown
    ]
  );

  if (!result.affectedRows) {
    const [rows] = await pool.query(
      `SELECT ${config.column} AS last_at
       FROM chaghal_players
       WHERE user_id = ?`,
      [String(user.id)]
    );

    const last = Number(rows[0]?.last_at) || 0;
    const remaining = config.cooldown - (now - last);

    return bot.sendMessage(
      chatId,
      [
        config.title,
        "",
        "⏳ داش، هنوز وقت جایزه‌ات نرسیده!",
        `⏰ زمان باقی‌مانده: ${formatRemaining(remaining)}`
      ].join("\n")
    );
  }

  const [rows] = await pool.query(
    "SELECT balance FROM chaghal_players WHERE user_id = ?",
    [String(user.id)]
  );

  return bot.sendMessage(
    chatId,
    [
      config.title,
      "",
      `🎉 تبریک داش! ${fmt(coins)} سکه برنده شدی!`,
      "",
      `💰 پول فعلی: ${fmt(rows[0].balance)} سکه`,
      "",
      `⏰ جایزه بعدی ${config.nextText} آماده می‌شه.`
    ].join("\n")
  );
}

async function doDailyReward(chatId, user) {
  return claimTimedReward(chatId, user, "daily");
}

async function doLuckyWheel(chatId, user) {
  return claimTimedReward(chatId, user, "wheel");
}

async function doWork(chatId, user) {
  const player = await getPlayer(user);
  const job = jobs.find(item => item.id === Number(player.job_id));

  if (!job) {
    return bot.sendMessage(
      chatId,
      "❌ اول دستور «شغل ها» رو بزن و یک شغل انتخاب کن!"
    );
  }

  if (Number(player.level) < job.requiredLevel) {
    return bot.sendMessage(
      chatId,
      `🔒 برای این شغل باید لول ${job.requiredLevel} داشته باشی.`
    );
  }

  const now = Date.now();
  const lastWork = Number(player.last_work_at) || 0;
  const remaining = WORK_COOLDOWN - (now - lastWork);

  if (remaining > 0) {
    return bot.sendMessage(
      chatId,
      `⏳ برای کار بعدی ${Math.ceil(remaining / 1000)} ثانیه صبر کن!`
    );
  }

  const earnedXP = job.id + 19;

  const [result] = await pool.query(
    `UPDATE chaghal_players
     SET balance = balance + ?, last_work_at = ?
     WHERE user_id = ?
       AND last_work_at = ?
       AND job_id = ?
       AND level >= ?`,
    [
      job.salary, now, String(user.id),
      lastWork, job.id, job.requiredLevel
    ]
  );

  if (!result.affectedRows) {
    return bot.sendMessage(
      chatId,
      "⏳ وضعیت کارت تغییر کرده؛ دوباره امتحان کن!"
    );
  }

  const updated = await addXP(user.id, earnedXP);
  const [rows] = await pool.query(
    "SELECT balance FROM chaghal_players WHERE user_id = ?",
    [String(user.id)]
  );

  await bot.sendMessage(
    chatId,
    [
      `✅ شما به‌عنوان «${job.name}» کار کردید!`,
      "",
      `💰 حقوق دریافتی: ${fmt(job.salary)} سکه`,
      "",
      `💵 پول فعلی: ${fmt(rows[0].balance)} سکه`,
      "",
      `✨ XP دریافتی: +${earnedXP}`,
      "",
      `⭐ XP فعلی: ${fmt(updated?.xp || 0)}`
    ].join("\n")
  );

  await notifyLevelUp(chatId, updated);
}

async function transferMoney(chatId, sender, recipient, amount) {
  if (!recipient || recipient.is_bot) {
    return bot.sendMessage(chatId, "❌ گیرنده معتبر نیست.");
  }

  if (String(sender.id) === String(recipient.id)) {
    return bot.sendMessage(chatId, "❌ نمی‌تونی به خودت پول انتقال بدی!");
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return bot.sendMessage(chatId, "❌ مبلغ باید عدد مثبت باشه.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // قفل‌کردن هر دو حساب برای جلوگیری از انتقال هم‌زمان ناسازگار
    const ids = [String(sender.id), String(recipient.id)].sort();

    const [rows] = await connection.query(
      `SELECT user_id, balance
       FROM chaghal_players
       WHERE user_id IN (?, ?)
       ORDER BY user_id
       FOR UPDATE`,
      ids
    );

    const senderRow = rows.find(
      row => String(row.user_id) === String(sender.id)
    );

    const recipientRow = rows.find(
      row => String(row.user_id) === String(recipient.id)
    );

    if (!senderRow || !recipientRow) {
      await connection.rollback();

      return bot.sendMessage(
        chatId,
        "❌ هر دو بازیکن باید قبلاً با دستور /start در چاقال ثبت شده باشن."
      );
    }

    const balance = Number(senderRow.balance);
    const recipientBalance = Number(recipientRow.balance);

    if (
      !Number.isSafeInteger(balance) ||
      !Number.isSafeInteger(recipientBalance) ||
      balance < amount
    ) {
      await connection.rollback();

      return bot.sendMessage(
        chatId,
        `❌ موجودی کافی نداری!\n💰 موجودی تو: ${fmt(senderRow.balance)} سکه`
      );
    }

    if (recipientBalance + amount > 9007199254740991) {
      await connection.rollback();

      return bot.sendMessage(
        chatId,
        "❌ موجودی گیرنده بعد از انتقال بیش از حد مجاز می‌شه."
      );
    }

    const [debit] = await connection.query(
      `UPDATE chaghal_players
       SET balance = balance - ?
       WHERE user_id = ? AND balance >= ?`,
      [amount, String(sender.id), amount]
    );

    if (debit.affectedRows !== 1) {
      await connection.rollback();

      return bot.sendMessage(
        chatId,
        "❌ انتقال انجام نشد؛ موجودی رو بررسی کن و دوباره تلاش کن."
      );
    }

    const [credit] = await connection.query(
      `UPDATE chaghal_players
       SET balance = balance + ?
       WHERE user_id = ?`,
      [amount, String(recipient.id)]
    );

    if (credit.affectedRows !== 1) {
      throw new Error("Recipient balance update failed");
    }

    await connection.commit();

    const [updatedRows] = await pool.query(
      `SELECT user_id, balance
       FROM chaghal_players
       WHERE user_id IN (?, ?)`,
      [String(sender.id), String(recipient.id)]
    );

    const updatedSender = updatedRows.find(
      row => String(row.user_id) === String(sender.id)
    );

    const updatedRecipient = updatedRows.find(
      row => String(row.user_id) === String(recipient.id)
    );

    const senderName = escapeHTML(
      sender.first_name || sender.username || "بازیکن"
    );

    const recipientName = escapeHTML(
      recipient.first_name || recipient.username || "بازیکن"
    );

    return bot.sendMessage(
      chatId,
      [
        "💸 <b>انتقال پول موفق بود!</b>",
        "",
        `👤 فرستنده: ${senderName}`,
        `👤 گیرنده: ${recipientName}`,
        `💰 مبلغ: ${fmt(amount)} سکه`,
        "",
        `💵 موجودی فرستنده: ${fmt(updatedSender.balance)} سکه`,
        `💵 موجودی گیرنده: ${fmt(updatedRecipient.balance)} سکه`
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

bot.on("message", async message => {
  try {
    if (!message.from || message.from.is_bot) return;

    const text = (message.text || "").trim();
    if (!text) return;

    const chatId = message.chat.id;
    const user = message.from;
	
	const transferMatch = text.match(/^انتقال پول\s+(\d+)$/);

if (transferMatch) {
  if (!message.reply_to_message?.from) {
    return bot.sendMessage(
      chatId,
      "❌ برای انتقال پول باید روی پیام گیرنده ریپلای کنی!\n\nمثال: انتقال پول 5000"
    );
  }

  const amount = Number(transferMatch[1]);

  return transferMoney(
    chatId,
    user,
    message.reply_to_message.from,
    amount
  );
}

    if (text === "/start" || text.startsWith("/start ")) {
      await getPlayer(user);

      return bot.sendMessage(
        chatId,
        [
          "🦆 به دنیای چاقال خوش اومدی! 💸",
          "",
          "سلام رفیق! 👋😈",
          "",
          "اینجا قراره از صفر شروع کنی، پولدار بشی، دارایی جمع کنی و توی دنیای چاقال پیشرفت کنی! 💰",
          "",
          "امکانات چاقال:",
          "",
          "▫️ 💵 کسب درآمد و جمع‌آوری پول",
          "▫️ 💼 شغل‌های مختلف و درآمدزایی",
          "▫️ 🏠 خرید خونه و ساخت زندگی مجازی",
          "▫️ 🚘 خرید ماشین و جمع‌آوری دارایی",
          "▫️ 📈 افزایش سطح و پیشرفت",
          "▫️ 🎲 اتفاقات تصادفی و سرگرمی",
          "▫️ 🏆 رقابت با بقیه بازیکن‌ها",
          "",
          "🔥 این فقط شروع ماجراست؛ قراره کلی امکانات خفن به چاقال اضافه بشه!",
          "",
          "📢 کانال رسمی چاقال:",
          "https://t.me/ChaghalCity",
          "",
          "💚 آماده‌ای وارد دنیای چاقال بشی؟"
        ].join("\n")
      );
    }

    if (
      text === "شغل ها" ||
      text === "شغل‌ها" ||
      text === "شغلهای" ||
      text === "/jobs"
    ) {
      return showJobs(chatId, user, 1);
    }

    if (text === "کار") {
      return doWork(chatId, user);
    }

    if (text === "موجودی" || text === "/balance") {
      return showBalance(chatId, user);
    }

    if (text === "لول" || text === "/level") {
      return showProfile(chatId, user);
    }

    if (text === "رنک" || text === "/rank") {
      const player = await getPlayer(user);
      return bot.sendMessage(
        chatId,
        `🏆 رتبه شما: ${getRank(Number(player.level))}`
      );
    }

    if (
      text === "پاداش روزانه" ||
      text === "/daily"
    ) {
      return doDailyReward(chatId, user);
    }

    if (
      text === "چرخ شانس" ||
      text === "/wheel"
    ) {
      return doLuckyWheel(chatId, user);
    }

    if (text === "چاق" || text === "/chag") {
      return doChag(chatId, user);
    }
  } catch (error) {
    console.error("Message handler error:", error);

    try {
      await bot.sendMessage(
        message.chat.id,
        "❌ یه خطا پیش اومد؛ دوباره امتحان کن."
      );
    } catch (_) {}
  }
});

bot.on("callback_query", async query => {
  const data = query.data || "";
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const user = query.from;

  try {
    if (!chatId || !messageId) {
      return bot.answerCallbackQuery(query.id);
    }

    if (data === "jobnoop") {
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith("jobpage:")) {
      const page = Number(data.split(":")[1]);
      await bot.answerCallbackQuery(query.id);
      return showJobs(chatId, user, page, messageId);
    }

    if (data.startsWith("joblocked:")) {
      const jobId = Number(data.split(":")[1]);
      const job = jobs.find(item => item.id === jobId);

      return bot.answerCallbackQuery(query.id, {
        text: `🔒 برای این شغل باید لول ${job?.requiredLevel || "بالاتر"} باشی.`,
        show_alert: true
      });
    }

    if (data.startsWith("jobselect:")) {
      const jobId = Number(data.split(":")[1]);
      const job = jobs.find(item => item.id === jobId);

      if (!job) {
        return bot.answerCallbackQuery(query.id, {
          text: "این شغل وجود نداره!",
          show_alert: true
        });
      }

      const connection = await pool.getConnection();
      let alreadySelected = false;
      let failedLevel = false;

      try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
          `SELECT level, job_id FROM chaghal_players
           WHERE user_id = ? FOR UPDATE`,
          [String(user.id)]
        );

        if (!rows.length) {
          await connection.rollback();

          return bot.answerCallbackQuery(query.id, {
            text: "اول /start رو بزن!",
            show_alert: true
          });
        }

        const level = Number(rows[0].level) || 1;
        const currentJob = Number(rows[0].job_id) || 0;

        if (level < job.requiredLevel) {
          failedLevel = true;
          await connection.rollback();
        } else if (currentJob === job.id) {
          alreadySelected = true;
          await connection.rollback();
        } else {
          await connection.query(
            "UPDATE chaghal_players SET job_id = ? WHERE user_id = ?",
            [job.id, String(user.id)]
          );

          await connection.commit();
        }
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      if (failedLevel) {
        return bot.answerCallbackQuery(query.id, {
          text: `🔒 برای این شغل لول ${job.requiredLevel} لازمه!`,
          show_alert: true
        });
      }

      if (alreadySelected) {
        return bot.answerCallbackQuery(query.id, {
          text: "⭐ این شغل رو از قبل انتخاب کردی!",
          show_alert: true
        });
      }

      const updated = await addXP(user.id, JOB_XP);

      await bot.answerCallbackQuery(query.id, {
        text: `⭐ شغل ${job.name} انتخاب شد!`
      });

      await bot.sendMessage(
        chatId,
        [
          `🎉 تبریک! شما به شغل «${job.name}» مشغول شدید!`,
          "",
          `💰 حقوق هر بار کار: ${fmt(job.salary)} سکه`,
          "",
          `✨ ${JOB_XP} XP دریافت کردی!`,
          "",
          `⭐ XP فعلی: ${fmt(updated?.xp || 0)}`
        ].join("\n")
      );

      await notifyLevelUp(chatId, updated);

      return showJobs(
        chatId,
        user,
        Math.ceil(job.id / JOBS_PER_PAGE),
        messageId
      );
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Callback handler error:", error);

    try {
      await bot.answerCallbackQuery(query.id, {
        text: "خطا پیش اومد؛ دوباره امتحان کن.",
        show_alert: true
      });
    } catch (_) {}
  }
});

bot.on("polling_error", error => {
  console.error("Telegram polling error:", error.message);
});

async function start() {
  await setupDatabase();
  await bot.startPolling();
  console.log("Chaghal bot started successfully!");
}

start().catch(error => {
  console.error("Bot startup failed:", error);
  process.exit(1);
});
