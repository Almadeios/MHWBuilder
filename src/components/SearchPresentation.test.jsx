import { fireEvent, render, screen } from '@testing-library/react';
import OptimizerProfile from './OptimizerProfile';
import ResultNavigation from './ResultNavigation';
import ResultTable from './ResultTable';
import SelectedBuildPanel from './SelectedBuildPanel';
import { SearchOutcome, SearchProgress } from './SearchStatus';
import WeaponSearchControls from './WeaponSearchControls';

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

  it('formats optimizer profile details outside the results container', () => {
    render(<OptimizerProfile profile={{
      engine: 'mitm', nodes: 1200, pruned: 300, leftStates: 10, rightStates: 20,
      stages: { ranking: 1500 }
    }} />);

    expect(screen.getByText(/nodes 1,200/)).toHaveTextContent('halves 10+20');
    expect(screen.getByText(/ranking 1.50s/)).toBeInTheDocument();
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

  it('routes actions from the extracted selected-build panel', () => {
    const save = vi.fn();
    const close = vi.fn();
    render(<SelectedBuildPanel canGoNext={false} canGoPrevious={false}
      hasSelection isSaved={false} name="Test Set" onClose={close} onExport={vi.fn()}
      onNext={vi.fn()} onPrevious={vi.fn()} onQueueSkills={vi.fn()}
      onRename={vi.fn()} onSave={save} onShare={vi.fn()} onWikiSearch={vi.fn()}
      resultCount={1} save={false} summary={<span>Decorations</span>} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Armor Set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close selected result' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Decorations')).toBeInTheDocument();
  });
});
