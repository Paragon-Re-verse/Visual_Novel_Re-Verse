import { Constants as C } from '../scripts/const.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ButtonsCustomizer extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['buttons-customizer-body'],
        id: "ButtonsCustomizerApp",
        actions: {

        },
        window: {

        }
    }

    static PARTS = {
        body: {template: `modules/${C.ID}/templates/buttonsCustomizer.hbs`},
    }

    constructor() {
        super();
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.parts = ["body"];
    }

    async _prepareContext(options) {
        const buttonList = game.settings.get(C.ID, `buttonsList`).map(el => new DefaultButton(el))
        return { buttonList }
    }
}

export class DefaultButton {
    constructor(data) {
        this.id = foundry.utils.randomID()
        this.name = data.name || game.i18n.localize(`${C.ID}.buttonsCustomizer.newButton`)
        this.icon = data.icon || "fas fa-circle"
        this.colors = {
            border: data.borderColor || "#9f9f9f",
            background: data.backgroundColor || "#4c4b4b",
            icon: data.iconColor || "#d9d9d9",
        }
        this.executor = data.executor || "player"       // player или gm
        this.action = data.action || "dataAction"       // command, macros, dataAction
        this.command = data.command || ""               // Команда - буквально выполняемый код
        this.macrosName = data.macrosName || ""         // Название макроса
        this.dataAction = data.dataAction || ""         // Одно из действий приложения VisualNovelDialogues (data-action)
    }

    static getDataActionList() {
        return ["hideVN", "openActorSheet", "toggleUI", "hideBack", "discordMenu", "changeBackground", "openSettingsMenu", "toggleEditMode", "toggleLinkChanges", "resetChanges", "epicRolls", "effectsWindow", "mainGuideHint", "openActorPicker", "editWindowHint", "locationClick", "deletePortraitFromOrder", "createRequest", "requestClick"]
    }

    static getButton(id) {
        return foundry.utils.mergeObject(new DefaultButton(), (game.settings.get(C.ID, `buttonsList`)[id]))
    }

    static getButtonLoc(key) {
        return game.i18n.localize(`${C.ID}.buttons.${id}`)
    }
    
    static defauldButtonList = () => [
        {id: "baHideVN", name: getButtonLoc("hide"), icon: "fas fa-eye-slash", dataAction: "hideVN"},
        {id: "baOpenActorSheet", name: getButtonLoc("actor"), icon: "fas fa-user", dataAction: "openActorSheet"},  
        {id: "baToggleUI", name: getButtonLoc("hideUI"), icon: "fas fa-tv", dataAction: "toggleUI"},
        {id: "baHideBack", name: getButtonLoc("hideBack"), icon: "fas fa-image", dataAction: "hideBack"},
        {id: "baDiscordMenu", name: getButtonLoc("discordMenu"), icon: "fa-brands fa-discord", dataAction: "discordMenu"},
        {id: "baChangeBackground", name: getButtonLoc("changeBackground"), icon: "fa-arrows-rotate", dataAction: "changeBackground"},
        {id: "baOpenSettingsMenu", name: getButtonLoc("settings-menu"), icon: "fa-gear", dataAction: "openSettingsMenu"},
        {id: "baToggleEditMode", name: getButtonLoc("edit"), icon: "fa-wrench", dataAction: "toggleEditMode"},
        {id: "baToggleLinkChanges", name: getButtonLoc("linkChanges"), icon: "fa-link", dataAction: "toggleLinkChanges"},
        {id: "baResetChanges", name: getButtonLoc("backup"), icon: "fa-reply-all", dataAction: "resetChanges"},
        {id: "baEpicRolls", name: getButtonLoc("epicRoll"), icon: "fa-dice", dataAction: "epicRolls"},
        // +Lancer Communicator
        {id: "baMainGuideHint", name: getButtonLoc("hint"), icon: "fa-question", dataAction: "mainGuideHint", colors: {icon: "#c9ffbc"}},
    ].map(button => foundry.utils.mergeObject(new DefaultButton(), button))

    static defaultButtonLocations = () => {

    }
}