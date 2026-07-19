import { fireEvent, render, screen } from '@testing-library/react';
import ResultNavigation from './ResultNavigation';
import ResultTable from './ResultTable';
import SelectedBuildPanel from './SelectedBuildPanel';
import ShareSetDialog, { buildSharedSetSummary } from './ShareSetDialog';
import { SearchOutcome, SearchProgress } from './SearchStatus';
import WeaponSearchControls from './WeaponSearchControls';
import RecommendationAudit from './RecommendationAudit';
import DamageConditions from './DamageConditions';

describe('search presentation components', () => {
  it('reports active search progress accessibly', () => {
    render(<SearchProgress bonusProgress={0} isExploringBonuses={false}
      isGenerating loadProgress={25} />);

    expect(screen.getByRole('progressbar', { name: 'Armor set search progress' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Searching for armor sets.');
  });

  it('renders recovery guidance for stale worker errors', () => {
    const reload = vi.fn();
    render(<SearchOutcome isExploringBonuses={false} onExploreRecommendations={vi.fn()}
      onReload={reload} resultsPresent={false} searchError="Loading chunk 3 failed" showMore={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load latest version' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Loading chunk 3 failed');
  });

  it('routes result navigation actions', () => {
    const next = vi.fn();
    const close = vi.fn();
    render(<ResultNavigation canGoNext canGoPrevious={false} onClose={close}
      onNext={next} onPrevious={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous result' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close selected result' }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('updates weapon numeric fields through the shared storage callback', () => {
    const updateField = vi.fn();
    render(<WeaponSearchControls fields={{
      weaponSlots: [], weaponType: 'other', weaponBaseRaw: 100, weaponBaseAffinity: 0,
      weaponElementType: 'None', weaponElementValue: 0, weaponSharpness: 'White',
      groupSkillBonus: '', setSkillBonus: ''
    }} updateField={updateField} />);

    fireEvent.change(screen.getByLabelText('Base Raw'), { target: { value: '125' } });
    expect(updateField).toHaveBeenCalledWith('weaponBaseRaw', 125);
  });

  it('presents damage conditions as accessible toggle chips', () => {
    const onChange = vi.fn();
    render(<DamageConditions
      conditions={{ monster_enraged: true }}
      onChange={onChange}
      skills={{ Agitator: 5 }}
    />);

    const enraged = screen.getByRole('button', { name: 'Monster Enraged' });
    expect(enraged).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(enraged);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ monster_enraged: false }));
  });

  it('summarizes recommendation uncertainty without dumping debug details', () => {
    render(<RecommendationAudit isExploring={false} progress={{
      status: 'partial', unresolved: 1, budgetExhausted: 1, budgetMs: 25000,
      candidates: [{
        skillName: "Jin Dahaad's Revolt", status: 'unresolved', reason: 'exploration-budget'
      }]
    }} />);

    expect(screen.getByRole('status')).toHaveTextContent('No new bonus improvements found');
    expect(screen.getByRole('status')).not.toHaveTextContent("Jin Dahaad's Revolt");
    expect(screen.getByRole('status')).not.toHaveTextContent('25-second exploration budget');
  });

  it('does not offer retries for oversized Group Skill pools', () => {
    render(<RecommendationAudit isExploring={false} onContinue={vi.fn()} progress={{
      status: 'partial', found: 8,
      candidates: [{
        skillName: 'Broad Group', status: 'unresolved', reason: 'large-pool-timeout'
      }]
    }} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 unusually broad Group Skill path');
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('selects a result from the extracted results table', () => {
    const onSelect = vi.fn();
    const result = {
      id: 'set-1', armorNames: ['head', 'chest', 'arms', 'waist', 'legs', 'charm'],
      damageProfile: { expected_dps: 100, raw_dps: 80, element_dps: 20, final_affinity: 10 }
    };
    render(<ResultTable isMobile={false} onSelect={onSelect} optimizationGoal="highest_raw"
      renderCompactTalisman={() => <span>Charm</span>} renderDefense={() => <span>100</span>}
      renderSlots={() => <span>Slots</span>} results={[result]} save={false} />);

    fireEvent.click(screen.getByRole('row', { name: 'View armor set Unnamed Set' }));
    expect(onSelect).toHaveBeenCalledWith(result, 0, [result]);
    expect(screen.getByText('Raw: 100.0')).toBeInTheDocument();
  });

  it('deletes a legacy saved set directly without trying to open it', () => {
    const onDeleteSavedSet = vi.fn();
    const onSelect = vi.fn();
    const legacyResult = {
      id: 'legacy-set', name: 'Qugaoed', armorNames: ['head', 'chest', 'arms', 'waist', 'legs'],
      damageProfile: { expected_dps: 0, raw_dps: 0, element_dps: 0, final_affinity: 0 }
    };
    render(<ResultTable isMobile={false} onDeleteSavedSet={onDeleteSavedSet}
      onSelect={onSelect} optimizationGoal="efficient"
      renderCompactTalisman={() => null} renderDefense={() => <span>0</span>}
      renderSlots={() => <span>Slots</span>} results={[legacyResult]} save
      savedSets={[legacyResult]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved set Qugaoed' }));
    expect(onDeleteSavedSet).toHaveBeenCalledWith('legacy-set');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('routes actions from the extracted selected-build panel', () => {
    const save = vi.fn();
    const close = vi.fn();
    const queueOriginal = vi.fn();
    const share = vi.fn();
    render(<SelectedBuildPanel canGoNext={false} canGoPrevious={false}
      hasOriginalSearch hasSelection isSaved={false} name="Test Set" onClose={close}
      onExport={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()}
      onQueueOriginalSearch={queueOriginal}
      onRename={vi.fn()} onSave={save} onShare={share}
      resultCount={1} save summary={<span>Decorations</span>} />);

    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save Armor Set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set as Search Target' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share Set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close selected result' }));
    expect(screen.queryByRole('button', { name: 'Search Wiki' })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    expect(queueOriginal).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Decorations')).toBeInTheDocument();
  });

  it('presents a visual share preview with explicit export actions', () => {
    const copySummary = vi.fn();
    const armor = [{
      name: 'Test Helm', rarity: 8, slots: [3, 1], weaponSlots: [1], skills: { Agitator: 2 }
    }];
    const result = {
      name: 'My Build', searchedSkills: { Agitator: 2 }, skills: { Agitator: 2 },
      setSkills: { 'Test Set Bonus': 1 }, setSkillPoints: { 'Test Set Bonus': 2 },
      setSkillBonus: 'Test Set Bonus', groupSkills: { 'Test Group Skill': 1 },
      freeSlots: [2], freeWeaponSlots: [1], conditions: { 'Monster Enraged': true },
      damageProfile: { expected_dps: 300, raw_dps: 250, element_dps: 50, final_affinity: 20 }
    };
    const decorations = [{
      name: 'Challenger Jewel', amount: 2, skills: 'Agitator Lv. 1', slotSize: 2
    }];

    render(<ShareSetDialog armor={armor} decorations={decorations}
      defense={{ base: 100, upgraded: 150 }} onClose={vi.fn()}
      onCopySummary={copySummary} open result={result} />);

    expect(screen.getByRole('dialog', { name: 'My Build' })).toBeInTheDocument();
    expect(screen.getByText('Test Helm')).toBeInTheDocument();
    expect(screen.getAllByText('Test Set Bonus')).toHaveLength(2);
    expect(screen.getByText('Test Group Skill')).toBeInTheDocument();
    expect(screen.getByText('300.0')).toBeInTheDocument();
    expect(screen.getByText('Monster Enraged')).toBeInTheDocument();
    const overview = screen.getByRole('region', { name: 'Build overview' });
    expect(overview).not.toHaveTextContent('equipment piece');
    expect(overview).toHaveTextContent('2 decorations');
    expect(screen.getByRole('img', { name: 'Agitator skill icon' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Agitator level progress' }))
      .toHaveAttribute('aria-valuemax', '5');
    expect(screen.getByRole('progressbar', { name: 'Test Set Bonus set points' }))
      .toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('+1 manual')).toBeInTheDocument();
    expect(screen.getByText('Manual Set Bonus')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Original search target' }))
      .toHaveTextContent('1 requirements');
    expect(screen.getByText('1 on')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Test Group Skill group points' }))
      .toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('img', { name: 'Level 2 slot' })).toBeInTheDocument();
    const weaponSlots = screen.getByLabelText('Weapon slots: 1');
    const regularSlot = screen.getByRole('img', { name: 'Level 2 slot' });
    expect(weaponSlots.compareDocumentPosition(regularSlot) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(screen.getByText('WPN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as PNG' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy Share Link' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Build Summary' }));
    expect(copySummary).toHaveBeenCalledTimes(1);

    expect(buildSharedSetSummary({ armor, decorations, defense: { base: 100, upgraded: 150 }, result }))
      .toContain('DPS: 300.0 | Raw: 250.0 | Element: 50.0 | Affinity: 20.0%');
  });
});
