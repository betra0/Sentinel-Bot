const { ChannelType, PermissionsBitField, CategoryChannel, embedLength, EmbedBuilder, ModalBuilder } = require('discord.js');
const { getSimpleRedisJson } = require('../services/getFromRedis');
const { saveSimpleRedisJson } = require('../services/insertInRedis');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TextInputBuilder, TextInputStyle } = require('discord.js');
const { findAndEditMessageText } = require('../services/findAndEditMessageText');
const fs = require('fs/promises');
const path = require('path');



async function ticketHandler(interaction, client, redis) {

    const prefixLog = `[interactionCreate-TicketHandler] `;

    const args = interaction.customId.split(':');
    const type = args[1];
    // estructura de ticket postulacion(application) : ticket:apply:action:applyId
    if (type === 'apply') {
        const action = args[2]; // create, close, claim, approve, reject
        // si es history, no necesitamos el applyId
        // esta acción es para enviar el historial del ticket al canal de logs
        if (action === 'history') {
            const historyPath = args[3];
            await sendTicketHistory(interaction, historyPath);
            return 
        }
        const applyId = args[3];
        const guildId = interaction.guildId;
        const configApply = await getSimpleRedisJson({ redis, type: `ticket:apply:${guildId}`, UID: applyId });
        if (!configApply) return
        
        
        if (action === 'create') {
            await createTicketApplication(interaction, client, redis, configApply);

        }
        else if (action === 'close') {
            await closeTicketApplication(interaction, client, redis, configApply);
            
        }
        else if (action === 'claim') {
            await claimTicketApplication(interaction, client, redis, configApply);
            
        }
        else if (action === 'approve') {
            await approveTicketApplication(interaction, client, redis, configApply);
        }
        else if (action === 'reject') {
            await rejectTicketApplication(interaction, client, redis, configApply);
        }
        else if (action === 'close_confirm') {
            interaction.reply({ content:'No habilitado temporalmente', ephemeral: true });
            return 
            await closeConfirmTicketApplication(interaction, client, redis, configApply);
        }
        else if (action === 'close_modal') {
            await closeModalTicketApplication(interaction, client, redis, configApply);
        }
        else if (action === 'reject_modal') {
            await rejectModalTicketApplication(interaction, client, redis, configApply);
        }
    }



    return 

}
module.exports = { ticketHandler };

