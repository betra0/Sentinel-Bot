
const { Events } = require('discord.js');
const { changeAmountMembers } = require('./handlers/changeAmountMembers.handler');




module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member, client, redis) 
    {

    //if (member.user.bot) return

    
    console.log('un miembro ha dejado el servidor')
    changeAmountMembers(member, redis, client);
    }
};



// 






