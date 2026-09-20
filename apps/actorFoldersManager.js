import { Constants as C, getSettings, requestSettingsUpdate } from '../scripts/const.js';
import { ActorPicker } from './actorPicker.js';

// Окно управления собственными Категориями/Папками Actor Picker.
// В отличие от старой системы, эти Категории/Папки НЕ связаны с папками Foundry Actor Directory -
// это отдельная структура (settings.actorFolders), которую Мастер игры наполняет вручную.
export class ActorFoldersManager extends FormApplication {
    static instance = null

    static get defaultOptions() {
        const defaults = super.defaultOptions;
        const overrides = {
            classes: ['afm-body'],
            width: 420,
            height: 560,
            resizable: true,
            id: "ActorFoldersManager",
            template: `modules/${C.ID}/templates/actorFoldersManager.hbs`,
            title: game.i18n.localize(`${C.ID}.actorFoldersManager.title`),
            userId: game.userId,
            closeOnSubmit: false,
            submitOnChange: false
        };
        return foundry.utils.mergeObject(defaults, overrides);
    }

    getData(options) {
        const settings = getSettings()
        // Категория -> список Папок -> список Портретов, привязанных к каждой Папке (по имени, через tag: [catName, folderName])
        const categories = (settings.actorFolders || []).map(cat => ({
            id: cat.id,
            name: cat.name,
            folders: (cat.folders || []).map(f => ({
                id: f.id,
                name: f.name,
                actors: settings.portraits.filter(p => p?.tag?.[0] === cat.name && p?.tag?.[1] === f.name)
            }))
        }))
        return { categories }
    }