async function createTicketApplication(interaction, client, redis, configApply) {
    const oldDataTicket = await getSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: interaction.user.id });
    //   revisar si ya tiene un ticket abierto
    if (oldDataTicket && oldDataTicket.status !== 'closed') {
        await interaction.reply({ content: `Ya tienes un ticket abierto para esta aplicación: <#${oldDataTicket.channelId}>`, ephemeral: true }); 
        return;
    }
    // revisar si ya tiene el rol 
    if(interaction.member.roles.cache.has(configApply.roleToAssign)){
        await interaction.reply({ content: `Ya tienes el rol asociado a esta postulación,`, ephemeral: true });
        return;
    }

    // lógica para crear ticket de aplicación
    let metionsStr=''
    const permisos = [
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
    ];
    if(configApply.staffAurthorityRoles && Array.isArray (configApply.staffAurthorityRoles)){
        configApply.staffAurthorityRoles.forEach(roleId => {
            permisos.push({
                id: roleId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
            });
            metionsStr += `<@&${roleId}> `;
        });
    }
    const newTicketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: configApply.categoryId || null,
        permissionOverwrites: permisos,
    });
    const rolApplyName = configApply.roleToAssign ? `<@&${configApply.roleToAssign}>` : 'Ninguno';
    const ticketData = {
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        channelId: newTicketChannel.id,
        mainMessageId: null,
        status: 'open',
        claimedBy: null,
        createdAt: new Date().toISOString(),
        configId: configApply.nombreclave,

    } 
    const formText = configApply.formInTicketStr || null;

    const userId = interaction.user.id;

    const embed = await generateAdminEmbedTicket(interaction, interaction.user, ticketData, configApply);

    const row = await generateRowTicketButtons( configApply, ticketData);
    
    const mainMessage = await newTicketChannel.send({
        content: `${metionsStr}`,
        embeds: [embed],
        components: [row]
    });

    ticketData.mainMessageId = mainMessage.id;

   
    await saveSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: interaction.user.id, json: ticketData });
    await setReferenceTicket(redis, newTicketChannel.id, interaction.user.id);
    try {
        await interaction.reply({ content: `Tu ticket de aplicación ha sido creado: <#${newTicketChannel.id}>`, ephemeral: true });

    }
    catch (error) {
        console.error(`${prefixLog} Error al enviar mensaje de confirmación de ticket: ${error.message}`);
    }

    if (formText){
        await newTicketChannel.send({ content: ` 👋 Hola <@${userId}>, responde las siguientes preguntas para poder continuar con el proceso.\n${formText}` });

    }else {
        await newTicketChannel.send({ content: ` 👋 Hola <@${userId}>\nPor favor espera a que un miembro del staff te atienda.` });
    }




}
async function closeTicketApplication(interaction, client, redis, configApply) {

    let dataTicket = null;
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply, ignoreRoles=true);
    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] closeTicketApplication controlled error: ${error.message}`);
            await interaction.reply({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    console.log(`[ticketHandler] closeTicketApplication invoked by user ${interaction.user.id} in channel ${interaction.channel.id}`);
    if (dataTicket.authorId === interaction.user.id) {
        if (dataTicket.status !=='approved'){
            await interaction.reply({ content: `No puedes cerrar el ticket hasta que tu postulación sea aprobada o rechazada.`, ephemeral: true });
            return;
        }
        else if (dataTicket.status === 'approved') {
            console.log(`[ticketHandler] Ticket ya aprobado, cerrando directamente.`);
            const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('confirmación de cierre')
            .setDescription(`Estas seguro que deseas cerrar este ticket?`)
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket:apply:close_confirm:${configApply.nombreclave}`)
                    .setLabel('Cerrar Ticket')
                    .setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            return
        }
    }else{
        // crear modal de confirmación y mensaje
        const modal = new ModalBuilder()
        .setCustomId(`ticket:apply:close_modal:${configApply.nombreclave}`)
        .setTitle('Confirmación de cierre de ticket');

        const input = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Motivo de cierre') // <= 45 chars
        .setPlaceholder('Opcional. Especifica el motivo o deja en blanco')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        return;
    }


    
    
}
async function claimTicketApplication(interaction, client, redis, configApply) {
    let dataTicket = null;
    await interaction.deferUpdate();
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);
        
    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] claimTicketApplication controlled error: ${error.message}`);

            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    // lógica de reclamar ticket
    if (!dataTicket) {
        return;
    }
    if (dataTicket.claimedBy) {
        await interaction.followUp({ content: `Este ticket ya ha sido reclamado por <@${dataTicket.claimedBy}>.`, ephemeral: true });
        return;
    }
    dataTicket.claimedBy = interaction.user.id;
    const member = dataTicket.authorId ? await interaction.guild.members.fetch(dataTicket.authorId) : null;
    const embed = await generateAdminEmbedTicket(interaction, member.user, dataTicket, configApply);
    const row = await generateRowTicketButtons( configApply, dataTicket);
    const channel = interaction.channel;
    const idMainMessage = dataTicket.mainMessageId;
    if (!idMainMessage){
        await interaction.followUp({ content: `ERROR: No se encontró el mensaje principal del ticket.`, ephemeral: true });
        return;
    }
    await findAndEditMessageText(interaction.client, channel.id, idMainMessage, { embeds: [embed], components: [row] })
    await saveSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: dataTicket.authorId, json: dataTicket });
    await interaction.followUp({ content: `El ticket ha sido reclamado por <@${interaction.user.id}>.` });
    return;

}

async function approveTicketApplication(interaction, client, redis, configApply) {
    // lógica de aprobar rol en ticket
    let dataTicket = null;
    await interaction.deferUpdate();
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);
        
    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] approveTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    if (!configApply.roleToAssign) {
        await interaction.followUp({ content: `ERROR: No hay un rol configurado para asignar en esta postulación.`, ephemeral: true });
        return;
    }
    const member = await interaction.guild.members.fetch(dataTicket.authorId);
    if (!member) {
        await interaction.followUp({ content: `ERROR: No se pudo encontrar al miembro para asignar el rol.`, ephemeral: true });
        return;
    }
    const strMesageOnApprove = configApply.MessagePostApproveStr || ''
    const channelLogs = configApply.channelForLogsId ? await interaction.guild.channels.fetch( configApply.channelForLogsId) : null;
    const embeds = [];
    const embed1 = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle(`Postulación Aprobada`)
    .setDescription(`¡Felicidades <@${dataTicket.authorId}>! Tu postulación ha sido aprobada 🥳.\n \n ${strMesageOnApprove}`)
    .addFields(
        { name: 'Rol Asignado:', value: `<@&${configApply.roleToAssign}>`, inline: true },
    )
    .setTimestamp();
    embeds.push(embed1);
    //if (configApply.MessagePostApproveStr && configApply.MessagePostApproveStr.trim() !==''){
    //    const embed2 = new EmbedBuilder()
    //    .setColor('#0099ff') 
    //    .setTitle(`Canales importantes`)
    //    .setDescription(`${configApply.MessagePostApproveStr}`)
    //    .setTimestamp();
    //    embeds.push(embed2);
    //}
    const embed3 = new EmbedBuilder()
    .setColor('#0099ff') 
    .setTitle(`Proceso Finalizado`)
    .setDescription(`Si no necesitas más ayuda, puedes cerrar este ticket.`)
    const row = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket:apply:close:${configApply.nombreclave}`)
            .setLabel('Cerrar Ticket 👋')
            .setStyle(ButtonStyle.Danger),
    );
    
    await member.roles.add(configApply.roleToAssign, 'Rol aprobado en postulación');
    dataTicket.status = 'approved';

    const userTicket = member.user;
    const embedMain = await generateAdminEmbedTicket(interaction, userTicket, dataTicket, configApply);
    const rowMain = await generateRowTicketButtons( configApply, dataTicket);
    const channel = interaction.channel;
    const idMainMessage = dataTicket.mainMessageId;
    if (!idMainMessage){
        await interaction.followUp({ content: `ERROR: No se encontró el mensaje principal del ticket.`, ephemeral: true });
        return;
    }
    await findAndEditMessageText(interaction.client, channel.id, idMainMessage, { embeds: [embedMain], components: [rowMain] })
    if (channelLogs){
        const reason = 'Postulación aprobada';
        const embedLog = generateEmbedLog({ action: 'approve', dataTicket, reason: reason, userStaffID: interaction.user.id });
        await channelLogs.send({ embeds: [embedLog] });
    }

    await saveSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: dataTicket.authorId, json: dataTicket });
    await interaction.followUp({ content: `<@${dataTicket.authorId}>`, embeds: [...embeds, embed3], components: [row] });
    await channel.edit({
        name: `ticket-approved-${member.user.username}`,
        reason: 'Ticket aprobado y rol asignado'
    });

}


