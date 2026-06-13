const {getInfoAdressForRedisNoFormat, getSimpleRedisJson } = require("../services/getFromRedis");
const { info, players } = require('source-server-query');
const { saveInfoAdressinRedis, saveSimpleRedisJson } = require("../services/insertInRedis");

const prefixLog = '[A2S FETCHER]';
async function getInfoAdressFromA2s(ip, port) {
  try {
    const serverInfo = await info(ip, port, 8000);
    const serverPlayers = await players(ip, port, 8000);

    // Convertir los BigInt que no necesitas a string
    const sanitizedInfo = {
      ...serverInfo,
      steamid: serverInfo.steamid?.toString(),
      gameid: serverInfo.gameid?.toString(),
	    ip: ip
    };

    return {
      info: sanitizedInfo,
      players: serverPlayers,
      updatedInfo: new Date().toISOString(),
      status: true,
      errorType: null
    };

  } catch (err) {
    let errorType = 'unknown';

    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      errorType = 'server_offline';
    }

    if (err.code === 'ENETUNREACH' || err.code === 'EAI_AGAIN') {
      errorType = 'network_error';
    }

    return {
      info: {},
      players: [],
      updatedInfo: null,
      status: false,
      errorType
    };
  }
}

async function getOldDataAdress(redis, key){
    return getInfoAdressForRedisNoFormat({ adress: key, redis })
}
async function logicAdressInfo(ip, port, redis){
	key = `${ip}:${port}`;
    const serverData = await getInfoAdressFromA2s(ip, port);
    const olddata = await getOldDataAdress(redis, key); 


	// si no hay info en serverData
	if (!serverData.status) {
		if (olddata && olddata.status !== false) {
			// pero si hay olddata y el status no es false
			await saveInfoAdressinRedis({ adress: key, infoAdress: serverData, redis });
			callRedisChangeInfo(redis, key);
			callRedisChangeamountPlayers(redis, key);
      // mandar un registro de server off 
      const registro = [{
      playerName: '__SERVER__'
        , action: 'offline_or_unreachable'
        , timestamp: new Date().toISOString()
      }];
      await saveRegistros({redis, address: key, newRegistros: registro});


		}
		return;
	}
	// si o si tengo data en serverData
    // NO hay oldata 
    if (!olddata|| (olddata &&  !olddata.status)){
		await saveInfoAdressinRedis({ adress: key, infoAdress: serverData, redis });
        callRedisChangeamountPlayers(redis, key);
        callRedisChangeInfo(redis, key);
        return
    }
    // si IF no hay cambios en data 
	if (compareAdressInfoSI(olddata, serverData)) return;
	else {
		console.log(prefixLog ,`Cambios detectados en ${key}`);
		await saveInfoAdressinRedis({ adress: key, infoAdress: serverData, redis });
		const {joinedPlayers, leftPlayers} = trackPlayerLeftJoin(serverData.players, olddata.players);
    // funcion a2sFollowPlayerslist

		await savejoinLeftRegistrer({redis, address: key, joinedPlayers, leftPlayers});
		callRedisChangeInfo(redis, key);

		if (
		  olddata.status !== serverData.status ||
		  (olddata.info?.players ?? 0) !== (serverData.info?.players ?? 0) ||
		  (olddata.info?.max_players ?? 0) !== (serverData.info?.max_players ?? 0)
		){
		  callRedisChangeamountPlayers(redis, key);
		}
		return;
	}


}
function a2sfollowPlayers(playerjoined, playerLeft, guildId, redis){
  if(true===false){
    return;
  }
  const followList = await getSimpleRedisJson({ redis, type: 'server:a2sFollowPlayers', UID: guildId });
  if(!followList || !Array.isArray(followList)){
    return;
  }
  const playersToNotify = []
  for(const player of joinedPlayers){
    const playerFollow = followList.find(p => p.name.toLowerCase() === player.name.toLowerCase());
    if(playerFollow){
      playersToNotify.push({ ...playerFollow, action: 'join' });
    }
  }
  for(const player of leftPlayers){
    const playerFollow = followList.find(p => p.name.toLowerCase() === player.name.toLowerCase());
    if(playerFollow){
      playersToNotify.push({ ...playerFollow, action: 'left' });
    }
  }    



}
async function sendNotificationFollowPlayers(playersToNotify, redis){
}
 
