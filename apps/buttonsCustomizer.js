import { Constants as C } from '../scripts/const.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ButtonsCustomizer extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['buttons-customizer-body'],
        id: "ButtonsCustomizerApp",
        position: {width: 720, height: "auto"},
        actions: {
            addButton: ButtonsCustomizer._onAddButton,
            deleteButton: ButtonsCustomizer._onDeleteButton,
            duplicateButton: ButtonsCustomizer._onDuplicateButton,
        },
        window: {
            resizable: true,
        }
    }

    static PARTS = {
        body: {template: `modules/${C.ID}/templates/buttonsCustomizer.hbs`},
    }

    constructor() {
        super();
    }

    get title() {
        return game.i18n.localize(`${C.ID}.buttonsCustomizer.openButton`)
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.parts = ["body"];
    }

    async _prepareContext(options) {
        const buttonList = game.settings.get(C.ID, `buttonsList`).map(el => new DefaultButton(el))
        return { buttons: buttonList, dataActions: DefaultButton.getDataActionList() }
    }

    _onRender(context, options) {
        super._onRender(context, options)
        this.element.querySelectorAll('.vbc-list-item').forEach(itemEl => {
            const id = itemEl.dataset.id
            itemEl.querySelectorAll('[data-key]').forEach(fieldEl => {
                fieldEl.addEventListener('change', async (event) => {
                    const buttonsList = foundry.utils.deepClone(game.settings.get(C.ID, 'buttonsList'))
                    const button = buttonsList.find(b => b.id === id)
                    if (!button) return
                    button[fieldEl.dataset.key] = fieldEl.value
                    await game.settings.set(C.ID, 'buttonsList', buttonsList)
                    this.render()
                })
            })
        })
    }

    static async _onAddButton(event, target) {
        const buttonsList = foundry.utils.deepClone(game.settings.get(C.ID, 'buttonsList'))
        buttonsList.push({...new DefaultButton()})
        await game.settings.set(C.ID, 'buttonsList', buttonsList)
        this.render()
    }

    static async _onDeleteButton(event, target) {
        const id = target.closest('.vbc-list-item')?.dataset.id
        if (!id) return
        const buttonsList = foundry.utils.deepClone(game.settings.get(C.ID, 'buttonsList')).filter(b => b.id !== id)
        await game.settings.set(C.ID, 'buttonsList', buttonsList)
        this.render()
    }

    static async _onDuplicateButton(event, target) {
        const id = target.closest('.vbc-list-item')?.dataset.id
        if (!id) return
        const buttonsList = foundry.utils.deepClone(game.settings.get(C.ID, 'buttonsList'))
        const original = buttonsList.find(b => b.id === id)
        if (!original) return
        buttonsList.push({...original, id: foundry.utils.randomID()})
        await game.settings.set(C.ID, 'buttonsList', buttonsList)
        this.render()
    }
}

export class DefaultButton {
    constructor(data = {}) {
        this.id = data.id || foundry.utils.randomID()
        this.name = data.name || game.i18n.localize(`${C.ID}.buttonsCustomizer.newButton`)
        this.icon = data.icon || "fas fa-circle"
        this.colors = {
            border: data.colors?.border || data.borderColor || "#9f9f9f",
            background: data.colors?.background || data.backgroundColor || "#4c4b4b",
            icon: data.colors?.icon || data.iconColor || "#d9d9d9",
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
        const stored = game.settings.get(C.ID, `buttonsList`).find(b => b.id === id)
        return stored ? new DefaultButton(stored) : null
    }

    static getButtonLoc(key) {
        return game.i18n.localize(`${C.ID}.buttons.${key}`)
    }

    static defauldButtonList = () => [
        {id: "baHideVN", name: DefaultButton.getButtonLoc("hide"), icon: "fas fa-eye-slash", dataAction: "hideVN"},
        {id: "baOpenActorSheet", name: DefaultButton.getButtonLoc("actor"), icon: "fas fa-user", dataAction: "openActorSheet"},
        {id: "baToggleUI", name: DefaultButton.getButtonLoc("hideUI"), icon: "fas fa-tv", dataAction: "toggleUI"},
        {id: "baHideBack", name: DefaultButton.getButtonLoc("hideBack"), icon: "fas fa-image", dataAction: "hideBack"},
        {id: "baDiscordMenu", name: DefaultButton.getButtonLoc("discordMenu"), icon: "fa-brands fa-discord", dataAction: "discordMenu"},
        {id: "baChangeBackground", name: DefaultButton.getButtonLoc("changeBackground"), icon: "fa-arrows-rotate", dataAction: "changeBackground"},
        {id: "baOpenSettingsMenu", name: DefaultButton.getButtonLoc("settings-menu"), icon: "fa-gear", dataAction: "openSettingsMenu"},
        {id: "baToggleEditMode", name: DefaultButton.getButtonLoc("edit"), icon: "fa-wrench", dataAction: "toggleEditMode"},
        {id: "baToggleLinkChanges", name: DefaultButton.getButtonLoc("linkChanges"), icon: "fa-link", dataAction: "toggleLinkChanges"},
        {id: "baResetChanges", name: DefaultButton.getButtonLoc("backup"), icon: "fa-reply-all", dataAction: "resetChanges"},
        {id: "baEpicRolls", name: DefaultButton.getButtonLoc("epicRoll"), icon: "fa-dice", dataAction: "epicRolls"},
        {id: "baMainGuideHint", name: DefaultButton.getButtonLoc("hint"), icon: "fa-question", dataAction: "mainGuideHint", colors: {icon: "#c9ffbc"}},
    ].map(button => foundry.utils.mergeObject(new DefaultButton(), button))
}