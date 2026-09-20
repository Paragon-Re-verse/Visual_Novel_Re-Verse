import { DiscordMenu } from "../apps/discordMenu.js";
import { Constants as C, getSettings } from "./const.js";
import { VisualNovelDialogues } from "./main.js";
import { PresetUIClass } from "./presetUIClass.js";

const isHost = (user = game.user) => {
    const hostId = game.settings.get(C.ID, 'discordHostUserId')
    return (hostId ? hostId === user.id : user.isGM)
}

export class DiscordIntegration {
    static instance = null;

    constructor() {
        this.ws = null;
        this.voiceStates = new Map();
        this.isConnecting = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 1; // Максимальное количество попыток подключения (пока будет 2, потом попробую 1 поставить)
        this.channelName = null;
        
        C.MODULE().discordIntegration = this;
        DiscordIntegration.instance = C.MODULE().discordIntegration
        this.connect();
        
        // Показываем подсказку через 5 секунд, если соединение не установлено
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                // ui.notifications?.warn(game.i18n.localize(`${C.ID}.discordBridge.notConnected`));
            }
        }, 5000);
    }

    connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            this.ws = new WebSocket('ws://localhost:8080');

            this.ws.onopen = () => {
                console.log(game.i18n.localize(`${C.ID}.discordBridge.connected`));
                ui.notifications?.info(game.i18n.localize(`${C.ID}.discordBridge.connected`));
                this.isConnecting = false;
                this.connectionAttempts = 0;

                DiscordMenu._render(["connection", "voiceChannel", "troubleshooting"]);
                VisualNovelDialogues._render(["foreground"], null, true);
                
                // Отправляем ID канала после подключения на всякий случай (ну чтоб наверняка)
                const channelId = game.settings.get('novel-dialogue-remai', 'discordChannelId');
                console.log(game.i18n.localize(`${C.ID}.discordBridge.retrievedChannel`), '->', channelId);
                
                if (!channelId) {
                    console.warn(game.i18n.localize(`${C.ID}.discordBridge.noChannelId`));
                    ui.notifications?.warn(game.i18n.localize(`${C.ID}.discordBridge.noChannelId`));
                    return;
                }

                const message = JSON.stringify({
                    type: 'config',
                    channelId: channelId
                });
                console.log(game.i18n.localize(`${C.ID}.discordBridge.sendWebsocket`), '->', message);
                this.ws.send(message);

                // Запрашиваем текущий список участников
                console.log(game.i18n.localize(`${C.ID}.discordBridge.curVoiceState`));
                this.ws.send(JSON.stringify({
                    type: 'getCurrentVoiceStates'
                }));
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleDiscordEvent(data);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.ws = null;
                this.isConnecting = false;
                
                DiscordMenu._render(["connection", "voiceChannel", "troubleshooting"]);
                VisualNovelDialogues._render(["foreground"], null, true);
            };

            this.ws.onclose = () => {
                console.log(game.i18n.localize(`${C.ID}.discordBridge.disconnected`));
                this.ws = null;
                this.isConnecting = false;
                
                DiscordMenu._render(["connection", "voiceChannel", "troubleshooting"]);
                VisualNovelDialogues._render(["foreground"], null, true);
                
                // Показываем уведомление только при первом отключении
                if (this.connectionAttempts === 0) {
                    // ui.notifications?.warn(game.i18n.localize(`${C.ID}.discordBridge.notConnected`));
                }
                
                if (this.connectionAttempts < this.maxConnectionAttempts) {
                    this.connectionAttempts++;
                    setTimeout(() => this.connect(), 5000);
                }
            };
        } catch (error) {
            this.isConnecting = false;
            console.error(game.i18n.localize(`${C.ID}.discordBridge.webSocketFailed`), error);
        }
    }

    // Метод для ручного переподключения
    reconnect() {
        this.connectionAttempts = 0;
        this.connect();
    }

    handleDiscordEvent(data) {
        if (data.type === 'voiceStateUpdate') {
            // Обновляем название канала
            if (data.channelName) {
                this.channelName = data.channelName;
            }

            if (data.joined) {
                // console.log(`${data.user} подключился к голосовому каналу`);
                console.log(data.user, game.i18n.localize(`${C.ID}.discordBridge.joined`));
                this.voiceStates.set(data.userId, data);
                ui.notifications?.info(data.user, game.i18n.localize(`${C.ID}.discordBridge.joined`));
                DiscordMenu._render(["voiceChannel", "troubleshooting"]);
                VisualNovelDialogues._render(["foreground"], null, true);
            } else if (data.left) {
                console.log(data.user, game.i18n.localize(`${C.ID}.discordBridge.left`));
                this.voiceStates.delete(data.userId);
                ui.notifications?.info(data.user, game.i18n.localize(`${C.ID}.discordBridge.left`));
                DiscordMenu._render(["voiceChannel", "troubleshooting"]);
                VisualNovelDialogues._render(["foreground"], null, true);
            }
        } else if (data.type === 'voiceSpeaking') {
            // Обновляем название канала и из события speaking тоже
            if (data.channelName) {
                this.channelName = data.channelName;
            }

            const state = this.voiceStates.get(data.userId);
            if (state) {
                state.speaking = data.speaking;
                this.voiceStates.set(data.userId, state);
                console.log(`${data.user} ${game.i18n.localize(`${C.ID}.discordBridge.${data.speaking ? 's' : 'stoppedS'}peaking`)}`);
                this.updateUI(data);
            }
        }
    }

    updateUI(data) {
        if (!game.settings.get(C.ID, 'discordActivitySync') || !isHost()) return

        const discordUsersIds = game.settings.get(C.ID, 'discordUsersIds')
        const userId = game.users.filter(u => u.active).map(u => u.id).find(id => [data.userId, data.user, data.userOrig].includes(discordUsersIds[id]))
        const settings = getSettings()
        if (!userId || !settings.showVN) return

        const user = game.users.get(userId)
        let userCharId
        if (user.isGM && game.settings.get(C.ID, 'discordHighlightGM')) {
            const masterSlot = PresetUIClass.getActivePreset().masterSlot.right
            userCharId = settings.activeSpeakers[`right${masterSlot}`]?.id
        } else {
            userCharId = game.users.get(userId).character?.id
        }
        discordElementActivity(userCharId, data.speaking)
        game.socket.emit(`module.${C.ID}`, {
            type: 'discordElementActivity',
            data: {
                id: userCharId,
                isSpeaking: data.speaking
            }
        });
    }

    async getConnectionStatus() {
        // Если нет подключения - красный
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return 'dsm-red';
        }

        // Если есть какая-то ошибка - жёлтый
        const { noProblems } = await DiscordMenu.getTroubles();
        if (!noProblems) {
            return 'dsm-yellow';
        }

        // Всё в порядке - зелёный
        return 'dsm-green';
    }

    sendMessage(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            ui.notifications?.warn(game.i18n.localize(`${C.ID}.discordBridge.notConnected`));
            return;
        }
        
        try {
            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(game.i18n.localize(`${C.ID}.discordBridge.errorSendingMessage`), ': ', error);
            ui.notifications?.error(game.i18n.localize(`${C.ID}.discordBridge.errorSendingMessage`));
        }
    }

    shutdown() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

export function discordElementActivity(id, isSpeaking) {
    if (id) {
        const element = document.getElementById(`vn-body`).querySelector(`.vn-pBody[data-id="${id}"]`)
        element?.querySelector(".vn-portrait")?.classList?.toggle("vn-main", isSpeaking)
    }
}