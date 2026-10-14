// gamemode.js
const RoomAPI = require('RoomAPI');
const PlayerAPI = require('PlayerAPI');
const ZoneAPI = require('ZoneAPI');
const ChatAPI = require('ChatAPI');
const UIAPI = require('UIAPI');

let serverStartTime = Date.now();
let firstPlayerAdm = false;
let players = new Map();
let nextPlayerID = 1;
let spawnPoint = { x: 0, y: 0, z: 0 };

// Получаем настройки из options.js
const options = require('./options.js').options.reduce((acc, opt) => {
    acc[opt.id] = opt.defaultValue;
    return acc;
}, {});

class PlayerData {
    constructor(id, playerObj) {
        this.id = id;
        this.obj = playerObj;
        this.coins = 0;
        this.kills = 0;
        this.health = 100;
        this.status = null;
        this.statusColor = null;
        this.hasAdmin = false;
    }
}

function onInit() {
    // Применяем настройки из options.js
    if (options.infinite_time) {
        RoomAPI.setInfiniteTime(true);
    }
    
    UIAPI.enablePopups(true);
    
    // Настройка колонок таблицы (как на фото)
    UIAPI.setColumnLabel('K', 'статусы!');
    UIAPI.setColumnLabel('D', 'R - рум айди');
    UIAPI.setColumnLabel('S', 'монеты!');
    UIAPI.setColumnLabel('RID', 'убийства');

    setInterval(updateHeaderText, 20000);
}

function onPlayerJoin(player) {
    let id = nextPlayerID++;
    let data = new PlayerData(id, player);
    players.set(id, data);

    // --- ЛОГИКА КОМАНД (СВЯЗЬ С default_teams.js) ---
    if (options.single_team_mode) {
        // Принудительно ставим в команду с ID 1 (Синяя команда из default_teams.js)
        player.setTeam(1); 
        ChatAPI.sendSystemMessage(`Игрок \${id} добавлен в Синюю Команду.`);
    }
    // --------------------------------------------------

    if (!firstPlayerAdm) {
        data.hasAdmin = true;
        firstPlayerAdm = true;
        grantAdminPermissions(data);
        ChatAPI.sendSystemMessage(`Игрок \${id} получил права администратора.`);
    }

    UIAPI.addPlayerToList(id, data.status, id, data.coins, data.kills);
}

function onPlayerLeave(player) {
    let id = getPlayerID(player);
    if (id) {
        players.delete(id);
        UIAPI.removePlayerFromList(id);
    }
}

function grantAdminPermissions(data) {
    data.obj.setFlyMode(true);
    data.obj.giveAllWeapons();
    data.obj.giveAllBuildingTools();
    data.obj.setInfiniteAmmo(true);
}

function onZoneEnter(zone, player) {
    let data = getPlayerData(player);
    if (!data) return;

    let tag = zone.getTag();
    let name = zone.getName();

    try {
        if (tag === 'farm') {
            let amount = parseInt(name);
            if (amount > 0) {
                data.coins += amount;
                UIAPI.showPopup(player, `+\${amount} монет!`, 2);
                updateUIStats(data);
            }
        } 
        else if (tag === 'weapon') {
            let parts = name.split('@');
            if (parts.length === 2) {
                let type = parseInt(parts);
                let price = parseInt(parts);
                buyWeapon(data, type, price);
            }
        }
        else if (tag === 'xp') {
            let parts = name.split('@');
            if (parts.length === 2) {
                let hp = parseInt(parts);
                let price = parseInt(parts);
                buyHealth(data, hp, price);
            }
        }
        else if (tag === 'hint') {
            UIAPI.showPopup(player, name, 3);
        }
        else if (tag === 'status') {
            let parts = name.split('@');
            if (parts.length === 3) {
                buyStatus(data, parts, parts, parseInt(parts));
            }
        }
        else if (tag === 'status2') {
            let parts = name.split('@');
            if (parts.length === 2) {
                checkStatusAccess(data, parts, zone);
            }
        }
        else if (tag === 'tp') {
            let coords = name.split('@').map(Number);
            if (coords.length === 3) {
                data.obj.teleport(coords, coords, coords);
            }
        }
        else if (tag.startsWith('plata')) {
            handleTransferZone(data, tag, name);
        }
    } catch (e) {
        console.error("Error in zone logic:", e);
    }
}

