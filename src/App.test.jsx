import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { StorageProvider } from './hooks/StorageContext';

vi.mock('./components/Search', () => {
  const MockSearch = () => <div>Armor Set Search</div>;
  MockSearch.displayName = 'MockSearch';
  return { default: MockSearch };
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/MHWBuilder/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/MHWBuilder/');
});

test('renders the main navigation and search tab', () => {
  render(<StorageProvider><App /></StorageProvider>);

  expect(screen.getByRole('tab', { name: 'Search' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Saved Sets' })).toBeInTheDocument();
  expect(screen.getByText('Armor Set Search')).toBeInTheDocument();
});

test('opens discoverable builder help from the navigation', async() => {
  render(<StorageProvider><App /></StorageProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Open builder help' }));

  expect(screen.getByRole('dialog', { name: 'Builder Help' })).toBeInTheDocument();
  expect(screen.getByText('Skills, Set Bonuses, and Group Skills')).toBeInTheDocument();
  expect(screen.getByText(/Charms can provide regular skills/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('previews a shared URL without automatically saving it or changing tabs', async() => {
  window.history.replaceState({}, '',
    '/MHWBuilder/?set=851-148-827-869-1278-843_312-260&name=Shared%20Test');

  render(<StorageProvider><App /></StorageProvider>);

  expect(await screen.findByRole('dialog', { name: 'Shared Test' })).toBeInTheDocument();
  expect(document.getElementById('simple-tab-0')).toHaveAttribute('aria-selected', 'true');
  expect(JSON.parse(localStorage.getItem('savedSets'))).toEqual([]);
  expect(window.location.search).toBe('');

  fireEvent.click(screen.getByRole('button', { name: 'Save to My Sets' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shared Test' }))
    .not.toBeInTheDocument());
  expect(JSON.parse(localStorage.getItem('savedSets'))).toHaveLength(1);
});

test('removes the reported accidental legacy shared set without touching other saves', async() => {
  localStorage.setItem('savedSets', JSON.stringify([
    { id: 'accidental', name: 'Sazeeaid', armorNames: [], decoNames: [] },
    { id: 'keep', name: 'My Real Set', armorNames: [], decoNames: [], damageProfile: {} }
  ]));

  render(<StorageProvider><App /></StorageProvider>);

  await waitFor(() => expect(JSON.parse(localStorage.getItem('savedSets')))
    .toEqual([expect.objectContaining({ name: 'My Real Set', damageProfile: {} })]));
});
