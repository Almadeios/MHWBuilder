import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { toPng } from 'html-to-image';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import ArmorSvgWrapper from './ArmorSvgWrapper';
import {
  armorNameFormat, getArmorBonusPointsFromNames, getArmorDefenseFromName, getSkillPopup,
  isGroupSkillName, isSetSkillName
} from '../util/util';
import SKILL_MAX_LEVELS from '../data/compact/skills.json';
import SKILL_ICON_MAP from '../data/skills/skill-icon-map.json';
import './ShareSetDialog.css';

const ARMOR_TYPES = ['head', 'chest', 'arms', 'waist', 'legs', 'talisman'];
const ARMOR_LABELS = ['Head', 'Chest', 'Arms', 'Waist', 'Legs', 'Charm'];
const CONDITION_ICONS = new Map([
  ['powercharm', 'attack'], ['food_attack_up', 'attack'], ['burst_active', 'power'],
  ['coalescence_active', 'power'], ['frenzy_cured', 'power'], ['monster_enraged', 'power'],
  ['elemental_absorption_active', 'elemental'], ['full_health', 'recovery'], ['weak_point', 'crit']
]);

const formatNumber = value => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—';

const formatSkillEntries = skills => Object.entries(skills || {})
  .filter(([, level]) => Number(level) > 0)
  .sort(([left], [right]) => left.localeCompare(right));

const formatSlots = slots => {
  const values = (slots || []).filter(Boolean);
  return values.length ? values.map(size => `Lv${size}`).join(' · ') : 'None';
};

const getSlotImage = size => `${import.meta.env.BASE_URL}images/slot${size}.png`;

const SlotIcons = ({ className = '', label = 'Decoration slots', slots }) => {
  const values = (slots || []).filter(size => size >= 1 && size <= 4);
  if (!values.length) { return <span className="share-set-no-slots">None</span>; }
  return <span aria-label={`${label}: ${values.join(', ')}`}
    className={`share-set-slot-icons ${className}`}>
    {values.map((size, index) => <img alt="" key={`${size}-${index}`}
      src={getSlotImage(size)} title={`Level ${size} slot`} />)}
  </span>;
};

SlotIcons.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string,
  slots: PropTypes.array
};

const getArmorSkills = armor => formatSkillEntries(armor?.skills)
  .map(([name, level]) => `${name} +${level}`)
  .join(' · ');

const getManualBonusNames = result => {
  const armorPoints = getArmorBonusPointsFromNames(result?.armorNames || []);
  const inferredSetBonus = result?.armorNames?.length ? Object.entries(result?.setSkillPoints || {})
    .find(([name, points]) => points > (armorPoints.setSkillPoints[name] || 0))?.[0] : '';
  const inferredGroupBonus = result?.armorNames?.length ? Object.entries(result?.groupSkillPoints || {})
    .find(([name, points]) => points > (armorPoints.groupSkillPoints[name] || 0))?.[0] : '';
  return {
    set: result?.setSkillBonus || inferredSetBonus || '',
    group: result?.groupSkillBonus || inferredGroupBonus || ''
  };
};

export const buildSharedSetSummary = ({ armor = [], decorations = [], defense, result }) => {
  const lines = [result?.name || 'Unnamed Set', ''];
  const manualBonuses = getManualBonusNames(result);
  armor.forEach((piece, index) => {
    lines.push(`${ARMOR_LABELS[index] || 'Equipment'}: ${armorNameFormat(piece.name)}`);
    const skills = getArmorSkills(piece);
    if (skills) { lines.push(`  ${skills}`); }
    if (piece.slots?.length) { lines.push(`  Slots: ${formatSlots(piece.slots)}`); }
    if (piece.weaponSlots?.length) { lines.push(`  Weapon Slots: ${formatSlots(piece.weaponSlots)}`); }
  });
  if (decorations.length) {
    lines.push('', 'Decorations:');
    decorations.forEach(deco => lines.push(`- ${deco.name} x${deco.amount}`));
  }
  const skills = formatSkillEntries(result?.skills);
  if (skills.length) {
    lines.push('', 'Skills:');
    skills.forEach(([name, level]) => lines.push(`- ${name} Lv. ${level}`));
  }
  const setSkills = formatSkillEntries(result?.setSkills);
  if (setSkills.length) {
    lines.push('', 'Set Bonuses:');
    setSkills.forEach(([name, level]) => lines.push(`- ${name} Lv. ${level}`));
  }
  if (manualBonuses.set) {
    lines.push(`  Manual Set Bonus +1: ${manualBonuses.set}`);
  }
  const groupSkills = formatSkillEntries(result?.groupSkills);
  if (groupSkills.length) {
    lines.push('', 'Group Skills:');
    groupSkills.forEach(([name, level]) => lines.push(`- ${name} Lv. ${level}`));
  }
  if (manualBonuses.group) {
    lines.push(`  Manual Group Skill +1: ${manualBonuses.group}`);
  }
  if (defense) { lines.push('', `Defense: ${defense.upgraded} (${defense.base} base)`); }
  const damage = result?.damageProfile;
  if (damage) {
    lines.push([
      `DPS: ${formatNumber(damage.expected_dps)}`,
      `Raw: ${formatNumber(damage.raw_dps)}`,
      `Element: ${formatNumber(damage.element_dps)}`,
      `Affinity: ${formatNumber(damage.final_affinity)}%`
    ].join(' | '));
  }
  return lines.join('\n');
};