function deepCompare(obj1, obj2, options = {}) {
  const { ignoreKeys = [] } = options;

  const keys1 = Object.keys(obj1).filter(k => !ignoreKeys.includes(k));
  const keys2 = Object.keys(obj2).filter(k => !ignoreKeys.includes(k));

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }

  return true;
}

// Función mínima para comparar listas de jugadores por nombre
function compareNamesInList(list1, list2) {
  if (list1.length !== list2.length) return false;

  const names1 = list1.map(p => p.name).sort();
  const names2 = list2.map(p => p.name).sort();

  for (let i = 0; i < names1.length; i++) {
    if (names1[i] !== names2[i]) return false;
  }

  return true;
}

function isUpdateRecentEnough(dataOld, dataNew, thresholdMs = 60000 * 5){
  if (!dataOld.updatedInfo || !dataNew.updatedInfo) return true;
  if (dataNew.info?.players === 0) return true;

  const timeOld = new Date(dataOld.updatedInfo).getTime();
  const timeNew = new Date(dataNew.updatedInfo).getTime();

  return Math.abs(timeNew - timeOld) <= thresholdMs;

}
function compareAdressInfoSI(dataOld, dataNew) {
  const a = deepCompare(
    dataOld.info,
    dataNew.info,
    { ignoreKeys: ["ping", "keywords"] }
  );

  const b = compareNamesInList(
    dataOld.players,
    dataNew.players
  );

  const c = (dataOld.status ?? false) === (dataNew.status ?? false);

  const d =  (dataOld.errorType ?? null) === (dataNew.errorType ?? null);

  const e = isUpdateRecentEnough(dataOld, dataNew, 1000 * 60 * 8); // 8 minutos

  return a && b && c && d && e;
}

async function callRedisChangeamountPlayers(redis, adress) {
    redis.publish('adressChangePlayerCount', adress);
}
async function callRedisChangeInfo(redis, adress) {
    redis.publish('adressChangeInfo', adress);
}
function trackPlayerLeftJoin(newPlayers, oldPlayers){
	const oldPlayerNames = new Set(oldPlayers.map(p => p.name));
	const newPlayerNames = new Set(newPlayers.map(p => p.name));

	const joinedPlayers = newPlayers
		.filter(p => !oldPlayerNames.has(p.name))
		.map(p => p.name); // solo nombres

	const leftPlayers = oldPlayers
		.filter(p => !newPlayerNames.has(p.name))
		.map(p => p.name); // solo nombres

	return { joinedPlayers, leftPlayers };
}


async function savejoinLeftRegistrer({redis, address, joinedPlayers, leftPlayers, key="a2sServer:playerJoinLeftRegister"}){
  // 
  joinedPlayers = Array.isArray(joinedPlayers) ? joinedPlayers : [];
  leftPlayers = Array.isArray(leftPlayers) ? leftPlayers : [];
  let register = [];
	for (const playerName of joinedPlayers) {
		register.push({
			playerName,
			action: 'join',
			timestamp: new Date().toISOString(),
		});
	}
	for (const playerName of leftPlayers) {
		register.push({
			playerName,
			action: 'left',
			timestamp: new Date().toISOString(),
		});
	}
  await saveRegistros({redis, address, newRegistros: register, key});
	

}
async function saveRegistros({redis, address, newRegistros, key="a2sServer:playerJoinLeftRegister"}){
	let register = await getSimpleRedisJson({
        redis,
        type: key,
        UID: address,
    });
	if (!register || !Array.isArray(register)) {
        register = [];
    }

  register = register.concat(newRegistros);
	const maxRegisterLength = 14;
	if (register.length > maxRegisterLength) {
		register = register.slice(register.length - maxRegisterLength);
	}
	
	await saveSimpleRedisJson({
        redis,
        type: key,
        UID: address,
        json: register,

  });
}

async function callAllEventsA2s(redis) {
    const adreesToFetch = await redis.smembers('ipsTofech');
    for (const adress of adreesToFetch) {
        callRedisChangeInfo(redis, adress);
        callRedisChangeamountPlayers(redis, adress);
    }

}
async function a2sFetcherMain(redis) {
    adreesToFetch = await redis.smembers('ipsTofech');
	console.log(prefixLog, "Fetching info for addresses: ", adreesToFetch);

    for (const adress of adreesToFetch) {
        const [ip, portStr] = adress.split(':');
        const port = parseInt(portStr, 10);
		await logicAdressInfo(ip, port, redis);
    }
    
}

module.exports = {
	a2sFetcherMain,
  callAllEventsA2s
}