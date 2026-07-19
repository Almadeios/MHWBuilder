import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { useStorage } from '../hooks/StorageContext';
import {
  copyTextToClipboard, getArmorDefenseFromNames, getArmorFromNames,
  getDecosFromNames
} from '../util/util';
import ShareSetDialog, { buildSharedSetSummary } from './ShareSetDialog';

const SharedSetImportDialog = ({ onClose, result }) => {
  const { fields, updateField } = useStorage();
  const customDecoMap = useMemo(() => Object.fromEntries((fields.customDecorations || [])
    .map(deco => [deco.name, [deco.type, deco.skills || {}, Number(deco.size || 1)]])),
  [fields.customDecorations]);
  const armor = useMemo(() => getArmorFromNames(result?.armorNames || []), [result]);
  const decorations = useMemo(() => getDecosFromNames(
    result?.decoNames || [], false, customDecoMap
  ), [customDecoMap, result]);
  const defense = useMemo(() => getArmorDefenseFromNames(result?.armorNames || []), [result]);

  if (!result) { return null; }

  const copySummary = () => copyTextToClipboard(
    buildSharedSetSummary({ armor, decorations, defense, result }),
    () => window.snackbar.createSnackbar('Copied build summary to clipboard!', { timeout: 3000 })
  );
  const saveSet = () => {
    const alreadySaved = (fields.savedSets || []).some(savedSet => savedSet.id === result.id);
    if (!alreadySaved) {
      updateField('savedSets', [...fields.savedSets || [], result]);
      window.snackbar?.createSnackbar(`Saved ${result.name} to My Sets!`, { timeout: 3000 });
    } else {
      window.snackbar?.createSnackbar(`${result.name} is already in My Sets.`, { timeout: 3000 });
    }
    onClose();
  };

  return <ShareSetDialog armor={armor} decorations={decorations} defense={defense}
    note="Preview only — this shared build has not been added to your saved sets."
    onClose={onClose} onCopySummary={copySummary}
    onSave={saveSet} open result={result} />;
};

SharedSetImportDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  result: PropTypes.object
};

export default SharedSetImportDialog;
