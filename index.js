require('dotenv').config();
const https = require('https');
const wol = require('wake_on_lan');

const TOKEN = process.env.TOKEN;
const ADMIN_ID = Number(process.env.USER_ID);
const MAC = process.env.MAC.replace(/-/g, ':').toLowerCase();

// Функция отправки текстового ответа в ВК
function sendVkMessage(peerId, text) {
    const data = `peer_id=${peerId}&message=${encodeURIComponent(text)}&access_token=${TOKEN}&v=5.131&random_id=${Math.floor(Math.random() * 1000000)}`;
    
    const req = https.request({
        hostname: '://vk.com',
        path: '/method/messages.send',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    req.on('error', (e) => console.error('Ошибка отправки сообщения:', e.message));
    req.write(data);
    req.end();
}

// Прослушивание сервера уведомлений VK (Long Poll)
function startLongPoll(server, key, ts) {
    https.get(`${server}?act=a_check&key=${key}&ts=${ts}&wait=25`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                // Если сессия устарела, перезапускаем бота
                if (data.failed) return initBot(); 
                
                if (data.updates && data.updates.length > 0) {
                    data.updates.forEach(update => {
                        // Проверяем только новые входящие сообщения
                        if (update.type === 'message_new') {
                            const message = update.object.message;
                            const fromId = message.from_id;
                            const text = message.text ? message.text.toLowerCase().trim() : '';

                            // Защита: проверяем ID админа
                            if (fromId === ADMIN_ID && text === 'включи пк') {
                                console.log(`[${new Date().toLocaleTimeString()}] Получена команда! Отправка WoL на ${MAC}...`);
                                
                                wol.wake(MAC, (err) => {
                                    if (err) {
                                        console.error(err);
                                        sendVkMessage(fromId, '❌ Ошибка при отправке пакета Wake-on-LAN.');
                                    } else {
                                        sendVkMessage(fromId, '🚀 Сигнал на включение ПК успешно отправлен!');
                                    }
                                });
                            }
                        }
                    });
                }
                // Рекурсивный вызов для ожидания следующих сообщений
                startLongPoll(server, key, data.ts);
            } catch (e) {
                console.error('Ошибка обработки данных Long Poll, перезапуск через 5 сек...');
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', (e) => {
        console.error('Ошибка сети Long Poll:', e.message);
        setTimeout(initBot, 5000);
    });
}

// Получение адреса Long Poll сервера для группы
function initBot() {
    // Сначала узнаем ID группы по токену
    https.get(`https://://vk.com/method/groups.getById?access_token=${TOKEN}&v=5.131`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const groupId = JSON.parse(body).response[0].id;
                
                // Запрашиваем сервер для этой группы
                https.get(`https://://vk.com/method/groups.getLongPollServer?group_id=${groupId}&access_token=${TOKEN}&v=5.131`, (res2) => {
                    let body2 = '';
                    res2.on('data', chunk => body2 += chunk);
                    res2.on('end', () => {
                        try {
                            const response = JSON.parse(body2).response;
                            console.log('==================================================');
                            console.log('🤖 Легковесный ВК-бот запущен напрямую через API!');
                            console.log(`🔒 Администратор: ID ${ADMIN_ID}`);
                            console.log('==================================================');
                            startLongPoll(response.server, response.key, response.ts);
                        } catch(e) {
                            console.error('Не удалось получить Long Poll сервер:', body2);
                            setTimeout(initBot, 5000);
                        }
                    });
                });
            } catch(e) {
                console.error('Ошибка авторизации токена VK:', body);
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', (e) => {
        console.error('Ошибка подключения к API VK:', e.message);
        setTimeout(initBot, 5000);
    });
}

initBot();
