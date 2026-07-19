import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Edit from '@mui/icons-material/DriveFileRenameOutline';
import { styled } from '@mui/material/styles';
import ResultNavigation from './ResultNavigation';

const EditIcon = styled(Edit)`
    width: 24px;
    height: 24px;
    transform: translateY(-2px);
    cursor: pointer;
    color: #ff8300;
`;

const SelectedBuildPanel = ({
    allSkills, canGoNext, canGoPrevious, children, conditionControls, defenseTotal,
    extraSkills, freeSlots, groupSkills, hasOriginalSearch, hasSelection, isSaved,
    name, onClose, onExport, onNext, onPrevious, onQueueOriginalSearch,
    onRename, onSave, onShare, resultCount, save,
    setEffects, showAll, showCalculatorExport,
    showExtra, summary
}) => {
    const [editingName, setEditingName] = useState(false);

    useEffect(() => {
        if (!hasSelection) { setEditingName(false); }
    }, [hasSelection]);

    const pageMessage = save ? 'Your saved sets will appear below.' :
        "Add skills above and tap 'Search' to get armor sets.";
    const emptySummary = <Typography sx={{ marginLeft: '-1em', fontSize: '20px',
        fontWeight: 'bold', cursor: 'default' }}>
        {resultCount > 0 ? 'Click on a set below to see details.' : pageMessage}
    </Typography>;

    return <div style={{ marginBottom: '1em' }}>
        <Accordion expanded={hasSelection} elevation={hasSelection ? 2 : 0}
            className={`result-paper ${hasSelection ? 'full' : 'empty'}`}>
            <AccordionSummary expandIcon={null} aria-controls="panel1-content" id="panel1-header"
                sx={{ cursor: 'default !important', marginBottom: '1em' }}>
                {editingName && <TextField autoFocus id="edit-name" label="Rename Set"
                    onKeyDown={event => { if (event.key === 'Enter') { event.target.blur(); } }}
                    onFocus={event => event.target.select()}
                    onBlur={event => { onRename(event.target.value); setEditingName(false); }}
                    sx={{ transform: 'translateY(-7px)' }} variant="standard" defaultValue={name} />}
                {!editingName && hasSelection && save &&
                    <Typography className="edit-name" sx={{ cursor: 'pointer !important' }}
                        onClick={() => setEditingName(true)} title="Click to rename set">
                        <EditIcon className="edit-icon" />{name}
                    </Typography>}
                {hasSelection ? summary : emptySummary}
            </AccordionSummary>
            {showAll && allSkills}
            {children || <AccordionDetails sx={{ cursor: 'default' }} />}
            {defenseTotal}
            {setEffects}
            {groupSkills}
            {conditionControls}
            {showExtra && extraSkills}
            <div className="free-slots-holder">
                <span className="set-label">Free Slots:</span>
                <div className="free-holder">{freeSlots}</div>
            </div>
            <Button className="save-set-button" onClick={onSave} variant="outlined"
                color={isSaved ? 'error' : 'info'}>
                {isSaved ? 'Remove From Saved Sets' : 'Save Armor Set'}
            </Button>
            {save && <Button className="save-set-button" disabled={!hasOriginalSearch}
                onClick={onQueueOriginalSearch}
                title={hasOriginalSearch ? 'Use only the skills that originally found this set' :
                    'This saved set does not contain its original search'}
                variant="outlined" color="info">Set as Search Target</Button>}
            {save && <Button className="save-set-button" onClick={onShare}
                title="Preview and share this armor set" variant="outlined" color="info">Share Set</Button>}
            {save && showCalculatorExport && <Button className="save-set-button export-calc-button"
                onClick={onExport} title="Copy armor set JSON data for mhwilds-calculator to clipboard"
                variant="outlined" color="info">🧮 Export</Button>}
            <ResultNavigation canGoNext={canGoNext} canGoPrevious={canGoPrevious}
                onClose={onClose} onNext={onNext} onPrevious={onPrevious} />
        </Accordion>
    </div>;
};

SelectedBuildPanel.propTypes = {
    allSkills: PropTypes.node, canGoNext: PropTypes.bool, canGoPrevious: PropTypes.bool,
    children: PropTypes.node, conditionControls: PropTypes.node, defenseTotal: PropTypes.node,
    extraSkills: PropTypes.node, freeSlots: PropTypes.node, groupSkills: PropTypes.node,
    hasOriginalSearch: PropTypes.bool, hasSelection: PropTypes.bool.isRequired,
    isSaved: PropTypes.bool, name: PropTypes.string,
    onClose: PropTypes.func.isRequired, onExport: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired, onPrevious: PropTypes.func.isRequired,
    onQueueOriginalSearch: PropTypes.func.isRequired, onRename: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired, onShare: PropTypes.func.isRequired,
    resultCount: PropTypes.number.isRequired, save: PropTypes.bool,
    setEffects: PropTypes.node, showAll: PropTypes.bool,
    showCalculatorExport: PropTypes.bool, showExtra: PropTypes.bool, summary: PropTypes.node
};

export default SelectedBuildPanel;
