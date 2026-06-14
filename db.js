const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./whisper.db');

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            nickname TEXT,
            warnings INTEGER DEFAULT 0,
            banned_until INTEGER DEFAULT 0,
            is_moderator INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS bots (
            id TEXT PRIMARY KEY,
            owner_id TEXT,
            name TEXT,
            interval_min INTEGER,
            message TEXT,
            active INTEGER DEFAULT 1,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS banned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_nick TEXT,
            content TEXT,
            reason TEXT,
            score INTEGER DEFAULT 0,
            timestamp INTEGER
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS warnings_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_nick TEXT,
            score INTEGER,
            reason TEXT,
            timestamp INTEGER
        )`);
    });
}

function getUser(id, callback) {
    db.get(`SELECT * FROM users WHERE id = ?`, [id], callback);
}

function saveUser(id, nickname, isModerator = 0) {
    db.run(`INSERT OR REPLACE INTO users (id, nickname, is_moderator) VALUES (?, ?, ?)`, [id, nickname, isModerator]);
}

function updateUser(id, data) {
    const fields = [];
    const values = [];
    for (let [key, val] of Object.entries(data)) {
        fields.push(`${key} = ?`);
        values.push(val);
    }
    values.push(id);
    db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
}

function getAllUsers(callback) {
    db.all(`SELECT id, nickname, warnings, banned_until, is_moderator FROM users ORDER BY created_at DESC`, callback);
}

function getStats(callback) {
    db.get(`SELECT COUNT(*) as total_users FROM users`, (err, total) => {
        db.get(`SELECT COUNT(*) as banned_messages FROM banned_messages`, (err2, banned) => {
            db.get(`SELECT COUNT(*) as active_bots FROM bots WHERE active = 1`, (err3, bots) => {
                db.get(`SELECT SUM(warnings) as total_warnings FROM users`, (err4, warns) => {
                    callback({ 
                        total_users: total.total_users, 
                        banned_messages: banned.banned_messages,
                        active_bots: bots.active_bots,
                        total_warnings: warns.total_warnings || 0
                    });
                });
            });
        });
    });
}

function saveBannedMessage(userId, content, reason, userNick, score = 0) {
    db.run(`INSERT INTO banned_messages (user_id, user_nick, content, reason, score, timestamp) VALUES (?, ?, ?, ?, ?, ?)`, 
        [userId, userNick, content, reason, score, Date.now()]);
}

function getBannedMessages(limit, callback) {
    db.all(`SELECT * FROM banned_messages ORDER BY timestamp DESC LIMIT ?`, [limit], callback);
}

function addWarning(userId, userNick, score, reason) {
    db.run(`INSERT INTO warnings_log (user_id, user_nick, score, reason, timestamp) VALUES (?, ?, ?, ?, ?)`, 
        [userId, userNick, score, reason, Date.now()]);
    db.run(`UPDATE users SET warnings = warnings + 1 WHERE id = ?`, [userId]);
}

function getWarnings(callback) {
    db.all(`SELECT * FROM warnings_log ORDER BY timestamp DESC LIMIT 100`, callback);
}

function createBot(id, ownerId, name, interval_min, message, callback) {
    db.run(`INSERT INTO bots (id, owner_id, name, interval_min, message) VALUES (?, ?, ?, ?, ?)`, 
        [id, ownerId, name, interval_min, message], callback);
}

function getBotsByUser(ownerId, callback) {
    db.all(`SELECT * FROM bots WHERE owner_id = ?`, [ownerId], callback);
}

function getAllBots(callback) {
    db.all(`SELECT b.*, u.nickname as owner_nick FROM bots b LEFT JOIN users u ON b.owner_id = u.id`, callback);
}

function deleteBot(botId, ownerId, callback) {
    db.run(`DELETE FROM bots WHERE id = ? AND owner_id = ?`, [botId, ownerId], function(err) {
        if (err) callback(err);
        else if (this.changes === 0) callback(new Error('Бот не найден'));
        else callback(null);
    });
}

function updateBotStatus(botId, active) {
    db.run(`UPDATE bots SET active = ? WHERE id = ?`, [active, botId]);
}

module.exports = { 
    initDb, getUser, saveUser, updateUser, getAllUsers, getStats, 
    saveBannedMessage, getBannedMessages, addWarning, getWarnings,
    createBot, getBotsByUser, getAllBots, deleteBot, updateBotStatus
};