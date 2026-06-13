const { ChannelType, PermissionsBitField, CategoryChannel, embedLength, EmbedBuilder, ModalBuilder } = require('discord.js');
const { getSimpleRedisJson } = require('../services/getFromRedis');
const { saveSimpleRedisJson } = require('../services/insertInRedis');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TextInputBuilder, TextInputStyle } = require('discord.js');
const { findAndEditMessageText } = require('../services/findAndEditMessageText');




async function fPAHandler(json, client, redis) {

    /*
    {
      "playersAlerts": [
        {
          "name": "Player1",
          "action": "joined",
          "timestamp": "2024-06-01T12:00:00Z",
          "description": "razon del alert"
          "priority":     "alta/baja"
          ""
        },
        
      "address":,
      guildId:,

      
    }
    */

    const config = await getSimpleRedisJson({ redis, type: 'server:config', UID: json.guildId });
    const a2sMentionRoles = config.a2sMentionRoles || [];
    const channelId = config.a2sFPChannelId;
    a2sFollowPlayers = config.a2sFollowPlayers || false;
    
    if(!a2sFollowPlayers) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
            console.error(`No se pudo encontrar el canal con ID ${channelId}`);
            return;
    }
    
    const mentions = "";
    const alert = json.playersAlerts.some(alert => alert.priority === 'alta') ? true : false;
    if( alert ){
         mentions = a2sMentionRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`Alertas de jugadores seguidos en ${json.address}`)
        .setDescription(json.playersAlerts.map(alert => `**${alert.name}** ${alert.action} - ${alert.description} (${alert.priority})`).join('\n'))
        .setColor(alert ? 'Red' : 'Yellow')
        .setTimestamp();

    channel.send({ content: mentions, embeds: [embed] });



    return 

}
module.exports = { fPAHandler };
