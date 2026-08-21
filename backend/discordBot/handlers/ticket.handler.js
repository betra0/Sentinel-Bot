const { ChannelType, PermissionsBitField, CategoryChannel, embedLength, EmbedBuilder, ModalBuilder } = require('discord.js');
const { getSimpleRedisJson } = require('../services/getFromRedis');
const { saveSimpleRedisJson } = require('../services/insertInRedis');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TextInputBuilder, TextInputStyle } = require('discord.js');
const { findAndEditMessageText } = require('../services/findAndEditMessageText');
const fs = require('fs/promises');
const path = require('path');
const { MessageFlags } = require('discord.js');


//
/*


configApply = {
    nombreclave: 'nombreclave',
    roleToAssign: 'roleId',
    staffAurthorityRoles: ['roleId1', 'roleId2'],
    categoryId: 'categoryId',
    channelForLogsId: 'channelId',
    formInTicketStr: 'formulario en texto',
    MessagePostApproveStr: 'mensaje de bienvenida al aprobar'
}


dataTicket = {
    authorId: 'userId',
    authorTag: 'userTag',
    channelId: 'channelId',
    mainMessageId: 'messageId',
    status: 'open' | 'closed' | 'approved' | 'rejected',
    claimedBy: 'userId' | null,
    createdAt: 'timestamp',
    configId: 'nombreclave'
}


*/
// este ticket no soporta que el usuario pueda cerrar el ticket solo los admins (por ahora)
async function ticketHandler(interaction, client, redis) {

    const prefixLog = `[interactionCreate-TicketHandler] `;

    const args = interaction.customId.split(':');
    const type = args[1];
    // estructura de ticket postulacion(application) : ticket:apply:action:applyId
    if (type === 'apply') {
        const action = args[2]; // create, close, claim, approve, reject
        const applyId = args[3];
        if (action === 'history' && args.length < 5) {
            await interaction.reply({ content: `ERROR: no es posible leer este ticket, porque la versión de guardado de este ticket es incompatible con la versión actual del bot.`, ephemeral: true });
        }
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
        else if (action === 'options'){
            await optionsTicketApplication(interaction, client, redis, configApply);
        }
        else if (action === 'history') {
            const historyPath = args[4];
            await sendTicketHistory(interaction, historyPath);
        }
        else if (action === 'cancel_approve') {
            await cancelApproveTicketApplication(interaction, client, redis, configApply);
        }
    }



    return 

}
module.exports = { ticketHandler };

