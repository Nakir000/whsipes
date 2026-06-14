const socket = io();
let myUserId = '';
let myNick = '';
let isAdmin = false;
let currentChat = 'global';
let contacts = [];
let globalMessages = [];

// DOM элементы
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const searchInput = document.getElementById('searchInput');
const chatsList = document.getElementById('chatsList');
const currentNickSpan = document.getElementById('currentNick');
const chatTitle = document.getElementById('chatTitle');
const onlineBadge = document.getElementById('onlineBadge');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const botModal = document.getElementById('botModal');
const adminPanel = document.getElementById('adminPanel');
const notificationsList = document.getElementById('notificationsList');
const clearNotifications = document.getElementById('clearNotifications');
const themeToggle = document.getElementById('themeToggle');
const editNickBtn = document.getElementById('editNickBtn');
const settingsNick = document.getElementById('settingsNick');
const settingsSetNick = document.getElementById('settingsSetNick');
const showBotsBtn = document.getElementById('showBotsBtn');
const createBotSettingsBtn = document.getElementById('createBotSettingsBtn');
const exitSettingsBtn = document.getElementById('exitSettingsBtn');
const botsListSettings = document.getElementById('botsListSettings');
const emojiBtn = document.getElementById('emojiBtn');

// Закрытие модалок
document.querySelectorAll('.close, .close-bot').forEach(el => {
    el.onclick = () => { settingsModal.style.display = 'none'; botModal.style.display = 'none'; };
});
window.onclick = (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
    if (e.target === botModal) botModal.style.display = 'none';
};

// Тема
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('whisper_theme', theme);
    if (themeToggle) themeToggle.checked = (theme === 'dark');
}
themeToggle?.addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
});
const savedTheme = localStorage.getItem('whisper_theme') || 'dark';
setTheme(savedTheme);

// Контакты
function loadContacts() {
    const saved = localStorage.getItem('whisper_contacts');
    if (saved) contacts = JSON.parse(saved);
    renderChats();
}
function saveContacts() { localStorage.setItem('whisper_contacts', JSON.stringify(contacts)); }
function addContact(userId, nickname) {
    if (!contacts.find(c => c.userId === userId) && userId !== myUserId) {
        contacts.push({ userId, nickname, unread: 0 });
        saveContacts();
        renderChats();
        addSystemMessage(`✅ ${nickname} добавлен в контакты`);
    }
}
function removeContact(userId) {
    contacts = contacts.filter(c => c.userId !== userId);
    saveContacts();
    renderChats();
    if (currentChat === userId) switchToChat('global');
}
function renderChats() {
    if (!chatsList) return;
    let html = `<div class="chat-item ${currentChat === 'global' ? 'active' : ''}" data-chat="global">
        <div class="chat-avatar">🌍</div>
        <div class="chat-info">
            <div class="chat-name">Общий чат</div>
            <div class="chat-preview">Все сообщения...</div>
        </div>
    </div>`;
    contacts.forEach(c => {
        html += `<div class="chat-item ${currentChat === c.userId ? 'active' : ''}" data-chat="${c.userId}">
            <div class="chat-avatar">👤</div>
            <div class="chat-info">
                <div class="chat-name">${escapeHtml(c.nickname)}</div>
                <div class="chat-preview">Личные сообщения</div>
                ${c.unread > 0 ? `<span class="unread-badge">${c.unread}</span>` : ''}
            </div>
        </div>`;
    });
    chatsList.innerHTML = html;
    document.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => switchToChat(el.dataset.chat));
    });
}

