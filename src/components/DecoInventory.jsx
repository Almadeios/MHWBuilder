import { useState, useEffect } from 'react';
import SKILLS from '../data/detailed/skills.json';
import TextField from '@mui/material/TextField';
import { getDecoDisplayName, getDecoFromName } from '../util/util';
import { Button, MenuItem, Typography } from '@mui/material';
import DECOS from '../data/compact/decoration.json';
import DECO_INVENTORY from '../data/user/deco-inventory.json';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useStorage } from '../hooks/StorageContext';

const DecoInventory = () => {
    const { fields, updateField } = useStorage();
    const [namesModded, setNamesModded] = useState({});
    const [inventory, setInventory] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [found, setFound] = useState([]);
    const [started, setStarted] = useState(false); // lazy activate
    const [customDraft, setCustomDraft] = useState({
        name: '', type: 'armor', size: 1, skill: '', level: 1, secondSkill: '', secondLevel: 1, amount: 99
    });

    const getInventoryAmount = name => {
        const myDecos = fields.decoInventory || {};
        if (myDecos[name] !== undefined) {
            return myDecos[name];
        }
        return DECO_INVENTORY[name] ?? 99;
    };

    const getDecoSearchNames = name => [
        getDecoDisplayName(name, false),
        getDecoDisplayName(name, true),
    ].map(x => x.toLowerCase());

    const matchesSearch = name => {
        if (!searchText) { return true; }
        const needle = searchText.toLowerCase();
        return getDecoSearchNames(name).some(x => x.includes(needle));
    };

    const refreshDecos = () => {
        const myDecos = { ...fields.decoInventory };
        const communistDecos = [];

        // modify deco inventory to reflect user-specified amounts
        for (const name of Object.keys(DECOS)) {
            communistDecos.push({
                name,
                amount: getInventoryAmount(name),
            });
        }

        const modded = {};
        for (const [decoName, amount] of Object.entries(myDecos)) {
            if (amount !== 99) {
                modded[decoName] = amount;
            }
        }

        const foundNames = communistDecos.filter(x => matchesSearch(x.name))
            .map(x => getDecoDisplayName(x.name, fields.showDecoSkillNames));
        communistDecos.sort((a, b) => nameSort(a, b, foundNames));
        setNamesModded(modded);
        setInventory(communistDecos);

        if (!started) {
            setStarted(true);
        }
    };

    useEffect(() => {
        refreshDecos();
    }, []);

    const nameSort = (a, b, foundNames) => {
        const aName = getDecoDisplayName(a.name, fields.showDecoSkillNames);
        const bName = getDecoDisplayName(b.name, fields.showDecoSkillNames);

        let priority1 = 0;
        if (foundNames) {
            const aFound = foundNames.includes(aName) ? -1 : 1;
            const bFound = foundNames.includes(bName) ? -1 : 1;
            priority1 = aFound - bFound;
        }

        return priority1 || aName.localeCompare(bName);
    };

    useEffect(() => {
        if (started) {
            const tempInventory = [...inventory];

            const foundNames = tempInventory.filter(x => matchesSearch(x.name))
                .map(x => getDecoDisplayName(x.name, fields.showDecoSkillNames));

            tempInventory.sort((a, b) => nameSort(a, b, foundNames));
            setFound(foundNames);
            setInventory(tempInventory);
        }
    }, [searchText, fields.showDecoSkillNames]);

    const updateMod = (decoName, ev) => {
        let amount = parseInt(ev.target.value, 10);
        if (isNaN(amount)) {
            amount = 0;
            ev.target.value = amount;
        }
        const mods = { ...fields.decoInventory };
        mods[decoName] = amount;
        updateField('decoInventory', mods);
        refreshDecos();
    };

    const restock = () => {
        updateField('decoInventory', {});
        refreshDecos();

        const inputs = document.getElementsByClassName('deco-amount');
        for (const input of inputs) {
            input.value = 99;
        }
    };

    const empty = () => {
        const emptyInv = {};
        const tempInv = { ...DECO_INVENTORY };
        for (const decoName of Object.keys({ ...DECOS, ...tempInv })) {
            emptyInv[decoName] = 0;
        }

        updateField('decoInventory', emptyInv);
        refreshDecos();
        const inputs = document.getElementsByClassName('deco-amount');
        for (const input of inputs) {
            input.value = 0;
        }
    };

    const renderDeco = decoRaw => {
        const decoName = decoRaw.name;
        const amount = decoRaw.amount;
        const deco = getDecoFromName(decoName, fields.showDecoSkillNames);

        // todo: make the red highlight dynamic on change
        const howManyWeGot = namesModded[decoRaw.name] ?? 99;
        const modded = howManyWeGot < deco.max;
        const highlighted = searchText && found.includes(deco.name);
        const highlightClass = highlighted ? "highlighted dhigh" : "";
        const modClass = modded ? 'dmodded' : '';

        const skillIcons = deco.skillNames.map(x => SKILLS[x]?.icon).filter(Boolean);
        const singleIcon = skillIcons[0]; // todo: change this should armor decos ever have more than 1 skill each

        return <div key={deco.name} className={`deco dpad ${highlightClass}`} title={deco.altText}>
            <img className="deco-img" src={`images/slot${deco.slotSize}.png`} alt="" />
            <div>
                <span className={`deco-name ${modded ? 'name-mod' : ''}`}>{deco.name}</span>
                <input type="number" step={1} max={99} min={0}
                    aria-label={`${deco.name} owned quantity`}
                    onBlur={ev => updateMod(decoRaw.name, ev)}
                    className={`deco-amount dinput ${modClass}`} defaultValue={amount} />
            </div>
            {singleIcon && <img className="deco-icon" src={`images/icons/${singleIcon}.png`}
                alt={`${singleIcon} skill`} />}
        </div>;
    };

    const renderDecos = () => {
        return <div className="deco-results">
            {inventory.map(renderDeco)}
        </div>;
    };

    const saveCustomDeco = () => {
        const name = customDraft.name.trim();
        if (!name || !customDraft.skill) {
            window.snackbar.createSnackbar('Custom decoration needs a name and skill.', { timeout: 3000 });
            return;
        }
        if (DECOS[name] || (fields.customDecorations || []).some(deco => deco.name === name)) {
            window.snackbar.createSnackbar('A decoration with that name already exists.', { timeout: 3000 });
            return;
        }

        const skills = { [customDraft.skill]: Math.max(1, Number(customDraft.level) || 1) };
        if (customDraft.secondSkill && customDraft.secondSkill !== customDraft.skill) {
            skills[customDraft.secondSkill] = Math.max(1, Number(customDraft.secondLevel) || 1);
        }
        const customDecoration = {
            name,
            type: customDraft.type,
            size: Math.min(3, Math.max(1, Number(customDraft.size) || 1)),
            skills,
            amount: Math.min(99, Math.max(0, Number(customDraft.amount) || 0))
        };
        updateField('customDecorations', [...fields.customDecorations || [], customDecoration]);
        setCustomDraft({
            name: '', type: 'armor', size: 1, skill: '', level: 1, secondSkill: '', secondLevel: 1, amount: 99
        });
    };

    const removeCustomDeco = name => {
        updateField('customDecorations', (fields.customDecorations || []).filter(deco => deco.name !== name));
    };

    const renderCustomDecorations = () => <div style={{ marginTop: '1.25em', marginBottom: '1.25em' }}>
        <Typography sx={{ marginBottom: '8px', fontSize: '20px', fontWeight: 'bold' }}>
            Custom Decorations
        </Typography>
        <Typography sx={{ marginBottom: '10px' }}>
            Saved custom decorations are available to the Search optimizer.
        </Typography>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <TextField size="small" label="Name" value={customDraft.name}
                onChange={ev => setCustomDraft({ ...customDraft, name: ev.target.value })} />
            <TextField select size="small" label="Slot type" value={customDraft.type}
                onChange={ev => setCustomDraft({ ...customDraft, type: ev.target.value })}>
                <MenuItem value="armor">Armor</MenuItem>
                <MenuItem value="weapon">Weapon</MenuItem>
            </TextField>
            <TextField select size="small" label="Slot size" value={customDraft.size}
                onChange={ev => setCustomDraft({ ...customDraft, size: Number(ev.target.value) })}>
                {[1, 2, 3].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Skill" value={customDraft.skill}
                sx={{ minWidth: '220px' }}
                onChange={ev => setCustomDraft({ ...customDraft, skill: ev.target.value })}>
                {Object.keys(SKILLS).sort().map(skill => <MenuItem key={skill} value={skill}>{skill}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Skill level" value={customDraft.level}
                inputProps={{ min: 1, max: 7 }}
                onChange={ev => setCustomDraft({ ...customDraft, level: Number(ev.target.value) })} />
            <TextField select size="small" label="Second skill (optional)" value={customDraft.secondSkill}
                sx={{ minWidth: '220px' }}
                onChange={ev => setCustomDraft({ ...customDraft, secondSkill: ev.target.value })}>
                <MenuItem value="">None</MenuItem>
                {Object.keys(SKILLS).sort().map(skill => <MenuItem key={skill} value={skill}>{skill}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Second level" value={customDraft.secondLevel}
                inputProps={{ min: 1, max: 7 }} disabled={!customDraft.secondSkill}
                onChange={ev => setCustomDraft({ ...customDraft, secondLevel: Number(ev.target.value) })} />
            <TextField size="small" type="number" label="Amount" value={customDraft.amount}
                inputProps={{ min: 0, max: 99 }}
                onChange={ev => setCustomDraft({ ...customDraft, amount: Number(ev.target.value) })} />
            <Button variant="contained" onClick={saveCustomDeco}>Add Custom Deco</Button>
        </div>
        {(fields.customDecorations || []).map(deco => <div key={deco.name}
            style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <span>{deco.name}: {deco.type} slot {deco.size}, {Object.entries(deco.skills || {})
                .map(([skill, level]) => `${skill} Lv. ${level}`).join(', ')}, x{deco.amount}</span>
            <Button size="small" color="error" variant="outlined"
                onClick={() => removeCustomDeco(deco.name)}>Delete</Button>
        </div>)}
    </div>;

    const label = "Search decorations by name or skill";

    return <div className="deco-inventory">
        <Typography sx={{ marginBottom: '8px', fontSize: '20px', fontWeight: 'bold', cursor: 'default' }}>
            You can limit how many of each decoration are available below.
        </Typography>
        <div style={{ display: "flex", flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <TextField id="deco-search" label={label} variant="outlined" size="small"
                className="deco-search" autoFocus
                onChange={ev => setSearchText(ev.target.value)} value={searchText} />
            <Button className="dbuttons" onClick={empty} variant="outlined" color="error" size="small">Empty Inventory</Button>
            <Button className="dbuttons" onClick={restock} variant="outlined" color="info" size="small">Fill Inventory</Button>
        </div>
        <div className="filters-div">
            <FormControlLabel control={<Switch checked={fields.showDecoSkillNames} />}
                onChange={ev => updateField('showDecoSkillNames', ev.target.checked)}
                label={fields.showDecoSkillNames ? "Label by Skill Names" : "Label by Decoration Names"} />
        </div>

        {renderCustomDecorations()}

        {renderDecos()}
    </div>;
};
DecoInventory.propTypes = {

};
export default DecoInventory;
