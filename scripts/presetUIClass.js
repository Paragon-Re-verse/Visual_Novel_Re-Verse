import { Constants as C } from "./const.js";
import { VisualNovelDialogues } from "./main.js";

export class PresetUIClass {
    constructor(data = {}) {
        this.id = data.id || foundry.utils.randomID()
        this.name = data.name || game.i18n.localize(`${C.ID}.visualSettingsMenu.newPreset`)
        this.hotkey = null

        this.activeElements = {
            // Слайдеры
            headerSlider: true,
            leftSlider: true,
            rightSlider: true,
            // Внутренности заголовка
            locName: true,
            parLocName: true,
            clock: true,
            weather: true,
            temperature: true,
            // Внутренности слайдеров
            leftNameBox: true,
            leftName: true,
            leftTitle: true,
            rightNameBox: true,
            rightName: true,
            rightTitle: true,
            // Кнопки
            hideVN: true,
            openActor: true,
            hideUI: true,
            hideBack: true,
            selector: true,
            playerList: true,
            requestFirst: true,
            requestThird: true
        }
        this.offset = {
            headerSliderX: 0,
            headerSliderY: 0,
            leftSliderX: 0,
            leftSliderY: 62,
            rightSliderX: 0,
            rightSliderY: 62
        },
        this.scale = {
            headerSlider: 100,
            leftSlider: 100,
            rightSlider: 100
        }
        this.masterSlot = {
            left: "first",
            right: "first"
        }
        this.slotCount = {
            left: null,
            right: null
        }
        this.headerSliderEls = [
            {"key": "locName", "active": true, flex: 320},
            {"key": "parLocName", "active": true, flex: 360},
            {"key": "clock", "active": true, flex: 160},
            {"key": "weather", "active": true, flex: 80},
            {"key": "temperature", "active": true, flex: 80}
        ]
    }

    static async addPreset(data = {}) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        const presetData = new PresetUIClass(data)
        settings.presets.push(presetData)
        await game.settings.set(C.ID, 'presetsUI', settings)
        return presetData.id
    }

    static async deletePreset(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        settings.presets = settings.presets.filter(s => s.id != id)
        await game.settings.set(C.ID, 'presetsUI', settings)
    }

    static async setPreset(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        settings.choosenPreset = id
        await game.settings.set(C.ID, 'presetsUI', settings)
        await VisualNovelDialogues._render(null, true, true)
    }

    // static async setDefault() {
    //     const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
    //     settings.choosenPreset = ""
    //     await game.settings.set(C.ID, 'presetsUI', settings)
    // }

    static getActivePreset() {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        let preset = settings.choosenPreset ? settings.presets.find(s => s.id == settings.choosenPreset) : null
        preset = preset ? foundry.utils.mergeObject(new PresetUIClass(), preset, {insertKeys: false}) : new PresetUIClass()
        if (!settings.choosenPreset) settings.choosenPreset = preset.id
        // Если кол-во слотов не установлено - ставим кол-во по умолчанию
        const defaultSlotCount = game.settings.get(C.ID, "slotCount")
        if (!preset.slotCount.left) preset.slotCount.left = defaultSlotCount
        if (!preset.slotCount.right) preset.slotCount.right = defaultSlotCount
        return preset
    }

    static getPreset(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        let preset = settings.presets.find(s => s.id == id)
        preset = preset ? foundry.utils.mergeObject(new PresetUIClass(), preset, {insertKeys: false}) : new PresetUIClass()
        return preset
    }

    static async updatePreset(id, dataObject) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
        let preset = settings.presets.find(s => s.id == id)
        if (!preset) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.errors.presetNotFound`))
            return
        }
        // бля пиздец
        preset = foundry.utils.mergeObject(new PresetUIClass(), preset, {insertKeys: false})
        preset = foundry.utils.mergeObject(preset, dataObject, {insertKeys: false});
        settings.presets = settings.presets.map(p => p.id == id ? preset : p)
        await game.settings.set(C.ID, 'presetsUI', settings)
    }

    // А нахуй оно надо?
    // Ну бля, наверное когда-то понадобится
    // Так всё равно хуйня ведь :/
    // static async updateActivePreset(dataObject) {
    //     const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI'))
    //     let preset = settings.choosenPreset ? settings.presets.find(s => s.id == settings.choosenPreset) : null
    //     preset = preset ? mergeObject(new PresetUIClass(), preset, {insertKeys: false}) : new PresetUIClass()
    //     preset = foundry.utils.mergeObject(preset, dataObject, {insertKeys: false});
    //     if (!settings.choosenPreset) settings.choosenPreset = preset.id
    //     await game.settings.set(C.ID, 'presetsUI', settings)
    // }
}