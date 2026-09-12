/* eslint-disable max-len */
import { useState } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import SKILLS from "../data/compact/skills.json";
import { useStorage } from "../hooks/StorageContext";
import { getCustomTalismanKey, MAX_CUSTOM_TALISMANS, MAX_TALISMAN_NAME_LENGTH } from "../util/customTalismans";

const EMPTY_TALISMAN_FORM = { name: '', skillRows: [{ name: '', level: 1 }, { name: '', level: 1 }, { name: '', level: 1 }], slots: '0-0-0', weaponSlots: '0-0-0' };
const SLOT_OPTIONS = [];
for (let first = 0; first <= 3; first += 1) {
  for (let second = 0; second <= first; second += 1) {
    for (let third = 0; third <= second; third += 1) { SLOT_OPTIONS.push(`${first}-${second}-${third}`); }
  }
}
const parseSlots = value => value.split('-').map(slot => Number(slot.replace(/^W/i, ''))).filter(Boolean).sort((a, b) => b - a);
const getSlotImage = slotSize => `images/slot${slotSize}.png`;
const renderSlotSummary = (armorSlots = [], weaponSlots = []) => {
  const icon = (slotSize, type, index) => <img key={`${type}-${slotSize}-${index}`} src={getSlotImage(slotSize)} alt={`${type} slot ${slotSize}`} title={`${type} slot ${slotSize}`} style={{ width: '16px', height: '16px', display: 'inline-block' }} />;
  const armor = [...armorSlots].sort((a, b) => b - a).map((size, index) => icon(size, 'armor', index));
  const weapon = [...weaponSlots].sort((a, b) => b - a).map((size, index) => icon(size, 'weapon', index));
  return <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', marginTop: '0.25em' }}>
    {weapon.length > 0 && <span title="Weapon decoration slots" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '1px 4px', border: '1px solid rgba(128, 214, 224, 0.35)', borderRadius: '4px', background: 'rgba(74, 144, 156, 0.14)' }}><span style={{ color: '#9ee8f0', fontSize: '10px', fontWeight: 700, lineHeight: 1, textTransform: 'uppercase' }}>Weapon</span>{weapon}</span>}
    {armor}
  </div>;
};