function switchToChat(chatId) {
    currentChat = chatId;
    messagesDiv.innerHTML = '';
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.chat-item[data-chat="${chatId}"]`)?.classList.add('active');
    
    if (chatId === 'global') {
        chatTitle.innerText = 'Общий чат';
        globalMessages.slice(-50).forEach(msg => {
            addMessage(msg.nickname, msg.text, msg.timestamp, msg.userId === socket.id, msg.isModerator, msg.isAdmin);
        });
    } else {
        const contact = contacts.find(c => c.userId === chatId);
        if (contact) {
            chatTitle.innerText = contact.nickname;
            contact.unread = 0;
            saveContacts();
            renderChats();
            loadPrivateMessages(chatId);
        }
    }
}

function loadPrivateMessages(userId) {
    const key = `whisper_pm_${myUserId}_${userId}`;
    const messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages.forEach(msg => {
        addMessage(msg.nickname, msg.text, msg.timestamp, msg.fromMe, false, false);
    });
}
function savePrivateMessage(userId, nickname, text, fromMe) {
    const key = `whisper_pm_${myUserId}_${userId}`;
    const messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages.push({ nickname: fromMe ? myNick : nickname, text, timestamp: Date.now(), fromMe });
    while (messages.length > 100) messages.shift();
    localStorage.setItem(key, JSON.stringify(messages));
}

function addMessage(nick, text, ts, isOwn, isMod, isAdminMsg) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = `
        <div class="nick">${escapeHtml(nick)} ${isMod ? '🔧' : ''} ${isAdminMsg ? '👑' : ''}</div>
        <div class="text">${escapeHtml(text)}</div>
        <div class="time">${new Date(ts).toLocaleTimeString()}</div>
    `;
    messagesDiv.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
}
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    messagesDiv.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
}

function sendMessage() {
    const val = messageInput.value.trim();
    if (!val) return;
    if (currentChat === 'global') {
        socket.emit('chat_message', val);
    } else {
        socket.emit('private_message', { to: currentChat, text: val });
        savePrivateMessage(currentChat, chatTitle.innerText, val, true);
        addMessage(myNick, val, Date.now(), true, false, false);
    }
    messageInput.value = '';
}

// ===== СОКЕТЫ =====
socket.on('connect', () => { myUserId = socket.id; });
socket.on('online_list', (data) => {
    onlineBadge.innerText = `${data.count} онлайн`;
    // Обновляем список для поиска
});
socket.on('chat_message', (msg) => {
    globalMessages.push(msg);
    if (globalMessages.length > 100) globalMessages.shift();
    if (currentChat === 'global') {
        addMessage(msg.nickname, msg.text, msg.timestamp, msg.userId === socket.id, msg.isModerator, msg.isAdmin);
    }
});
socket.on('private_message', (data) => {
    if (data.to === myUserId) {
        const contact = contacts.find(c => c.userId === data.from);
        if (contact) { contact.unread = (contact.unread || 0) + 1; saveContacts(); renderChats(); }
        savePrivateMessage(data.from, data.fromNick, data.text, false);
        if (currentChat === data.from) {
            addMessage(data.fromNick, data.text, data.timestamp, false, false, false);
        }
    }
});
socket.on('user_renamed', (data) => addSystemMessage(`${data.old} → ${data.new}`));
socket.on('blocked', (data) => addSystemMessage(data.message));
socket.on('system_message', (msg) => addSystemMessage(msg));
socket.on('force_ban', (data) => {
    addSystemMessage(`❌ Вы забанены до ${new Date(data.until).toLocaleString()}`);
    messageInput.disabled = true;
    sendBtn.disabled = true;
});
socket.on('my_bots', (bots) => {
    if (!botsListSettings) return;
    if (bots.length === 0) { botsListSettings.innerHTML = '<div style="color:#666;">Нет ботов</div>'; return; }
    botsListSettings.innerHTML = bots.map(bot => `
        <div class="bot-item-settings">
            <span>🤖 ${escapeHtml(bot.name)} (каждые ${bot.interval_min} мин)</span>
            <button onclick="deleteBot('${bot.id}')">Удалить</button>
        </div>
    `).join('');
});
socket.on('search_results', (results) => {
    // Можно добавить поиск в интерфейс
});
socket.on('admin_notification', (notif) => {
    if (!isAdmin) return;
    adminPanel.style.display = 'flex';
    const div = document.createElement('div');
    div.className = `notification ${notif.type === 'danger' ? 'danger' : ''}`;
    div.innerHTML = `
        <div>${new Date(notif.timestamp).toLocaleTimeString()}</div>
        <strong>${notif.type === 'danger' ? '🔴 ОПАСНОЕ СООБЩЕНИЕ' : '📋 ЖАЛОБА'}</strong><br>
        ${notif.nickname ? `👤 ${escapeHtml(notif.nickname)}<br>` : ''}
        📝 "${escapeHtml(notif.message || notif.reason)}"<br>
        ${notif.userId ? `<button onclick="banById('${notif.userId}', 24)">🚫 Бан 24ч</button>` : ''}
    `;
    notificationsList.prepend(div);
});
socket.on('set_nick_ack', (data) => { if (data.success) myNick = data.nick; });

// ===== ФУНКЦИИ =====
window.deleteBot = (botId) => {
    socket.emit('delete_bot', botId, (res) => { if (res.success) addSystemMessage('Бот удалён'); });
};
window.banById = (userId, hours) => {
    socket.emit('ban_user', { targetUserId: userId, hours }, (res) => {
        if (res.success) addSystemMessage(`✅ Пользователь забанен на ${hours}ч`);
    });
};
function setNick(nick) {
    if (nick && nick.length >= 2) {
        socket.emit('set_nick', nick);
        myNick = nick;
        currentNickSpan.innerText = nick;
    }
}

// Обработчики
sendBtn.onclick = sendMessage;
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
settingsBtn.onclick = () => { settingsModal.style.display = 'flex'; loadContacts(); socket.emit('get_my_bots'); };
editNickBtn.onclick = () => { const newNick = prompt('Новый ник:', myNick); if (newNick) setNick(newNick); };
settingsSetNick.onclick = () => { const newNick = settingsNick.value.trim(); if (newNick) setNick(newNick); settingsNick.value = ''; };
showBotsBtn.onclick = () => socket.emit('get_my_bots');
createBotSettingsBtn.onclick = () => { botModal.style.display = 'flex'; };
exitSettingsBtn.onclick = () => { socket.emit('exit_chat'); setTimeout(() => location.reload(), 100); };
clearNotifications?.onclick = () => { notificationsList.innerHTML = ''; adminPanel.style.display = 'none'; };
emojiBtn?.addEventListener('click', () => {
    // Простые эмодзи для демо
    const emojis = ['😊', '😂', '❤️', '👍', '🔥', '🥺', '😭', '🎉', '✨', '💀'];
    const pick = prompt('Выбери эмодзи:\n' + emojis.join(' '));
    if (pick && emojis.includes(pick)) messageInput.value += pick;
});

// Создание бота
document.getElementById('confirmCreateBot')?.addEventListener('click', () => {
    const name = document.getElementById('botName').value.trim();
    const interval = parseInt(document.getElementById('botInterval').value);
    const message = document.getElementById('botMessage').value.trim();
    if (!name || !interval || !message) { addSystemMessage('Заполните все поля'); return; }
    if (interval < 1 || interval > 60) { addSystemMessage('Интервал 1-60 мин'); return; }
    socket.emit('create_bot', { name, interval, message }, (response) => {
        if (response.success) {
            addSystemMessage(`✅ Бот "${name}" создан`);
            botModal.style.display = 'none';
            document.getElementById('botName').value = '';
            document.getElementById('botInterval').value = '';
            document.getElementById('botMessage').value = '';
        } else {
            addSystemMessage(`❌ ${response.error}`);
        }
    });
});

function escapeHtml(str) { return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

// Инициализация
socket.on('connect', () => {
    socket.emit('get_my_info', (data) => {
        if (data) { myNick = data.nickname; currentNickSpan.innerText = myNick; isAdmin = data.isAdmin; }
    });
});
loadContacts();
globalMessages = [];
setTimeout(() => {
    if (isAdmin && adminPanel) adminPanel.style.display = 'flex';
}, 1000);