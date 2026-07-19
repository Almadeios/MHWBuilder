import PropTypes from 'prop-types';
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

    return <div className="damage-condition-list">
        {options.map(condition => {
            const active = isChecked(condition.id);
            return <button
                aria-pressed={active}
                className={`damage-condition-chip${active ? ' damage-condition-chip--active' : ''}`}
                key={condition.id}
                onClick={() => toggle(condition.id)}
                type="button">
                <span aria-hidden="true" className="damage-condition-chip__state">
                    {active ? '✓' : ''}
                </span>
                <span>{condition.displayLabel}</span>
            </button>;
        })}
    </div>;
};

DamageConditions.propTypes = {
    conditions: PropTypes.object,
    skills: PropTypes.object,
    onChange: PropTypes.func.isRequired
};

export default DamageConditions;
