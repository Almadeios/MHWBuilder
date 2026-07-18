import PropTypes from 'prop-types';
import { IconButton } from '@mui/material';
import ArrowForward from '@mui/icons-material/ArrowForwardRounded';
import ArrowBack from '@mui/icons-material/ArrowBackRounded';
import Close from '@mui/icons-material/DisabledByDefaultRounded';

const ResultNavigation = ({ canGoNext, canGoPrevious, onClose, onNext, onPrevious }) =>
  <div className="result-cyclers">
    <IconButton className="cycle" aria-label="Previous result" title="Previous Result"
      disabled={!canGoPrevious} onClick={onPrevious}><ArrowBack /></IconButton>
    <IconButton className="cycle" aria-label="Next result" title="Next Result"
      disabled={!canGoNext} onClick={onNext}><ArrowForward /></IconButton>
    <IconButton aria-label="Close selected result" title="Close selected result" onClick={onClose}>
      <Close className="close-icon" />
    </IconButton>
  </div>;

ResultNavigation.propTypes = {
  canGoNext: PropTypes.bool.isRequired,
  canGoPrevious: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onPrevious: PropTypes.func.isRequired
};

export default ResultNavigation;
