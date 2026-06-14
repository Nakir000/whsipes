let users = [];
let bots = [];
let bannedMessages = [];

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        document.getElementById('stats').innerHTML = `
            <div class="stat">👥 Всего: <span>${stats.total_users || 0}</span></div>
            <div class="stat">🤖 Ботов: <span>${stats.active_bots || 0}</span></div>
            <div class="stat">🚫 Заблокировано: <span>${stats.banned_messages || 0}</span></div>
            <div class="stat">⚠️ Предупреждений: <span>${stats.total_warnings || 0}</span></div>
        `;
    } catch(e) { console.error(e); }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        users = await res.json();
        renderUsers();
    } catch(e) { console.error(e); }
}

async function loadBots() {
    try {
        const res = await fetch('/api/bots');
        bots = await res.json();
        renderBots();
    } catch(e) { console.error(e); }
}

async function loadBannedMessages() {
    try {
        const res = await fetch('/api/banned');
        if (res.ok) {
            bannedMessages = await res.json();
            renderBanned();
        }
    } catch(e) { console.error(e); }
}

function renderUsers() {
    const search = document.getElementById('searchUsers')?.value.toLowerCase() || '';
    const filtered = users.filter(u => 
        u.id.toLowerCase().includes(search) || 
        u.nickname.toLowerCase().includes(search)
    );
    
    const tbody = document.getElementById('userTable');
    if (!tbody) return;
    
    tbody.innerHTML = filtered.map(u => {
        const isBanned = u.banned_until && u.banned_until > Date.now();
        const banDate = isBanned ? new Date(u.banned_until).toLocaleString() : '—';
        
        return `
            <tr>
                <td class="user-id" title="${u.id}">${u.id.slice(0, 12)}...${u.id.slice(-6)}</td>
                <td><strong>${escapeHtml(u.nickname)}</strong> ${u.is_moderator ? '<span class="mod-badge">🔧 Модератор</span>' : ''}</td>
                <td class="${isBanned ? 'status-banned' : 'status-active'}">${isBanned ? '🚫 ЗАБАНЕН' : '✅ Активен'}</td>
                <td>${u.warnings || 0}</td>
                <td style="font-size: 11px;">${banDate}</td>
                <td>
                    <button class="ban-btn" onclick="banUser('${u.id}', 24)">🚫 Бан 24ч</button>
                    <button class="ban-btn" onclick="banUser('${u.id}', 168)">🔨 Бан 7д</button>
                    <button class="unban-btn" onclick="unbanUser('${u.id}')">✅ Разбан</button>
                    <button class="mod-btn" onclick="setModerator('${u.id}', ${u.is_moderator ? 0 : 1})">${u.is_moderator ? '⬇️ Снять' : '⭐ Назначить'}</button>
                </td>
            </tr>
        `;
    }).join('');
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Ничего не найдено</td></tr>';
    }
}

function renderBots() {
    const tbody = document.getElementById('botTable');
    if (!tbody) return;
    
    tbody.innerHTML = bots.map(b => `
        <tr>
            <td class="user-id">${b.id.slice(0, 12)}...</td>
            <td>🤖 ${escapeHtml(b.name)}</td>
            <td>${escapeHtml(b.owner_nick || b.owner_id.slice(0, 8))}</td>
            <td>${b.interval_min} мин</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(b.message).slice(0, 50)}</td>
            <td>${b.active ? '🟢 Активен' : '🔴 Отключен'}</td>
            <td>
                <button onclick="toggleBot('${b.id}', ${b.active ? 0 : 1})" style="background: ${b.active ? '#8b3c2c' : '#2a6f3f'}">
                    ${b.active ? '⏸ Отключить' : '▶ Включить'}
                </button>
            </td>
        </tr>
    `).join('');
    
    if (bots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Нет ботов</td></tr>';
    }
}

function renderBanned() {
    const tbody = document.getElementById('bannedTable');
    if (!tbody) return;
    
    tbody.innerHTML = bannedMessages.slice(0, 100).map(m => `
        <tr>
            <td style="font-size: 11px;">${new Date(m.timestamp).toLocaleString()}</td>
            <td>${escapeHtml(m.user_nick || m.user_id.slice(0, 8))}</td>
            <td style="max-width: 300px; word-break: break-word;">${escapeHtml(m.content)}</td>
            <td>${escapeHtml(m.reason || '—')}</td>
            <td>${m.score || 0}</td>
        </tr>
    `).join('');
    
    if (bannedMessages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Нет заблокированных сообщений</td></tr>';
    }
}

async function banUser(userId, hours) {
    if (confirm(`Забанить пользователя на ${hours} часов?`)) {
        await fetch('/api/ban', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId, hours }) 
        });
        loadUsers();
        loadStats();
    }
}

async function unbanUser(userId) {
    if (confirm('Разбанить пользователя?')) {
        await fetch('/api/unban', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId }) 
        });
        loadUsers();
        loadStats();
    }
}

async function setModerator(userId, isModerator) {
    const action = isModerator ? 'назначить модератором' : 'снять с модератора';
    if (confirm(`Вы уверены, что хотите ${action} пользователя?`)) {
        await fetch('/api/set_moderator', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId, isModerator }) 
        });
        loadUsers();
    }
}

async function toggleBot(botId, active) {
    await fetch('/api/toggle_bot', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ botId, active: active === 1 }) 
    });
    loadBots();
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
        
        if (tab.dataset.tab === 'bots') loadBots();
        if (tab.dataset.tab === 'banned') loadBannedMessages();
    };
});

document.getElementById('searchUsers')?.addEventListener('input', () => renderUsers());

function escapeHtml(str) { 
    return String(str || '').replace(/[&<>]/g, function(m){
        return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m];
    });
}

loadStats();
loadUsers();
setInterval(() => { loadStats(); loadUsers(); }, 15000);