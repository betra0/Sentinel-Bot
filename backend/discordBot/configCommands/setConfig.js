const { channelLink } = require('discord.js');
const { parseArgs } = require('../utils/parseArgs');
getSimpleRedisJson = require('../services/getFromRedis').getSimpleRedisJson;


module.exports = {
    description:'Establecer la configuración del bot en el servidor.',
    usage: '%s config setconfig <key> <value>',
    run: async (message, redis) => {
        const actualconfig = await getSimpleRedisJson({ redis, type: 'server:config', UID: message.guild.id });
        const args = parseArgs(message.content);
        if(args.length < 2){
            return message.reply('Por favor, proporciona una clave y un valor para la configuración. Uso: `%s config setconfig <key> <value>`');
        }
        const key = args[0];
        const value = args.slice(1).join(' ');

        const newConfig = {
            ...actualconfig,
            [key]: value
        };
        await saveSimpleRedisJson({ redis, type: 'server:config', UID: message.guild.id, data: newConfig });
        message.reply(`Configuración actualizada: **${key}** se ha establecido a **${value}**.`);

    }
};