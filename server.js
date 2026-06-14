const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { initDb, getUser, saveUser, updateUser, getAllUsers, getStats, saveBannedMessage, createBot, getBotsByUser, deleteBot, getAllBots, updateBotStatus, getBannedMessages } = require('./db');
const { moderateMessageAdvanced } = require('./moderation');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

initDb();

const sessions = new Map();
const botIntervals = new Map();

const OWNER_ID = 'whisper-owner-uuid';
const OWNER_NICK = 'ПОВЕЛИТЕЛЬ';

// Создаём владельца
getUser(OWNER_ID, (user) => {
    if (!user) {
        saveUser(OWNER_ID, OWNER_NICK, 1);
        updateUser(OWNER_ID, { is_moderator: 1 });
    }
});

// Уведомления владельцу
function sendAdminNotification(notification) {
    for (let [sid, session] of sessions.entries()) {
        if (session.isAdmin) {
            const adminSocket = io.sockets.sockets.get(sid);
            if (adminSocket) {
                adminSocket.emit('admin_notification', notification);
                break;
            }
        }
    }
    console.log(`🔔 УВЕДОМЛЕНИЕ:`, notification);
}

function getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

// ============ MIDDLEWARE ============
io.use((socket, next) => {
    let userId = socket.handshake.auth.userId;
    if (!userId) userId = uuidv4();
    
    getUser(userId, (user) => {
        if (user && user.banned_until && user.banned_until > Date.now()) {
            return next(new Error(`banned until ${user.banned_until}`));
        }
        socket.userId = userId;
        socket.nickname = user?.nickname || `Гость${Math.floor(Math.random()*10000)}`;
        socket.isModerator = user?.is_moderator === 1;
        socket.isAdmin = userId === OWNER_ID;
        next();
    });
});

// ============ ОСНОВНОЙ БЛОК ============
io.on('connection', (socket) => {
    console.log(`✅ + ${socket.nickname} (${socket.userId})`);
    
    sessions.set(socket.id, { 
        userId: socket.userId, 
        nickname: socket.nickname,
        isModerator: socket.isModerator,
        isAdmin: socket.isAdmin
    });
    broadcastOnline();
    
    getBotsByUser(socket.userId, (bots) => socket.emit('my_bots', bots));
    
    if (socket.isAdmin) {
        getBannedMessages(50, (messages) => socket.emit('admin_logs', messages));
    }
    
    // ===== СМЕНА НИКА =====
    socket.on('set_nick', (newNick) => {
        if (!newNick || newNick.length < 2 || newNick.length > 25) return;
        if (newNick === OWNER_NICK && !socket.isAdmin) return;
        const oldNick = socket.nickname;
        socket.nickname = newNick;
        saveUser(socket.userId, newNick);
        sessions.set(socket.id, { ...sessions.get(socket.id), nickname: newNick });
        io.emit('user_renamed', { old: oldNick, new: newNick, userId: socket.userId });
        broadcastOnline();
    });
    
    // ===== ПРИВАТНЫЕ СООБЩЕНИЯ =====
    socket.on('private_message', (data) => {
        const { to, text } = data;
        if (!text || !to) return;
        for (let [sid, session] of sessions.entries()) {
            if (session.userId === to) {
                io.to(sid).emit('private_message', {
                    from: socket.userId,
                    fromNick: socket.nickname,
                    to: to,
                    text: text,
                    timestamp: Date.now()
                });
                break;
            }
        }
    });
    
    // ===== ПОЛУЧИТЬ ИНФО О СЕБЕ =====
    socket.on('get_my_info', (callback) => {
        callback({ nickname: socket.nickname, userId: socket.userId, isAdmin: socket.isAdmin });
    });
    
    // ===== ПОЛУЧИТЬ МОИХ БОТОВ =====
    socket.on('get_my_bots', () => {
        getBotsByUser(socket.userId, (bots) => socket.emit('my_bots', bots));
    });
    
    // ===== СООБЩЕНИЕ В ЧАТ С МОДЕРАЦИЕЙ =====
    socket.on('chat_message', (msg) => {
        if (!msg || msg.trim().length === 0) return;
        
        const moderated = moderateMessageAdvanced(msg, socket.userId);
        
        if (!moderated.allowed) {
            saveBannedMessage(socket.userId, msg, moderated.reason, socket.nickname, moderated.score || 0);
            
            sendAdminNotification({
                type: 'danger',
                userId: socket.userId,
                nickname: socket.nickname,
                message: msg,
                reason: moderated.reason,
                score: moderated.score || 0,
                timestamp: Date.now()
            });
            
            socket.emit('blocked', { message: moderated.message, reason: moderated.reason });
            return;
        }
        
        const messageData = {
            userId: socket.userId,
            nickname: socket.nickname,
            text: msg,
            timestamp: Date.now(),
            isModerator: socket.isModerator,
            isAdmin: socket.isAdmin
        };
        
        io.emit('chat_message', messageData);
    });
    
    // ===== ЗАКРЕПЛЁННОЕ СООБЩЕНИЕ =====
    socket.on('set_pinned', (text, callback) => {
        if (!socket.isAdmin) {
            callback({ success: false, error: 'Только ПОВЕЛИТЕЛЬ' });
            return;
        }
        io.emit('pinned_message', { text, by: socket.nickname, timestamp: Date.now() });
        callback({ success: true });
    });
    
    // ===== БАН =====
    socket.on('ban_user', (data, callback) => {
        if (!socket.isModerator && !socket.isAdmin) {
            callback({ success: false, error: 'Нет прав' });
            return;
        }
        
        const { targetUserId, hours, reason } = data;
        const until = Date.now() + (hours || 24) * 3600 * 1000;
        updateUser(targetUserId, { banned_until: until });
        
        for (let [sid, session] of sessions.entries()) {
            if (session.userId === targetUserId) {
                const sock = io.sockets.sockets.get(sid);
                if (sock) sock.emit('force_ban', { until, reason: reason || 'Нарушение' });
                break;
            }
        }
        
        if (!socket.isAdmin) {
            sendAdminNotification({
                type: 'mod_action',
                action: 'ban',
                moderator: socket.nickname,
                targetId: targetUserId,
                hours,
                reason,
                timestamp: Date.now()
            });
        }
        
        callback({ success: true });
    });
    
    // ===== РАЗБАН =====
    socket.on('unban_user', (data, callback) => {
        if (!socket.isModerator && !socket.isAdmin) {
            callback({ success: false, error: 'Нет прав' });
            return;
        }
        updateUser(data.userId, { banned_until: 0 });
        callback({ success: true });
    });
    
    // ===== ЖАЛОБА =====
    socket.on('report_user', (data, callback) => {
        sendAdminNotification({
            type: 'report',
            from: socket.nickname,
            fromId: socket.userId,
            target: data.targetNick,
            reason: data.reason,
            timestamp: Date.now()
        });
        callback({ success: true });
        socket.emit('system_message', 'Жалоба отправлена ПОВЕЛИТЕЛЮ');
    });
    
    // ===== ПОИСК =====
    socket.on('search_users', (query) => {
        getAllUsers((users) => {
            const filtered = users.filter(u => 
                u.nickname.toLowerCase().includes(query.toLowerCase()) ||
                u.id.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 20);
            socket.emit('search_results', filtered.map(u => ({ 
                nickname: u.nickname, 
                userId: u.id,
                isBanned: u.banned_until > Date.now()
            })));
        });
    });
    
    // ===== СОЗДАНИЕ БОТА =====
    socket.on('create_bot', (botData, callback) => {
        getBotsByUser(socket.userId, (existing) => {
            if (existing.length >= 3) {
                callback({ success: false, error: 'Максимум 3 бота' });
                return;
            }
            
            const botId = uuidv4();
            createBot(botId, socket.userId, botData.name, botData.interval, botData.message, (err) => {
                if (err) {
                    callback({ success: false, error: err.message });
                    return;
                }
                
                const interval = setInterval(() => {
                    io.emit('chat_message', {
                        userId: botId,
                        nickname: `🤖 ${botData.name}`,
                        text: botData.message,
                        timestamp: Date.now(),
                        isBot: true
                    });
                }, botData.interval * 60000);
                botIntervals.set(botId, interval);
                
                callback({ success: true, botId });
                getBotsByUser(socket.userId, (bots) => socket.emit('my_bots', bots));
            });
        });
    });
    
    // ===== УДАЛЕНИЕ БОТА =====
    socket.on('delete_bot', (botId, callback) => {
        if (botIntervals.has(botId)) {
            clearInterval(botIntervals.get(botId));
            botIntervals.delete(botId);
        }
        deleteBot(botId, socket.userId, (err) => {
            if (err) callback({ success: false, error: err.message });
            else {
                callback({ success: true });
                getBotsByUser(socket.userId, (bots) => socket.emit('my_bots', bots));
            }
        });
    });
    
    // ===== ВЫХОД =====
    socket.on('exit_chat', () => socket.disconnect());
    
    socket.on('disconnect', () => {
        sessions.delete(socket.id);
        broadcastOnline();
        console.log(`❌ - ${socket.nickname}`);
    });
});

