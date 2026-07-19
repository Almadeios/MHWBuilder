// handles anything that modifies local storage
/* eslint-disable react/prop-types */
import { createContext, useContext, useEffect, useState } from "react";
import {
    getArmorTypeList, getFromLocalStorage,
    getSetFromUrlParams, saveToLocalStorage, stringToId
} from "../util/util";
import SKILL_ID_MAP from '../data/ids/skill-ids.json';
import { normalizeCustomTalismans } from "../util/customTalismans";
const StorageContext = createContext();

const createSafeMessage = (prefix, highlighted, suffix, color) => {
    const message = document.createElement('div');
    message.append(document.createTextNode(prefix));
    const highlight = document.createElement('span');
    highlight.textContent = String(highlighted);
    highlight.style.color = color;
    message.append(highlight, document.createTextNode(suffix));
    return message;
};

const DEFAULTS = {
    // search parameters
    skills: {},
    slotFilters: {},
    weaponSlots: [],
    weaponBaseRaw: '',
    weaponBaseAffinity: 0,
    weaponType: 'other',
    weaponElementType: 'None',
    weaponElementValue: '',
    weaponSharpness: 'White',
    optimizationGoal: 'efficient',
    setSkillBonus: '',
    groupSkillBonus: '',
    customTalismans: [],
    useOnlyOwnedTalismans: false,
    decoInventory: {},
    customDecorations: [],
    mandatoryArmor: ['', '', '', '', '', ''],
    blacklistedArmor: [],
    blacklistedArmorTypes: [],
    dontUseDecos: false,

    // search page
    searchedSkills: {},
    lastParams: {},
    paramStr: '',
    conditions: {},

    // saved sets page
    savedSets: [],

    // common
    showDecoSkillNames: false,
    showGroupSkillNames: false,
    updatedIds: undefined,

    // settings page
    showAll: true,
    showExtra: false,
    forceDesktop: false,
    showCalcExport: false,
};

