import { render, screen } from '@testing-library/react';
import App from './App';
import { StorageProvider } from './hooks/StorageContext';

vi.mock('./components/Search', () => {
  const MockSearch = () => <div>Armor Set Search</div>;
  MockSearch.displayName = 'MockSearch';
  return { default: MockSearch };
});

test('renders the main navigation and search tab', () => {
  render(<StorageProvider><App /></StorageProvider>);

  expect(screen.getByRole('tab', { name: 'Search' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Saved Sets' })).toBeInTheDocument();
  expect(screen.getByText('Armor Set Search')).toBeInTheDocument();
});
