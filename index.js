require('dotenv').config(); 
const { VK } = require('vk-io');
const wol = require('wake_on_lan');

const vkToken = process.env.TOKEN
// Вставьте сюда ваш числовой ID ВКонтакте
const ADMIN_ID = process.env.USER_ID; 
const computerMac = process.env.MAC.replace(/-/g, ':').toLowerCase();; // Сюда вставим MAC позже

if (!(vkToken && ADMIN_ID && computerMac)) {
    console.error('❌ Ошибка: Не все переменные окружения заданы в файле .env');
    process.exit(1);
}

const vk = new VK({
    token: process.env.TOKEN
});

// vk.updates.on('message_new', async (context) => {
vk.updates.on('message', async (context) => {
    if (context.senderId !== ADMIN_ID) return; 
    const text = context.text ? context.text.toLowerCase().trim() : '';

    if (text === '/turnon') {
        wol.wake(computerMac, (error) => {
            if (error) {
                context.send('❌ Ошибка WoL пакета.');
            } else {
                context.send('🚀 Сигнал отправлен!');
            }
        });
    }
});

vk.updates.start()
    .then(() => console.log('Бот запущен...'))
    .catch(console.error);