function broadcastOnline() {
    const online = Array.from(sessions.values()).map(s => ({ 
        nickname: s.nickname, 
        userId: s.userId,
        isModerator: s.isModerator,
        isAdmin: s.isAdmin
    }));
    io.emit('online_list', { count: online.length, users: online });
}

// ============ АДМИН API ============
app.get('/api/users', (req, res) => getAllUsers((users) => res.json(users)));
app.get('/api/bots', (req, res) => getAllBots((bots) => res.json(bots)));
app.get('/api/stats', (req, res) => getStats((stats) => res.json(stats)));
app.get('/api/banned', (req, res) => getBannedMessages(100, (messages) => res.json(messages)));

app.post('/api/ban', (req, res) => {
    const { userId, hours } = req.body;
    const until = Date.now() + (hours || 24) * 3600 * 1000;
    updateUser(userId, { banned_until: until });
    res.json({ ok: true });
});

app.post('/api/unban', (req, res) => {
    updateUser(req.body.userId, { banned_until: 0 });
    res.json({ ok: true });
});

app.post('/api/set_moderator', (req, res) => {
    updateUser(req.body.userId, { is_moderator: req.body.isModerator ? 1 : 0 });
    res.json({ ok: true });
});

app.post('/api/toggle_bot', (req, res) => {
    const { botId, active } = req.body;
    updateBotStatus(botId, active ? 1 : 0);
    if (!active && botIntervals.has(botId)) {
        clearInterval(botIntervals.get(botId));
        botIntervals.delete(botId);
    }
    res.json({ ok: true });
});

const PORT = 3000;
const localIp = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🔒 WHISPER ЗАПУЩЕН');
    console.log('========================================');
    console.log(`📱 Локальный доступ: http://localhost:${PORT}`);
    console.log(`🌐 По сети (Wi-Fi): http://${localIp}:${PORT}`);
    console.log(`👑 Админ-панель: http://localhost:${PORT}/admin.html`);
    console.log('========================================\n');
});