    // Простой промпт для ввода/переименования названия (Категории или Папки)
    async _promptName(defaultValue = "") {
        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize(`${C.ID}.actorFoldersManager.namePromptTitle`),
                content: `<div class="form-group"><input type="text" class="afm-prompt-input" style="width:100%;"/></div>`,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize(`${C.ID}.buttons.confirm`),
                        callback: (html) => resolve(html.find('.afm-prompt-input').val())
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize(`${C.ID}.dialogue.cancel`),
                        callback: () => resolve(null)
                    }
                },
                default: "ok",
                render: (html) => {
                    // Значение подставляем отдельно, а не в HTML-строку - чтобы название с кавычками/спецсимволами
                    // не могло случайно сломать разметку
                    const input = html.find('.afm-prompt-input')
                    input.val(defaultValue)
                    input[0]?.focus()
                    input[0]?.select()
                },
                close: () => resolve(null)
            }).render(true)
        })
    }

    async _confirmDelete(titleKey, contentKey) {
        return Dialog.confirm({
            title: game.i18n.localize(`${C.ID}.actorFoldersManager.${titleKey}`),
            content: `<p>${game.i18n.localize(`${C.ID}.actorFoldersManager.${contentKey}`)}</p>`,
        })
    }

    // Общий хвост после любого изменения: сохранить, перерисовать себя и обновить список в Actor Picker
    async _persist(settings) {
        await requestSettingsUpdate(settings)
        this.render(false)
        ActorPicker.refresh()
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- Добавить категорию ---
        html.find('.afm-add-category').on('click', async (event) => {
            event.preventDefault()
            const input = html[0].querySelector('.afm-new-category-input')
            const name = input.value.trim()
            if (!name) return
            const settings = getSettings()
            settings.actorFolders = settings.actorFolders || []
            if (settings.actorFolders.some(c => c.name === name)) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorFoldersManager.duplicateCategory`))
                return
            }
            settings.actorFolders.push({ id: foundry.utils.randomID(), name, folders: [] })
            input.value = ""
            await this._persist(settings)
        })
        html.find('.afm-new-category-input').on('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); html.find('.afm-add-category').trigger('click') }
        })

        // --- Переименовать категорию ---
        html.on('click', '.afm-rename-category', async (event) => {
            event.preventDefault()
            const catId = event.currentTarget.closest('.afm-category').dataset.catId
            const settings = getSettings()
            const cat = settings.actorFolders.find(c => c.id === catId)
            if (!cat) return
            const newName = (await this._promptName(cat.name))?.trim()
            if (!newName || newName === cat.name) return
            if (settings.actorFolders.some(c => c.id !== catId && c.name === newName)) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorFoldersManager.duplicateCategory`))
                return
            }
            // Обновляем привязку у всех портретов этой категории, чтобы не потерять их фильтрацию
            settings.portraits.forEach(p => { if (p?.tag?.[0] === cat.name) p.tag[0] = newName })
            cat.name = newName
            await this._persist(settings)
        })

        // --- Удалить категорию ---
        html.on('click', '.afm-delete-category', async (event) => {
            event.preventDefault()
            const catId = event.currentTarget.closest('.afm-category').dataset.catId
            if (!await this._confirmDelete('deleteCategoryTitle', 'deleteCategoryContent')) return
            const settings = getSettings()
            const cat = settings.actorFolders.find(c => c.id === catId)
            if (!cat) return
            // Снимаем привязку у портретов, которые были в этой категории (сам Портрет НЕ удаляется)
            settings.portraits.forEach(p => { if (p?.tag?.[0] === cat.name) p.tag = null })
            settings.actorFolders = settings.actorFolders.filter(c => c.id !== catId)
            await this._persist(settings)
        })

        // --- Добавить папку в категорию ---
        html.on('click', '.afm-add-folder', async (event) => {
            event.preventDefault()
            const catId = event.currentTarget.closest('.afm-category').dataset.catId
            const name = (await this._promptName(""))?.trim()
            if (!name) return
            const settings = getSettings()
            const cat = settings.actorFolders.find(c => c.id === catId)
            if (!cat) return
            cat.folders = cat.folders || []
            if (cat.folders.some(f => f.name === name)) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorFoldersManager.duplicateFolder`))
                return
            }
            cat.folders.push({ id: foundry.utils.randomID(), name })
            await this._persist(settings)
        })

        // --- Переименовать папку ---
        html.on('click', '.afm-rename-folder', async (event) => {
            event.preventDefault()
            const row = event.currentTarget.closest('.afm-folder')
            const catId = row.closest('.afm-category').dataset.catId
            const folderId = row.dataset.folderId
            const settings = getSettings()
            const cat = settings.actorFolders.find(c => c.id === catId)
            const folder = cat?.folders.find(f => f.id === folderId)
            if (!folder) return
            const newName = (await this._promptName(folder.name))?.trim()
            if (!newName || newName === folder.name) return
            if (cat.folders.some(f => f.id !== folderId && f.name === newName)) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorFoldersManager.duplicateFolder`))
                return
            }
            settings.portraits.forEach(p => {
                if (p?.tag?.[0] === cat.name && p?.tag?.[1] === folder.name) p.tag[1] = newName
            })
            folder.name = newName
            await this._persist(settings)
        })

        // --- Удалить папку ---
        html.on('click', '.afm-delete-folder', async (event) => {
            event.preventDefault()
            const row = event.currentTarget.closest('.afm-folder')
            const catId = row.closest('.afm-category').dataset.catId
            const folderId = row.dataset.folderId
            if (!await this._confirmDelete('deleteFolderTitle', 'deleteFolderContent')) return
            const settings = getSettings()
            const cat = settings.actorFolders.find(c => c.id === catId)
            if (!cat) return
            const folder = cat.folders.find(f => f.id === folderId)
            if (!folder) return
            settings.portraits.forEach(p => {
                if (p?.tag?.[0] === cat.name && p?.tag?.[1] === folder.name) p.tag = null
            })
            cat.folders = cat.folders.filter(f => f.id !== folderId)
            await this._persist(settings)
        })

        // --- Свернуть/развернуть папку (показать список Портретов внутри) ---
        html.on('click', '.afm-folder-header', (event) => {
            if (["afm-rename-folder", "afm-delete-folder"].some(cls => event.target.closest(`.${cls}`))) return
            event.currentTarget.closest('.afm-folder')?.classList.toggle('afm-folder-open')
        })

        // --- Убрать Актёра из папки (снимает привязку, сам Портрет не удаляется) ---
        html.on('click', '.afm-remove-actor', async (event) => {
            event.preventDefault()
            const actorId = event.currentTarget.closest('.afm-actor-row').dataset.id
            const settings = getSettings()
            const portrait = settings.portraits.find(p => p.id === actorId)
            if (!portrait) return
            portrait.tag = null
            await this._persist(settings)
        })
    }

    async _updateObject(event, formData) {
    }
}