async function createTicketApplication(interaction, client, redis, configApply) {
    const prefixLog = `[createTicketApplication] `;
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

    const row = await generateRowGoblalButton( configApply, ticketData);
    
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
        console.error(`${prefixLog} Error al enviar mensaje de confirmación de ticket: `, error);
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
    // revisa si el que seleciono cerrar el ticket es el autor del ticket y si no es admin o staff 
    if (dataTicket.authorId === interaction.user.id && !isAdminOrStaff(interaction, configApply)) {
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
    let member;
    try {
        member = dataTicket.authorId ? await interaction.guild.members.fetch(dataTicket.authorId) : null;
        

    }catch (error) {
        if(error.code === 10007) {
            const m = `No se pudo encontrar al miembro con ID ${dataTicket.authorId}. Es posible que haya abandonado el servidor. errorCode: ${error.code}`;
            console.error(`[ticketHandler] claimTicketApplication error: ${m}`);
            await interaction.followUp({ content: m, ephemeral: true });
            return;
        }
        console.error(error);
        throw error;
    }
        
    const embed = await generateAdminEmbedTicket(interaction, member.user, dataTicket, configApply);
    const row = await generateRowGoblalButton( configApply, dataTicket);
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
    let member;
    try {
        member = dataTicket.authorId ? await interaction.guild.members.fetch(dataTicket.authorId) : null;
        

    }catch (error) {
        if(error.code === 10007) {
            const m = `No se pudo encontrar al miembro con ID ${dataTicket.authorId}. Es posible que haya abandonado el servidor. errorCode: ${error.code}`;
            console.error(`[ticketHandler] claimTicketApplication error: ${m}`);
            await interaction.followUp({ content: m, ephemeral: true });
            return;
        }
        console.error(error);
        throw error;
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
    const rowMain = await generateRowGoblalButton( configApply, dataTicket);
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


    // mandar log al canal de logs
    await sendAndSaveLogTicket({interaction:interaction, channelLogs: channelLogs, reason: rejectReason, userStaffID: interaction.user.id, applyId: configApply.nombreclave, dataTicket:dataTicket, action: 'reject'});
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
    // eliminar canal
    const channel = interaction.channel;
    // mandar log al canal de logs
    const reason = dataTicket.status === 'approved' ? 'Postulación aprobada previamente' : closeReason;
    await sendAndSaveLogTicket({interaction:interaction, channelLogs: channelLogs, reason: reason, userStaffID: interaction.user.id, applyId: configApply.nombreclave, dataTicket: dataTicket, action: 'close'});

    await redis.del(`ticket:${interaction.channel.id}:author`);
    await redis.hdel(`databot:ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, dataTicket.authorId);
    
    await channel.delete('Ticket cerrado');
    return;
}
async function cancelApproveTicketApplication(interaction, client, redis, configApply) {
    await interaction.deferUpdate();
    let dataTicket;
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);
    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] cancelApproveTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    console.log(`[ticketHandler] cancelApproveTicketApplication invoked by user ${interaction.user.id} in channel ${interaction.channel.id}`);

    let member;
    try {
        member = dataTicket.authorId ? await interaction.guild.members.fetch(dataTicket.authorId) : null;
    }catch (error) {
        if(error.code === 10007) {
            const m = `No se pudo encontrar al miembro con ID ${dataTicket.authorId}. Es posible que haya abandonado el servidor. errorCode: ${error.code}`;
            console.error(`[ticketHandler] cancelApproveTicketApplication error: ${m}`);
            await interaction.followUp({ content: m, ephemeral: true });
            return;
        }
        console.error(error);
        throw error;
    }
    
    // 1. remover rol al usuario
    if (!configApply.roleToAssign) {
        await interaction.followUp({ content: `ERROR: No hay un rol configurado para asignar en esta postulación.`, ephemeral: true });
        return;
    }
    await member.roles.remove(configApply.roleToAssign, 'Cancelación de aprobación de postulación');
    // 2. cambiar status a open
    dataTicket.status = 'open';
    // 3. actualizar embed principal
    const userTicket = member.user;
    const embedMain = await generateAdminEmbedTicket(interaction, userTicket, dataTicket, configApply);
    const rowMain = await generateRowGoblalButton( configApply, dataTicket);
    const channel = interaction.channel;
    const idMainMessage = dataTicket.mainMessageId;
    if (!idMainMessage){
        await interaction.followUp({ content: `ERROR: No se encontró el mensaje principal del ticket.`, ephemeral: true });
        return;
    }
    await findAndEditMessageText(interaction.client, channel.id, idMainMessage, { embeds: [embedMain], components: [rowMain] })
    // 4 .cambiar nombre del canal
    await channel.edit({
        name: `ticket-${member.user.username}`,
        reason: `Cancelación de aprobación de postulación para user ${member.user.username} (${member.user.id})` 
    });
    // 5. guadar un log en el canal de logs
    const channelLogs = configApply.channelForLogsId ? await interaction.guild.channels.fetch( configApply.channelForLogsId) : null;
        await findAndEditMessageText(interaction.client, channel.id, idMainMessage, { embeds: [embedMain], components: [rowMain] })
    if (channelLogs){
        const reason = 'Cancelación de aprobación de postulación';
        const embedLog = generateEmbedLog({ action: 'cancel_approve', dataTicket, reason: reason, userStaffID: interaction.user.id });
        await channelLogs.send({ embeds: [embedLog] });
    }
    
    // 6. guardar en redis
    await saveSimpleRedisJson({ redis, type: `ticket:apply:${interaction.guildId}:${configApply.nombreclave}`, UID: dataTicket.authorId, json: dataTicket });
   
   
    //7. avisar por el canal del ticket
    const embedC = new EmbedBuilder()
        .setColor('#ff0d00')
        .setTitle('Aprobación de postulación revertida')
        .setDescription('La aprobación de la postulación ha sido revertida.');
    await interaction.followUp({ content: '', embeds: [embedC] });



}

async function optionsTicketApplication(interaction, client, redis, configApply) {
    await interaction.deferUpdate();
    let dataTicket;
    try {
        dataTicket = await logicCheckInTicketApplication(interaction, client, redis, configApply);
    }catch (error) {
        if (error.isControlled) {
            console.log(`[ticketHandler] optionsTicketApplication controlled error: ${error.message}`);
            await interaction.followUp({ content: error.message, ephemeral: true });
            return;
        } else {
            throw error;
        }
    }
    if (!dataTicket) {
        return;
    }
    console.log(`[ticketHandler] optionsTicketApplication invoked by user ${interaction.user.id} in channel ${interaction.channel.id}`);

    const { row, embed } = await generateRowAndEmbedTicketButtons( configApply, dataTicket);
    

    const message = await interaction.followUp({ 
        content:`<@${interaction.user.id}>`, 
        embeds: [embed], 
        components: [row],     
        flags: MessageFlags.Ephemeral,
        fetchReply: true 
    });
    
    setTimeout(async () => {
        console.log('Intentando borrar Ephemeral Message');
        try {
            await interaction.webhook.deleteMessage(message.id);
            console.log('Borrado correctamente');
        } catch (error) {
            console.error('Error borrando followUp:', error);
        }
    }, 20 * 1000);





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
function isAdminOrStaff(interaction, configApply) {
    const hasAnyRole = configApply.staffAurthorityRoles
        .some(roleId => interaction.member.roles.cache.has(roleId));
    if (hasAnyRole || interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }
    return false;
}
async function logicCheckInTicketApplication(interaction, client, redis, configApply, ignoreRoles=false) {

    if (!ignoreRoles && !isAdminOrStaff(interaction, configApply)) {
            const err =new Error('No tienes permisos para gestionar este ticket.');
            err.code = 'TICKET_ERROR';
            err.isControlled = true;
            throw err;
        
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

// es el embed que se miestra arriba del ticket, con la info del ticket y el usuario
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
        { name: 'Fecha de creación:', value: `<t:${Math.floor(new Date(dataTicket.createdAt).getTime() / 1000)}:F>`, inline: true },
    )
    .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 512 }))
    .setAuthor({ name: `Staff Tickets`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
    .setTimestamp();
    
    return embed;
}

async function generateRowAndEmbedTicketButtons(configApply, dataTicket) {
    const descriptions = [
        '⚙️ Selecciona una opción a continuación.\n'
    ];
    const components = [];

    if (!dataTicket.claimedBy) {
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:claim:${configApply.nombreclave}`)
                .setLabel('Reclamar Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary),
        );

        descriptions.push(
            '🎫 **Reclamar Ticket** — Asigna el ticket al administrador que lo está gestionando.'
        );
    }

    if (dataTicket.claimedBy && dataTicket.status !== 'approved') {
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:approve:${configApply.nombreclave}`)
                .setLabel('Aprobar')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
        );

        descriptions.push(
            '✅ **Aprobar** — Aprueba la postulación del usuario.'
        );
    }

    if (dataTicket.status === 'approved') {
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:cancel_approve:${configApply.nombreclave}`)
                .setLabel('Cancelar Aprobación')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Danger)
        );

        descriptions.push(
            '↩️ **Cancelar Aprobación** — Revierte una aprobación realizada anteriormente.'
        );
    }

    if (dataTicket.status !== 'approved') {
        components.push(
            new ButtonBuilder()
                .setCustomId(`ticket:apply:reject:${configApply.nombreclave}`)
                .setLabel('Rechazar')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger),
        );

        descriptions.push(
            '❌ **Rechazar** — Rechaza la postulación del usuario.'
        );
    }

    // Cerrar Ticket siempre está disponible
    const closeButton = new ButtonBuilder()
        .setCustomId(`ticket:apply:close:${configApply.nombreclave}`)
        .setLabel('Cerrar Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

    components.unshift(closeButton);

    descriptions.push(
        '🔒 **Cerrar Ticket** — Cierra y finaliza el ticket.'
    );

    descriptions.push(
        '\n⏳ Este panel se eliminará automáticamente en **20 segundos**.'
    );

    const embedoptions = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Opciones de Administración')
        .setDescription(descriptions.join('\n'));

    const row = new ActionRowBuilder()
        .addComponents(...components);

    return {
        embed: embedoptions,
        row: row
    };
}

