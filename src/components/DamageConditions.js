import PropTypes from 'prop-types';
import { Checkbox, FormControlLabel } from '@mui/material';
import { getConditionOptionsForSkills } from '../util/damageScoring';

const DamageConditions = ({ conditions = {}, skills = {}, onChange }) => {
    const options = getConditionOptionsForSkills(skills);

    const isChecked = conditionId => conditionId === 'wound' ?
        Boolean(conditions.wound || conditions.weak_point_and_wound) :
        Boolean(conditions[conditionId]);

    const toggle = conditionId => {
        const nextConditions = { ...conditions };
        nextConditions[conditionId] = !isChecked(conditionId);
        if (conditionId === 'wound') {
            delete nextConditions.weak_point_and_wound;
        }
        onChange(nextConditions);
    };

    return options.map(condition =>
        <FormControlLabel
            key={condition.id}
            control={<Checkbox
                checked={isChecked(condition.id)}
                onChange={() => toggle(condition.id)}
            />}
            label={condition.displayLabel}
        />
    );
};

DamageConditions.propTypes = {
    conditions: PropTypes.object,
    skills: PropTypes.object,
    onChange: PropTypes.func.isRequired
};

export default DamageConditions;
