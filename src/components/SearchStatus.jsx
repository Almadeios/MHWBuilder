import PropTypes from 'prop-types';
import LinearProgress from '@mui/material/LinearProgress';
import { Button } from '@mui/material';
import { styled } from '@mui/material/styles';

const LoadingBar = styled(LinearProgress)`
  margin-top: 1em;
`;

export const SearchProgress = ({ bonusProgress, isExploringBonuses, isGenerating, loadProgress }) => <>
    {isGenerating && <LoadingBar className="loading-bar" value={loadProgress}
      aria-label="Armor set search progress"
      variant={loadProgress ? 'determinate' : 'indeterminate'} />}
    {isExploringBonuses && <LoadingBar className="loading-bar" value={bonusProgress}
      aria-label="Recommendation exploration progress"
      variant={bonusProgress ? 'determinate' : 'indeterminate'} />}
    <div className="sr-only" role="status" aria-live="polite">
      {isGenerating ? 'Searching for armor sets.' : ''}
      {isExploringBonuses ? 'Exploring build recommendations.' : ''}
    </div>
  </>;

SearchProgress.propTypes = {
  bonusProgress: PropTypes.number.isRequired,
  isExploringBonuses: PropTypes.bool.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  loadProgress: PropTypes.number.isRequired
};

export const SearchOutcome = ({
  isExploringBonuses, onExploreRecommendations, onReload, resultsPresent, searchError, showMore
}) => {
  const staleVersion = (/importScripts|Loading chunk|ChunkLoadError|failed to load/i).test(searchError);
  return <>
    {resultsPresent && !showMore && !isExploringBonuses && <div className="bonus-recommendation-prompt">
      <div>
        <strong>Want bonus recommendations?</strong>
        <div>
          Check which extra skills, Set Bonuses, Group Skills, and free slots are compatible
          with these results. You do not need to select a bonus first.
        </div>
      </div>
      <Button variant="contained" size="small" onClick={onExploreRecommendations}>
        Explore Recommendations
      </Button>
    </div>}
    {searchError && <div className="warn" role="alert" style={{ marginTop: '0.75em' }}>
      <div>Search failed: {searchError}</div>
      {staleVersion && <div style={{ marginTop: '0.5em' }}>
        If the app was recently updated, your browser may still be using an older version.
      </div>}
      {staleVersion && <Button variant="outlined" color="warning" size="small"
        onClick={onReload} sx={{ marginTop: '0.5em' }}>
        Load latest version
      </Button>}
    </div>}
  </>;
};

SearchOutcome.propTypes = {
  isExploringBonuses: PropTypes.bool.isRequired,
  onExploreRecommendations: PropTypes.func.isRequired,
  onReload: PropTypes.func.isRequired,
  resultsPresent: PropTypes.bool.isRequired,
  searchError: PropTypes.string.isRequired,
  showMore: PropTypes.bool.isRequired
};