async function rejectTicketApplication(interaction, client, redis, configApply) {
    let dataTicket = null;
    try 
    {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);
        
    }
    catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] rejectTicketApplication controlled error: ${error.message}`);
            await interaction.reply({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    const modal = new ModalBuilder()
    .setCustomId(`ticket:apply:reject_modal:${configApply.nombreclave}`)
    .setTitle('Rechazo de postulación');

    const input = new TextInputBuilder()
    .setCustomId('reject_reason')
    .setLabel('Motivo de rechazo') 
    .setPlaceholder('Especifica el motivo del rechazo')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(input);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
    return;
}
 async function rejectModalTicketApplication(interaction, client, redis, configApply) {
    let dataTicket = null;
    await interaction.deferUpdate();
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);

    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] rejectModalTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }   
    const rejectReason = interaction.fields.getTextInputValue('reject_reason');
    const user = await interaction.guild.members.fetch(dataTicket.authorId);
    if (!user){
        await interaction.followUp({ content: `ERROR: No se pudo encontrar al miembro para enviar el rechazo.`, ephemeral: true });
        return;
    }
    const channelLogs = configApply.channelForLogsId ? await interaction.guild.channels.fetch( configApply.channelForLogsId) : null;
    const channel = interaction.channel;
    const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('Postulación Rechazada')
    .setDescription(`Lamentablemente tu postulación ha sido rechazada.\n\nMotivo: ${rejectReason}`)
    .setTimestamp();
    await user.send({ embeds: [embed] }).catch((err) => {
        console.log(`[ticketHandler] No se pudo enviar mensaje directo al usuario ${dataTicket.authorId}: ${err.message}`);
    });
    dataTicket.status = 'rejected';
    await saveSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: dataTicket.authorId, json: dataTicket });
    const historyPath = await saveHistory(interaction.channel);
    // mandar log al canal de logs
    if (channelLogs){
        const embedLog = generateEmbedLog({ action: 'reject', dataTicket, reason: rejectReason, userStaffID: interaction.user.id, historyPath: historyPath });
        const row2= new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver historial del ticket')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`ticket:apply:history:${historyPath}`)
        );
        await channelLogs.send({ embeds: [embedLog], components: [row2] });
    }
    redis.del(`ticket:${channel.id}:author`); // eliminar referencia al canal pero no el dataTicket
    await channel.delete('Ticket cerrado por rechazo de postulación');
    return;
}

async function closeConfirmTicketApplication(interaction, client, redis, configApply) {
    console.log('Cerrando ticket por confirmación directa');
    let dataTicket = null;
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply, ignoreRoles=true);

    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] closeConfirmTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    const historyPath = await saveHistory(interaction.channel);
    await redis.del(`ticket:${interaction.channel.id}:author`);
    await redis.hdel(`databot:ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, dataTicket.authorId);
    // eliminar canal
    await interaction.channel.delete('Ticket cerrado');
    return;
}
async function closeModalTicketApplication(interaction, client, redis, configApply) {
    await interaction.deferUpdate();
    let dataTicket = null;
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);

    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] closeModalTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    const closeReason = interaction.fields.getTextInputValue('close_reason');
    const channelLogs = configApply.channelForLogsId ? await interaction.guild.channels.fetch( configApply.channelForLogsId) : null;

    if (closeReason && closeReason.trim() !==''){
        const user = await interaction.guild.members.fetch(dataTicket.authorId);
        if (user){
            embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Cierre de Ticket')
            .setDescription(`Tu ticket ha sido cerrado por un miembro del staff.\n\nMotivo: ${closeReason}`)
            .setTimestamp();
            await user.send({ embeds: [embed] }).catch((err) => {
                console.log(`[ticketHandler] No se pudo enviar mensaje directo al usuario ${dataTicket.authorId}: ${err.message}`);
            });
        }else{
            console.log(`[ticketHandler] No se pudo encontrar al usuario ${dataTicket.authorId} para enviarle el motivo de cierre.`);
        }
    }
    // antes de borrar guardar el historial del canal en un archivo
    const historyPath = await saveHistory(interaction.channel);
    await redis.del(`ticket:${interaction.channel.id}:author`);
    await redis.hdel(`databot:ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, dataTicket.authorId);
    // eliminar canal
    const channel = interaction.channel;
    // mandar log al canal de logs
    if (channelLogs ){
        const reason = dataTicket.status === 'approved' ? 'Postulación aprobada previamente' : closeReason;
        const embedLog = generateEmbedLog({ action: 'close', dataTicket, reason: reason, userStaffID: interaction.user.id, historyPath: historyPath },);
        const row2= new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver historial del ticket')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`ticket:apply:history:${historyPath}`)
        );
        await channelLogs.send({ embeds: [embedLog], components: [row2] });
    }
    
    await channel.delete('Ticket cerrado');
    return;
}





// funciones auxiliares

async function getDataTicket(redis, channel, appliId) {
    const authorId = await getReferenceTicket(redis, channel.id);
    if (!authorId) {
        throw new Error('No authorId found for this ticket channel');
    }
    const dataTicket = await getSimpleRedisJson({redis, type: `ticket:apply:${channel.guildId}:${appliId}`, UID: authorId});
    return dataTicket;   
}

async function setReferenceTicket(redis , channelId, authorId) {
    await redis.set(`ticket:${channelId}:author`, authorId);
}

async function getReferenceTicket(redis, channelId) {
    const authorId = await redis.get(`ticket:${channelId}:author`);
    return authorId;
    
}
async function logicCheckInTicketApplication(interaction, client, redis, configApply, ignoreRoles=false) {
    if (!ignoreRoles){
        const hasAnyRole = configApply.staffAurthorityRoles
        .some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAnyRole && !interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const err =new Error('No tienes permisos para gestionar este ticket.');
            err.code = 'TICKET_ERROR';
            err.isControlled = true;
            throw err;
        }
    }

    const dataTicket = await getDataTicket(redis, interaction.channel, configApply.nombreclave);
    if (!dataTicket) {
        const err = new Error('No se encontró el ticket asociado a este canal.');
        err.code = 'TICKET_ERROR';
        err.isControlled = true;
        throw err;
    }

    if (dataTicket.status === 'closed') {
        const err = new Error('Este ticket ya está cerrado.');
        err.code = 'TICKET_ERROR';
        err.isControlled = true;
        throw err;
    }
    return dataTicket;
}
async function generateAdminEmbedTicket(interaction, userTicket, dataTicket, configApply) {
    const rolApplyName= configApply.roleToAssign ? `<@&${configApply.roleToAssign}>` : 'Ninguno';
    const reclamado= dataTicket.claimedBy ? `<@${dataTicket.claimedBy}>` : 'No';
    const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Ticket de Postulación de ${userTicket.username}`)
    .setDescription(`Sistema de tickets de postulación.`)
    .addFields(
        { name: 'Rol a postular:', value: `${rolApplyName}`, inline: true },
        { name: 'Reclamado:', value: `${reclamado}`, inline : true },
        { name: 'Creador del ticket:', value: `<@${userTicket.id}>`, inline: true },
        { name: 'Estado del ticket:', value: `${dataTicket.status}`, inline: true },
        { name: 'Fecha de creación:', value: `<t:${dataTicket.createdAt}:F>`, inline: true },
    )
    .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 512 }))
    .setAuthor({ name: `Staff Tickets`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
    .setTimestamp();
    
    return embed;
}

async function generateRowTicketButtons(configApply, dataTicket) {
    const components = [];
    if (!dataTicket.claimedBy) {
        // ticket reclamado
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:claim:${configApply.nombreclave}`)
                .setLabel('Reclamar Ticket')
                .setStyle(ButtonStyle.Primary),
        );
    }
    else if(dataTicket.status !== 'approved') {
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:approve:${configApply.nombreclave}`)
                .setLabel('Aprobar')
                .setStyle(ButtonStyle.Success)
        );
    }
    if (dataTicket.status !=='approved'){
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:reject:${configApply.nombreclave}`)
                .setLabel('Rechazar')
                .setStyle(ButtonStyle.Danger),
        );
    }



    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket:apply:close:${configApply.nombreclave}`)
            .setLabel('Cerrar Ticket')
            .setStyle(ButtonStyle.Danger),

        ...components
    );
    
    return row;
}

