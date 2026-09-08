import { useState } from 'react';
import SKILLS from '../data/detailed/skills.json';
import TextField from '@mui/material/TextField';
import { getDecoDisplayName } from '../util/util';
import { Button, MenuItem, Typography } from '@mui/material';
import DECOS from '../data/compact/decoration.json';
import DECO_INVENTORY from '../data/user/deco-inventory.json';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useStorage } from '../hooks/StorageContext';

const DecoInventory = () => {
    const { fields, updateField, updateMultipleFields } = useStorage();
    const [searchText, setSearchText] = useState('');
    const [slotType, setSlotType] = useState('all');
    const [slotSize, setSlotSize] = useState('all');
    const [ownedOnly, setOwnedOnly] = useState(false);
    const [customDraft, setCustomDraft] = useState({
        name: '', type: 'armor', size: 1, skill: '', level: 1, secondSkill: '', secondLevel: 1, amount: 99
    });

    const inventory = [
        ...Object.entries(DECOS).map(([name, [type, skills, size]]) => ({ name, type, skills, size })),
        ...(fields.customDecorations || []).map(deco => ({ ...deco, custom: true }))
    ].map(deco => ({
        ...deco,
        amount: fields.decoInventory?.[deco.name] ?? deco.amount ?? DECO_INVENTORY[deco.name] ?? 99,
        displayName: fields.showDecoSkillNames && !deco.custom ?
            getDecoDisplayName(deco.name, true) : deco.name
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const visibleInventory = inventory.filter(deco =>
        (slotType === 'all' || deco.type === slotType) &&
        (slotSize === 'all' || deco.size === Number(slotSize)) &&
        (!ownedOnly || deco.amount > 0) &&
        [deco.name, ...Object.keys(deco.skills)].join(' ').toLowerCase().includes(searchText.trim().toLowerCase())
    );
    const updateAmount = (name, value) => {
        const amount = Math.min(99, Math.max(0, Math.trunc(Number(value) || 0)));
        updateField('decoInventory', { ...fields.decoInventory, [name]: amount });
    };
    const setAllAmounts = amount => updateField('decoInventory', {
        ...fields.decoInventory,
        ...Object.fromEntries(inventory.map(deco => [deco.name, amount]))
    });
    const resetFilters = () => {
        setSearchText('');
        setSlotType('all');
        setSlotSize('all');
        setOwnedOnly(false);
    };
    const renderDecos = () => <section className="search-section decoration-list" aria-labelledby="inventory-heading">
        <div className="search-section-heading">
            <h2 id="inventory-heading">Your inventory</h2>
            <span className="search-selection-count">{visibleInventory.length} of {inventory.length} jewels</span>
        </div>
        <p className="search-section-description">Quantities save automatically. Set a jewel to 0 to exclude it from search.</p>
        <div className="decoration-column-headings" aria-hidden="true">
            <span>Decoration & skills</span><span>Slot</span><span>Owned</span>
        </div>
        <div className="decoration-rows">
            {visibleInventory.map(deco => <div key={deco.name}
                className={`decoration-row ${deco.amount === 0 ? 'decoration-row-empty' : ''}`}>
                <div className="decoration-identity">
                    <strong>{deco.displayName}</strong>
                    {fields.showDecoSkillNames && deco.displayName !== deco.name && <span>{deco.name}</span>}
                    <div className="decoration-skills">{Object.entries(deco.skills).map(([skill, level]) =>
                        <span key={skill}>
                            {SKILLS[skill]?.icon && <img src={`images/icons/${SKILLS[skill].icon}.png`} alt="" />}
                            {skill} Lv. {level}
                        </span>
                    )}</div>
                    {deco.custom && <Button size="small" color="error" onClick={() => removeCustomDeco(deco.name)}
                        aria-label={`Delete ${deco.name}`}>Delete custom decoration</Button>}
                </div>
                <span className={`decoration-slot decoration-slot-${deco.type}`}>
                    {deco.type === 'weapon' ? 'Weapon' : 'Armor'} / Lv. {deco.size}
                </span>
                <div className="decoration-quantity">
                    <input type="number" min={0} max={99} step={1} value={deco.amount}
                        aria-label={`${deco.name} owned quantity`}
                        onChange={event => updateAmount(deco.name, event.target.value)} />
                    <span>{deco.amount === 0 ? 'Not owned' : 'Available'}</span>
                </div>
            </div>)}
        </div>
        {!visibleInventory.length && <div className="decoration-empty-state">
            <strong>No decorations match your filters.</strong>
            <Button onClick={resetFilters}>Clear filters</Button>
        </div>}
    </section>;

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
        const nextInventory = { ...fields.decoInventory };
        delete nextInventory[name];
        updateMultipleFields({
            customDecorations: (fields.customDecorations || []).filter(deco => deco.name !== name),
            decoInventory: nextInventory
        });
    };

    const renderCustomDecorations = () => <details className="search-section custom-decoration-panel">
        <summary>Custom decorations <span>Create a jewel for your searches</span></summary>
        <Typography sx={{ marginBottom: '10px' }}>
            Saved custom decorations are available to the Search optimizer.
        </Typography>
        <div className="custom-decoration-grid">
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
    </details>;

    const label = "Search decorations by name or skill";

    return <div className="deco-inventory">
        <header className="search-intro">
            <h1>Decorations</h1>
            <p>Manage the jewels your armor searches can use.</p>
        </header>
        <section className="search-section" aria-label="Decoration filters">
            <div className="decoration-filters">
                <TextField id="deco-search" label={label} variant="outlined" size="small"
                    className="deco-search" onChange={ev => setSearchText(ev.target.value)} value={searchText} />
                <TextField select size="small" label="Filter slot type" value={slotType}
                    onChange={event => setSlotType(event.target.value)}>
                    <MenuItem value="all">All types</MenuItem>
                    <MenuItem value="armor">Armor</MenuItem><MenuItem value="weapon">Weapon</MenuItem>
                </TextField>
                <TextField select size="small" label="Filter slot size" value={slotSize}
                    onChange={event => setSlotSize(event.target.value)}>
                    <MenuItem value="all">All sizes</MenuItem>
                    {[1, 2, 3].map(size => <MenuItem key={size} value={size}>Level {size}</MenuItem>)}
                </TextField>
            </div>
            <div className="decoration-filter-options">
                <FormControlLabel control={<Switch checked={ownedOnly}
                    onChange={event => setOwnedOnly(event.target.checked)} />} label="Owned only" />
                <FormControlLabel control={<Switch checked={fields.showDecoSkillNames}
                    onChange={ev => updateField('showDecoSkillNames', ev.target.checked)} />} label="Label by skill names" />
                <Button onClick={resetFilters}>Clear filters</Button>
            </div>
            <div className="decoration-bulk-actions">
                <span>Applies to all jewels, including custom decorations.</span>
                <Button onClick={() => setAllAmounts(0)} variant="outlined" color="error" size="small">Empty Inventory</Button>
                <Button onClick={() => setAllAmounts(99)} variant="outlined" size="small">Fill Inventory</Button>
            </div>
        </section>

        {renderCustomDecorations()}

        {renderDecos()}
    </div>;
};
DecoInventory.propTypes = {

};
export default DecoInventory;