export const StorageProvider = ({ children }) => {
    const [fields, setFields] = useState(DEFAULTS);
    const [swapTab, setSwapTab] = useState(false);
    const [setId, setSetId] = useState();
    const [sharedSetPreview, setSharedSetPreview] = useState();

    useEffect(() => {
        // honestly, should probably combine all these into one localStorage object
        const tempFields = {};
        for (const [fieldName, defaultValue] of Object.entries(DEFAULTS)) {
            tempFields[fieldName] = getFromLocalStorage(fieldName, defaultValue);
        }
        // Efficiency is now the single search strategy; migrate older saved goals.
        tempFields.optimizationGoal = 'efficient';
        saveToLocalStorage('optimizationGoal', tempFields.optimizationGoal);
        tempFields.customTalismans = normalizeCustomTalismans(tempFields.customTalismans);
        saveToLocalStorage('customTalismans', tempFields.customTalismans);

        // One-time cleanup for the accidental legacy URL import reported before shared previews.
        if (!getFromLocalStorage('sharedPreviewMigrationV1', false)) {
            tempFields.savedSets = tempFields.savedSets.filter(savedSet => !(
                savedSet.name === 'Sazeeaid' &&
                !savedSet.damageProfile &&
                !savedSet.requiredDecoNames
            ));
            saveToLocalStorage('savedSets', tempFields.savedSets);
            saveToLocalStorage('sharedPreviewMigrationV1', true);
        }

        const urlParams = new URLSearchParams(window.location.search);

        // handle getting skills from url
        const skillsStr = urlParams.get('skills');
        let moddedSearch = false;
        if (skillsStr) {
            const skillsStrArr = skillsStr.split('_');
            tempFields.skills = Object.fromEntries(skillsStrArr.map(x => {
                const split = x.split("-");
                const id = parseInt(split[0], 10);
                const level = parseInt(split[1], 10);
                const name = Object.entries(SKILL_ID_MAP).filter(sk => sk[1] === id)[0]?.[0];

                return [name, level];
            }).filter(x => x[0]));
            urlParams.delete('skills');
            moddedSearch = true;
            saveToLocalStorage('skills', tempFields.skills);
        }

        // handle getting slot filters from url
        const sfStr = urlParams.get('sf');
        if (sfStr) {
            const slotFilterArr = sfStr.split('_');
            tempFields.slotFilters = Object.fromEntries(slotFilterArr.map(x => {
                const split = x.split("-");
                const slotSize = split[0];
                const amount = parseInt(split[1], 10);

                return [slotSize, amount];
            }).filter(x => x[0]));
            urlParams.delete('sf');
            moddedSearch = true;
            saveToLocalStorage('slotFilters', tempFields.slotFilters);
        }

        // Shared links are previews. Saving them must be an explicit user action.
        const sharedSet = getSetFromUrlParams(urlParams);
        if (sharedSet) {
            setSharedSetPreview(sharedSet);
            urlParams.delete("set");
            urlParams.delete("name");
            moddedSearch = true;
        }

        // update any deprecated saved set ids to new format
        if (!tempFields.updatedIds && tempFields.savedSets.length > 0) {
            for (const armor of tempFields.savedSets) {
                armor.id = stringToId(`${armor.armorNames.join(",")}_${armor.decoNames.join(",")}`);
            }
            updateMultipleFields({
                savedSets: tempFields.savedSets,
                updatedIds: true,
            });
            console.log("updated deprecated saved set ids");
        }

        // remove search string from url
        if (moddedSearch) {
            const cleanedUrl = new URL(window.location.href);
            cleanedUrl.search = urlParams.toString();
            window.history.replaceState(
                {}, document.title, `${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`
            );
        }
        setFields(tempFields);
    }, []);

    const updateField = (name, value) => {
        const tempFields = { ...fields };
        tempFields[name] = value;
        if (saveToLocalStorage(name, value)) {
            setFields(tempFields);
            return true;
        }
        window.snackbar?.createSnackbar('Unable to save: browser storage is full.', { timeout: 5000 });
        return false;
    };

    const updateMultipleFields = multiple => {
        const tempFields = {
            ...fields,
            ...multiple
        };
        setFields(tempFields);

        for (const [name, data] of Object.entries(multiple)) {
            saveToLocalStorage(name, data);
        }
    };

    const pinArmor = (name, type) => {
        const tempMandatory = [...fields.mandatoryArmor];
        let tempBlacklist = [...fields.blacklistedArmor];
        let tempTypeBlacklist = [...fields.blacklistedArmorTypes];

        if (name.toLowerCase() === "none") {
            const typeIndex = getArmorTypeList().indexOf(type);
            tempMandatory[typeIndex] = '';
            updateMultipleFields({
                mandatoryArmor: tempMandatory,
                blacklistedArmor: tempBlacklist,
                blacklistedArmorTypes: tempTypeBlacklist
            });
            return;
        }

        let notifyStr = ["Pinned ", ""];

        const alreaddyPinnedIndex = tempMandatory.indexOf(name);
        if (alreaddyPinnedIndex !== -1) {
            tempMandatory[alreaddyPinnedIndex] = '';
            notifyStr = ["Unpinned ", ''];
        } else {
            const typeIndex = getArmorTypeList().indexOf(type);
            tempMandatory[typeIndex] = name;

            // if a newly-mandated armor piece is in the blacklist, remove it
            if (tempBlacklist.includes(name)) {
                tempBlacklist = tempBlacklist.filter(x => x !== name);
            }

            // likewise, if a newly-mandated armor piece is type blacklisted, remove that restriction
            if (tempTypeBlacklist.includes(type)) {
                tempTypeBlacklist = tempTypeBlacklist.filter(x => x !== type);
            }
        }

        const message = createSafeMessage(notifyStr[0], name, notifyStr[1], 'skyblue');

        window.snackbar.createSnackbar(
            message, { timeout: 3000 }
        );

        updateMultipleFields({
            mandatoryArmor: tempMandatory,
            blacklistedArmor: tempBlacklist,
            blacklistedArmorTypes: tempTypeBlacklist
        });
    };

    const excludeArmor = name => {
        if (name.toLowerCase() === "none") { return; }
        let tempMandatory = [...fields.mandatoryArmor];
        let tempBlacklist = [...fields.blacklistedArmor];

        let notifyStr = ["Added ", " to "];
        if (tempBlacklist.includes(name)) {
            tempBlacklist = tempBlacklist.filter(x => x !== name);
            notifyStr = ["Removed ", ' from '];
        } else {
            tempBlacklist.push(name);

            // if a newly-blacklisted armor piece is in the mandatory list, remove it
            if (tempMandatory.includes(name)) {
                // eslint-disable-next-line no-confusing-arrow
                tempMandatory = tempMandatory.map(x => x === name ? '' : x);
            }
        }

        const message = createSafeMessage(
            notifyStr[0], name, `${notifyStr[1]} the blacklist`, 'crimson'
        );

        window.snackbar.createSnackbar(message, { timeout: 3000 });

        updateMultipleFields({
            mandatoryArmor: tempMandatory,
            blacklistedArmor: tempBlacklist
        });
    };

    const saveArmorSet = result => {
        if (!result) { return undefined; }
        let currentSets = getFromLocalStorage('savedSets') || [];
        const alreadyHas = currentSets.filter(x => x.id === result.id);

        if (alreadyHas.length > 0) {
            currentSets = currentSets.filter(x => x.id !== result.id);
        } else {
            currentSets.push({ ...result });
        }

        updateField('savedSets', currentSets);
        return currentSets;
    };

    return (
        <StorageContext.Provider value={{
            fields, updateField, updateMultipleFields,
            pinArmor, excludeArmor, saveArmorSet, swapTab,
            setSwapTab, setId, setSetId, sharedSetPreview,
            dismissSharedSetPreview: () => setSharedSetPreview(undefined)
        }}>
            {children}
        </StorageContext.Provider>
    );
};

export const useStorage = () => useContext(StorageContext);