const getSkillVisual = (name, level, kind, setSkillPoints, manualBonusName) => {
  if (kind === 'set') {
    const points = setSkillPoints?.[name] ?? Math.min(level * 2, 4);
    const manualPoint = manualBonusName === name ? 1 : 0;
    return {
      baseCurrent: Math.min(4, Math.max(0, points - manualPoint)),
      current: Math.min(4, points),
      icon: 'set',
      manualPoint,
      max: 4,
      progressLabel: `${name} set points`
    };
  }
  if (kind === 'group') {
    const manualPoint = manualBonusName === name ? 1 : 0;
    return {
      baseCurrent: level > 0 ? 3 - manualPoint : 0,
      current: level > 0 ? 3 : 0,
      icon: 'group',
      manualPoint,
      max: 3,
      progressLabel: `${name} group points`
    };
  }
  return {
    baseCurrent: level,
    current: level,
    icon: SKILL_ICON_MAP[name] || 'power',
    max: SKILL_MAX_LEVELS[name] || level,
    progressLabel: `${name} level progress`
  };
};

const SkillList = ({ emptyText, kind = 'regular', manualBonusName,
  searchedSkills, setSkillPoints, skills }) => {
  const entries = formatSkillEntries(skills);
  if (!entries.length) { return <div className="share-set-empty">{emptyText}</div>; }
  return <div className="share-set-skill-list">
    {entries.map(([name, level]) => {
      const visual = getSkillVisual(name, level, kind, setSkillPoints, manualBonusName);
      const isSearchTarget = Boolean(searchedSkills?.[name]);
      return <div className={`share-set-skill ${kind} ${isSearchTarget ? 'target' : ''}`}
        key={name} title={getSkillPopup(name)}>
        <img alt={`${name} skill icon`} className="share-set-skill-icon"
          src={`${import.meta.env.BASE_URL}images/icons/${visual.icon}.png`} />
        <div className="share-set-skill-copy">
          <span className="share-set-skill-name">
            <span>{name}</span>
            {visual.manualPoint > 0 && <em title="One point comes from the manually selected +1 bonus">
              +1 manual
            </em>}
          </span>
          <span aria-label={visual.progressLabel} aria-valuemax={visual.max}
            aria-valuemin="0" aria-valuenow={visual.current}
            className="share-set-skill-pips" role="progressbar">
            {Array.from({ length: visual.max }, (_, index) => {
              let pipClass = '';
              if (index < visual.baseCurrent) {
                pipClass = 'active';
              } else if (index < visual.current) {
                pipClass = 'manual';
              }
              return <i className={pipClass} key={index} />;
            })}
          </span>
        </div>
        <strong>Lv. {level}</strong>
      </div>;
    })}
  </div>;
};

SkillList.propTypes = {
  emptyText: PropTypes.string.isRequired,
  kind: PropTypes.oneOf(['regular', 'set', 'group']),
  manualBonusName: PropTypes.string,
  searchedSkills: PropTypes.object,
  setSkillPoints: PropTypes.object,
  skills: PropTypes.object
};

const humanizeCondition = condition => condition
  .replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

const getTargetVisual = name => {
  if (isSetSkillName(name)) { return { icon: 'set', kind: 'set' }; }
  if (isGroupSkillName(name)) { return { icon: 'group', kind: 'group' }; }
  return { icon: SKILL_ICON_MAP[name] || 'power', kind: 'regular' };
};

