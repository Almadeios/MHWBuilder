import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { styled } from '@mui/material/styles';
import ArmorSvgWrapper from './ArmorSvgWrapper';
import TablePaginationActions from './TablePaginationActions';
import { armorNameFormat, paginate } from '../util/util';

const StyledTableCell = styled(TableCell)(({ theme }) => ({
    [`&.${tableCellClasses.head}`]: {
        backgroundColor: theme.palette.common.black,
        color: theme.palette.common.white,
    },
    [`&.${tableCellClasses.body}`]: { fontSize: 14 },
    '@media (prefers-color-scheme: dark)': {
        [`&.${tableCellClasses.head}`]: {
            backgroundColor: '#141414',
            color: '#e8ebed',
        },
        [`&.${tableCellClasses.body}`]: {
            fontSize: 14,
            borderColor: '#1b1919',
            color: '#d5d6cd'
        }
    }
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
    '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover },
    '&:last-child td, &:last-child th': { border: 0 },
    '&:hover': { backgroundColor: 'lightblue' },
    '@media (prefers-color-scheme: dark)': {
        'backgroundColor': '#333',
        '&:nth-of-type(odd)': { backgroundColor: '#2c2b2b' },
        '&:hover': { backgroundColor: '#1a3943' }
    }
}));

const PaginationBox = styled(Box)`display: flex;`;
const pageOptions = [30, 50, 100].map(value => ({ label: `${value}`, value }))
    .concat({ label: 'All', value: -1 });

const goalLabel = goal => {
    if (goal === 'highest_raw') { return 'Raw'; }
    if (goal === 'highest_element') { return 'Element'; }
    if (goal === 'highest_affinity') { return 'Affinity'; }
    if (goal === 'balanced') { return 'Balanced'; }
    return 'DPS';
};

const ResultTable = ({
    isMobile, onSelect, optimizationGoal, renderCompactTalisman, renderDefense,
    renderSlots, results, save, savedSets = [], selectedResultId
}) => {
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(100);

    useEffect(() => { setPage(0); }, [pageSize, results.length]);

    const visibleResults = paginate(results, page, pageSize);
    const renderResult = (result, index) => {
        const savedMatch = savedSets.find(savedSet => savedSet.id === result.id);
        const name = savedMatch?.name || 'Unnamed Set';
        const score = result?.damageProfile?.expected_dps?.toFixed(1) ?? '—';
        const raw = result?.damageProfile?.raw_dps?.toFixed(1) ?? '—';
        const element = result?.damageProfile?.element_dps?.toFixed(1) ?? '—';
        const affinity = result?.damageProfile?.final_affinity?.toFixed(0) ?? '—';
        const toggle = () => onSelect(
            selectedResultId === result.id ? undefined : result,
            index,
            visibleResults
        );
        const className = `${!save && savedMatch ? 'striped' : ''}` +
            `${selectedResultId === result.id ? ' row-shine' : ''}`;

        return <StyledTableRow key={result.id} className={className} tabIndex={0}
            aria-label={`View armor set ${name}`}
            onClick={toggle}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle();
                }
            }}>
            {save && <StyledTableCell align="left">{name}</StyledTableCell>}
            <StyledTableCell align="left">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {renderSlots(result)}
                    <div style={{ fontSize: '12px', color: '#3b6ea8', fontWeight: 600 }}>
                        {goalLabel(optimizationGoal)}: {score}
                    </div>
                    <div style={{ fontSize: '12px', color: '#4b5563' }}>
                        Raw {raw} • Element {element} • Aff {affinity}%
                    </div>
                </div>
            </StyledTableCell>
            {isMobile && <StyledTableCell align="left" scope="row">{renderDefense(result)}</StyledTableCell>}
            {!isMobile && result.armorNames.slice(0, 5).map((armor, armorIndex) =>
                <StyledTableCell key={`${result.id}-${armorIndex}`} align="left" scope={armorIndex ? undefined : 'row'}>
                    {armorNameFormat(armor)}
                </StyledTableCell>
            )}
            {!isMobile && <StyledTableCell align="left">{renderCompactTalisman(result)}</StyledTableCell>}
        </StyledTableRow>;
    };

    const svgStyle = { width: '20px', height: '20px', transform: 'translateY(2px)', marginRight: '2px' };
    const columns = ['head', 'chest', 'arms', 'waist', 'legs', 'talisman'];
    const slotImage = <img className="armor-img" src="images/slot4.png" alt="" />;
    const defenseImage = <img className="def-icon" src="images/defense.png" alt="" />;

    return <Paper id="main1" className="table-paper">
        <TableContainer sx={{ maxHeight: '69vh', overflowY: 'auto', width: '100%' }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <StyledTableRow className="table-row">
                        {save && <StyledTableCell component="th" align="left">Name</StyledTableCell>}
                        <StyledTableCell component="th" align="left">{slotImage} slots</StyledTableCell>
                        {isMobile && <StyledTableCell component="th" align="left">
                            <span className="fspan">{defenseImage} Defense</span>
                        </StyledTableCell>}
                        {!isMobile && columns.map(type => <StyledTableCell key={type} component="th" align="left">
                            <span className="fspan">
                                <ArmorSvgWrapper type={type} style={svgStyle} /> {type}
                            </span>
                        </StyledTableCell>)}
                    </StyledTableRow>
                </TableHead>
                <TableBody>{visibleResults.map(renderResult)}</TableBody>
            </Table>
        </TableContainer>
        <TablePagination className="pagination-row" component={PaginationBox}
            rowsPerPageOptions={pageOptions} count={results.length} rowsPerPage={pageSize}
            labelRowsPerPage="" page={page}
            slotProps={{ select: { inputProps: { 'aria-label': 'rows per page' }, native: false,
                sx: { marginRight: '1em', marginLeft: '0em' }, title: 'Rows Per Page' } }}
            onPageChange={(event, newPage) => setPage(newPage)}
            onRowsPerPageChange={event => setPageSize(parseInt(event.target.value, 10))}
            ActionsComponent={TablePaginationActions} />
    </Paper>;
};

ResultTable.propTypes = {
    isMobile: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired,
    optimizationGoal: PropTypes.string,
    renderCompactTalisman: PropTypes.func.isRequired,
    renderDefense: PropTypes.func.isRequired,
    renderSlots: PropTypes.func.isRequired,
    results: PropTypes.array.isRequired,
    save: PropTypes.bool,
    savedSets: PropTypes.array,
    selectedResultId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default ResultTable;
