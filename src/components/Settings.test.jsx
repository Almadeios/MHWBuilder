import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';
import { StorageProvider } from '../hooks/StorageContext';

describe('settings factory reset', () => {
  beforeEach(() => localStorage.clear());

  it('requires explicit confirmation and explains what will be deleted', async() => {
    render(<StorageProvider><Settings /></StorageProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Factory Reset' }));

    expect(screen.getByRole('dialog', { name: 'Factory reset MHW Builder?' })).toBeInTheDocument();
    expect(screen.getByText(/permanently deletes every saved build/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Everything' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
