const { VK } = require('vk-io');
const wol = require('wake_on_lan');

const vk = new VK({
    token: process.env.TOKEN
});

// Вставьте сюда ваш числовой ID ВКонтакте
const ADMIN_ID = process.env.USER_ID; 
const computerMac = process.env.MAC; // Сюда вставим MAC позже

vk.updates.on('message_new', async (context) => {
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
