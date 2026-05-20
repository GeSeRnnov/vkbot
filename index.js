const fs = require('fs');
const path = require('path');
const https = require('https');
const dgram = require('dgram'); // Встроенный модуль для сетевых пакетов

// 1. САМОПИСНЫЙ ПАРСЕР .ENV (Замена библиотеки dotenv)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.replace(/(^"|"$)/g, '');
            }
            process.env[key] = value.trim();
        }
    });
}

const TOKEN = process.env.VK_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const MAC = process.env.COMPUTER_MAC ? process.env.COMPUTER_MAC.replace(/-/g, ':').toLowerCase() : '';

if (!TOKEN || !ADMIN_ID || !MAC) {
    console.error('❌ Ошибка: Проверьте переменные в файле .env');
    process.exit(1);
}

// 2. САМОПИСНЫЙ WAKE-ON-LAN (Замена библиотеки wake_on_lan)
function wakeComputer(macAddress, callback) {
    try {
        const macParts = macAddress.split(':');
        if (macParts.length !== 6) throw new Error('Неверный формат MAC');

        const buffer = Buffer.alloc(6 + 16 * 6);
        for (let i = 0; i < 6; i++) buffer[i] = 0xff; // Заголовок пакета

        const macBuffer = Buffer.from(macParts.map(hex => parseInt(hex, 16)));
        for (let i = 0; i < 16; i++) {
            macBuffer.copy(buffer, 6 + i * 6, 0, 6); // Повторяем MAC 16 раз
        }

        const socket = dgram.createSocket('udp4');
        socket.on('error', err => callback(err));
        
        socket.bind(() => {
            socket.setBroadcast(true);
            // Отправляем широковещательный пакет на порт 9
            socket.send(buffer, 0, buffer.length, 9, '255.255.255.255', (err) => {
                socket.close();
                callback(err);
            });
        });
    } catch (e) {
        callback(e);
    }
}

// 3. РАБОТА С VK API (Long Poll)
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

function startLongPoll(server, key, ts) {
    https.get(`${server}?act=a_check&key=${key}&ts=${ts}&wait=25`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.failed) return initBot(); 
                
                if (data.updates && data.updates.length > 0) {
                    data.updates.forEach(update => {
                        if (update.type === 'message_new') {
                            const message = update.object.message;
                            const fromId = message.from_id;
                            const text = message.text ? message.text.toLowerCase().trim() : '';

                            if (fromId === ADMIN_ID && text === 'включи пк') {
                                console.log(`[${new Date().toLocaleTimeString()}] Получена команда! Включаю ПК...`);
                                
                                wakeComputer(MAC, (err) => {
                                    if (err) {
                                        console.error('Ошибка отправки WoL:', err);
                                        sendVkMessage(fromId, '❌ Ошибка при отправке пакета Wake-on-LAN.');
                                    } else {
                                        sendVkMessage(fromId, '🚀 Сигнал на включение ПК успешно отправлен!');
                                    }
                                });
                            }
                        }
                    });
                }
                startLongPoll(server, key, data.ts);
            } catch (e) {
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', () => setTimeout(initBot, 5000));
}

function initBot() {
    https.get(`https://://vk.com/method/groups.getById?access_token=${TOKEN}&v=5.131`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const groupId = JSON.parse(body).response[0].id;
                https.get(`https://://vk.com/method/groups.getLongPollServer?group_id=${groupId}&access_token=${TOKEN}&v=5.131`, (res2) => {
                    let body2 = '';
                    res2.on('data', chunk => body2 += chunk);
                    res2.on('end', () => {
                        try {
                            const response = JSON.parse(body2).response;
                            console.log('==================================================');
                            console.log('🤖 Ультра-легкий автономный бот успешно запущен!');
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
                console.error('Ошибка авторизации токена VK. Проверьте .env файл.');
                setTimeout(initBot, 5000);
            }
        });
    }).on('error', () => setTimeout(initBot, 5000));
}

initBot();
