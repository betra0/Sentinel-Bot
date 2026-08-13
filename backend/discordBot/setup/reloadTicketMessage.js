const { saveRedisNewMessageSubcription, insertAdressTofetcher, saveSimpleRedisJson, saveRedisJsonTTL } = require('../services/insertInRedis');
const { generateMessageEmbed } = require('../services/embedMessageGenerator');
const { GenerateEmbedStatusServer } = require('../services/embedStatusServer');
const { getInfoAdressForRedis, getSimpleRedisJson, getRedisJson } = require('../services/getFromRedis');
const { parseArgs } = require('../utils/parseArgs');
const { ChannelType, PermissionsBitField, CategoryChannel } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findAndEditMessageText } = require('../services/findAndEditMessageText');

// ahora mismo este archivo es una copia de chacuser solo para el fromato pero la idea es que cree un sistema de ticket de aplicacion osea un tiketck apply rol etc 

module.exports = {
    description:'comando harcodeado para  editar el mensaje de apertura de ticket ',
    usage:'nose',

    run: async (message, redis) => {
        console.log('inicio de funcion ticketApply ')
        const args = parseArgs(message.content); // lista [ '%s', 'setup', 'ticketApply', 'hola', 'que', 'onda' ]
        console.log(args)

        const guild = message.guild;
        const client = message.client;
        const configDef = {
            nombreclave: 'postulaciones',
            title: 'Postulacion a Rol',
            description: 'para postularse a un rol, debe cumplir los siguientes requisitos:\n - Ser activo en el servidor\n - Tener buen comportamiento\n',
            messageForGiveRole: 'Felicidades! Has sido aprobado para el rol solicitado.',
            formInTicketStr: 'Por favor, respnda las siguientes preguntas para completar su postulacion:\n1. ¿Por qué desea obtener este rol?\n2. ¿Qué experiencia tiene relacionada con este rol?\n3. ¿Cuánto tiempo puede comprometerse a este rol?\n4. ¿Tiene alguna pregunta o comentario adicional?',
            imageUrl: null,
            roleToAssign: null,
            staffAurthorityRoles: [], // roles que pueden ver y gestionar los tickets
            MessagePostApproveStr: '',
            channelId: null,
            messageId: null,
            categoryId: null,
            channelForLogsId: null,
        };

        // harcodeado XD

        console.log('porfa no te rompas xd')

        const btnId = 'ticket:apply:create:' + 'MilSim'; 
        const embedVe=[]
        embedVe.push(generateMessageEmbed(
            {
                title:"🪖 Postulación Oficial – MilSim División Andina", 
                descripcion:"¿Quieres postular a la MilSim de División Andina?\n\nAntes de iniciar tu postulación, asegúrate de cumplir con los requisitos básicos:\n\n• Disponibilidad los Jueves y sábados desde las 21:30hs - Argentina / 20:30hs - Chile.\n• **Compromiso con el roleo, la disciplina y la cadena de mando.**\n• Micrófono funcional y espacio suficiente para los mods del servidor.\n• **No pertenecer a otra comunidad de Arma 3.**\n\n¿Qué es MilSim?\nMilSim (Military Simulation) es una forma de jugar Arma 3 enfocada en el realismo militar: actuamos como una unidad real, siguiendo disciplina, cadena de mando, comunicación táctica, trabajo en equipo y procedimientos operativos.",
                imgUrl: "https://cdn.discordapp.com/attachments/1194425003479932958/1460500376586551459/image.png?ex=697a4238&is=6978f0b8&hm=9f11e0592113e9d58c722645eb49b724763462c4ae02c189792cbd26a7c26607&",
                color:'#0099ff',
            }
        ))
        embedVe.push(generateMessageEmbed(
            {
                title:`Postulacion`,
                descripcion:`Para abrir un ticket de postulacion, haga click en el boton de abajo.`,
                color:'#0099ff',
                
            }
        ))
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(btnId)
                .setLabel('Abrir Ticket')
                .setEmoji('✅') 
                .setStyle(ButtonStyle.Primary)
        );
        const body = {
            content: '',
            embeds: embedVe,
            components: [row]
        }
        findAndEditMessageText(client, '1465899192076472393', '1465899193708318923', body)
        console.log('mensaje de apertura de ticket creado')
            






        
        
        

        
        
        //  message.reply({embeds:[embed1, embed2]})
        




        //let channelName = message.channel; // Por defecto, se utilizará el canal actual
        //let isNewChannel = false
        //let channelId = message.channel.id;

        
        

    }
}

