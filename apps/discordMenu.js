import { VisualNovelDialogues } from "../scripts/main.js";
import { Constants as C } from "./../scripts/const.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const _getAppParts = (getTemplates = false) => {
    let ret = ["connection", "voiceChannel", "midBox", "troubleshooting", "settings", "guide"]
    // if (getTemplates) ret = ret.map(part => ({part: {template: `modules/${C.ID}/templates/discordMenuParts/${part}.hbs`}}))
    if (getTemplates) ret = ret.reduce((acc, part) => ({...acc, [part]: {template: `modules/${C.ID}/templates/discordMenuParts/${part}.hbs`}}), {})
    return ret
}

export class DiscordMenu extends HandlebarsApplicationMixin(ApplicationV2) {
    static instance = null

    static DEFAULT_OPTIONS = {
        classes: ['dsm-body'],
        id: "discord-menu",
        title: "Discord Bridge",
        position: {
        },
        actions: {
            // Обработчик кнопки подключения
            connect: this._connect,
            // Обработчики изменения настроек
            updateChannelId: this._updateChannelId,
            updateUserId: this._updateUserId,
            updateNotifications: this._updateNotifications,
            updateActivitySync: this._updateActivitySync,
            updateAutoConnect: this._updateAutoConnect,
            updateHighlightGM: this._updateHighlightGM,
            addBot: this._addBot,
            kickBot: this._kickBot,
            discordGuideHint: this._discordGuideHint
        },
        window: {
            resizable: true,
            title: "Discord Bridge",
            frame: true,
            positioned: true
        }
    };

    static PARTS = _getAppParts(true);

    constructor() {
        super();
        this.discordIntegration = C.MODULE().discordIntegration;
        this.renderParts = _getAppParts();
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.parts = this.renderParts
    }

    _prepareContext(options) {
        return { 
            isConnected: this.discordIntegration?.ws?.readyState === WebSocket.OPEN,
            speakers: Array.from(this.discordIntegration?.voiceStates?.values() || [])
         };
    }

    static getTroubles = async (connected = (C.MODULE().discordIntegration?.ws?.readyState === WebSocket.OPEN), speakers = Array.from(C.MODULE().discordIntegration?.voiceStates?.values() || []), isHost = false) => {
        let troubles = []
        const tokenFile = await fetch(`modules/${C.ID}/bot/token.txt`).then(r => r.text())
        if (!tokenFile) troubles.push("noToken")
        if (!connected && isHost) troubles.push("notConnected")
        if (!game.settings.get(C.ID, 'discordChannelId')) troubles.push("noChannelId")
        if (!(speakers.some(u => u.isOurBot)) && isHost) troubles.push("noBot")

        const speakersStatus = game.users.filter(u => u.active && !u.isGM).map(u => u.id).reduce((acc, userId) => {
            const user = game.users.get(userId)
            const hasChar = user.character
            const hasId = user.getFlag(C.ID, "discordUserId")
            if (!hasChar || !hasId) acc.push({noChar: !hasChar, noId: !hasId, name: user.name, id: userId})
            return acc
        }, [])

        return {
            troubles,
            speakersStatus,
            noProblems: (!troubles.length && !speakersStatus.length)
        }
    }

    async _preparePartContext(partType, context) {
        let hostUserId = game.settings.get(C.ID, 'discordHostUserId')
        // Если хост Discord Bridge не указан или не найден, устанавливаем его как активного GM'а
        if (!hostUserId || !game.users.get(hostUserId)) {
            hostUserId = game.users.activeGM.id
            await requestSettingsWithKeyUpdate('discordHostUserId', hostUserId)
        }
        const isHost = hostUserId === game.user.id
        switch (partType) {
            case "connection":
                context = { ...context, 
                    disableButton: context.isConnected || !isHost,
                    notHost: !isHost
                };
                break;
            case "voiceChannel":
                context = { ...context, 
                    voiceUsers: Array.from(context.speakers.map(user => ({name: user.user, isOurBot: user.isOurBot}))) || [],
                    voiceChannelName: this.discordIntegration?.channelName,
                    notHost: !isHost
                };
                break;
            case "troubleshooting":
                const troubles = await DiscordMenu.getTroubles(context.isConnected, context.speakers, isHost)
                context = { ...context, ...troubles};
            case "settings":
                context = { ...context, 
                    settings: {
                        hostUserId,
                        channelId: game.settings.get(C.ID, 'discordChannelId'),
                        userId: game.settings.get(C.ID, 'discordUserId'),
                        notifyVoiceStatus: game.settings.get(C.ID, 'discordNotifications'),
                        syncPortraits: game.settings.get(C.ID, 'discordActivitySync'),
                        autoConnect: game.settings.get(C.ID, 'discordAutoConnect'),
                        highlightGM: game.settings.get(C.ID, 'discordHighlightGM')
                    },
                    users: game.users.map(u => ({id: u.id, name: u.name}))
                };
                break;
        }
        return context
    }

