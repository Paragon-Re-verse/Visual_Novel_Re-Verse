import { Constants as C, requestSettingsUpdate } from "./const.js";

export class VNLocation {
    constructor(data) {
        this.id = foundry.utils.randomID()

        this.locationName = data.locationName
        this.parentLocation = data.parentLocation || "???"
        this.backgroundImage = data.backgroundImage || C.backgroundPlaceholder()
        this.weather = data.weather || null
        this.temperature = data.temperature || 20
        this.knowTime = data.knowTime || true
        this.locationTags = data.locationTags || []
        this.presets = data.presets || []
        this.scale = data.scale || 100
        // offsetX/offsetY - смещение центра жёлтой рамки от центра картинки (диалог "Масштабирование",
        // apps/locationPicker.js), в долях ширины/высоты картинки (0 = по центру). bgSizeX/Y, bgPosX/Y -
        // готовые background-size/background-position в процентах, разрешённые из scale/offsetX/offsetY
        // ОДИН РАЗ в диалоге на экране ГМа (см. computeFrame там же) - main.js просто копирует их в
        // инлайн-стиль без пересчёта на каждый рендер. null = ещё не масштабировали через новый диалог -
        // рендерится как обычный background-size:cover;background-position:center (styles/module.css).
        this.offsetX = data.offsetX || 0
        this.offsetY = data.offsetY || 0
        this.bgSizeX = data.bgSizeX ?? null
        this.bgSizeY = data.bgSizeY ?? null
        this.bgPosX = data.bgPosX ?? null
        this.bgPosY = data.bgPosY ?? null
    }

    static async delete(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'))
        settings.locationList = settings.locationList.filter(m => m.id != id)
        await requestSettingsUpdate(settings)
    }

    static async updateFilterList(id, filterArray) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'))
        const location = [settings.locationList.find(m => m.id == id)]
        if (settings.location.id == id) {
            location.push(settings.location)
        }
        location.forEach(m => m.locationTags = filterArray)
        await requestSettingsUpdate(settings)
    }

    static getActive() {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'))
        return settings.locationList.find(m => m.id == settings.location.id)
    }
}