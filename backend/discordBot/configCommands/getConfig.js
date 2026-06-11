const { channelLink } = require('discord.js');
const { parseArgs } = require('../utils/parseArgs');
getSimpleRedisJson = require('../services/getFromRedis').getSimpleRedisJson;


module.exports = {
    description:'Obtener la configuración actual del bot en el servidor.',
    usage: '%s config getconfig',
    run: async (message, redis) => {
        message.reply('Obteniendo la configuración actual del bot en este servidor...');
        const config = await getSimpleRedisJson({ redis, type: 'server:config', UID: message.guild.id });

        if (!config || Object.keys(config).length === 0) {
            return message.reply('No se encontró ninguna configuración para este servidor.');
        }
        const formattedConfig = Object.entries(config)
            .map(([key, value]) => `**${key}**: ${value}`)
            .join('\n');
        message.reply(`Configuración actual del bot en este servidor:\n${formattedConfig}`);
    }
};