const generateEmbedLog = ({ action='reject', dataTicket, reason, userStaffID, historyPath=null 

}) => {
    reason = reason || 'No especificado';
    reclamado = dataTicket.claimedBy ? dataTicket.claimedBy : false;
    
    const dialog ={
        reject : ['rechazado', 'rechazada', '#FF0000'],
        approve: ['aprobado', 'aprobada', '#00FF00'],
        close: ['cerrado', 'cerrada', '#FFA500'],
    }


    const embedLog = new EmbedBuilder()
        .setColor(dialog[action][2])
        .setTitle(`Ticket ${dialog[action][0]}`)
        .setDescription(`La postulación de <@${dataTicket.authorId}> ha sido ${dialog[action][1]} por <@${userStaffID}>.`)
        .addFields(
            { name: 'ID del Ticket:', value: `${dataTicket.channelId}`, inline: true },
            {name: 'ID del Postulante:', value: `${dataTicket.authorId}`, inline: true },
            { name: 'Postulante:', value: `<@${dataTicket.authorId}>`, inline: true },
            { name: 'Motivo:', value: `${reason}`, inline: true },
            { name: `Ticket reclamado${reclamado ? ' por' : ''}:`, value: reclamado ? `<@${reclamado}>` : 'No', inline: true },
            { name: 'historial del ticket:', value: historyPath ? `${historyPath}` : 'No disponible', inline: true },
        )
        .setTimestamp();

    return embedLog;
}

