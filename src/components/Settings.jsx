import { useState } from 'react';
import TextField from '@mui/material/TextField';
import {
    armorNameFormat,
    getArmorTypeList,
    isArmorOfType
} from '../util/util';
import {
    Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogContentText,
    DialogTitle, FormControlLabel, Paper, Switch, Typography
} from '@mui/material';
import ArmorSvgWrapper from './ArmorSvgWrapper';
import Remove from '@mui/icons-material/Remove';
import { iconCommon } from './Results';
import { styled } from '@mui/material/styles';
import { getJsonFromType } from '../util/tools';
import { useStorage } from '../hooks/StorageContext';
import { _x } from '../util/armorAccessor';
import { clearAppData } from '../util/factoryReset';

const RemoveIcon = styled(Remove)`
    ${iconCommon}
    transform: translateY(0px);
    color: crimson;
`;

const Settings = () => {
    const { fields, updateField, pinArmor, excludeArmor } = useStorage();
    const [factoryResetOpen, setFactoryResetOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const types = getArmorTypeList();

    const factoryReset = async() => {
        setIsResetting(true);
        await clearAppData();
        const cleanUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
        window.location.replace(cleanUrl.toString());
    };

    const toggleBlacklistType = type => {
        let tempTypeBlacklist = [...fields.blacklistedArmorTypes];
        const armorTypeList = getArmorTypeList();

        if (fields.blacklistedArmorTypes.includes(type)) {
            tempTypeBlacklist = fields.blacklistedArmorTypes.filter(x => x !== type);
        } else if (tempTypeBlacklist.length < 5) {
            tempTypeBlacklist = [...fields.blacklistedArmorTypes, type];
            const pulledMandatory = fields.mandatoryArmor;
            pulledMandatory[armorTypeList.indexOf(type)] = '';
            updateField('mandatoryArmor', pulledMandatory);
        } else {
            window.snackbar.createSnackbar(`You can't exclude all armor types!`, {
                timeout: 3000
            });
            return;
        }

        updateField('blacklistedArmorTypes', tempTypeBlacklist);
    };

    const clearBlacklist = (items, type) => {
        const tempBlacklist = [...fields.blacklistedArmor].filter(x => !items.includes(x));
        updateField('blacklistedArmor', tempBlacklist);

        window.snackbar.createSnackbar(`Cleared all ${type} pieces from the blacklist`, {
            timeout: 3000
        });
    };

    const toggleShowDeco = () => {
        updateField('showDecoSkillNames', !fields.showDecoSkillNames);
    };

    const toggleShowGroup = () => {
        updateField('showGroupSkillNames', !fields.showGroupSkillNames);
    };

    const toggleShowAll = () => {
        updateField('showAll', !fields.showAll);
    };

    const toggleShowExtra = () => {
        updateField('showExtra', !fields.showExtra);
    };

    const toggleForceDesktop = () => {
        updateField('forceDesktop', !fields.forceDesktop);
    };

    const toggleShowCalcExport = () => {
        updateField('showCalcExport', !fields.showCalcExport);
    };

    const changePin = (type, armor, armorList) => {
        const armorName = armor?.value || "none";
        const isValid = !armorName ||
            armorList.filter(x => x.value.toLowerCase() === armorName.toLowerCase())[0];

        if (isValid) {
            pinArmor(armorName, type);
        }

        document.getElementById(`pinned-${type}`)?.blur();
    };

    const renderBlacklist = armorName => {
        return <div key={armorName} className="blacklist-couple">
            <RemoveIcon onClick={() => excludeArmor(armorName)} />
            <span className="blacklist-name">{armorName}</span>
        </div>;
    };

    const renderList = (type, index) => {
        const hasPin = Boolean(fields.mandatoryArmor[index]);
        const pinStatus = hasPin ? 'Pinned' : 'Any piece';
        const myBlacklist = fields.blacklistedArmor.filter(x => isArmorOfType(type, x));
        const hasBlacklist = myBlacklist.length > 0;

        const datalist = [{
            label: `No ${type} pinned`,
            value: "none"
        }, ...Object.entries(getJsonFromType(type)).filter(armor =>
            _x.type(armor[1]) === "talisman" ||
            _x.rank(armor[1]) === "high"
        ).map(armor => {
            return {
                label: armorNameFormat(armor[0]),
                value: armor[0]
            };
        }).sort()];

        const stilo = {
            '& .MuiOutlinedInput-root': {
                '& fieldset': {
                    borderColor: '#165493',
                }
            },
        };

        const value = hasPin ? {
            label: armorNameFormat(fields.mandatoryArmor[index]),
            value: fields.mandatoryArmor[index]
        } : datalist[0];

        return <Paper key={type} className="blacklist-rows" elevation={2}>
            <div className="settings-equipment-title">
                <ArmorSvgWrapper type={type} style={{ width: '24px', height: '24px' }} />
                <h3>{type}</h3>
                <span>{fields.blacklistedArmorTypes.includes(type) ? 'Excluded' : pinStatus}</span>
            </div>
            <div className="pinlist">
                <div className="pinned">
                    <Autocomplete
                        id={`pinned-${type}`}
                        onChange={(ev, option) => changePin(type, option, datalist)}
                        disablePortal
                        options={datalist}
                        sx={{ width: '250px' }}
                        size="small"
                        disableClearable={!hasPin}
                        isOptionEqualToValue={option => option.value === value.value}
                        value={value}
                        renderInput={
                            params => <TextField {...params} sx={hasPin ? stilo : {}} label={`Pinned ${type} Armor`} />
                        }
                    />
                </div>
                <FormControlLabel sx={{ marginLeft: '1em' }}
                    control={<Switch checked={fields.blacklistedArmorTypes.includes(type)} />}
                    onChange={() => toggleBlacklistType(type)}
                    label={`Exclude all '${type}' armor pieces?`} />
            </div>
            {hasBlacklist && <div className="blacklist">
                <Button variant="outlined" color="error" size="small"
                    onClick={() => clearBlacklist(myBlacklist, type)}>Clear</Button>
                {myBlacklist.map(renderBlacklist)}
            </div>}
        </Paper>;
    };

    return <div className="settings">
        <header className="search-intro">
            <h1>Settings</h1>
            <p>Customize your workspace and control which equipment appears in your builds.</p>
        </header>
        <div className="armor-settings">
            <div className="settings-preferences-grid">
            <section className="search-section" aria-labelledby="general-settings-heading">
            <div className="search-section-heading"><h2 id="general-settings-heading">General preferences</h2></div>
            <p className="search-section-description">Choose how names and layouts appear across the builder.</p>
            <div className="general-settings">
                <FormControlLabel sx={{ marginLeft: '1em' }} control={<Switch checked={fields.showDecoSkillNames} />}
                    onChange={() => toggleShowDeco()}
                    label={`Label decorations by skill name`} />
                <FormControlLabel sx={{ marginLeft: '1em' }} control={<Switch checked={fields.showGroupSkillNames} />}
                    onChange={() => toggleShowGroup()}
                    label={`Label set skills by skill name`} />
                <FormControlLabel sx={{ marginLeft: '1em' }}
                    title="The UI is simplified when the screen is small enough.  This will force it to never do that."
                    control={<Switch checked={fields.forceDesktop} />}
                    onChange={() => toggleForceDesktop()}
                    label={`Force desktop mode`} />
            </div>
            </section>
            <section className="search-section" aria-labelledby="result-settings-heading">
            <div className="search-section-heading"><h2 id="result-settings-heading">Build display</h2></div>
            <p className="search-section-description">Choose the details and export actions shown for your armor sets.</p>
            <div className="general-settings">
                <FormControlLabel sx={{ marginLeft: '1em' }} control={<Switch checked={fields.showAll} />}
                    onChange={() => toggleShowAll()}
                    label={`Show all skills box`} />
                <FormControlLabel sx={{ marginLeft: '1em' }} control={<Switch checked={fields.showExtra} />}
                    onChange={() => toggleShowExtra()}
                    label={`Show 'Extra Skills' line`} />
                <FormControlLabel sx={{ marginLeft: '1em' }}
                    title="Whether to show a button that exports an armor set to mhwilds-calculator format"
                    control={<Switch checked={fields.showCalcExport} />}
                    onChange={() => toggleShowCalcExport()}
                    label={`Show mhwilds-calculator export`} />
            </div>

            </section>
            </div>
            <section className="search-section" aria-labelledby="equipment-settings-heading">
                <div className="search-section-heading">
                    <h2 id="equipment-settings-heading">Pinned & excluded equipment</h2>
                </div>
                <p className="search-section-description">
                    Pin a piece to require it in every result. Excluded pieces will not be used in searches.
                </p>
                <div className="settings-equipment-grid">{types.map(renderList)}</div>
            </section>
            <Paper className="factory-reset-panel" elevation={0}>
                <div>
                    <Typography className="factory-reset-panel__title">Factory Reset</Typography>
                    <Typography className="factory-reset-panel__description">
                        Delete all saved sets, custom charms and decorations, inventory, search history,
                        settings, and cached app files from this browser.
                    </Typography>
                </div>
                <Button color="error" variant="outlined" onClick={() => setFactoryResetOpen(true)}>
                    Factory Reset
                </Button>
            </Paper>
        </div>
        <Dialog open={factoryResetOpen} onClose={() => !isResetting && setFactoryResetOpen(false)}>
            <DialogTitle>Factory reset MHW Builder?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    This permanently deletes every saved build and all builder data stored in this browser.
                    This action cannot be undone.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button disabled={isResetting} onClick={() => setFactoryResetOpen(false)}>Cancel</Button>
                <Button color="error" disabled={isResetting} variant="contained" onClick={factoryReset}>
                    {isResetting ? 'Resetting…' : 'Delete Everything'}
                </Button>
            </DialogActions>
        </Dialog>
    </div>;
};
export default Settings;
