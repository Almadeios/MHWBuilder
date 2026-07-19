import Button from '@mui/material/Button';
import PropTypes from 'prop-types';

const recommendationCountText = count => {
  const total = Number(count || 0);
  return total === 0 ? 'No new bonus improvements found.' :
    `${total} new bonus improvement${total === 1 ? '' : 's'} found.`;
};

const RecommendationAudit = ({ isExploring, onContinue, progress }) => {
  const unresolvedCandidates = (progress.candidates || []).filter(candidate =>
    candidate.status === 'unresolved' || candidate.maxUnresolved
  );
  const broadCandidates = unresolvedCandidates.filter(candidate =>
    candidate.reason === 'large-pool-timeout'
  );
  const retryableCandidates = unresolvedCandidates.filter(candidate =>
    candidate.reason !== 'large-pool-timeout'
  );

  if (isExploring) {
    return <div className="recommendation-audit recommendation-audit--running" role="status">
      Checking bonus improvements…
    </div>;
  }

  if (progress.status === 'partial') {
    return <div className="recommendation-audit recommendation-audit--paused" role="status">
      <strong>{recommendationCountText(progress.found)}</strong>
      {broadCandidates.length > 0 && <span>
        {broadCandidates.length} unusually broad Group Skill path
        {broadCandidates.length === 1 ? ' was' : 's were'} skipped to keep the search responsive.
      </span>}
      {retryableCandidates.length > 0 && <span>
        {retryableCandidates.length} check{retryableCandidates.length === 1 ? '' : 's'} need more time.
      </span>}
      {onContinue && retryableCandidates.length > 0 && <Button
        className="recommendation-audit__continue"
        onClick={onContinue}
        size="small"
        title="Spend more time checking the remaining bonus paths"
        variant="outlined">
        Continue
      </Button>}
    </div>;
  }

  if (progress.status === 'complete') {
    return <div className="recommendation-audit recommendation-audit--complete" role="status">
      <strong>Bonus check complete.</strong>
      <span>{recommendationCountText(progress.found)}</span>
    </div>;
  }

  if (progress.status === 'cancelled') {
    return <div className="recommendation-audit recommendation-audit--paused" role="status">
      Bonus check cancelled. Improvements already found were kept.
    </div>;
  }

  return null;
};

RecommendationAudit.propTypes = {
  elapsedSeconds: PropTypes.number,
  isExploring: PropTypes.bool.isRequired,
  onContinue: PropTypes.func,
  progress: PropTypes.object.isRequired
};

export default RecommendationAudit;
