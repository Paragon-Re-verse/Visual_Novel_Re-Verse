import { Constants as C } from "./const.js";

export class SlidersSetClass {
    constructor(data = {}) {
        this.id = foundry.utils.randomID()

        this.setName = data.setName || "Classic"
        this.headerImg = data.headerImg || C.headerImg
        this.leftSlider = data.leftSlider || C.leftSlider
        this.rightSlider = data.rightSlider || C.rightSlider
        this.leftSliderBack = data.leftSliderBack || C.leftSliderBack
        this.rightSliderBack = data.rightSliderBack || C.rightSliderBack
    }

    static async addSet(data = {}) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        const setData = new SlidersSetClass(data)
        settings.sliderSets.push(setData)
        await game.settings.set(C.ID, 'style', settings)
        return setData.id
    }

    static async deleteSet(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        settings.sliderSets = settings.sliderSets.filter(s => s.id != id)
        await game.settings.set(C.ID, 'style', settings)
    }

    static async setSet(id) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        const set = settings.sliderSets.some(s => s.id == id)
        if (!set) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.errors.sliderSetNotFound`))
            return
        }
        settings.choosenSliderSet = id
        await game.settings.set(C.ID, 'style', settings)
    }

    static async setDefault() {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        settings.choosenSliderSet = ""
        await game.settings.set(C.ID, 'style', settings)
    }

    static getActiveSet() {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        let set = settings.choosenSliderSet ? settings.sliderSets.find(s => s.id == settings.choosenSliderSet) : null
        if (!set) set = new SlidersSetClass()
        return set
    }

    static async updateSet(id, dataObject) {
        const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'style'))
        let set = settings.sliderSets.find(s => s.id == id)
        if (!set) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.errors.sliderSetNotFound`))
            return
        }
        set = foundry.utils.mergeObject(set, dataObject, {insertKeys: false});
        await game.settings.set(C.ID, 'style', settings)
    }
}