'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ProposalSheet } from './ProposalSheet';

interface ProposalContextValue {
  open: () => void;
}

const ProposalContext = createContext<ProposalContextValue | null>(null);

/**
 * Holds one sheet for the whole profile, so every lock overlay and CTA opens
 * the same instance. Server-rendered panels pass straight through as
 * `children`, so wrapping the page costs them no client JS.
 */
export function ProposalProvider({
  handle,
  displayName,
  minimumBudget,
  children,
}: {
  handle: string;
  displayName: string;
  minimumBudget: number | null;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo<ProposalContextValue>(() => ({ open: () => setIsOpen(true) }), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ProposalContext.Provider value={value}>
      {children}
      <ProposalSheet
        handle={handle}
        displayName={displayName}
        minimumBudget={minimumBudget}
        isOpen={isOpen}
        onClose={close}
      />
    </ProposalContext.Provider>
  );
}

export function useProposal(): ProposalContextValue {
  const context = useContext(ProposalContext);
  if (!context) throw new Error('useProposal must be used inside <ProposalProvider>');
  return context;
}
