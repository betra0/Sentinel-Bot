

const { Events } = require('discord.js');
const { changeAmountMembers } = require('./handlers/changeAmountMembers.handler');




module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client, redis) 
    {

    //if (member.user.bot) return

    
    console.log('se a unido un nuevo miembro al servidor')
    changeAmountMembers(member, redis, client);
    }
};



// 






