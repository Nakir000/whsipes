function killTextAdvanced(text) {
    let clean = text.toLowerCase();
    
    const fullMap = {
        'a':'а','b':'в','c':'с','e':'е','h':'н','k':'к','m':'м','o':'о',
        'p':'р','t':'т','x':'х','y':'у','u':'и','i':'и','l':'л',
        '0':'о','1':'и','2':'з','3':'е','4':'ч','5':'с','6':'б',
        '7':'т','8':'в','9':'д',
        'є':'е','ї':'и','і':'и','ё':'е','ъ':'','ь':'','ы':'и',
        'э':'е','ю':'у','я':'а','@':'а','$':'с','+':'т',
        '₽':'р','%':'п','&':'и','*':'','#':'','_':''
    };
    for (let [bad, good] of Object.entries(fullMap)) {
        clean = good ? clean.split(bad).join(good) : clean.split(bad).join('');
    }
    
    clean = clean.replace(/[\.\,\-\_\*\+\=\!\?\&\^\$\#\@\~\`\|\\\/]/g, '');
    clean = clean.replace(/(.)\1{2,}/g, '$1').replace(/\s+/g, '');
    
    return clean;
}

function analyzeContext(cleanText, originalText) {
    const safeContext = [
        'антитеррор', 'безопасность', 'новости', 'фильм', 'игра',
        'антинаркотик', 'лечение', 'помощь', 'не хочу'
    ];
    for (let safe of safeContext) {
        if (cleanText.includes(safe)) return false;
    }
    
    const timeWords = ['сегодня', 'завтра', 'вечером', 'утром', 'через час', 'сейчас'];
    const placeWords = ['школа', 'тц', 'вокзал', 'метро', 'детсад', 'универ'];
    
    let hasTime = timeWords.some(w => originalText.includes(w));
    let hasPlace = placeWords.some(w => cleanText.includes(w));
    
    if (hasTime && hasPlace) return { riskBoost: 150, reason: 'конкретное время+место' };
    if (hasTime || hasPlace) return { riskBoost: 50, reason: 'намёк на время/место' };
    return { riskBoost: 0 };
}

const dangerScoreAdvanced = {
    'теракт': 500, 'взрыв': 450, 'бомба': 400, 'тц': 350,
    'школ': 300, 'детсад': 300, 'убить': 250, 'зарезать': 200,
    'расстрел': 200, 'стрельб': 200, 'автомат': 150,
    'наркотик': 100, 'меф': 80, 'соль': 70, 'спайс': 70,
    'закладк': 60, 'кладмен': 60, 'шоп': 50,
    'нацист': 50, 'фашист': 50, 'жид': 40, 'хач': 40,
    'дебил': 10, 'идиот': 10, 'тупой': 8, 'лох': 5
};

const userWarnings = new Map();
const userBans = new Map();

function moderateMessageAdvanced(text, userId) {
    const cleanText = killTextAdvanced(text);
    const originalText = text;
    
    if (userBans.has(userId) && userBans.get(userId) > Date.now()) {
        return { allowed: false, reason: 'banned', message: 'Вы забанены до ' + new Date(userBans.get(userId)).toLocaleTimeString() };
    } else if (userBans.has(userId)) {
        userBans.delete(userId);
    }
    
    const context = analyzeContext(cleanText, originalText);
    if (context.riskBoost === 0 && cleanText.length < 3) {
        return { allowed: true };
    }
    
    let totalScore = 0;
    let foundWords = [];
    for (let [word, score] of Object.entries(dangerScoreAdvanced)) {
        if (cleanText.includes(word)) {
            totalScore += score;
            foundWords.push(word);
        }
    }
    totalScore += context.riskBoost;
    
    const dangerEmoji = ['🔪', '💣', '🔫', '⚔️', '🗡️', '🩸', '☠️', '💀'];
    let emojiCount = dangerEmoji.filter(e => originalText.includes(e)).length;
    let emojiScore = Math.min(emojiCount * 25, 75);
    totalScore += emojiScore;
    
    let warningsCount = userWarnings.get(userId) || 0;
    if (warningsCount >= 2) totalScore += 20;
    
    console.log(`[LOG] User ${userId}: score=${totalScore}, words=${foundWords.join(',')}`);
    
    if (totalScore >= 100) {
        const banHours = warningsCount >= 3 ? 72 : 24;
        userBans.set(userId, Date.now() + banHours * 3600 * 1000);
        userWarnings.set(userId, warningsCount + 1);
        return {
            allowed: false,
            reason: 'danger',
            score: totalScore,
            message: `⚠️ СООБЩЕНИЕ ЗАБЛОКИРОВАНО\nБан на ${banHours} ч.`
        };
    }
    
    if (totalScore >= 30) {
        userWarnings.set(userId, warningsCount + 1);
        if (warningsCount + 1 >= 3) {
            userBans.set(userId, Date.now() + 24 * 3600 * 1000);
            return {
                allowed: false,
                reason: 'danger',
                score: totalScore,
                message: '⚠️ 3 ПРЕДУПРЕЖДЕНИЯ\nБан на 24 часа.'
            };
        }
        return {
            allowed: false,
            reason: 'warning',
            score: totalScore,
            message: `⚠️ Сообщение удалено. Нарушение (${foundWords.join(', ')}). Предупреждение ${warningsCount+1}/3.`
        };
    }
    
    if (totalScore >= 5) {
        return {
            allowed: true,
            warning: true,
            message: text,
            note: `Не оскорбляйте других. (замечено: ${foundWords.join(', ') || 'эмодзи'})`
        };
    }
    
    if (warningsCount > 0) userWarnings.delete(userId);
    return { allowed: true };
}

module.exports = { moderateMessageAdvanced };