const {Client, Events  } = require('discord.js');
const fs = require('fs');
const path = require('path');

const Redis = require('ioredis');
require('dotenv').config({ path: '../../.env' });


const { reloadStatusCraftyTask } = require('./task/reloadStatusCrafty');
const { initRedisSubscriber } = require('./redis/subscriber');
const { changeAmountMembers } = require('./handlers/changeAmountMembers.handler');

const { a2sFetcherMain, callAllEventsA2s } = require('./task/a2sFetcher');



console.log('este es el Redis host y port \n ', process.env.REDISHOST, process.env.REDISPORT)

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let redis 
let subscriber


const client = new Client({
    intents:process.env.INTENTSDS
});
const token = process.env.BOTDSTOKEN
// funcion que itera las carpetas de comandos [capeta, carpeta2, ...] y busca los comandos, 




client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // inicializar eventos de redis subscriber
    initRedisSubscriber(subscriber, redis, client);
    // task
    startReloadLoop();
    startA2sFetcherLoop();
    await sleep(6*1000);
    await callAllEventsA2s(redis) // llamar a todos los eventos una vez al iniciar el bot

});



//client.on(Events.GuildMemberAdd, async member => {
//    console.log('se a unido un nuevo miembro al servidor')
//    changeAmountMembers(member, redis, client);
//});
//client.on(Events.GuildMemberRemove, async member => {
//    console.log('un miembro a salido del servidor')
//    changeAmountMembers(member, redis, client);  
//});

// Cargar Eventos 

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client , redis));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client , redis));
    }
}

// fin 




//tasks
async function startReloadLoop() {
    while(true) {
        try {
            await reloadStatusCraftyTask(client, redis);
        } catch (e) {
            console.error('Error en reloadStatusCraftyTask:', e);
        }
        await sleep(1000 * 60 * 2); // 3 minutos
    }
}
 
async function startA2sFetcherLoop(){
        while(true) {
        try {
            await a2sFetcherMain(redis);
        } catch (e) {
            console.error('Error en a2sFetcherMain:', e);
        }
        await sleep(1000 * 60 * 4); // 4 minutos
    }
} 









async function ejecutar() {
    console.log('Esperando unos segundos para iniciar el bot...');
    await sleep(1000); 
    console.log('Iniciando el bot...');
    redis = new Redis({
        host:process.env.REDISHOST,
        port:process.env.REDISPORT
    });
    subscriber = new Redis({
        host: process.env.REDISHOST,
        port: process.env.REDISPORT
    });
    await client.login(token);


}

ejecutar();