async function generateRowGoblalButton(
    configApply, dataTicket
){

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket:apply:options:${configApply.nombreclave}`)
            .setLabel('Opciones')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Primary)

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
        cancel_approve: ['revertido', 'revertida', '#FF00FF'],
    }
    const strhistoryPath = historyPath ? `${historyPath}` : (action !== 'close' ? `aún abierto →<#${dataTicket.channelId}>` : 'No Disponible');

    const embedLog = new EmbedBuilder()
        .setColor(dialog[action][2])
        .setTitle(`Ticket ${dialog[action][0]}`)
        .setDescription(`La postulación de <@${dataTicket.authorId}> ha sido ${dialog[action][1]} por <@${userStaffID}>.`)
        .addFields(
            { name: 'ID del Ticket:', value: `${dataTicket.channelId}`, inline: true },
            {name: 'ID del Postulante:', value: `${dataTicket.authorId}`, inline: true },
            { name: 'nombre del postulante:', value: `${dataTicket.authorTag}`, inline: true },
            { name: 'Postulante:', value: `<@${dataTicket.authorId}>`, inline: true },
            { name: 'Motivo:', value: `${reason}`, inline: true },
            { name: `Ticket reclamado${reclamado ? ' por' : ''}:`, value: reclamado ? `<@${reclamado}>` : 'No', inline: true },
            { name: 'historial del ticket:', value: strhistoryPath, inline: true },
        )
        .setTimestamp();

    return embedLog;
}

async function saveHistory(channel) {
    console.log(`[saveHistory] Iniciando guardado del historial.`);
    console.log(`[saveHistory] Channel ID: ${channel.id}, Name: ${channel.name}`);

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


        const batch = await channel.messages.fetch(options);

        batchNumber++;


        if (batch.size === 0) {
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


        lastId = batch.last().id;


        if (batch.size < 100) {
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


    try {
        await fs.mkdir(directory, {
            recursive: true
        });


        const filePath = path.join(
            directory,
            `${channel.id}.json`
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
    

async function sendAndSaveLogTicket({interaction, channelLogs, reason, userStaffID, interactionID, applyId, dataTicket, action='close'}) {
    // Implementation for sending and saving ticket log
    const historyPath = await saveHistory(interaction.channel);
    // mandar log al canal de logs
    if (channelLogs){
        const embedLog = generateEmbedLog({ action: action, dataTicket, reason: reason, userStaffID: interaction.user.id, historyPath: historyPath });
        const row2= new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver historial del ticket')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`ticket:apply:history:${applyId}:${historyPath}`)
        );
        await channelLogs.send({ embeds: [embedLog], components: [row2] });
    }
}