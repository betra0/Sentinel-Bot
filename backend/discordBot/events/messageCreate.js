
const { Agent } = require('undici');
const { MessageFlags } = require('discord.js');
const { getListRedisIpSubcription, getInfoAdressForRedis, getSimpleRedisJson } = require('../services/getFromRedis');
const { generateMessageEmbed } = require('../services/embedMessageGenerator');
const { saveSimpleRedisJson } = require('../services/insertInRedis');
const { Events } = require('discord.js');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const traslatecommands = {
    'createCommands': '%s create',
    'editCommands': '%s edit',
    'setup': '%s setup',
    'adminCommands': '%s',
    'commands': '%'
};



async function scanFoldersCommands(carpetasarray){
    const embeds = []
    embeds.push(generateMessageEmbed(
        {
            title: 'Lista de Comandos Disponibles',
            descripcion: `Aquí tienes la lista de comandos disponibles según el tipo que hayas consultado. Los comandos que aparecen como \`%s comando\` son **solo para administradores**, mientras que los comandos con \`%comando\` son libres para cualquier usuario. Usa '--help' después de un comando para ver más detalles.`,
            color: '#0099ff',
        }
    ));
    const colors = ['#ff9900', '#33cc33', '#ff3333', '#9933ff', '#00cc99'];

    for (let i = 0; i < carpetasarray.length; i++) {
        const carpeta = carpetasarray[i];
        const fields = [];
        const files = fs.readdirSync(`./${carpeta}`);
        for (const file of files) {
            const { title, usage, description } = callHelpCommand(carpeta, file);

            const safeUsage = usage?.trim() || 'No definido';
            const safeDescription = description?.trim() || 'Sin descripción';

            fields.push({
                name: `**${title}**` || 'Comando sin nombre',
                value: `**Uso:** ${safeUsage}\n**Descripción:** ${safeDescription}`,
                inline: false
            });
        }
        const color = colors[i % colors.length];
        embeds.push(new EmbedBuilder()
            .setColor(color)
            .setTitle(`Comandos en ${carpeta}`)
            .setDescription(`Comandos disponibles con ${traslatecommands[carpeta]}`)
            .addFields(fields)
        );
    }
    return { embeds };
}

function callHelpCommand(folder, file){
    let title = "";
    let usage = "";
    let description = "";

    try {
        const command = require(`../${folder}/${file}`);

        title = command.name ?? file.replace('.js', '');
        usage = command.usage || '';
        description = command.description || '';

    } catch (e) {
        console.error('Error cargando el comando:', e);
    }

    return { title, usage, description };
}

const handlerReqireCommand = async (carpeta, arg, message, redis)=>{
  try{
    console.log(`log desde handlerReqireCommand: carpeta: ${carpeta}, arg: ${arg}`)
    if (arg==='--help'){
        //  llamar a una funcion que busque en [carpeta] yy esta funcion llame a usage de cada comando y lo muestre en un embed
        const {embeds} = await scanFoldersCommands([carpeta])
        return message.reply({embeds: embeds});

    }
    const command = require(`../${carpeta}/${arg}`)
    command.run(message, redis)
  }catch(e){
    if(e.code === 'MODULE_NOT_FOUND'){
        message.reply(`Comando no encontrado en ${carpeta}: ${arg} \n usa %s --help o %--help para ver la lista de comandos disponibles.`);
        return
    }
    console.log(e)
  }

}

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client, redis) 
    {

    if (message.author.bot) return

    if (!message.guild) {
        console.log('Message received:',  'DM', message.author.username, ':', message.content );
        return message.reply('este bot no funciona por dm, por favor usa los comandos en un servidor.');
    }

    console.log('Message received:',  'ServerName',message.guild.name, 'ChannelName', message.channel.name, message.author.username, ':', message.content );

    if (message.content.startsWith('&s')) {
            if (message.member && !message.member?.permissions.has(PermissionsBitField.Flags.Administrator) && message.author.id !== '708054004923629639') {
                return message.reply('¡Solo los administradores pueden ejecutar este comando!');
            }
          
             // Handler comannd
            const arg = message.content.slice(3).split(' ')[0]
            if(arg === 'create'){
              const arg = message.content.slice(3).split(' ')[1]
              console.log(arg)
              handlerReqireCommand('createCommands', arg, message, redis)
            }
            else if (arg === 'edit'){
              const arg = message.content.slice(3).split(' ')[1]
              console.log(arg)
              handlerReqireCommand('editCommands', arg, message, redis)
            }
            else if (arg === 'setup'){
              const arg = message.content.slice(3).split(' ')[1]
              console.log(arg)
              handlerReqireCommand('setup', arg, message, redis)
            }
            else if (arg === '--help'){
              //  llamar a una funcion que busque en [adminCommands, createCommands, editCommands, setup] yy esta funcion llame a otra funcion que llame a usage de cada comando y lo muestre en un embed
                const {embeds} = await scanFoldersCommands(['adminCommands', 'createCommands', 'editCommands', 'setup'])
                return message.reply({embeds: embeds});
            }

            else{
              console.log(arg)
              handlerReqireCommand('adminCommands', arg, message, redis)
            }
          


    }else if(message.content.startsWith('%r')){
        const resComand = await redis.get(`response:${message.channel.id}`);
        if (!resComand || resComand ==''){
            return
        }
      const arg = `${resComand}`
      
      

      console.log(arg)
      handlerReqireCommand('setup', arg, message, redis)

    }
    else if (message.content.startsWith('%')){
      const arg = message.content.slice(1).split(' ')[0]
      console.log(arg)
      handlerReqireCommand('commands', arg, message, redis)
    }
     
    }
};



// 






