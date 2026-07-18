import PropTypes from 'prop-types';

const OptimizerProfile = ({ profile }) => {
  if (!profile) { return null; }
  const stages = Object.entries(profile.stages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, ms]) => `${name} ${(ms / 1000).toFixed(2)}s`);
  const details = [
    profile.timedOut ? 'timed out' : null,
    profile.cacheHit ? 'cache hit' : profile.engine,
    profile.seed ? `guided by ${profile.seed}` : null,
    `nodes ${Number(profile.nodes || 0).toLocaleString()}`,
    `pruned ${Number(profile.pruned || 0).toLocaleString()}`,
    profile.engine === 'mitm' ? `halves ${[
      Number(profile.leftStates || 0).toLocaleString(),
      Number(profile.rightStates || 0).toLocaleString()
    ].join('+')}` : null,
    profile.inputCandidateCount ? `candidates ${[
      Number(profile.filteredCandidateCount || 0).toLocaleString(),
      Number(profile.inputCandidateCount).toLocaleString()
    ].join('/')}` : null,
    profile.dominatedCandidateCount ?
      `dominated ${Number(profile.dominatedCandidateCount).toLocaleString()}` : null,
    profile.equivalentCandidateCount ?
      `equivalent ${Number(profile.equivalentCandidateCount).toLocaleString()}` : null,
    profile.compactedHalfStates ? `compacted ${Number(profile.compactedHalfStates).toLocaleString()}` : null,
    profile.decorationSolverCalls ? `deco-checks ${Number(profile.decorationSolverCalls).toLocaleString()}` : null,
    profile.priorResults ? `extensions ${[
      Number(profile.priorExtensions || 0).toLocaleString(),
      Number(profile.priorResults).toLocaleString()
    ].join('/')}` : null,
    profile.skillBoundPruned ? `skill-bound ${Number(profile.skillBoundPruned).toLocaleString()}` : null,
    profile.feasibilityCacheHits ? `deco-cache ${Number(profile.feasibilityCacheHits).toLocaleString()}` : null,
    ...stages
  ].filter(Boolean).join(' | ');

  return <div style={{ fontSize: '0.85em', color: '#9fb2a4', marginTop: '0.25em' }}>
    Profile: {details}
  </div>;
};

OptimizerProfile.propTypes = { profile: PropTypes.object };
export default OptimizerProfile;
