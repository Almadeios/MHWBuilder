import { useState } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import SKILLS from "../data/compact/skills.json";
import RULES from "../data/talisman-generator/rules.json";
import { generateTalismans, hasTalismanGeneratorRules } from "../util/talismanGenerator";
import { useStorage } from "../hooks/StorageContext";

const EMPTY_TALISMAN_FORM = {
  name: '',
  skillRows: [
    { name: '', level: 1 },
    { name: '', level: 1 },
    { name: '', level: 1 }
  ],
  slots: '0-0-0',
  weaponSlots: '0-0-0'
};

const SLOT_OPTIONS = [];
for (let a = 0; a <= 3; a += 1) {
  for (let b = 0; b <= a; b += 1) {
    for (let c = 0; c <= b; c += 1) {
      SLOT_OPTIONS.push(`${a}-${b}-${c}`);
    }
  }
}

const parseSlots = value => {
  return value.split('-').map(slot => {
    if (typeof slot === 'string' && slot.toUpperCase().startsWith('W')) {
      return Number(slot.slice(1));
    }
    return Number(slot);
  }).filter(Boolean).sort((a, b) => b - a);
};

const slotsMatch = (a, b) => {
  if (!a || !b) { return false; }
  if (a.length !== b.length) { return false; }
  return a.every((value, index) => value === b[index]);
};

const normalizeSkillEntry = entry => {
  if (Array.isArray(entry)) {
    return { skill: entry[0], maxLevel: Number(entry[1]) };
  }
  return {
    skill: entry.skill || entry.name,
    maxLevel: Number(entry.maxLevel || entry.level || entry.max || 1)
  };
};

const getGroupEntries = groupId => {
  const group = RULES.groups[String(groupId)] || [];
  return group.map(normalizeSkillEntry).filter(entry => entry.skill && SKILLS[entry.skill]);
};

const getTemplateGroups = template => {
  return template.skillGroups || [template.skill1Group, template.skill2Group, template.skill3Group].filter(x => x && x !== "-");
};

const isTemplateCompatible = (groupIds, selectedSkills) => {
  const skills = selectedSkills.filter(Boolean);
  const uniqueSkills = new Set(skills);
  if (uniqueSkills.size !== skills.length) {
    return false;
  }
  const slots = groupIds.map(groupId => getGroupEntries(groupId).map(entry => entry.skill));
  if (skills.length > slots.length) {
    return false;
  }

  const assignSkill = (index, usedSlots) => {
    if (index >= skills.length) {
      return true;
    }
    const skill = skills[index];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (usedSlots.has(slotIndex)) { continue; }
      if (slots[slotIndex].includes(skill)) {
        usedSlots.add(slotIndex);
        if (assignSkill(index + 1, usedSlots)) {
          return true;
        }
        usedSlots.delete(slotIndex);
      }
    }
    return false;
  };

  return assignSkill(0, new Set());
};

const getCompatibleTemplates = (selectedSkills, armorSlots = null, weaponSlots = null) => {
  const chosenSkills = selectedSkills.filter(Boolean);
  return RULES.templates.filter(template => {
    const groupIds = getTemplateGroups(template);
    if (!isTemplateCompatible(groupIds, chosenSkills)) {
      return false;
    }
    if (armorSlots !== null && weaponSlots !== null) {
      return (template.slotCombos || []).some(combo => {
        const { armorSlots: comboArmor, weaponSlots: comboWeapon } = splitSlotCombo(combo);
        return slotsMatch(comboArmor, armorSlots) && slotsMatch(comboWeapon, weaponSlots);
      });
    }
    return true;
  });
};

const splitSlotCombo = combo => {
  const armorSlots = [];
  const weaponSlots = [];
  for (const slot of combo) {
    if (!slot || slot === "0") { continue; }
    if (typeof slot === "string" && slot.toUpperCase().startsWith("W")) {
      weaponSlots.push(Number(slot.slice(1)));
      continue;
    }
    armorSlots.push(Number(slot));
  }
  return {
    armorSlots: armorSlots.filter(Boolean).sort((a, b) => b - a),
    weaponSlots: weaponSlots.filter(Boolean).sort((a, b) => b - a)
  };
};

