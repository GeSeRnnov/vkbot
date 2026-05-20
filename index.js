const fs = require('fs');
const path = require('path');
const https = require('https');
const dgram = require('dgram');

// 1. НАДЕЖНЫЙ ПАРСЕР .ENV
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split(/\n/).forEach(line => {
        const cleanLine = line.replace(/\r/g, '').trim();
        if (!cleanLine || cleanLine.startsWith('#')) return;

        const firstEq = cleanLine.indexOf('=');
        if (firstEq !== -1) {
            const key = cleanLine.substring(0, firstEq).trim();
            let value = cleanLine.substring(firstEq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1).trim();
            }
            process.env[key] = value;
        }
    });
}

const TOKEN = process.env.TOKEN;
const ADMIN_ID = Number(process.env.USER_ID);
const MAC = process.env.MAC ? process.env.MAC.replace(/-/g, ':').toLowerCase() : '';
const API_VERSION = '5.199';

if (!TOKEN || !ADMIN_ID || !MAC) {
    console.error('❌ Ошибка: Проверьте переменные в файле .env');
    process.exit(1);
}

// 2. АВТОНОМНЫЙ WAKE-ON-LAN
function wakeComputer(macAddress, callback) {
    try {
        const macParts = macAddress.split(':');
        if (macParts.length !== 6) throw new Error('Неверный формат MAC');

        const buffer = Buffer.alloc(6 + 16 * 6);
        for (let i = 0; i < 6; i++) buffer[i] = 0xff;

        const macBuffer = Buffer.from(macParts.map(hex => parseInt(hex, 16)));
        for (let i = 0; i < 16; i++) {
            macBuffer.copy(buffer, 6 + i * 6, 0, 6);
        }

        const socket = dgram.createSocket('udp4');
        socket.on('error', err => callback(err));
        
        socket.bind(() => {
            socket.setBroadcast(true);
            socket.send(buffer, 0, buffer.length, 9, '255.255.255.255', (err) => {
                socket.close();
                callback(err);
            });
        });
    } catch (e) {
        callback(e);
    }
}

// 3. ОТПРАВКА СООБЩЕНИЙ В ВК
function sendVkMessage(peerId, text) {
    const data = `peer_id=${peerId}&message=${encodeURIComponent(text)}&access_token=${TOKEN}&v=${API_VERSION}&random_id=${Math.floor(Math.random() * 1000000)}`;
    const req = https.request({
        hostname: 'api.vk.com',
        path: '/method/messages.send',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    req.on('error', (e) => console.error('Ошибка отправки сообщения:', e.message));
    req.write(data);
    req.end();
}

// 4. ПРОСЛУШИВАНИЕ LONG POLL
function startLongPoll(serverUrl, key, ts) {
    // Безопасно очищаем адрес сервера от возможных двойных протоколов
    let cleanUrl = serverUrl.replace(/^https?:\/\//i, '');
    
    https.get(`https://${cleanUrl}?act=a_check&key=${key}&ts=${ts}&wait=25`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.failed) return initBot(); 
                
                if (data.updates && data.updates.length > 0) {
                    data.updates.forEach(update => {
                        if (update.type === 'message_new') {
                            const messageObj = update.object.message;
                            if (!messageObj) return;

                            const fromId = messageObj.from_id;
                            const text = messageObj.text ? messageObj.text.toLowerCase().trim() : '';

                            if (fromId === ADMIN_ID && text === 'включи пк') {
                                console.log(`[${new Date().toLocaleTimeString()}] Команда получена. Включаю ПК...`);
                                
                                wakeComputer(MAC, (err) => {
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
                startLongPoll(serverUrl, key, data.ts);
            } catch (e) {
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', () => setTimeout(initBot, 5000));
}

// 5. ИНИЦИАЛИЗАЦИЯ БОТА
function initBot() {
    // Делаем явный запрос по строгому адресу без лишних склеек
    https.get(`https://vk.com${TOKEN}&v=${API_VERSION}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                // Защита от ошибок авторизации
                if (!json.response || !json.response.groups || json.response.groups.length === 0) {
                    console.error('❌ Ошибка VK API. Возможно, неверный токен. Ответ сервера:', body);
                    return setTimeout(initBot, 10000);
                }

                const groupId = json.response.groups[0].id;
                
                https.get(`https://vk.com${groupId}&access_token=${TOKEN}&v=${API_VERSION}`, (res2) => {
                    let body2 = '';
                    res2.on('data', chunk => body2 += chunk);
                    res2.on('end', () => {
                        try {
                            const json2 = JSON.parse(body2);
                            if (!json2.response) {
                                console.error('❌ Не удалось получить Long Poll сервер. Ответ:', body2);
                                return setTimeout(initBot, 10000);
                            }

                            const response = json2.response;
                            console.log('==================================================');
                            console.log(`🤖 Автономный ВК-бот запущен (API v${API_VERSION})`);
                            console.log(`🔒 Администратор: ID ${ADMIN_ID}`);
                            console.log(`🖥️ Целевой MAC: ${MAC}`);
                            console.log('==================================================');
                            startLongPoll(response.server, response.key, response.ts);
                        } catch(e) {
                            setTimeout(initBot, 5000);
                        }
                    });
                });
            } catch(e) {
                console.error('Ошибка парсинга ответа авторизации, повтор...');
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', (e) => {
        console.error('Ошибка подключения к VK:', e.message);
        setTimeout(initBot, 5000);
    });
}

initBot();
