import { Constants as C, getDefaultPortraitData, getPortrait, getSettings, getTags, updatePortrait } from '../scripts/const.js';
import { ActorPicker } from './actorPicker.js';

export class ActorPickerSub extends FormApplication {
    constructor(portraitId = "") {
        super();
        this.portraitId = portraitId;
    }
    
    static get defaultOptions() {
        const defaults = super.defaultOptions;

        const overrides = {
            classes: ['ap-sub-body'],
            width: 540,
            height: 560,
            resizable: false,
            id: "ActorPickerSub",
            template: `modules/${C.ID}/templates/actorPickerSub.hbs`,
            title: `Actor-picker Settings`,
            userId: game.userId,
            closeOnSubmit: true,
            submitOnChange: false
        };
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
        return mergedOptions;
    }

    getData(options) {
        const portFlags = getPortrait(this.portraitId) || {name: game.actors.get(this.portraitId)?.prototypeToken?.name};
        const settings = getSettings()
        const currentTag = portFlags.tag || null
        // Список Категорий/Папок для выпадающего списка "Папка" - собственная система Actor Picker
        // (settings.actorFolders), не связанная с папками Foundry Actor Directory
        const folderCategories = (settings.actorFolders || []).map(cat => ({
            id: cat.id,
            name: cat.name,
            folders: (cat.folders || []).map(f => ({
                id: f.id,
                name: f.name,
                value: `${cat.id}|${f.id}`,
                selected: currentTag?.[0] === cat.name && currentTag?.[1] === f.name
            }))
        }))
        return { portFlags: portFlags, folderCategories };
    }