const slotsToString = slots => {
  const sorted = [...slots].filter(Boolean).sort((a, b) => b - a);
  return [sorted[0] || 0, sorted[1] || 0, sorted[2] || 0].join("-");
};

const weaponSlotsToString = slots => {
  if (!slots || slots.length === 0) { return '0-0-0'; }
  const sorted = [...slots].filter(Boolean).sort((a, b) => b - a);
  return sorted.map(s => `W${s}`).concat(Array(3 - sorted.length).fill(0)).slice(0, 3).join("-");
};

const getMaxAllowedLevelForSkill = (skill, selectedSkills) => {
  const compatible = getCompatibleTemplates(selectedSkills);
  let maxLevel = 1;
  compatible.forEach(template => {
    getTemplateGroups(template).forEach(groupId => {
      getGroupEntries(groupId).forEach(entry => {
        if (entry.skill === skill) {
          maxLevel = Math.max(maxLevel, entry.maxLevel);
        }
      });
    });
  });
  return maxLevel;
};

const CharmCreator = () => {
  const { fields, updateField } = useStorage();
  const [form, setForm] = useState(EMPTY_TALISMAN_FORM);

  const customTalismans = fields.customTalismans || [];
  const useOnlyOwnedTalismans = fields.useOnlyOwnedTalismans || false;
  const allGeneratedCharms = hasTalismanGeneratorRules() && Object.keys(fields.skills || {}).length
    ? Object.entries(generateTalismans(fields.skills))
    : [];
  const generatedTruncated = allGeneratedCharms.length > 50;
  const generatedCharms = allGeneratedCharms.slice(0, 50);

  const normalizedSkillRows = form.skillRows.map(row => {
    if (!row.name) { return row; }
    const maxLevel = getMaxAllowedLevelForSkill(row.name, form.skillRows.map(r => r.name).filter(Boolean));
    return {
      ...row,
      level: Math.max(1, Math.min(row.level, maxLevel))
    };
  });

  const selectedSkillNames = normalizedSkillRows.map(row => row.name).filter(Boolean);
  const slotFilterActive = form.slots !== '0-0-0' || form.weaponSlots !== '0-0-0';
  const currentArmorSlots = slotFilterActive ? parseSlots(form.slots) : null;
  const currentWeaponSlots = slotFilterActive ? parseSlots(form.weaponSlots) : null;
  const compatibleTemplates = getCompatibleTemplates(selectedSkillNames, currentArmorSlots, currentWeaponSlots);

  const getAllowedSkillsForRow = rowIndex => {
    const selectedOthers = normalizedSkillRows
      .map((row, index) => index === rowIndex ? null : row.name)
      .filter(Boolean);
    const slotFilterActive = form.slots !== '0-0-0' || form.weaponSlots !== '0-0-0';
    const currentArmorSlots = slotFilterActive ? parseSlots(form.slots) : null;
    const currentWeaponSlots = slotFilterActive ? parseSlots(form.weaponSlots) : null;
    
    const allSkills = new Set();
    
    // Restrict groups by skill position based on template structure
    let allowedGroups;
    if (rowIndex === 0) {
      allowedGroups = [1, 2, 3, 4]; // Skill 1: offensive/weapon foundation
    } else if (rowIndex === 1) {
      allowedGroups = [1, 6, 7, 8, 9, 10]; // Skill 2: mixed offensive or utility/unique
    } else {
      allowedGroups = [4, 5, 6, 7, 8]; // Skill 3: utility-focused or secondary offensive
    }
    
    allowedGroups.forEach(groupId => {
      getGroupEntries(groupId).forEach(entry => allSkills.add(entry.skill));
    });

    const allowed = new Set();
    allSkills.forEach(skill => {
      if (selectedOthers.includes(skill)) { return; }
      const candidateSkills = [...selectedOthers, skill];
      if (getCompatibleTemplates(candidateSkills, currentArmorSlots, currentWeaponSlots).length > 0) {
        allowed.add(skill);
      }
    });

    return [...allowed].sort();
  };

  const supportsThreeSkills = () => {
    if (!normalizedSkillRows[1].name) { return false; }
    
    const skill1Name = normalizedSkillRows[0].name;
    const skill1Level = normalizedSkillRows[0].level;
    const skill2Name = normalizedSkillRows[1].name;
    const skill2Level = normalizedSkillRows[1].level;
    
    const allowedRow2Skills = getAllowedSkillsForRow(2);
    if (allowedRow2Skills.length === 0) { return false; }
    
    // Check if ANY allowed skill for row 2 keeps current levels valid
    for (const skill3 of allowedRow2Skills) {
      const threeSkillSelection = [skill1Name, skill2Name, skill3];
      const threeSkillTemplates = getCompatibleTemplates(threeSkillSelection, currentArmorSlots, currentWeaponSlots);
      
      // Check if current levels are valid in any 3-skill template
      for (const template of threeSkillTemplates) {
        const groupIds = getTemplateGroups(template);
        if (groupIds.length >= 3) {
          // Verify skill1 and skill2 can maintain their levels
          const skill1MaxInTemplate = groupIds.map(gid => {
            const entries = getGroupEntries(gid);
            const entry = entries.find(e => e.skill === skill1Name);
            return entry ? entry.maxLevel : 0;
          }).reduce((a, b) => Math.max(a, b), 0);
          
          const skill2MaxInTemplate = groupIds.map(gid => {
            const entries = getGroupEntries(gid);
            const entry = entries.find(e => e.skill === skill2Name);
            return entry ? entry.maxLevel : 0;
          }).reduce((a, b) => Math.max(a, b), 0);
          
          if (skill1MaxInTemplate >= skill1Level && skill2MaxInTemplate >= skill2Level) {
            return true;
          }
        }
      }
    }
    
    return false;
  };

  const allowedArmorSlotOptions = new Set();
  const allowedWeaponSlotOptions = new Set();
  compatibleTemplates.forEach(template => {
    (template.slotCombos || []).forEach(combo => {
      const { armorSlots, weaponSlots } = splitSlotCombo(combo);
      allowedArmorSlotOptions.add(slotsToString(armorSlots));
      allowedWeaponSlotOptions.add(weaponSlotsToString(weaponSlots));
    });
  });

  const armorSlotOptions = allowedArmorSlotOptions.size
    ? [...allowedArmorSlotOptions].sort()
    : SLOT_OPTIONS;
  const weaponSlotOptions = allowedWeaponSlotOptions.size
    ? [...allowedWeaponSlotOptions].sort()
    : SLOT_OPTIONS;


  const updateForm = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const sanitizeSlotSelection = (selectedSkillNames, slots, weaponSlots) => {
    const compatible = getCompatibleTemplates(selectedSkillNames);
    const allowedArmor = new Set();
    const allowedWeapon = new Set();

    compatible.forEach(template => {
      (template.slotCombos || []).forEach(combo => {
        const { armorSlots: aSlots, weaponSlots: wSlots } = splitSlotCombo(combo);
        allowedArmor.add(slotsToString(aSlots));
        allowedWeapon.add(weaponSlotsToString(wSlots));
      });
    });

    const armorOptions = allowedArmor.size ? [...allowedArmor] : SLOT_OPTIONS;
    const weaponOptions = allowedWeapon.size ? [...allowedWeapon] : SLOT_OPTIONS;

    return {
      slots: armorOptions.includes(slots) ? slots : armorOptions[0] || '0-0-0',
      weaponSlots: weaponOptions.includes(weaponSlots) ? weaponSlots : weaponOptions[0] || '0-0-0'
    };
  };

  const updateSkillRow = (index, key, value) => {
    const skillRows = [...form.skillRows];
    skillRows[index] = { ...skillRows[index], [key]: value };
    if (key === 'name' && !value) {
      skillRows[index].level = 1;
    }

    const selectedSkillNames = skillRows.map(row => row.name).filter(Boolean);
    const sanitizedSlots = sanitizeSlotSelection(selectedSkillNames, form.slots, form.weaponSlots);
    setForm({ ...form, skillRows, ...sanitizedSlots });
  };

  const getFormSkills = () => Object.fromEntries(
    normalizedSkillRows.filter(row => row.name).map(row => [row.name, row.level])
  );

  const validateCustomTalisman = () => {
    if (!hasTalismanGeneratorRules()) { return true; }
    const skills = getFormSkills();
    if (Object.keys(skills).length === 0) { return false; }
    
    const skillNames = Object.keys(skills);
    const manualSlots = parseSlots(form.slots);
    const manualWeaponSlots = parseSlots(form.weaponSlots);
    
    // Check if this skill + slot combo matches any template
    const validTemplates = compatibleTemplates.filter(template => {
      return (template.slotCombos || []).some(combo => {
        const { armorSlots: comboArmor, weaponSlots: comboWeapon } = splitSlotCombo(combo);
        return slotsMatch(comboArmor, manualSlots) && slotsMatch(comboWeapon, manualWeaponSlots);
      });
    });
    
    if (validTemplates.length === 0) { return false; }
    
    // Also verify via generateTalismans for extra safety
    const generated = generateTalismans(skills);
    const skillsMatch = (a, b) => {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) { return false; }
      return aKeys.every(key => b[key] === a[key]);
    };

    return Object.values(generated).some(talisman => {
      const [_, generatedSkills, __, generatedSlots, ___, ____, _____, _______, generatedWeaponSlots] = talisman;
      return skillsMatch(generatedSkills, skills) &&
        slotsMatch(generatedSlots, manualSlots) &&
        slotsMatch(generatedWeaponSlots || [], manualWeaponSlots);
    });
  };

  const addCustomTalisman = () => {
    const skills = Object.fromEntries(
      normalizedSkillRows.filter(row => row.name).map(row => [row.name, row.level])
    );

    if (Object.keys(skills).length === 0) {
      window.snackbar?.createSnackbar(`Choose at least one skill for the charm`, { timeout: 3000 });
      return;
    }

    if (!validateCustomTalisman()) {
      return;
    }

    const name = form.name.trim() || `Custom Talisman ${customTalismans.length + 1}`;
    const newTalisman = {
      id: `${Date.now()}-${customTalismans.length}`,
      name,
      skills,
      slots: parseSlots(form.slots),
      weaponSlots: parseSlots(form.weaponSlots)
    };

    updateField('customTalismans', [...customTalismans, newTalisman]);
    setForm(EMPTY_TALISMAN_FORM);
  };

  const removeCustomTalisman = id => {
    updateField('customTalismans', customTalismans.filter(talisman => talisman.id !== id));
  };

  const addGeneratedTalisman = (name, talismanData) => {
    const slots = talismanData[3] || [];
    const weaponSlots = talismanData[8] || [];
    const skills = talismanData[1] || {};
    const newTalisman = {
      id: `${Date.now()}-${customTalismans.length}`,
      name,
      skills,
      slots,
      weaponSlots
    };

    updateField('customTalismans', [...customTalismans, newTalisman]);
    window.snackbar?.createSnackbar(`Added ${name} to custom talismans`, { timeout: 3000 });
  };

  return (
    <div className="charm-creator">
      <Typography sx={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '0.75em' }}>
        Charm Creator
      </Typography>
      <Typography sx={{ marginBottom: '1em' }}>
        Create and manage custom talismans here. Saved charms are available in Search.
      </Typography>
      <Typography sx={{ marginBottom: '1em', color: '#555', fontSize: '0.95em' }}>
        Manual charms are validated against the same talisman rule templates used by the automatic generator. Legal charm suggestions update automatically from the current Search skills.
      </Typography>
      <div style={{ display: 'grid', gap: '1em', maxWidth: '760px' }}>
        <TextField
          size="small"
          label="Talisman Name"
          value={form.name}
          onChange={ev => updateForm('name', ev.target.value)}
        />

        {normalizedSkillRows.map((row, index) => {
          const maxLevel = row.name ? getMaxAllowedLevelForSkill(row.name, selectedSkillNames) : 1;
          const allowedSkills = getAllowedSkillsForRow(index);
          const isSkillRowDisabled = index === 1 ? !normalizedSkillRows[0].name : index === 2 ? !normalizedSkillRows[1].name || !supportsThreeSkills() : false;
          return (
            <div key={`skill-row-${index}`} style={{ display: 'flex', gap: '0.75em', flexWrap: 'wrap', opacity: isSkillRowDisabled ? 0.5 : 1 }}>
              <TextField
                select
                size="small"
                label={`Skill ${index + 1}`}
                value={row.name}
                disabled={isSkillRowDisabled}
                onChange={ev => updateSkillRow(index, 'name', ev.target.value)}
                sx={{ minWidth: '220px' }}
              >
                <MenuItem value="">None</MenuItem>
                {allowedSkills.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </TextField>
              <TextField
                select
                size="small"
                label="Level"
                disabled={!row.name || isSkillRowDisabled}
                value={row.level}
                onChange={ev => updateSkillRow(index, 'level', Number(ev.target.value))}
                sx={{ width: '90px' }}
              >
                {Array.from({ length: maxLevel }, (_, i) => i + 1).map(level => <MenuItem key={level} value={level}>{level}</MenuItem>)}
              </TextField>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '0.75em', flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="Armor Slots"
            value={form.slots}
            onChange={ev => updateForm('slots', ev.target.value)}
            sx={{ minWidth: '150px' }}
          >
            {armorSlotOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </TextField>
          <TextField
            select
            size="small"
            label="Weapon Slots"
            value={form.weaponSlots}
            onChange={ev => updateForm('weaponSlots', ev.target.value)}
            sx={{ minWidth: '150px' }}
          >
            {weaponSlotOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </TextField>
        </div>

        <Button variant="contained" onClick={addCustomTalisman} disabled={!validateCustomTalisman()}>
          Add Custom Talisman
        </Button>
        {!validateCustomTalisman() && <Typography sx={{ color: 'error.main', fontSize: '0.9em' }}>
          Current selection does not match any legal talisman template.
        </Typography>}
        {generatedCharms.length > 0 &&
          <div style={{ padding: '0.75em', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '8px' }}>
            <Typography sx={{ fontWeight: 'bold', marginBottom: '0.5em' }}>
              Generated Legal Charms
            </Typography>
            {generatedCharms.map(([name, talismanData]) =>
              <div key={name} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5em 0',
                borderBottom: '1px solid rgba(0,0,0,0.08)'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95em' }}>{name}</div>
                  <div style={{ fontSize: '0.85em', color: '#555' }}>
                    Slots: {(talismanData[3] || []).join('-') || 'none'} · Weapon: {(talismanData[8] || []).map(x => `W${x}`).join('-') || 'none'}
                  </div>
                </div>
                <Button size="small" variant="outlined" onClick={() => addGeneratedTalisman(name, talismanData)}>
                  Add
                </Button>
              </div>
            )}
            {generatedTruncated && <Typography sx={{ marginTop: '0.5em', fontSize: '0.85em', color: '#777' }}>
              Showing first 50 generated charms.
            </Typography>}
          </div>
        }

        <FormControlLabel
          control={<Checkbox checked={useOnlyOwnedTalismans} />}
          onChange={ev => updateField('useOnlyOwnedTalismans', ev.target.checked)}
          label="Use only base + custom talismans in Search"
        />

        <div>
          <Typography sx={{ fontWeight: 'bold', marginTop: '1.25em' }}>
            Saved Custom Talismans
          </Typography>
          {customTalismans.length === 0 && <Typography>No custom talismans yet.</Typography>}
          {customTalismans.map(talisman =>
            <div key={talisman.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75em',
              border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: '8px',
              marginTop: '0.5em'
            }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{talisman.name}</div>
                <div style={{ fontSize: '0.95em', color: '#555' }}>
                  {Object.entries(talisman.skills).map(([name, level]) => `${name} ${level}`).join(' / ')}
                </div>
                <div style={{ fontSize: '0.85em', color: '#777' }}>
                  Slots: {(talisman.slots || []).join('-') || 'none'} · Weapon: {(talisman.weaponSlots || []).map(x => `W${x}`).join('-') || 'none'}
                </div>
              </div>
              <Button variant="outlined" color="error" onClick={() => removeCustomTalisman(talisman.id)}>
                Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CharmCreator;
