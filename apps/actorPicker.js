import { Constants as C, getSettings, getTags, getPortrait, updatePortrait, getEmptyActiveSpeakers, requestSettingsUpdate, getDefaultPortraitData } from '../scripts/const.js';
import { VisualNovelDialogues } from '../scripts/main.js';
import { PresetUIClass } from '../scripts/presetUIClass.js';
import { ActorPickerSub } from './actorPickerSub.js';
import { ActorFoldersManager } from './actorFoldersManager.js';

export class ActorPicker extends FormApplication {
    static instance = null;
    constructor(isDrag = true, changedPosition = null) {
        super();
        this.activeFilters = []
        this.isDrag = isDrag
        this.changedPosition = changedPosition
    }

    static get defaultOptions() {
        const defaults = super.defaultOptions;

        const overrides = {
            classes: ['vn-actor-picker'],
            width: 625,
            height: 750,
            resizable: false,
            id: "ActorPicker",
            template: `modules/${C.ID}/templates/actorPicker.hbs`,
            title: `Actor Picker`,
            userId: game.userId,
            closeOnSubmit: false,
            submitOnChange: false,
            scrollY: ['.ac-actor-list'],
            classes: ['z-index-1600'],
            dragDrop: [
                {
                    dragSelector: '.ac-actor-list li'
                },
                {
                    dragSelector: '.vn-ac-slot',
                },
            ]
        };
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
        return mergedOptions;
    }

    #onKeyDown;
    #onKeyUp;

    async getData(options) {
        const settingData = getSettings()

        let data = {
            highlightEl: settingData.editActiveSpeaker,
            portraits: settingData.portraits || [],
        }
        data.portraits.sort((a, b) => a.name.localeCompare(b.name))

        // Проверка наполненности activeSpeakers
        const uiData = PresetUIClass.getActivePreset()
        const defaultSlotCount = game.settings.get(C.ID, "slotCount")
        if (!uiData.slotCount.left) uiData.slotCount.left = defaultSlotCount
        if (!uiData.slotCount.right) uiData.slotCount.right = defaultSlotCount
        const _empty = getEmptyActiveSpeakers();
        settingData.activeSpeakers = foundry.utils.mergeObject(settingData.activeSpeakers, _empty, {overwrite: false});
        // Активные слоты
        /*
        data.activeSpeakers = Object.keys(settingData.activeSpeakers).reduce((acc, current) => {
            const posParts = current?.split(/(?=[A-Z])/)
            const index = numbersArr(posParts[1])
            if (!index || index == "null") return acc
            if (index <= uiData.slotCount[posParts[0]]) {
                acc[posParts[0]][index-1] = {...settingData.activeSpeakers[current], pos: current}
            }
            return acc
        }, {"left": [], "right": [], "center": []})
        */
        const numArray = C.numArray
        data.activeSpeakers = ["left", "right"/*, "center"*/].reduce((acc, side) => {
            acc[side] = numArray.slice(0, uiData.slotCount[side]).map(index => {return{...settingData.activeSpeakers[`${side}${index}`], pos: `${side}${index}`}})
            if (side == "right") acc[side].reverse()
            return acc
        }, {"left": [], "right": []/*, "center": []*/})
        
        // Категории/Папки теперь собственные для Actor Picker (settingData.actorFolders), управляются через
        // отдельное окно (ActorFoldersManager), а не выводятся автоматически из папок Foundry Actor Directory
        data.filters = [
            {
                name: game.i18n.localize(`${C.ID}.actorPicker.generarFilter`), 
                list: [{name: game.i18n.localize(`${C.ID}.actorPicker.npcFilter`), id: foundry.utils.randomID()}, {name: game.i18n.localize(`${C.ID}.actorPicker.onScene`), id: foundry.utils.randomID()}]
            },
            ...(settingData.actorFolders || []).map(cat => ({
                name: cat.name,
                list: (cat.folders || []).map(f => ({name: f.name, id: f.id}))
            }))
        ]

        return { ...data };
    }

