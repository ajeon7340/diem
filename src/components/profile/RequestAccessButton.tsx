'use client';

import { Lock } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { useProposal } from './proposal-context';

/**
 * Every route to the proposal form goes through this button, so the CTA copy
 * and the sheet it opens can never drift apart.
 */
export function RequestAccessButton({
  label = 'Request Full Report & Propose Collaboration',
  showIcon = true,
  ...props
}: ButtonProps & { label?: string; showIcon?: boolean }) {
  const { open } = useProposal();

  return (
    <Button type="button" onClick={open} {...props}>
      {showIcon ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </Button>
  );
}
