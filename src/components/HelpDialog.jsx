import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

const HelpSection = ({ children, title }) => <section className="help-section">
  <Typography component="h3" variant="h6">{title}</Typography>
  <Typography component="div" variant="body2">{children}</Typography>
</section>;

HelpSection.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired
};

const HelpDialog = ({ onClose, open }) => <Dialog aria-labelledby="builder-help-title"
  fullWidth maxWidth="md" onClose={onClose} open={open} scroll="paper">
  <DialogTitle id="builder-help-title">Builder Help</DialogTitle>
  <DialogContent dividers>
    <HelpSection title="Quick start">
      Search for a skill, click it to add its maximum level, adjust the level with the arrows,
      then select <strong>Search</strong>. Results prioritize combinations that satisfy every
      selected requirement while preserving the best free slots.
    </HelpSection>
    <Divider />
    <HelpSection title="Skills, Set Bonuses, and Group Skills">
      Regular skills come from armor, decorations, charms, and weapons. Set Bonuses are activated
      by armor pieces from the same monster set; Group Skills count compatible armor groups.
      Charms can provide regular skills and slots, but they do not contribute pieces toward Set
      Bonuses or Group Skills.
    </HelpSection>
    <Divider />
    <HelpSection title="Weapons and damage conditions">
      Enter weapon slots, raw, affinity, element, and sharpness when comparing damage-oriented
      builds. Conditions describe situational effects such as an enraged monster or attacking a
      weak point. Enable only conditions you expect to maintain.
    </HelpSection>
    <Divider />
    <HelpSection title="Recommendations">
      After a successful search, <strong>Explore Recommendations</strong> checks which additional
      Set Bonuses and Group Skills are compatible with the current requirements. Normal skill and
      free-slot suggestions are calculated immediately from the returned builds. The bonus audit
      uses exact targeted searches for up to 60 seconds by default and may be cancelled.
    </HelpSection>
    <Divider />
    <HelpSection title="Inventory and custom charms">
      The Decorations page records what you own. Charm Creator adds your real charms to the
      builder. Settings can restrict searches to owned decorations or charms when you want
      results that match your inventory. In Saved Sets, <strong>Set as Search Target</strong>
      restores only the skills from the search that originally found that set. <strong>Share
      Set</strong> opens a detailed build preview that can be saved as a PNG or copied as a
      readable text summary. Opening an older shared link previews it without changing pages or
      adding it to Saved Sets; use <strong>Save to My Sets</strong> when you want to keep it.
    </HelpSection>
    <Divider />
    <HelpSection title="Keyboard shortcuts">
      <ul>
        <li><strong>Ctrl + Search:</strong> copy a shareable search URL.</li>
      </ul>
    </HelpSection>
  </DialogContent>
  <DialogActions>
    <Button onClick={onClose} variant="contained">Close</Button>
  </DialogActions>
</Dialog>;

HelpDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired
};

export default HelpDialog;