    _onRender() {
        const html = $(this.element)

        // Перемещаем settings и troubleshooting в midBox
        html.find('.dsm-settings').appendTo(html.find('.dsm-mid-box'));
        html.find('.dsm-troubleshooting').appendTo(html.find('.dsm-mid-box'));

        // При изменении text input-полей с настройками, обновляем настройки
        html.find('input[name="channelId"]').change(DiscordMenu._updateChannelId);
        html.find('input[name="userId"]').change(DiscordMenu._updateUserId);
        html.find('input[name="notifyVoiceStatus"]').change(DiscordMenu._updateNotifications);
        html.find('input[name="syncPortraits"]').change(DiscordMenu._updateActivitySync);
        html.find('input[name="autoConnect"]').change(DiscordMenu._updateAutoConnect);
        html.find('input[name="highlightGM"]').change(DiscordMenu._updateHighlightGM);

        // При изменении селектора, обновляем настройки
        html.find('select[name="hostUserId"]').change(DiscordMenu._updateHostUserId);
    }

    static _render(parts = [], fullRender = false) {
        if (fullRender) {
            parts = _getAppParts()
            if (!DiscordMenu?.instance) DiscordMenu.instance = new DiscordMenu();
        } else if (!DiscordMenu?.instance?.rendered) return
        // if (!parts.includes("midBox")) parts.push("midBox")

        DiscordMenu.instance.renderParts = parts
        DiscordMenu.instance.render(true);
    }

    static _connect(event, target) {
        const discordIntegration = game.modules.get(C.ID).discordIntegration;
        if (discordIntegration?.ws?.readyState === WebSocket.OPEN) {
            discordIntegration.disconnect();
        } else {
            discordIntegration.reconnect();
        }
    }
    static async _updateHostUserId(event, target) {
        const value = target?.value || event?.target?.value;
        await requestSettingsWithKeyUpdate('discordHostUserId', value)
        // Диалог-оповещение о том, что изменения вступят в силу только после перезагрузки
        const proceed = await foundry.applications.api.DialogV2.confirm({
            content: game.i18n.localize(`${C.ID}.settings.reloadPromtBody`),
            rejectClose: false,
            modal: true
        });
        if ( proceed ) {
            ui.notifications.info(game.i18n.localize(`${C.ID}.settings.reloading`));
            await new Promise(resolve => setTimeout(resolve, 500));
            location.reload();
        };
    }
    static async _updateChannelId(event, target) {
        const value = target?.value || event?.target?.value;
        await requestSettingsWithKeyUpdate('discordChannelId', value)
    }
    static async _updateUserId(event, target) {
        const value = target?.value || event?.target?.value;
        await requestSettingsWithKeyUpdate('discordUserId', value)
    }
    static async _updateNotifications(event, target) {
        await requestSettingsWithKeyUpdate('discordNotifications', target?.checked || event?.target?.checked)
    }
    static async _updateActivitySync(event, target) {
        await requestSettingsWithKeyUpdate('discordActivitySync', target?.checked || event?.target?.checked)
    }
    static async _updateAutoConnect(event, target) {
        await requestSettingsWithKeyUpdate('discordAutoConnect', target?.checked || event?.target?.checked)
    }
    static async _updateHighlightGM(event, target) {
        await requestSettingsWithKeyUpdate('discordHighlightGM', target?.checked || event?.target?.checked)
    }
    static _discordGuideHint(event, target) {
        new Dialog({
            title: game.i18n.localize(`${C.ID}.dialogues.discordGuideTitle`),
            content: game.settings.get(C.ID, "discordBotLocalization")[game.i18n.lang] || game.settings.get(C.ID, "discordBotLocalization").en,
            buttons: {},
        }).render(true, {width: window.innerWidth*0.70, height: window.innerHeight*0.90})
    }

    static async _addBot(event, target) {
        const channelId = game.settings.get(C.ID, 'discordChannelId');
        if (!channelId) {
            ui.notifications.warn("Пожалуйста, укажите ID канала в настройках");
            return;
        }
        
        if (this.discordIntegration?.ws?.readyState === WebSocket.OPEN) {
            this.discordIntegration.sendMessage({
                type: 'joinVoice',
                channelId: channelId
            });
        } else {
            ui.notifications.warn("Сначала подключитесь к Discord Bridge");
        }
    }

    static async _kickBot(event, target) {
        if (this.discordIntegration?.ws?.readyState === WebSocket.OPEN) {
            this.discordIntegration.sendMessage({
                type: 'leaveVoice'
            });
        } else {
            ui.notifications.warn("Сначала подключитесь к Discord Bridge");
        }
    }

    // Обновление списка пользователей
    updateVoiceUsers() {
        this.render(true);
    }
}

async function requestSettingsWithKeyUpdate(key, value) {
    if (game.user.isGM) {
        await game.settings.set(C.ID, key, value);
    } else {
        game.socket.emit(`module.${C.ID}`, {
            type: 'setSetting',
            data: value,
            key: key
        });
    }
}

// Крюки
// troubleshooting: userConnect, updateSettings, updateUser
// settings: updateSetting
Hooks.on('userConnected', () => {
    DiscordMenu._render(["troubleshooting"])
    VisualNovelDialogues._render(["foreground"])
});
Hooks.on('userDisconnected', () => {
    DiscordMenu._render(["troubleshooting"])
    VisualNovelDialogues._render(["foreground"])
});
Hooks.on('updateUser', (user, changes) => {
    if (changes?.hasOwnProperty('character') || changes?.hasOwnProperty(`flags`)) {
        DiscordMenu._render(["troubleshooting"])
        VisualNovelDialogues._render(["foreground"])
    };
});

Hooks.on('updateSetting', (key, value) => {
    if (["discordChannelId", "discordUserId", "discordNotifications", "discordActivitySync", "discordAutoConnect", "discordHighlightGM"].includes(key)) {
        DiscordMenu._render(["settings", "troubleshooting"]);
    }
});