const SearchTargetList = ({ manualBonuses, skills }) => <section
  className="share-set-target" aria-label="Original search target">
  <div className="share-set-target-heading">
    <span>Original Search</span><small>{skills.length} requirements</small>
  </div>
  <div className="share-set-target-grid">
    {skills.map(([name, level]) => {
      const visual = getTargetVisual(name);
      return <div className={`share-set-target-skill ${visual.kind}`} key={name}
        title={getSkillPopup(name)}>
        <img alt="" src={`${import.meta.env.BASE_URL}images/icons/${visual.icon}.png`} />
        <span>{name}</span><strong>Lv. {level}</strong>
      </div>;
    })}
  </div>
  {(manualBonuses.set || manualBonuses.group) && <div className="share-set-manual-targets">
    {manualBonuses.set && <div className="set">
      <img alt="" src={`${import.meta.env.BASE_URL}images/icons/set.png`} />
      <span><small>Manual Set Bonus</small>{manualBonuses.set}</span><strong>+1</strong>
    </div>}
    {manualBonuses.group && <div className="group">
      <img alt="" src={`${import.meta.env.BASE_URL}images/icons/group.png`} />
      <span><small>Manual Group Skill</small>{manualBonuses.group}</span><strong>+1</strong>
    </div>}
  </div>}
</section>;

SearchTargetList.propTypes = {
  manualBonuses: PropTypes.shape({ group: PropTypes.string, set: PropTypes.string }).isRequired,
  skills: PropTypes.array.isRequired
};