const CharmCreator = () => {
  const { fields, updateField } = useStorage();
  const [form, setForm] = useState(EMPTY_TALISMAN_FORM);
  const customTalismans = fields.customTalismans || [];
  const useOnlyOwnedTalismans = fields.useOnlyOwnedTalismans || false;
  const selectedSkillNames = form.skillRows.map(row => row.name).filter(Boolean);
  const updateForm = (key, value) => setForm({ ...form, [key]: value });
  const updateSkillRow = (index, key, value) => {
    const skillRows = [...form.skillRows];
    skillRows[index] = { ...skillRows[index], [key]: value };
    if (key === 'name') { skillRows[index].level = 1; }
    setForm({ ...form, skillRows });
  };
  const allowedSkills = index => Object.keys(SKILLS).filter(name => !form.skillRows.some((row, rowIndex) => rowIndex !== index && row.name === name)).sort();
  const formSkills = () => Object.fromEntries(form.skillRows.filter(row => row.name).map(row => [row.name, Math.min(Math.max(1, Number(row.level) || 1), SKILLS[row.name])]));
  const addCustomTalisman = () => {
    const skills = formSkills();
    if (!Object.keys(skills).length) { window.snackbar?.createSnackbar('Choose at least one skill for the charm.', { timeout: 3000 }); return; }
    if (customTalismans.length >= MAX_CUSTOM_TALISMANS) { window.snackbar?.createSnackbar(`You can save up to ${MAX_CUSTOM_TALISMANS} custom talismans.`, { timeout: 5000 }); return; }
    const name = (form.name.trim() || `Custom Talisman ${customTalismans.length + 1}`).slice(0, MAX_TALISMAN_NAME_LENGTH);
    const talisman = { id: `${Date.now()}-${customTalismans.length}`, name, skills, slots: parseSlots(form.slots), weaponSlots: parseSlots(form.weaponSlots) };
    if (customTalismans.some(existing => getCustomTalismanKey(existing) === getCustomTalismanKey(talisman))) { window.snackbar?.createSnackbar('That talisman is already saved.', { timeout: 4000 }); return; }
    if (updateField('customTalismans', [...customTalismans, talisman])) { setForm(EMPTY_TALISMAN_FORM); }
  };
  return <div className="charm-creator">
    <header className="search-intro"><h1>Charm Creator</h1><p>Create any custom charm you want, then make it available to Search.</p></header>
    <div className="charm-workspace">
      <section className="search-section charm-form" aria-labelledby="create-charm-heading">
        <div className="search-section-heading"><h2 id="create-charm-heading">Create a charm</h2></div>
        <p className="search-section-description">Choose up to three different skills, their normal maximum levels, and any slot layout. Custom charms are not restricted to game templates.</p>
        <TextField size="small" label="Talisman Name" value={form.name} onChange={event => updateForm('name', event.target.value)} inputProps={{ maxLength: MAX_TALISMAN_NAME_LENGTH }} helperText={`${form.name.length}/${MAX_TALISMAN_NAME_LENGTH}`} />
        {form.skillRows.map((row, index) => {
          const maxLevel = row.name ? SKILLS[row.name] : 1;
          return <div key={`skill-row-${index}`} className="charm-skill-row">
            <TextField select size="small" label={`Skill ${index + 1}`} value={row.name} onChange={event => updateSkillRow(index, 'name', event.target.value)} sx={{ minWidth: '220px' }}>
              <MenuItem value="">None</MenuItem>{allowedSkills(index).map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={`Skill ${index + 1} level`} disabled={!row.name} value={row.level} onChange={event => updateSkillRow(index, 'level', Number(event.target.value))} sx={{ width: '90px' }}>
              {Array.from({ length: maxLevel }, (_, number) => number + 1).map(level => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
          </div>;
        })}
        <div className="charm-slot-row">
          <TextField select size="small" label="Armor Slots" value={form.slots} onChange={event => updateForm('slots', event.target.value)} sx={{ minWidth: '150px' }}>{SLOT_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>
          <TextField select size="small" label="Weapon Slots" value={form.weaponSlots} onChange={event => updateForm('weaponSlots', event.target.value)} sx={{ minWidth: '150px' }}>{SLOT_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>
        </div>
        <Button variant="contained" onClick={addCustomTalisman} disabled={!selectedSkillNames.length}>Add Custom Talisman</Button>
      </section>
      <section className="search-section charm-library" aria-labelledby="saved-charms-heading">
        <div className="search-section-heading"><h2 id="saved-charms-heading">Saved charms</h2><span className="search-selection-count">{customTalismans.length} saved</span></div>
        <p className="search-section-description">Your custom talismans are available in Search.</p>
        <FormControlLabel control={<Checkbox checked={useOnlyOwnedTalismans} />} onChange={event => updateField('useOnlyOwnedTalismans', event.target.checked)} label="Use only base + custom talismans in Search" />
        <div>
          {!customTalismans.length && <p className="charm-empty-state">No charms saved yet. Create your first charm using the form.</p>}
          {customTalismans.map(talisman => <div key={talisman.id} className="saved-charm-card"><div><div style={{ fontWeight: 'bold' }}>{talisman.name}</div><div className="saved-charm-skills">{Object.entries(talisman.skills).map(([name, level]) => `${name} ${level}`).join(' / ')}</div><div className="saved-charm-slots">{renderSlotSummary(talisman.slots || [], talisman.weaponSlots || [])}</div></div><Button variant="outlined" color="error" onClick={() => updateField('customTalismans', customTalismans.filter(item => item.id !== talisman.id))}>Remove</Button></div>)}
        </div>
      </section>
    </div>
  </div>;
};

export default CharmCreator;