    // Кнопки Экспорт/Импорт данных в шапке окна — та же система, что используется в стандартных
    // листах документов Foundry (Actor, Item и т.п.)
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift(
            {
                label: game.i18n.localize(`${C.ID}.actorPickerSub.exportData`),
                class: "aps-export-data",
                icon: "fas fa-file-export",
                onclick: (event) => this._onExportData(event)
            },
            {
                label: game.i18n.localize(`${C.ID}.actorPickerSub.importData`),
                class: "aps-import-data",
                icon: "fas fa-file-import",
                onclick: (event) => this._onImportData(event)
            }
        );
        return buttons;
    }

    // Экспортирует текущие путь к изображению/Имя/Титул/доп. спрайты (с названиями) в скачиваемый JSON-файл (пресет)
    _onExportData(event) {
        event.preventDefault();
        const html = this.element;
        const data = {
            img: html.find('.aps-choose-img').val() || "",
            name: html.find('.aps-text-input.aps-name').val() || "",
            title: html.find('.aps-text-input.aps-title').val() || "",
            sprites: this._collectSprites(html)
        };
        if (!data.name) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.noName`))
            return
        }
        const filename = `vn-portrait-preset-${data.name.slugify({strict: true})}.json`;
        foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
    }

    // Открывает системный диалог выбора файла и подставляет импортированные данные в поля формы
    _onImportData(event) {
        event.preventDefault();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.style.display = "none";
        input.addEventListener("change", async (ev) => {
            const file = ev.target.files[0];
            input.remove();
            if (!file) return;
            let data;
            try {
                const text = await foundry.utils.readTextFromFile(file);
                data = JSON.parse(text);
            } catch (err) {
                console.error(err);
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.invalidJson`));
                return;
            }
            this._applyImportedPreset(data);
        });
        document.body.appendChild(input);
        input.click();
    }

    // Подставляет импортированные значения (img/name/title/sprites) в незасабмиченную форму
    _applyImportedPreset(data) {
        if (!data || typeof data !== "object") {
            ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.invalidJson`));
            return;
        }
        const html = this.element;
        if (typeof data.img === "string") html.find('.aps-choose-img').val(data.img);
        if (typeof data.name === "string") html.find('.aps-text-input.aps-name').val(data.name);
        if (typeof data.title === "string") html.find('.aps-text-input.aps-title').val(data.title);
        if (Array.isArray(data.sprites)) {
            const container = html[0].querySelector('.aps-sprites-container')
            if (container) {
                container.innerHTML = ""
                data.sprites.forEach(s => {
                    const normalized = this._normalizeSprite(s)
                    if (normalized) this._addSpriteRow(container, normalized)
                })
            }
        }
        ui.notifications.info(game.i18n.localize(`${C.ID}.actorPickerSub.importSuccess`));
    }

    // Приводит запись спрайта к единому виду {img, label}. Поддерживает старый формат
    // (просто строка-путь, из версии до добавления "Названия") и новый формат-объект.
    _normalizeSprite(s) {
        if (!s) return null
        if (typeof s === "string") return { img: s, label: "" }
        if (typeof s === "object" && s.img) return { img: s.img, label: s.label || "" }
        return null
    }

    // Создаёт строку дополнительного спрайта (изображение + название + выбор файла + удаление этой строки)
    _addSpriteRow(container, sprite = {}) {
        if (!container) return
        const { img = "", label = "" } = this._normalizeSprite(sprite) || {}
        const row = document.createElement('div')
        row.className = 'form-group aps-sprite-row'
        row.innerHTML = `
            <span class="aps-span">${game.i18n.localize(`${C.ID}.actorPickerSub.spriteLabel`)}</span>
            <div class="form-fields">
                <input class="image aps-choose-sprite" type="text" placeholder="path/image.png">
                <input class="aps-choose-sprite-label" type="text" placeholder="${game.i18n.localize(`${C.ID}.actorPickerSub.spriteNamePlaceholder`)}" title="${game.i18n.localize(`${C.ID}.actorPickerSub.spriteNameTooltip`)}">
                <button type="button" class="aps-sprite-file-picker" title="${game.i18n.localize(`${C.ID}.actorPickerSub.image-button`)}">
                    <i class="fas fa-file-import fa-fw"></i>
                </button>
                <button type="button" class="aps-sprite-delete" title="${game.i18n.localize(`${C.ID}.actorPickerSub.deleteSpriteTooltip`)}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `
        // Значения подставляем отдельно (через .value), а не в HTML-строку - чтобы путь к файлу/название
        // не могли случайно сломать разметку какими-нибудь спецсимволами/кавычками
        row.querySelector('.aps-choose-sprite').value = img
        row.querySelector('.aps-choose-sprite-label').value = label
        container.appendChild(row)
        return row
    }

    // Собирает все текущие строки доп. спрайтов из формы в массив [{img, label}], отбрасывая пустые
    _collectSprites(html) {
        return Array.from(html[0].querySelectorAll('.aps-sprite-row')).map(row => ({
            img: row.querySelector('.aps-choose-sprite')?.value.trim() || "",
            label: row.querySelector('.aps-choose-sprite-label')?.value.trim() || ""
        })).filter(s => s.img)
    }

    activateListeners(html) {
        super.activateListeners(html);
        const _id = this.portraitId || foundry.utils.randomID()

        // --- Дополнительные спрайты ---
        const spritesContainer = html[0].querySelector('.aps-sprites-container')
        const existingSprites = getPortrait(_id)?.sprites || []
        existingSprites.forEach(src => this._addSpriteRow(spritesContainer, src))

        html.find('.aps-add-sprite').on('click', (event) => {
            event.preventDefault()
            this._addSpriteRow(spritesContainer, "")
        })
        // Делегированные обработчики - чтобы работать и со строками, добавленными позже динамически
        html.on('click', '.aps-sprite-delete', (event) => {
            event.preventDefault()
            event.currentTarget.closest('.aps-sprite-row')?.remove()
        })
        html.on('click', '.aps-sprite-file-picker', (event) => {
            event.preventDefault()
            const row = event.currentTarget.closest('.aps-sprite-row')
            const input = row?.querySelector('.aps-choose-sprite')
            if (!input) return
            new FilePicker({classes: ["filepicker"], current: C.portraitFoldersPath(), type: "imagevideo", displayMode: "thumbs", callback: async (image) => {
                if (image) input.value = decodeURI(image).replace(`%2C`, `,`)
            }}).render();
        })
        // --- конец блока дополнительных спрайтов ---

        html.find('.aps-submit-button').on('click', async (event) => {
            const newImg = html[0].querySelector('.aps-choose-img').value
            const _imgIsFine = await srcExists(newImg || "")
            if (!_imgIsFine) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.nonExistImg`))
                return
            } else {
                const actor = game.actors.get(_id)
                // АААААААААААААААААААААААААААААААААААААААААААААААААА сори я пошёл отдохнуть
                const flag = getPortrait(_id) || foundry.utils.mergeObject(getDefaultPortraitData(actor || {id: _id}), {
                    img: newImg,
                    name: html[0].querySelector('.aps-text-input.aps-name').value,
                    title: html[0].querySelector('.aps-text-input.aps-title').value,
                    hasActor: !!actor
                })
                const imgElValue = html[0].querySelector('.aps-choose-img')?.value
                const nameElValue = html[0].querySelector('.aps-text-input.aps-name')?.value
                const titleElValue = html[0].querySelector('.aps-text-input.aps-title')?.value
                const spritesElValues = this._collectSprites(html)
                const folderSelectValue = html[0].querySelector('.aps-folder-select')?.value || ""
                if (imgElValue !== flag.img) flag.img = imgElValue
                if (nameElValue) flag.name = nameElValue
                if (titleElValue) flag.title = titleElValue
                flag.sprites = spritesElValues
                // Переводим выбор catId|folderId обратно в [название категории, название папки] - именно так
                // сейчас хранится и сверяется привязка (flag.tag), совместимо со старым форматом фильтров
                if (!folderSelectValue) {
                    flag.tag = null
                } else {
                    const [catId, folderId] = folderSelectValue.split('|')
                    const cat = getSettings().actorFolders?.find(c => c.id === catId)
                    const folder = cat?.folders.find(f => f.id === folderId)
                    flag.tag = (cat && folder) ? [cat.name, folder.name] : null
                }
                if (!flag.name) {
                    ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.noName`))
                    return
                }
                if (!foundry.utils.objectsEqual(flag, getPortrait(_id) || {})) {
                    if (game.user.isGM || actor?.ownership?.[game.user.id] >= 3) {
                        await updatePortrait(_id, flag)
                        ActorPicker.refresh()
                    } else {
                        ui.notifications.error(game.i18n.localize(`${C.ID}.actorPickerSub.noPermission`))
                        return
                    }
                }
                this.close();
            }
        });
        html.find('.aps-delete-button').on('click', async (event) => {
            const settings = getSettings()
            settings.portraits = settings.portraits.filter(m => m.id != _id)
            await game.settings.set(C.ID, "vnData", settings)
            this.close();
        })
        html.find('.aps-file-picker').on('click', async (event) => {
            const fp = new FilePicker({classes: ["filepicker"], current: C.portraitFoldersPath(), type: "imagevideo", displayMode: "thumbs", callback: async (image) => {
                if (image) {
                    const input = html[0].querySelector('.aps-choose-img')
                    input.value = decodeURI(image).replace(`%2C`, `,`)
                };
            }}).render();
        })
    }

    async _updateObject(event, formData) {
    }
}