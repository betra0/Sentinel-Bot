const { fPAHandler } = require("../handlers/followPlayersAlert.handler");
const { changeInfoGameServerHandler } = require("../handlers/infoAddressChange.handler");


async function initRedisSubscriber(subscriber, redis, client) {


    // suscribire a los canales de comunicacion con fetcher en redis 
    subscriber.subscribe('adressChangeInfo', (err, count) => {
        if (err) {
          console.error('Error al suscribirse a subscriber:', err);
        } else {
          console.log(`Suscrito a ${count} canal(es) en subscriber.`);
        }
    });
    subscriber.subscribe('adressChangePlayerCount', (err, count) => {
        if (err) {
          console.error('Error al suscribirse a subscriber:', err);
        } else {
          console.log(`Suscrito a ${count} canal(es) en subscriber.`);
        }
    });

    //
    subscriber.subscribe('a2sFollowPlayersAlerts', (err, count) => {
        if (err) {
          console.error('Error al suscribirse a subscriber:', err);
        } else {
          console.log(`Suscrito a ${count} canal(es) en subscriber.`);
        }
    });


    subscriber.on('message', async (channel, message) => {
        console.log(`Mensaje recibido en ${channel}: ${message}`);

        if (
            channel === 'adressChangeInfo' ||
            channel === 'adressChangePlayerCount'
        ) {
            changeInfoGameServerHandler(channel, message, redis, client);
        }

        else if(channel === 'a2sFollowPlayersAlerts'){
            // Manejar mensajes para alertas de jugadores seguidos

            message = JSON.parse(message);  
            await fPAHandler(message, client, redis);
        }
    });
}




module.exports = { initRedisSubscriber };