const ShareSetDialog = ({ armor, decorations, defense, note, onClose,
  onCopySummary, onSave, open, result }) => {
  const exportRef = useRef(null);
  const [savingPng, setSavingPng] = useState(false);
  const damage = result?.damageProfile;
  const activeConditions = Object.entries(result?.conditions || {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  const searchedSkills = formatSkillEntries(result?.searchedSkills);
  const totalDecorationCount = decorations.reduce((total, deco) => total + deco.amount, 0);
  const totalSkillCount = formatSkillEntries(result?.skills).length;
  const manualBonuses = getManualBonusNames(result);

  const savePng = async() => {
    const exportNode = exportRef.current;
    if (!exportNode || savingPng) { return; }
    setSavingPng(true);
    exportNode.classList.add('share-set-exporting');
    const content = exportNode.querySelector('.share-set-content');
    const title = exportNode.querySelector('.share-set-title');
    const exportHeight = (title?.scrollHeight || 0) + (content?.scrollHeight || 0);
    exportNode.style.height = `${exportHeight}px`;

    try {
      await document.fonts?.ready;
      const dataUrl = await toPng(exportNode, {
        backgroundColor: '#171a1b',
        cacheBust: true,
        height: exportHeight,
        pixelRatio: 2,
        skipFonts: true,
        width: exportNode.scrollWidth
      });
      const download = document.createElement('a');
      const safeName = (result?.name || 'monster-hunter-build')
        .replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      download.download = `${safeName || 'monster-hunter-build'}.png`;
      download.href = dataUrl;
      download.click();
      window.snackbar?.createSnackbar('Saved build preview as PNG!', { timeout: 3000 });
    } catch (error) {
      console.error('Unable to save build preview as PNG:', error);
      window.snackbar?.createSnackbar('Unable to save the build PNG.', { timeout: 4000 });
    } finally {
      exportNode.classList.remove('share-set-exporting');
      exportNode.style.height = '';
      setSavingPng(false);
    }
  };

  return <Dialog aria-labelledby="share-set-title" className="share-set-dialog"
    fullWidth maxWidth="xl" onClose={onClose} open={open} scroll="paper">
    <div className="share-set-export-surface" ref={exportRef}>
    <DialogTitle id="share-set-title" className="share-set-title">
      <span className="share-set-title-mark" aria-hidden="true">◆</span>
      <span>{result?.name || 'Unnamed Set'}</span>
      <span aria-hidden="true" className="share-set-title-caption">Build preview</span>
    </DialogTitle>
    <DialogContent dividers className="share-set-content">
      {searchedSkills.length > 0 && <SearchTargetList manualBonuses={manualBonuses}
        skills={searchedSkills} />}
      <section className="share-set-overview" aria-label="Build overview">
        <span><strong>{totalDecorationCount}</strong> decorations</span>
        <span><strong>{totalSkillCount}</strong> active skills</span>
        <span><strong>{defense?.upgraded ?? 0}</strong> defense</span>
      </section>

      <div className="share-set-layout">
        <section className="share-set-card share-set-skills-card">
          <h3>Skills</h3>
          <SkillList emptyText="No regular skills" searchedSkills={result?.searchedSkills}
            skills={result?.skills} />
          <h3>Set Bonuses</h3>
          <SkillList emptyText="No active Set Bonuses" kind="set"
            manualBonusName={manualBonuses.set} setSkillPoints={result?.setSkillPoints}
            skills={result?.setSkills} />
          <h3>Group Skills</h3>
          <SkillList emptyText="No active Group Skills" kind="group"
            manualBonusName={manualBonuses.group} skills={result?.groupSkills} />
        </section>

        <section className="share-set-card share-set-equipment-card">
          <h3>Equipment</h3>
          <div className="share-set-equipment-list">
            {armor.map((piece, index) => <article className="share-set-equipment" key={`${piece.name}-${index}`}>
              <div className="share-set-equipment-icon">
                <ArmorSvgWrapper type={ARMOR_TYPES[index]} rarity={piece.rarity} />
              </div>
              <div className="share-set-equipment-copy">
                <span className="share-set-equipment-type">{ARMOR_LABELS[index]}</span>
                <strong>{armorNameFormat(piece.name)}</strong>
                <span>{getArmorSkills(piece) || 'No skills'}</span>
              </div>
              <div className="share-set-slots" title="Decoration slots">
                <span>Slots</span>
                <div className="share-set-slot-rail">
                  {piece.weaponSlots?.length > 0 && <span className="share-set-weapon-slots"
                    title="Weapon decoration slots supplied by the charm">
                    <small>WPN</small>
                    <SlotIcons className="weapon" label="Weapon slots" slots={piece.weaponSlots} />
                  </span>}
                  <SlotIcons slots={piece.slots} />
                </div>
                {index < 5 && <small>{getArmorDefenseFromName(piece.name)?.upgraded || 0} def</small>}
              </div>
            </article>)}
          </div>
          <h3>Decorations</h3>
          {decorations.length ? <div className="share-set-decos">
            {decorations.map(deco => <div key={deco.name}>
              <img alt={`Level ${deco.slotSize} slot`} className="share-set-deco-slot-img"
                src={getSlotImage(deco.slotSize)} />
              <strong>{deco.name}</strong><span>x{deco.amount}</span>
              <small>{deco.skills}</small>
            </div>)}
          </div> : <div className="share-set-empty">No decorations equipped</div>}
        </section>

        <aside className="share-set-sidebar">
          <section className="share-set-card">
            <h3>Damage</h3>
            {damage ? <div className="share-set-stat-grid">
              <span>DPS<strong>{formatNumber(damage.expected_dps)}</strong></span>
              <span>Raw<strong>{formatNumber(damage.raw_dps)}</strong></span>
              <span>Element<strong>{formatNumber(damage.element_dps)}</strong></span>
              <span>Affinity<strong>{formatNumber(damage.final_affinity)}%</strong></span>
            </div> : <div className="share-set-empty">No weapon damage profile</div>}
          </section>
          <section className="share-set-card">
            <h3>Defense</h3>
            <div className="share-set-defense">
              <strong>{defense?.upgraded ?? 0}</strong>
              <span>{defense?.base ?? 0} base</span>
            </div>
          </section>
          <section className="share-set-card">
            <h3>Free Slots</h3>
            <div className="share-set-free-slots">
              <span>Armor <SlotIcons label="Free armor slots" slots={result?.freeSlots} /></span>
              <span>Weapon <SlotIcons label="Free weapon slots" slots={result?.freeWeaponSlots} /></span>
            </div>
          </section>
          {activeConditions.length > 0 && <section className="share-set-card">
            <h3 className="share-set-condition-title">
              <span>Active Conditions</span><strong>{activeConditions.length} on</strong>
            </h3>
            <div className="share-set-conditions">{activeConditions.map(condition =>
              <div key={condition}>
                <img alt="" src={`${import.meta.env.BASE_URL}images/icons/${
                  CONDITION_ICONS.get(condition) || 'power'
                }.png`} />
                <span>{humanizeCondition(condition)}</span>
                <i aria-label="Active" title="Active">✓</i>
              </div>)}</div>
          </section>}
        </aside>
      </div>
    </DialogContent>
    </div>
    <DialogActions className="share-set-actions">
      <span className="share-set-link-note">{note}</span>
      {onSave && <Button color="success" onClick={onSave} variant="contained">Save to My Sets</Button>}
      <Button onClick={onCopySummary} variant="outlined">Copy Build Summary</Button>
      <Button disabled={savingPng} onClick={savePng} variant="contained">
        {savingPng ? 'Saving PNG…' : 'Save as PNG'}
      </Button>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>;
};

ShareSetDialog.propTypes = {
  armor: PropTypes.array.isRequired,
  decorations: PropTypes.array.isRequired,
  defense: PropTypes.shape({ base: PropTypes.number, upgraded: PropTypes.number }),
  note: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onCopySummary: PropTypes.func.isRequired,
  onSave: PropTypes.func,
  open: PropTypes.bool.isRequired,
  result: PropTypes.object
};

ShareSetDialog.defaultProps = {
  note: 'The PNG includes the complete build preview without these controls.'
};

export default ShareSetDialog;