    _filterActors(html) {
        const filterText = html[0].querySelector('.ac-search-input').value
        // ВАЖНО: у чекбокса фильтра берём и Категорию (data-cat), и имя Папки (data-name).
        // Раньше сравнивалось только имя Папки, поэтому одинаково названные Папки в РАЗНЫХ
        // Категориях считались одним и тем же фильтром, и в списке "утекали" персонажи
        // из другой (ранее созданной) Категории с такой же Папкой.
        const filterList = Array.from(html[0].querySelectorAll('.ac-filter-option input:checked')).map((element) => ({
            cat: element.getAttribute('data-cat') || "",
            name: element.getAttribute('data-name') || ""
        }))
        const settings = getSettings()
        const filterIsEmpty = filterText == "" && filterList.length == 0
        const generalFilterCat = game.i18n.localize(`${C.ID}.actorPicker.generarFilter`)
        const filteredIds = filterIsEmpty ? settings.portraits.map(p => p.id) : settings.portraits.reduce((acc, current) => {
            if (filterText && current.name.toLowerCase().includes(filterText.toLowerCase())) {
                acc.push(current)
            }
            if (filterList.length > 0) {
                // Тег портрета - это [Категория, Папка], поэтому и сравнивать нужно пару целиком
                let filterTags = current.tag?.[1] ? [{ cat: current.tag[0] || "", name: current.tag[1] }] : []
                // if (actor.type == "npc") filterTags.push({ cat: generalFilterCat, name: "НПС" })
                if (canvas.tokens.placeables.map(t => t.actor?.id).includes(current?.id)) filterTags.push({ cat: generalFilterCat, name: game.i18n.localize(`${C.ID}.actorPicker.onScene`) })
                if (filterList.every(sel => filterTags.some(tag => tag.cat === sel.cat && tag.name === sel.name))) acc.push(current)
            }
            return acc
        }, []).map(p => p.id)
        html[0].querySelectorAll('.ac-actor-list li').forEach(element => {
            element.style = `display: ${filteredIds.includes(element.dataset.id) ? 'flex' : 'none'};`
        })
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Установка портрета на выбранный слот при клике ЛКМ
        html.find('.ac-actor-list li').on('click', async (event) => {
            if (["ac-open-button", "ac-edit-button", "ac-delete-button"].includes(event.target.classList[0])) return
            const actorData = getPortrait(event.currentTarget.dataset.id)
            if (actorData) {
                const settings = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'))
                if (event.altKey) {
                    actorData.hideName = true
                    actorData.hideTitle = true
                }
                settings.activeSpeakers[settings.editActiveSpeaker] = actorData
                await requestSettingsUpdate(settings, {renderData: {renderParts: [`${settings.editActiveSpeaker}Portrait`, "foreground"]}})
            }
        })
        // Кнопка открытия листа связанного персонажа
        html.find('.ac-open-button')?.on('click', async (event) => {
            const sheet = game.actors.get(event.currentTarget.parentElement.parentElement.dataset.id)?.sheet
            if (sheet) sheet.render(true)
        })
        // Кнопка редактирования портрета
        html.find('.ac-edit-button')?.on('click', async (event) => {
            const portraitData = getPortrait(event.currentTarget.parentElement.parentElement.dataset.id)
            new ActorPickerSub(portraitData.id).render(true)
        })
        // Кнопка удаления портрета
        html.find('.ac-delete-button')?.on('click', async (event) => {
            const settingData = getSettings()
            const id = event.currentTarget.parentElement.parentElement.dataset.id
            if (settingData.portraits.some(p => p.id == id)) {
                settingData.portraits = settingData.portraits.filter(p => p.id != id)
                await requestSettingsUpdate(settingData)
                ActorPicker.refresh()
            } else {
                ui.notifications.error(game.i18n.localize(`${C.ID}.errors.portraitNotFound`));
            }
        })
        // Поиск по тексту
        html.find('.ac-search-input').on('keyup', async (event) => {
            this._filterActors(html)
        })
        html.find('.ac-search-input').on('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
            }
        });
        // Очистка поля для ввода при клике ПКМ
        html.find('.ac-search-input').on('contextmenu', (event) => {
            event.preventDefault();
            event.currentTarget.value = ""
            this._filterActors(html)
        })
        // Поиск по фильтрам
        html.find('.ac-filter-option input').on('change', (event) => {
            this._filterActors(html)
        })
        // Смена редактируемого актёра / выбор пустого слота как цели для установки нового актёра
        // (клик по актёру в списке справа поставит его именно в этот слот - альтернатива drag&drop)
        html.find('.vn-ac-slot').on('click', async (event) => {
            const settingData = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'));
            const pos = event.currentTarget.dataset.pos
            settingData.editActiveSpeaker = pos
            const imgElements = Array.from(html.find('.vn-ac-slot'))
            imgElements.forEach(element => {
                if (element.dataset.pos == settingData.editActiveSpeaker) {
                    element.classList.add('vn-hlight')
                } else {
                    element.classList.remove('vn-hlight')
                }
            })
            await requestSettingsUpdate(settingData, {renderData: {renderParts: [`${pos}Portrait`]}})
        })
        // Удаление актёра из списка спикеров при клике ПКМ
        html.find('.vn-ac-slot').on('contextmenu', async (event) => {
            event.preventDefault();
            const pos = event.currentTarget.dataset.pos
            const settingData = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'));
            settingData.activeSpeakers[pos] = null
            await requestSettingsUpdate(settingData, {renderData: {renderParts: [`${pos}Portrait`, "foreground"]}})
        })
        // Изменение иконки при наведении на глаз
        html.find('.ac-stealth-extButton').on('mouseover', async (event) => {
            event.currentTarget.querySelector('.ac-eye').style.display = 'none'
            event.currentTarget.querySelector('.ac-question').style.display = 'block'
        })
        html.find('.ac-stealth-extButton').on('mouseout', async (event) => {
            event.currentTarget.querySelector('.ac-eye').style.display = 'block'
            event.currentTarget.querySelector('.ac-question').style.display = 'none'
        })
        // Открытие подсказки по скрытому переносу
        html.find('.ac-stealth-extButton').on('click', async (event) => {
            new Dialog({
                title: game.i18n.localize(`${C.ID}.dialogues.stealthPickerTitle`),
                content: `
                    <p>${game.i18n.localize(`${C.ID}.dialogues.stealthPickerContent1`)}</p>
                    <p>${game.i18n.localize(`${C.ID}.dialogues.stealthPickerContent2`)}</p>
                `,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize(`${C.ID}.dialogues.close`),
                    }
                },
                default: "ok",
                close: () => {}
            }).render(true)
        })
        // Изменение иконки скрытого переноса при зажатии alt
        if ( !this.#onKeyDown ) {
            this.#onKeyDown = this._onKeyDown.bind(this);
            document.addEventListener("keydown", this.#onKeyDown);
        }
        if ( !this.#onKeyUp ) {
            this.#onKeyUp = this._onKeyUp.bind(this);
            document.addEventListener("keyup", this.#onKeyUp);
        }
    }

    _onKeyDown(event) {
        if (event.key === "Alt") {
            document.getElementById('ActorPicker').querySelector('.ac-eye').className = 'ac-eye fas fa-eye-slash'
        }
    }

    _onKeyUp(event) {
        if (event.key === "Alt") {
            document.getElementById('ActorPicker').querySelector('.ac-eye').className = 'ac-eye fas fa-eye'
        }
    }

    async close(options={}) {
        if ( this.#onKeyDown ) {
            document.removeEventListener("keydown", this.#onKeyDown);
            this.#onKeyDown = undefined;
        }
        if ( this.#onKeyUp ) {
            document.removeEventListener("keyup", this.#onKeyUp);
            this.#onKeyUp = undefined;
        }
        return super.close(options);
    }

    static open(isDrag = true, changedPosition = null) {

        if (!this.instance) {
            this.instance = new ActorPicker(isDrag, changedPosition);
        }

        if (!this.instance.rendered) {
            this.instance.isDrag = isDrag
            this.instance.changedPosition = changedPosition
            this.instance.render(true);
        } else {
            this.instance.bringToTop();
        }
    }

    static close() {
        if (this.instance) {
            this.instance.close();
        }
    }

    static async refresh() {
        await this.instance?.render();
    }

    async _updateObject(event, formData) {
    }

    _onDragStart(event) {
        const img = $(event.currentTarget);
        const actorId = img[0].dataset.id
        if (!actorId) return false
        let actorFlags = getPortrait(actorId)
        if (actorFlags) {
            if (event.altKey) {
                actorFlags.hideName = true
                actorFlags.hideTitle = true
            }
            event.dataTransfer.setData("text/plain", JSON.stringify({
                type: "PortraitData",
                portraitSlot: img[0].dataset.pos,
                portraitData: actorFlags
            }))
        };
    }

    async _onDrop(event) {
        const actorData = event.dataTransfer.getData('text/plain');
        if (!actorData || actorData === "") return
        let transferData = JSON.parse(actorData)
        if (!transferData) return

        const settings = getSettings()
        if (transferData.type == "Actor") {
            const id = transferData.uuid?.split(".")?.pop() || ""
            const portraitData = getActivePortrait(id) || getPortrait(id)
            if (portraitData) {
                transferData = {
                    type: "PortraitData",
                    portraitSlot: transferData.portraitSlot,
                    portraitData: portraitData
                }
            } else {
                return
            }
        }
        if (transferData.type != "PortraitData") return

        // Аналогично с EditWindow - я потом сделаю по-человечески и без "или" элемента в if снизу. Наверное.
        //      Комментарий спустя три месяца после прошлого: не сделаю.
        if (event.target?.classList?.contains("vn-ac-slot") || event.target?.parentElement?.classList?.contains("vn-ac-slot")) {
            let renderParts = [`${event.target.dataset.pos}Portrait`]
            if (transferData.portraitSlot) {
                settings.activeSpeakers[transferData.portraitSlot] = getPortrait(event.target.parentElement.dataset.id, settings) || null
                renderParts.push(`${transferData.portraitSlot}Portrait`)
            }
            if (event.altKey) {
                transferData.portraitData.hideName = true
                transferData.portraitData.hideTitle = true
            }
            settings.activeSpeakers[event.target.dataset.pos] = transferData.portraitData
            await requestSettingsUpdate(settings, {renderData: {renderParts}})
        } else {
            return false
        }
    }
}

export async function openMassPortraitCreator() {
    const autoMakerData = await portraitAutoMaker(null, true)
    new Dialog({
        title: game.i18n.localize(`${C.ID}.portraitsMaker.multiCreateButton`),
        content: `
            <p>${game.i18n.localize(`${C.ID}.portraitsMaker.multiCreateContent0`)}</p>
            <p>${game.i18n.localize(`${C.ID}.portraitsMaker.multiCreateContent1`)} <b>${autoMakerData.updateData.length}</b> ${game.i18n.localize(`${C.ID}.portraitsMaker.multiCreateContent2`)}</p>
        `,
        buttons: {
            ok: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize(`${C.ID}.buttons.confirm`),
                callback: async () => {
                    await requestSettingsUpdate(autoMakerData.newSettings)
                }
            }
        },
        default: "ok",
        close: () => {}
    }).render(true)
}

// forceUpdate нужен для обновления portraitData актёра, но пока что не используется. Потом подумаю как реализовать по-человечески
async function portraitAutoMaker(_actors = null, returnData = false, forceupdate = false) {
    if (!_actors || !Array.isArray(_actors)) _actors = Array.from(game.actors.values())

    const settings = getSettings()
    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"))

    // Отсеиваем актёров у которых уже есть Портрет и стопаем функцию если массив пуст
    if (!forceupdate) _actors = _actors.filter(a => !settings.portraits.some(p => p.id == a.id))
    if (!_actors.length) {
        if (returnData) return {updateData: [], newSettings: settings}
        else return
    }

    // Изображение актёра/токена по умолчанию
    const defaultImage = Actor.implementation.getDefaultArtwork({type: "someActorType"}).img

    // Чтобы при массовом создании Портретов не вызывать "await FilePicker.browse()" для каждого актёра
    let filesBuffer = {defaultFolder: null, tokenImageFolder: null, actorImageFolder: null, folderOnPathEverywhere: {}, folderOnPath: {}}
    // Данные автосоздания
    let updateData = []
    // Сокрытые типы персонажей (для них не создаются Портреты)
    const hiddenTypes = game.settings.get(C.ID, "hiddenTypes")
    // Ищем картиночки
    for (const actor of _actors) {
        const type = actor.type
        const actorPortraitSettings = autoPortraitSettings[type]
        // Если настроек для этого типа актёра нету - скип
        if (!actorPortraitSettings || hiddenTypes.includes(type)) continue

        let portraitData = getDefaultPortraitData(actor)
        
        const useImageRule = actorPortraitSettings.generalRules.useImage
        if (useImageRule == "tokenImage") {
            portraitData.img = actor.prototypeToken.texture.src
        } else if (useImageRule == "actorImage") {
            portraitData.img = actor.img
        } else {
            // Автопоиск изображения
            const searchConditions = actorPortraitSettings.searchConditions
            let _img = null
            for (const filter of searchConditions) {
                // Ищем все файлы в папке
                const filePlaceFilter = filter.filePlace
                let files = (filePlaceFilter == "folderOnPath") ? filesBuffer.folderOnPath[filter.folderPath] 
                    : (filePlaceFilter == "folderOnPathEverywhere") ? filesBuffer.folderOnPathEverywhere[filter.folderPath]
                    : filesBuffer[filePlaceFilter]

                if (!files || !files.length) {
                    const folder = filePlaceFilter == "defaultFolder" ? C.portraitFoldersPath() 
                        : filePlaceFilter == "tokenImageFolder" ? actor.prototypeToken.texture.src.replace(/\/[^\/]*$/, '')
                        : filePlaceFilter == "actorImageFolder" ? actor.img.replace(/\/[^\/]*$/, '')
                        : filePlaceFilter == "folderOnPathEverywhere" ? filter.folderPath
                        : filePlaceFilter == "folderOnPath" ? filter.folderPath
                        : ""
                    files = await searchFiles(folder, ["folderOnPathEverywhere", "foundryEverywhere"].includes(filePlaceFilter))
                }

                if (!files?.length) continue
                if (filePlaceFilter == "folderOnPathEverywhere") {
                    filesBuffer.folderOnPathEverywhere[filter.folderPath] = files
                } else if (filePlaceFilter == "folderOnPath") {
                    filesBuffer.folderOnPath[filter.folderPath] = files
                } else {
                    filesBuffer[filePlaceFilter] = files
                }
                // Фильтруем по расширению
                if (filter.chosenExt != "any") {
                    const extentions = filter.customExtension.split("/").map(item => item.trim())
                    files = files.filter(f => extentions.some(e => f.endsWith(e)))
                }
                if (!files?.length) continue
                // Переводим в нормальные символы
                files = files.map(f => decodeURI(f))
                // Ищем по имени
                const nameCompare = filter.nameCompare
                const vars = {
                    tokenName: decodeURI(actor.prototypeToken.name),
                    actorName: decodeURI(actor.name),
                    tokenFileName: decodeURI(actor.prototypeToken.texture.src).replace(/\.[^/.]+$/, "").split("/").pop(),
                    actorFileName: decodeURI(actor.img).replace(/\.[^/.]+$/, "").split("/").pop(),
                    any: ".*"
                }
                _img = findMatchingFile(filter.fileName, files, vars, nameCompare) || null
                if (_img) break
            }
            portraitData.img = _img
        }

        if (!portraitData.img) {
            if (useImageRule == "searchImage") {
                // Если выбран автопоиск и изображение не найдено
                const afterRule = actorPortraitSettings.generalRules.afterRule
                if (afterRule == "useTokenImage") {
                    portraitData.img = actor.prototypeToken.texture.src
                } else if (afterRule == "useActorImage") {
                    portraitData.img = actor.img
                } else continue
            } else continue
        }
    
        if (portraitData.img && portraitData.img != defaultImage) {
            settings.portraits.push(portraitData)
            updateData.push({name: portraitData.name, portrait: portraitData.img, type: type})
        }

        console.log("Портрет создан")
    }
    console.log("Завершение")
    if (returnData) {
        return {newSettings: settings, updateData: updateData}
    } else {
        await requestSettingsUpdate(settings)
    }
}

async function searchFiles(folderPath, deepSearch = false) {
    const fpData = await FilePicker.browse("data", folderPath)
    let _files = fpData.files
    if (deepSearch) {
        for (const dir of fpData.dirs) {
            _files.push(...(await searchFiles(dir, deepSearch)))
        }
    }
    return _files
}

function findMatchingFile(searchString, filePaths, variables, nameCompare) {
    const regex = /\{(\w+)\}/g;
    const processedSearchString = searchString.replace(regex, (match, varName) => {
        return variables[varName] !== undefined ? variables[varName] : '.*';
    });
    
    return filePaths.find(filePath => {
        const fileName = filePath.split('/').pop().split('.').shift();
        if (nameCompare === "equals") {
            return processedSearchString == fileName;
        } else if (nameCompare === "inputInName") {
            return fileName.includes(processedSearchString)
        } else if (nameCompare === "nameInInput") {
            return processedSearchString.includes(fileName); 
        }
    });
}

// И сидит блять
// Не используется, но сидит
/*
async function fullPortraitsCheck(_actors = null) {
    let allPortraits = await FilePicker.browse("data", C.portraitFoldersPath())
    allPortraits = allPortraits.files.map(f => decodeURI(f).replace(`%2C`, `,`).replace(`${C.portraitFoldersPath()}/`, ``)).sort((a, b) => b.length - a.length)
    const actors = _actors || game.actors.contents
    let settings = getSettings()
    const useTokenForPortraits = game.settings.get(C.ID, "useTokenForPortraits")
    const getImg = (actor) => {
        if (useTokenForPortraits) {
            const img = actor.prototypeToken.texture.src
            return (img && img != "icons/svg/mystery-man.svg") ? img : null
        } else {
            let img = allPortraits.find(n => actor.prototypeToken.name.toLowerCase().includes(n.toLowerCase().replace(/.[^/.]+$/, '')))
            img = img ? `${C.portraitFoldersPath()}/${img}` : null
            return img
        }
    }
    // Проходимся по всем актёрам
    for (let i = 0; i < actors.length; i++) {
        console.log(game.i18n.localize(`${C.ID}.actorPicker.checkingActor`), actors[i].name)
        const actor = actors[i]
        let flag = getPortrait(actor.id, settings)

        // Миграция со старой системы хранения данных портретов
        const _oldFlag = foundry.utils.deepClone(actor.getFlag(C.ID, "portraitData"))
        if (_oldFlag) {
            flag = _oldFlag
            await actor.unsetFlag(C.ID, "portraitData")
        }

        if (flag == "lockChange") continue
        if (!flag) {    // Если флага нету, ищем подходящий портрет, и при наличии такового - устанавливаем флаги
            const portraitPath = getImg(actor)
            if (portraitPath) {
                flag = {
                    img: portraitPath,
                    name: actor.prototypeToken.name,
                    title: "",
                    tag: null,
                    id: actor.id,
                    scale: 100,
                    offsetXl: 0,
                    offsetXr: 0,
                    offsetY: 0,
                    hasActor: true
                }
                settings.portraits.push(flag)
            }
        } else {        // Если флаг есть, проверяем данные портрета
            let _img = flag.img
            const _imgIsFine = await srcExists(_img || "")
            console.log("_imgIsFine", _imgIsFine)
            if (!_imgIsFine) _img = getImg(actor)
            if (!_img || _img == `${C.portraitFoldersPath()}/`) {
                settings.portraits = settings.portraits.filter(f => f.id !== actor.id)
                continue
            } else {
                const newFlag = {
                    img: _img,
                    name: flag.name || actor.prototypeToken.name,
                    title: flag.title || "",
                    tag: flag.tag || null,
                    id: actor.id,
                    scale: flag.scale || 100,
                    offsetXl: flag.offsetXl || 0,
                    offsetXr: flag.offsetXr || 0,
                    offsetY: flag.offsetY || 0,
                    hasActor: true
                }
                if (_oldFlag || !foundry.utils.objectsEqual(flag, newFlag)) {
                    const _temp = await updatePortrait(newFlag.id, newFlag, settings, true)
                    settings.portraits = _temp.portraits
                } 
            }
        }
    }
    await requestSettingsUpdate(settings)
    ActorPicker.refresh()
}
*/

// Приводит запись спрайта к единому виду {img, label}. Поддерживает старый формат
// (просто строка-путь) и новый формат-объект - для совместимости со старыми экспортами.
const _normalizeSpriteEntry = (s) => {
    if (!s) return null
    if (typeof s === "string") return { img: s, label: "" }
    if (typeof s === "object" && s.img) return { img: s.img, label: s.label || "" }
    return null
}

// Экспортирует ВСЕ Портреты из Actor Picker в один JSON-файл (путь к изображению/Имя/Титул),
// чтобы можно было перенести их в другой проект Foundry VTT с этим же модулем
function exportAllPortraits() {
    const settings = getSettings()
    const data = (settings.portraits || []).map(p => ({
        img: p.img || "",
        name: p.name || "",
        title: p.title || "",
        sprites: Array.isArray(p.sprites) ? p.sprites.map(_normalizeSpriteEntry).filter(Boolean) : []
    }))
    if (!data.length) {
        ui.notifications.warn(game.i18n.localize(`${C.ID}.actorPicker.exportAllEmpty`))
        return
    }
    const dateStamp = new Date().toISOString().slice(0, 10)
    foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", `vn-portraits-export-${dateStamp}.json`)
}

// Импортирует массив Портретов из JSON-файла (экспортированного этой же кнопкой в другом проекте)
// и ДОБАВЛЯЕТ их к уже существующему списку, не затрагивая имеющиеся Портреты
function importAllPortraits() {
    if (!game.user.isGM) {
        ui.notifications.error(game.i18n.localize(`${C.ID}.actorPicker.noPermissionImportExport`))
        return
    }
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json,.json"
    input.style.display = "none"
    input.addEventListener("change", async (ev) => {
        const file = ev.target.files[0]
        input.remove()
        if (!file) return

        let raw
        try {
            const text = await foundry.utils.readTextFromFile(file)
            raw = JSON.parse(text)
        } catch (err) {
            console.error(err)
            ui.notifications.error(game.i18n.localize(`${C.ID}.actorPicker.invalidJson`))
            return
        }

        // Поддерживаем как чистый массив, так и {portraits: [...]}
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.portraits) ? raw.portraits : null)
        if (!list) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.actorPicker.invalidJson`))
            return
        }

        const newPortraits = []
        let skipped = 0
        for (const entry of list) {
            if (!entry || typeof entry !== "object" || !entry.name) { skipped++; continue }
            newPortraits.push(foundry.utils.mergeObject(getDefaultPortraitData({ id: foundry.utils.randomID() }), {
                img: typeof entry.img === "string" ? entry.img : null,
                name: entry.name,
                title: typeof entry.title === "string" ? entry.title : "",
                sprites: Array.isArray(entry.sprites) ? entry.sprites.map(_normalizeSpriteEntry).filter(Boolean) : [],
                hasActor: false
            }))
        }

        if (!newPortraits.length) {
            ui.notifications.warn(game.i18n.format(`${C.ID}.actorPicker.importAllResult`, { imported: 0, skipped }))
            return
        }

        new Dialog({
            title: game.i18n.localize(`${C.ID}.actorPicker.importAllConfirmTitle`),
            content: `<p>${game.i18n.format(`${C.ID}.actorPicker.importAllConfirmContent`, { count: newPortraits.length })}</p>`,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize(`${C.ID}.buttons.confirm`),
                    callback: async () => {
                        const settings = getSettings()
                        settings.portraits.push(...newPortraits)
                        await requestSettingsUpdate(settings)
                        ActorPicker.refresh()
                        ui.notifications.info(game.i18n.format(`${C.ID}.actorPicker.importAllResult`, { imported: newPortraits.length, skipped }))
                    }
                }
            },
            default: "ok",
            close: () => {}
        }).render(true)
    })
    document.body.appendChild(input)
    input.click()
}

Hooks.on("getActorPickerHeaderButtons", (app, buttons) => {
    buttons.unshift({
        label: `${C.ID}.actorPicker.manageFoldersButton`,
        class: "ap-header-button-folders",
        icon: "fas fa-folder-plus",
        onclick: () => {
            if (!game.user.isGM) {
                ui.notifications.error(game.i18n.localize(`${C.ID}.actorPicker.noPermissionImportExport`))
                return
            }
            new ActorFoldersManager().render(true)
        }
    });
    buttons.unshift({
        label: `${C.ID}.actorPicker.importAllButton`,
        class: "ap-header-button-import-all",
        icon: "fas fa-file-import",
        onclick: importAllPortraits
    });
    buttons.unshift({
        label: `${C.ID}.actorPicker.exportAllButton`,
        class: "ap-header-button-export-all",
        icon: "fas fa-file-export",
        onclick: exportAllPortraits
    });
    buttons.unshift({
        label: `${C.ID}.actorPicker.header-button`,
        class: "ap-header-button-search",
        icon: "fas fa-magnifying-glass",
        onclick: openMassPortraitCreator
    });
    buttons.unshift({
        label: `${C.ID}.actorPicker.add-portrait-button`,
        class: "ap-header-button-add",
        icon: "fas fa-user-plus",
        onclick: () => {new ActorPickerSub().render(true)}
    })
});

Hooks.on("updateActor", async (actor, update, changes, userId) => {
    const autoPortraitSettings = game.settings.get(C.ID, "autoPortraitSettings")
    // const forcedChange = !!update.img || !!update.prototypeToken.texture.src || !!update.name || !!update.prototypeToken.name        (пока не используется)
    if (autoPortraitSettings[actor.type]?.generalRules.portraitAutoCreationRule == "actorCreateOrChange") portraitAutoMaker([actor])
})

function _injectActorPickerButton(app, htmlEl) {
    if (!htmlEl || !app.actor) return
    // Патч (не от автора модуля): не добавляем кнопку Actor Picker на листы
    // акторов модуля "Неболёт: Тактическая сцена" (nebolet-tactics.*, напр.
    // корабль) - это не персонажи, портрет/VN-диалоги им не нужны.
    if (app.actor.type?.startsWith("nebolet-tactics.")) return
    if (htmlEl.querySelector(".ap-tidyui-alter, .ap-button-spec, .ap-sheet-portrait")) return // уже добавлено (напр. если несколько хуков сработали на одном рендере)

    const flag = getPortrait(app.actor.id) || {}
    const lockPortraitChange = app.actor.getFlag(C.ID, "lockPortraitChange")
    let iEl = document.createElement('i');
    const icon = lockPortraitChange ? "fa-user-large-slash" : "fa-user"

    const tidyPortraitEl = htmlEl.querySelector('.svelte-cixcnb')
    const sidebarCardEl = htmlEl.querySelector('.sidebar .card')
    const sheetHeaderEl = htmlEl.querySelector('.sheet-header')

    if (tidyPortraitEl) {
        iEl.className = `fa-${flag.img ? "solid" : "regular"} ${icon} ap-tidyui-alter`
        iEl.dataset.tooltip = game.i18n.localize(`${C.ID}.actorPicker.tooltip`);
        tidyPortraitEl.appendChild(iEl);
    } else if (app.actor.type == "character" && sidebarCardEl?.querySelector('.collapser.card-tab')) {
        iEl.className = `fa-${flag.img ? "solid" : "regular"} ${icon}`
        let buttonEl = document.createElement('button');
        buttonEl.className = `collapser card-tab vertical unbutton interface-only ap-button-spec`
        buttonEl.dataset.tooltip = game.i18n.localize(`${C.ID}.actorPicker.tooltip`);
        buttonEl.appendChild(iEl);
        sidebarCardEl.querySelector('.collapser.card-tab').classList.add('ap-collapse-spec')
        sidebarCardEl.appendChild(buttonEl);
    } else if (sheetHeaderEl) {
        sheetHeaderEl.classList.add('ap-pos-rel');
        iEl.className = `fa-${flag.img ? "solid" : "regular"} ${icon} ap-sheet-portrait`
        iEl.dataset.tooltip = game.i18n.localize(`${C.ID}.actorPicker.tooltip`);
        sheetHeaderEl.appendChild(iEl);
    } else {
        // Запасной вариант - если ни один из ожидаемых селекторов не найден (изменилась вёрстка листа),
        // добавляем кнопку в стандартный window-header, который есть у любого приложения ApplicationV2.
        const windowHeaderEl = htmlEl.closest?.('.application')?.querySelector('.window-header') || htmlEl.querySelector?.('.window-header')
        if (!windowHeaderEl) return
        iEl.className = `fa-${flag.img ? "solid" : "regular"} ${icon} ap-sheet-portrait ap-header-fallback`
        iEl.dataset.tooltip = game.i18n.localize(`${C.ID}.actorPicker.tooltip`);
        windowHeaderEl.appendChild(iEl);
    }

    iEl.addEventListener('click', (event) => {
        event.preventDefault();
        new ActorPickerSub(app.actor.id).render(true)
    });
    iEl.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        await app.actor.setFlag(C.ID, "lockPortraitChange", !lockPortraitChange)
    });
}

Hooks.on("renderActorSheet5e", async (app, html, data) => {
    const autoPortraitSettings = game.settings.get(C.ID, "autoPortraitSettings")
    if (autoPortraitSettings[app.actor.type]?.generalRules.portraitAutoCreationRule == "openSheet") portraitAutoMaker([app.actor])
    _injectActorPickerButton(app, html[0])
})

// dnd5e перевёл свои листы персонажей/NPC на ApplicationV2 - "renderActorSheet5e" для них больше не вызывается.
// Этот хук дублирует ту же логику для современных V2-листов (html здесь - обычный HTMLElement, не jQuery).
Hooks.on("renderActorSheetV2", async (app, html, context, options) => {
    if (!app.actor) return
    const autoPortraitSettings = game.settings.get(C.ID, "autoPortraitSettings")
    if (autoPortraitSettings[app.actor.type]?.generalRules.portraitAutoCreationRule == "openSheet") portraitAutoMaker([app.actor])
    _injectActorPickerButton(app, html)
})


Hooks.on("getActorSheetHeaderButtons", async (app, buttons) => {
    // Тот же патч, что и в _injectActorPickerButton выше - на всякий случай,
    // если этот legacy-хук (AppV1) когда-нибудь всё же сработает для наших
    // ApplicationV2-листов через совместимость Foundry.
    if (app.actor?.type?.startsWith("nebolet-tactics.")) return
    if (game.settings.get(C.ID, "headerPortraitButton") || game.system.id != "dnd5e") {
        const portraitData = getPortrait(app.actor.id) || {}
        buttons.unshift({
            label: `${C.ID}.actorPicker.tooltip`,
            class: "ap-header-button",
            icon: `fa-${portraitData.img ? "solid" : "regular"} ${app.actor.getFlag(C.ID, "lockPortraitChange") ? "fa-user-large-slash" : "fa-user"}`,
            onclick: async () => {new ActorPickerSub(app.actor.id).render(true)}
        });
    }
})

Hooks.on("updateSetting", async (setting, value, diff, userId) => {
    if (setting.key == `${C.ID}.vnData`) {
        const app = document.getElementById("ActorPicker")
        if (app) {
            const settingData = foundry.utils.deepClone(game.settings.get(C.ID, 'vnData'))
            app.querySelectorAll(".vn-ac-slot").forEach(element => {
                const pos = element.dataset.pos
                const newImg = settingData.activeSpeakers[pos]?.img || ""
                const imgEl = element.querySelector("img")
                element.dataset.id = settingData.activeSpeakers[pos]?.id
                // Пустой src на <img> вызывает иконку "нет изображения" в браузере - вместо этого
                // при отсутствии актёра в слоте убираем атрибут src и скрываем сам <img>
                if (newImg) {
                    imgEl.src = newImg
                    imgEl.style.display = ""
                } else {
                    imgEl.removeAttribute("src")
                    imgEl.style.display = "none"
                }
                if (pos == settingData.editActiveSpeaker) {
                    element.classList.add("vn-hlight")
                } else {
                    element.classList.remove("vn-hlight")
                }
            })
        }
    }
})