async function saveHistory(channel) {
    console.log(`[saveHistory] Iniciando guardado del historial.`);
    console.log(`[saveHistory] Channel ID: ${channel.id}`);
    console.log(`[saveHistory] Channel name: ${channel.name}`);
    console.log(`[saveHistory] process.cwd(): ${process.cwd()}`);

    const messages = [];
    let lastId = null;
    let batchNumber = 0;

    while (true) {
        const options = {
            limit: 100
        };

        if (lastId) {
            options.before = lastId;
        }

        console.log(
            `[saveHistory] Obteniendo batch #${batchNumber + 1}` +
            `${lastId ? ` antes del mensaje ${lastId}` : ''}...`
        );

        const batch = await channel.messages.fetch(options);

        batchNumber++;

        console.log(
            `[saveHistory] Batch #${batchNumber} obtenido. ` +
            `Mensajes encontrados: ${batch.size}`
        );

        if (batch.size === 0) {
            console.log(`[saveHistory] No quedan más mensajes.`);
            break;
        }

        for (const message of batch.values()) {
            messages.push({
                id: message.id,
                authorId: message.author.id,
                authorTag: message.author.tag,
                content: message.content,
                createdAt: message.createdAt.toISOString(),

                attachments: [...message.attachments.values()].map(attachment => ({
                    name: attachment.name,
                    url: attachment.url
                })),

                embeds: message.embeds.map(embed => embed.toJSON())
            });
        }

        console.log(
            `[saveHistory] Mensajes acumulados: ${messages.length}`
        );

        lastId = batch.last().id;

        console.log(
            `[saveHistory] Último mensaje del batch: ${lastId}`
        );

        if (batch.size < 100) {
            console.log(
                `[saveHistory] Batch menor a 100 mensajes. ` +
                `Finalizando búsqueda.`
            );
            break;
        }
    }

    messages.reverse();

    console.log(
        `[saveHistory] Total de mensajes a guardar: ${messages.length}`
    );

    const directory = path.join(
        process.cwd(),
        'data',
        'ticket-history'
    );

    console.log(
        `[saveHistory] Directorio de historial: ${directory}`
    );

    try {
        await fs.mkdir(directory, {
            recursive: true
        });

        console.log(
            `[saveHistory] Directorio creado/verificado correctamente: ${directory}`
        );

        const filePath = path.join(
            directory,
            `${channel.id}.json`
        );

        console.log(
            `[saveHistory] Ruta final del archivo: ${filePath}`
        );

        await fs.writeFile(
            filePath,
            JSON.stringify(messages, null, 2),
            'utf8'
        );

        console.log(
            `[saveHistory] Historial guardado correctamente.`
        );

        console.log(
            `[saveHistory] Archivo: ${filePath}`
        );

        return filePath;

    } catch (error) {
        console.error(
            `[saveHistory] ERROR al guardar historial: ${error.message}`
        );

        console.error(
            `[saveHistory] Stack: ${error.stack}`
        );

        throw error;
    }
}