function buyWeapon(data, type, price) {
    if (data.coins >= price) {
        data.coins -= price;
        data.obj.giveWeapon(type);
        UIAPI.showPopup(data.obj, "Оружие куплено!", 2);
        updateUIStats(data);
    } else {
        UIAPI.showPopup(data.obj, "Недостаточно средств!", 2);
    }
}

function buyHealth(data, hp, price) {
    if (data.coins >= price) {
        data.coins -= price;
        data.health += hp;
        data.obj.setHealth(data.health);
        UIAPI.showPopup(data.obj, `Здоровье восстановлено (+\${hp})`, 2);
        updateUIStats(data);
    } else {
        UIAPI.showPopup(data.obj, "Недостаточно средств!", 2);
    }
}

function buyStatus(data, color, name, price) {
    if (data.coins >= price) {
        data.coins -= price;
        data.status = name;
        data.statusColor = color;
        UIAPI.showPopup(data.obj, `Статус \${name} активирован!`, 2);
        updateUIStats(data);
    } else {
        UIAPI.showPopup(data.obj, "Недостаточно средств!", 2);
    }
}

function checkStatusAccess(data, requiredStatus, zone) {
    if (data.status !== requiredStatus) {
        data.obj.teleport(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        UIAPI.showPopup(data.obj, "Нет доступа к этой зоне!", 3);
    }
}

function onChatMessage(player, message) {
    if (!message.startsWith('/')) return;

    let args = message.substring(1).split(/[,]+/);
    let cmd = args.toLowerCase();
    
    let data = getPlayerData(player);
    if (!data) return;

    if (cmd === 'tp') {
        if (args.length >= 3) {
            let targetID = parseInt(args);
            let targetData = players.get(targetID);
            if (targetData) {
                targetData.obj.teleport(data.obj.getPosition());
                ChatAPI.sendSystemMessage(`Игрок ${targetID} телепортирован к игроку ${data.id}.`);
            }
        }
    }
    else if (cmd === 'pop') {
        if (args.length >= 2) {
            let text = args;
            RoomAPI.broadcastPopup(text, 5);
        }
    }
    else if (cmd === 'spawn') {
        if (args.length >= 2) {
            let targetID = parseInt(args);
            let targetData = players.get(targetID);
            if (targetData) {
                targetData.obj.teleport(spawnPoint.x, spawnPoint.y, spawnPoint.z);
            }
        }
    }
    else if (cmd === 'adm') {
        if (data.hasAdmin && args.length >= 2) {
            let targetID = parseInt(args);
            let targetData = players.get(targetID);
            if (targetData) {
                targetData.hasAdmin = true;
                grantAdminPermissions(targetData);
                ChatAPI.sendSystemMessage(`Админка выдана игроку \${targetID}.`);
            }
        }
    }
    else if (cmd === 'ban') {
        if (data.hasAdmin && args.length >= 2) {
            let targetID = parseInt(args);
            let targetData = players.get(targetID);
            if (targetData) {
                targetData.obj.kick("Вы были забанены администратором.");
            }
        }
    }
    else if (cmd === 'help') {
        ChatAPI.sendPrivateMessage(player, "/tp(A,B) - тп B к A | /pop(text) - всем текст | /spawn(ID) - на спавн | /adm(ID) - дать админку | /ban(ID) - бан");
    }
}

function updateHeaderText() {
    let text = UIAPI.getHeaderText();
    if (text === "Режим от тяночки!") {
        UIAPI.setHeaderText("/help - тут все команды!");
    } else {
        UIAPI.setHeaderText("Режим от тяночки!");
    }
}

function updateUIStats(data) {
    UIAPI.updatePlayerStats(data.id, data.status, data.id, data.coins, data.kills);
}

function updateServerTimer() {
    let time = Math.floor((Date.now() - serverStartTime) / 1000);
    UIAPI.setServerTimer(time);
}

function getPlayerData(player) {
    for (let [id, data] of players.entries()) {
        if (data.obj === player) return data;
    }
    return null;
}

function getPlayerID(player) {
    let data = getPlayerData(player);
    return data ? data.id : null;
}

function handleTransferZone(data, tag, name) {
    // Логика перевода денег (требует UI кнопок)
}

// Подписка на события
RoomAPI.onInit(onInit);
RoomAPI.onPlayerJoin(onPlayerJoin);
RoomAPI.onPlayerLeave(onPlayerLeave);
ZoneAPI.onZoneEnter(onZoneEnter);
ChatAPI.onMessage(onChatMessage);

setInterval(updateServerTimer, 1000);
