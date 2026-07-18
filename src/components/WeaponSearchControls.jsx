import PropTypes from 'prop-types';
import { MenuItem, TextField } from '@mui/material';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import SET_SKILLS from '../data/compact/set-skills.json';

const SHARPNESS_OPTIONS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'White', 'Purple'];
const WEAPON_TYPE_OPTIONS = [
  { value: 'other', label: 'Other' },
  { value: 'great_sword_hunting_horn', label: 'GS / HH' },
  { value: 'hammer_gunlance_switch_axe_charge_blade', label: 'Hammer / GL / SA / CB' },
  { value: 'dual_blades', label: 'Dual Blades' },
  { value: 'ranged', label: 'Ranged' }
];
const ELEMENT_OPTIONS = [
  'None', 'Fire', 'Water', 'Thunder', 'Ice', 'Dragon', 'Poison', 'Sleep', 'Paralysis', 'Blast'
];
const WEAPON_SLOT_OPTIONS = [];
for (let first = 0; first <= 3; first++) {
  for (let second = 0; second <= first; second++) {
    for (let third = 0; third <= second; third++) {
      WEAPON_SLOT_OPTIONS.push([first, second, third]);
    }
  }
}

const BonusSelect = ({ label, options, value, onChange }) => <TextField
  select
  size="small"
  label={label}
  value={value || ''}
  onChange={event => onChange(event.target.value)}
  sx={{ minWidth: '190px' }}
  title={`Adds 1 point toward the selected ${label.toLowerCase()} requirement`}
>
  <MenuItem value="">None</MenuItem>
  {Object.keys(options).sort().map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
</TextField>;

BonusSelect.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.object.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired
};

const WeaponSearchControls = ({ fields, updateField }) => {
  const slots = [0, 0, 0];
  (fields.weaponSlots || []).forEach((slot, index) => { slots[index] = slot; });
  const slotValue = slots.join('-');
  const updateNumber = (field, value) => {
    if (value === '') {
      updateField(field, '');
      return;
    }
    const parsed = Number(value);
    updateField(field, Number.isFinite(parsed) ? parsed : '');
  };

  return <>
    <TextField
      select
      size="small"
      label="Weapon Slots"
      value={slotValue}
      onChange={event => updateField(
        'weaponSlots', event.target.value.split('-').map(Number).filter(Boolean).sort((a, b) => b - a)
      )}
      sx={{ minWidth: '130px' }}
      title="Weapon decoration slots available on your weapon"
    >
      {WEAPON_SLOT_OPTIONS.map(option => {
        const value = option.join('-');
        return <MenuItem key={value} value={value}>{value}</MenuItem>;
      })}
    </TextField>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
      <TextField select size="small" label="Weapon Type" value={fields.weaponType || 'other'}
        onChange={event => updateField('weaponType', event.target.value)} sx={{ minWidth: '125px' }}
        title="Used for Burst raw and element values">
        {WEAPON_TYPE_OPTIONS.map(option =>
          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
      </TextField>
      <TextField size="small" label="Base Raw" type="number" value={fields.weaponBaseRaw ?? 0}
        onChange={event => updateNumber('weaponBaseRaw', event.target.value)} placeholder="100"
        sx={{ minWidth: '110px' }} title="Weapon base attack; an empty value uses 100" />
      <TextField size="small" label="Base Affinity" type="number" value={fields.weaponBaseAffinity ?? 0}
        onChange={event => updateNumber('weaponBaseAffinity', event.target.value)} sx={{ minWidth: '125px' }}
        title="Weapon base affinity" />
      <TextField select size="small" label="Element" value={fields.weaponElementType || 'None'}
        onChange={event => updateField('weaponElementType', event.target.value)} sx={{ minWidth: '110px' }}
        title="Weapon element type">
        {ELEMENT_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
      </TextField>
      <TextField size="small" label="Element Value" type="number" value={fields.weaponElementValue ?? 0}
        onChange={event => updateNumber('weaponElementValue', event.target.value)} placeholder="100"
        sx={{ minWidth: '120px' }} title="Weapon element damage; an empty value uses 100" />
      <TextField select size="small" label="Sharpness" value={fields.weaponSharpness || 'White'}
        onChange={event => updateField('weaponSharpness', event.target.value)} sx={{ minWidth: '110px' }}
        title="Current sharpness color">
        {SHARPNESS_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
      </TextField>
    </div>
    <BonusSelect label="Group Skill +1" options={GROUP_SKILLS} value={fields.groupSkillBonus}
      onChange={value => updateField('groupSkillBonus', value)} />
    <BonusSelect label="Set Bonus +1" options={SET_SKILLS} value={fields.setSkillBonus}
      onChange={value => updateField('setSkillBonus', value)} />
  </>;
};

WeaponSearchControls.propTypes = {
  fields: PropTypes.object.isRequired,
  updateField: PropTypes.func.isRequired
};

export default WeaponSearchControls;
