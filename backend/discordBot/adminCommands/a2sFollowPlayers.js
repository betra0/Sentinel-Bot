const { channelLink } = require('discord.js');
const { parseArgs } = require('../utils/parseArgs');

module.exports = {
    description:'añadir jugadores a la lista de seguimiento de A2S, el bot enviará un mensaje al canal cada vez que uno de los jugadores en la lista se conecte a algun servidor',
    usage: 'uso simple: %s a2sFollowPlayers add <playerName> uso avanzado: %s a2sFollowPlayers add <playerName> -p <priority (baja/alta)> --descripcion <descripcion>',
    run: async (message) => {
        let args = parseArgs(message.content);
        args = args.slice(2); // eliminar el primer y segundo elemento que es el activador del comando y el comando 'say'
        
        let action = "add"
        if(args[0] === "add" || args[0] === "remove"){
            action = args[0]
            args = args.slice(1)
        }
        
        if(args.length < 1){
            return message.reply('Por favor, proporciona un nombre de jugador para agregar a la lista de seguimiento. Uso: `%s a2sFollowPlayers add <playerName>`');
        }
        let playerName = args[0];
        let priority = "baja"
        let description = ""
        const priorityIndex = args.findIndex(arg => arg === '-p' || arg === '--priority');
        if (priorityIndex !== -1 && priorityIndex < args.length - 1) {
            priority = args[priorityIndex + 1].toLowerCase();
            if(priority !== "baja" && priority !== "alta"){
                return message.reply('La prioridad debe ser "baja" o "alta". Uso: `%s a2sFollowPlayers add <playerName> -p <priority (baja/alta)>`');
            }
        }
        const descriptionIndex = args.findIndex(arg => arg === '--descripcion' || arg === '-d');
        if (descriptionIndex !== -1 && descriptionIndex < args.length - 1) {
            description = args[descriptionIndex + 1];
        }



        const actualList = await getSimpleRedisJson({ redis, type: 'server:a2sFollowPlayers', UID: message.guild.id });
        if(!actualList || !Array.isArray(actualList)){
            actualList = []
        }
        if (action === "add"){
            if(actualList && actualList.find(player => player.name.toLowerCase() === playerName.toLowerCase())){
                //future: sobre escribir
                return message.reply(`El jugador ${playerName} ya está en la lista de seguimiento.`);
            }
            actualList.push({ name: playerName, priority, description })
            return message.reply(`Jugador ${playerName} agregado a la lista de seguimiento con prioridad ${priority} y descripción "${description}".`);
        } 
        if (action === "remove"){
            const index = actualList.findIndex(player => player.name.toLowerCase() === playerName.toLowerCase());
            if(index === -1){
                return message.reply(`El jugador ${playerName} no está en la lista de seguimiento.`);
            }
            actualList.splice(index, 1);
            return message.reply(`Jugador ${playerName} eliminado de la lista de seguimiento.`);
        }


    }
}