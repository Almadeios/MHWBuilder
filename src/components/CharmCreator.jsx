import { useState } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import SKILLS from "../data/compact/skills.json";
import RULES from "../data/talisman-generator/rules.json";
import { hasTalismanGeneratorRules } from "../util/talismanGenerator";
import { useStorage } from "../hooks/StorageContext";
import {
  getCustomTalismanKey,
  MAX_CUSTOM_TALISMANS,
  MAX_TALISMAN_NAME_LENGTH
} from "../util/customTalismans";

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

const isTemplateRollCompatible = (groupIds, selectedSkills) => {
  const skills = Object.entries(selectedSkills);
  const groups = groupIds.map(getGroupEntries);
  const assignSkill = (index, usedGroups) => {
    if (index >= skills.length) { return true; }
    const [skillName, level] = skills[index];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      if (usedGroups.has(groupIndex)) { continue; }
      const entry = groups[groupIndex].find(candidate => candidate.skill === skillName);
      if (!entry || entry.maxLevel < level) { continue; }
      usedGroups.add(groupIndex);
      if (assignSkill(index + 1, usedGroups)) { return true; }
      usedGroups.delete(groupIndex);
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

export const getCompatibleSlotOptions = (selectedSkills, armorSlotValue, weaponSlotValue) => {
  const currentArmorSlots = parseSlots(armorSlotValue);
  const currentWeaponSlots = parseSlots(weaponSlotValue);
  const armorOptions = new Set();
  const weaponOptions = new Set();

  // Each selector must be constrained only by the other selector. Filtering by
  // both current values first traps the form in the current template family
  // (for example, R7 without W1 cannot transition to the equivalent R8 roll).
  getCompatibleTemplates(selectedSkills).forEach(template => {
    (template.slotCombos || []).forEach(combo => {
      const { armorSlots, weaponSlots } = splitSlotCombo(combo);
      if (slotsMatch(weaponSlots, currentWeaponSlots)) {
        armorOptions.add(slotsToString(armorSlots));
      }
      if (slotsMatch(armorSlots, currentArmorSlots)) {
        weaponOptions.add(weaponSlotsToString(weaponSlots));
      }
    });
  });

  return {
    armorOptions: [...armorOptions].sort(),
    weaponOptions: [...weaponOptions].sort()
  };
};

const getSlotImage = slotSize => `images/slot${slotSize}.png`;

const renderSlotSummary = (armorSlots = [], weaponSlots = []) => {
  const armorIcons = [...armorSlots].sort((a, b) => b - a).map((slotSize, index) =>
    <img
      key={`armor-${slotSize}-${index}`}
      src={getSlotImage(slotSize)}
      alt={`slot ${slotSize}`}
      title={`armor slot ${slotSize}`}
      style={{ width: '16px', height: '16px', display: 'inline-block' }}
    />
  );

  const weaponIcons = [...weaponSlots].sort((a, b) => b - a).map((slotSize, index) =>
    <img
      key={`weapon-${slotSize}-${index}`}
      src={getSlotImage(slotSize)}
      alt={`weapon slot ${slotSize}`}
      title={`weapon slot ${slotSize}`}
      style={{ width: '16px', height: '16px', display: 'inline-block' }}
    />
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', marginTop: '0.25em' }}>
      {weaponIcons.length > 0 && <span
        title="Weapon decoration slots"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          padding: '1px 4px',
          border: '1px solid rgba(128, 214, 224, 0.35)',
          borderRadius: '4px',
          background: 'rgba(74, 144, 156, 0.14)'
        }}>
        <span style={{
          color: '#9ee8f0',
          fontSize: '10px',
          fontWeight: 700,
          lineHeight: 1,
          textTransform: 'uppercase'
        }}>
          Weapon
        </span>
        {weaponIcons}
      </span>}
      {armorIcons}
    </div>
  );
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
  const hasManualSelection = selectedSkillNames.length > 0 || slotFilterActive || Boolean(form.name.trim());
  const currentArmorSlots = slotFilterActive ? parseSlots(form.slots) : null;
  const currentWeaponSlots = slotFilterActive ? parseSlots(form.weaponSlots) : null;
  const compatibleTemplates = getCompatibleTemplates(selectedSkillNames, currentArmorSlots, currentWeaponSlots);

  const getAllowedSkillsForRow = rowIndex => {
    const selectedOthers = normalizedSkillRows
      .map((row, index) => index === rowIndex ? null : row.name)
      .filter(Boolean);
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

  const compatibleSlotOptions = getCompatibleSlotOptions(
    selectedSkillNames,
    form.slots,
    form.weaponSlots
  );
  const armorSlotOptions = compatibleSlotOptions.armorOptions.length ?
    compatibleSlotOptions.armorOptions :
    SLOT_OPTIONS;
  const weaponSlotOptions = compatibleSlotOptions.weaponOptions.length ?
    compatibleSlotOptions.weaponOptions :
    SLOT_OPTIONS;

  const updateForm = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const sanitizeSlotSelection = (skillNames, slots, weaponSlots) => {
    const compatible = getCompatibleTemplates(skillNames);
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

    const updatedSkillNames = skillRows.map(row => row.name).filter(Boolean);
    const sanitizedSlots = sanitizeSlotSelection(updatedSkillNames, form.slots, form.weaponSlots);
    setForm({ ...form, skillRows, ...sanitizedSlots });
  };

  const getFormSkills = () => Object.fromEntries(
    normalizedSkillRows.filter(row => row.name).map(row => [row.name, row.level])
  );

  const validateCustomTalisman = () => {
    if (!hasTalismanGeneratorRules()) { return true; }
    const skills = getFormSkills();
    if (Object.keys(skills).length === 0) { return false; }

    const manualSlots = parseSlots(form.slots);
    const manualWeaponSlots = parseSlots(form.weaponSlots);

    // Check if this skill + slot combo matches any template
    const validTemplates = compatibleTemplates.filter(template => {
      if (!isTemplateRollCompatible(getTemplateGroups(template), skills)) { return false; }
      return (template.slotCombos || []).some(combo => {
        const { armorSlots: comboArmor, weaponSlots: comboWeapon } = splitSlotCombo(combo);
        return slotsMatch(comboArmor, manualSlots) && slotsMatch(comboWeapon, manualWeaponSlots);
      });
    });

    return validTemplates.length > 0;
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

    if (customTalismans.length >= MAX_CUSTOM_TALISMANS) {
      window.snackbar?.createSnackbar(`You can save up to ${MAX_CUSTOM_TALISMANS} custom talismans.`, {
        timeout: 5000
      });
      return;
    }

    const name = (form.name.trim() || `Custom Talisman ${customTalismans.length + 1}`)
      .slice(0, MAX_TALISMAN_NAME_LENGTH);
    const newTalisman = {
      id: `${Date.now()}-${customTalismans.length}`,
      name: String(name).slice(0, MAX_TALISMAN_NAME_LENGTH),
      skills,
      slots: parseSlots(form.slots),
      weaponSlots: parseSlots(form.weaponSlots)
    };

    if (customTalismans.some(talisman =>
      getCustomTalismanKey(talisman) === getCustomTalismanKey(newTalisman))) {
      window.snackbar?.createSnackbar('That talisman is already saved.', { timeout: 4000 });
      return;
    }

    if (updateField('customTalismans', [...customTalismans, newTalisman])) {
      setForm(EMPTY_TALISMAN_FORM);
    }
  };

  const removeCustomTalisman = id => {
    updateField('customTalismans', customTalismans.filter(talisman => talisman.id !== id));
  };

  return (
    <div className="charm-creator">
      <header className="search-intro">
        <h1>Charm Creator</h1>
        <p>Add your talismans and manage the charms available to your builds.</p>
      </header>
      <div className="charm-workspace">
      <section className="search-section charm-form" aria-labelledby="create-charm-heading">
        <div className="search-section-heading"><h2 id="create-charm-heading">Create a charm</h2></div>
        <p className="search-section-description">Choose up to three skills and decoration slots.
          Combinations are checked against the talisman templates.</p>
        <TextField
          size="small"
          label="Talisman Name"
          value={form.name}
          onChange={ev => updateForm('name', ev.target.value)}
          inputProps={{ maxLength: MAX_TALISMAN_NAME_LENGTH }}
          helperText={`${form.name.length}/${MAX_TALISMAN_NAME_LENGTH}`}
        />

        {normalizedSkillRows.map((row, index) => {
          const maxLevel = row.name ? getMaxAllowedLevelForSkill(row.name, selectedSkillNames) : 1;
          const allowedSkills = getAllowedSkillsForRow(index);
          const secondRowDisabled = index === 1 && !normalizedSkillRows[0].name;
          const thirdRowDisabled = index === 2 &&
            (!normalizedSkillRows[1].name || !supportsThreeSkills());
          const isSkillRowDisabled = secondRowDisabled || thirdRowDisabled;
          return (
            <div
              key={`skill-row-${index}`}
              className="charm-skill-row"
            >
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
                label={`Skill ${index + 1} level`}
                disabled={!row.name || isSkillRowDisabled}
                value={row.level}
                onChange={ev => updateSkillRow(index, 'level', Number(ev.target.value))}
                sx={{ width: '90px' }}
              >
                {Array.from({ length: maxLevel }, (_, i) => i + 1).map(level =>
                  <MenuItem key={level} value={level}>{level}</MenuItem>
                )}
              </TextField>
            </div>
          );
        })}

        <div className="charm-slot-row">
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
        {hasManualSelection && !validateCustomTalisman() && <Typography sx={{ color: 'error.main', fontSize: '0.9em' }}>
          Current selection does not match any legal talisman template.
        </Typography>}
      </section>
      <section className="search-section charm-library" aria-labelledby="saved-charms-heading">
        <div className="search-section-heading">
          <h2 id="saved-charms-heading">Saved charms</h2>
          <span className="search-selection-count">{customTalismans.length} saved</span>
        </div>
        <p className="search-section-description">Your custom talismans are available in Search.</p>
        <FormControlLabel
          control={<Checkbox checked={useOnlyOwnedTalismans} />}
          onChange={ev => updateField('useOnlyOwnedTalismans', ev.target.checked)}
          label="Use only base + custom talismans in Search"
        />

        <div>

          {customTalismans.length === 0 && <p className="charm-empty-state">
            No charms saved yet. Create your first charm using the form.
          </p>}
          {customTalismans.map(talisman =>
            <div key={talisman.id} className="saved-charm-card">
              <div>
                <div style={{ fontWeight: 'bold' }}>{talisman.name}</div>
                <div className="saved-charm-skills">
                  {Object.entries(talisman.skills).map(([name, level]) => `${name} ${level}`).join(' / ')}
                </div>
                <div className="saved-charm-slots">
                  {renderSlotSummary(talisman.slots || [], talisman.weaponSlots || [])}
                </div>
              </div>
              <Button variant="outlined" color="error" onClick={() => removeCustomTalisman(talisman.id)}>
                Remove
              </Button>
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
};

export default CharmCreator;