async function sendTicketHistory(interaction, historyPath, prefixLog = '[sendTicketHistory]') {

    console.log(
        `${prefixLog} Mostrando historial del ticket desde: ${historyPath}`
    );

    try {
        const historyData = await fs.readFile(historyPath, 'utf8');

        console.log(
            `${prefixLog} Historial del ticket leído correctamente.`
        );

        console.log(
            `${prefixLog} Tamaño del historial: ${historyData.length} caracteres.`
        );

        // Convertir el JSON a objeto
        const history = JSON.parse(historyData);

        // Generar versión simple de la conversación
        const simpleHistory = history.map(message => {
            let text = `[${message.createdAt}] ${message.authorTag}:`;

            if (message.content && message.content.trim() !== '') {
                text += `\n${message.content}`;
            }

            if (message.attachments && message.attachments.length > 0) {
                text += '\n\nAdjuntos:';

                for (const attachment of message.attachments) {
                    text += `\n- ${attachment.name}: ${attachment.url}`;
                }
            }

            if (message.embeds && message.embeds.length > 0) {
                text += '\n\n[Embed enviado]';

                for (const embed of message.embeds) {
                    if (embed.title) {
                        text += `\nTítulo: ${embed.title}`;
                    }

                    if (embed.description) {
                        text += `\n${embed.description}`;
                    }
                }
            }

            return text;
        }).join('\n\n----------------------------------------\n\n');

        // Crear archivo temporal
        const tempHistoryPath = path.join(
            process.cwd(),
            'data',
            'ticket-history',
            `temp-${path.basename(historyPath, '.json')}.txt`
        );

        await fs.writeFile(
            tempHistoryPath,
            simpleHistory,
            'utf8'
        );

        console.log(
            `${prefixLog} Archivo TXT temporal creado: ${tempHistoryPath}`
        );

        await interaction.reply({
            content: '📋 Historial del ticket:',
            files: [
                {
                    attachment: historyPath,
                    name: `ticket-history-${path.basename(historyPath)}`
                },
                {
                    attachment: tempHistoryPath,
                    name: `ticket-conversacion-${path.basename(historyPath, '.json')}.txt`
                }
            ],
            ephemeral: true
        });

        // Eliminar el TXT temporal después de enviarlo
        await fs.unlink(tempHistoryPath);

        console.log(
            `${prefixLog} Archivo TXT temporal eliminado correctamente.`
        );

    } catch (error) {
        console.error(
            `${prefixLog} Error al procesar el historial del ticket: ${error.message}`
        );

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `No se pudo leer el historial del ticket.`,
                ephemeral: true
            });
        }
    }

    return;
}
    