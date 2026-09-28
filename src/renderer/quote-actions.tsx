import { MessageSquarePlus, Quote as QuoteIcon } from 'lucide-react';
import type { Quote } from '../shared/notebook';
import { Button } from './components/ui/button';
import { DropdownMenuItem } from './components/ui/dropdown-menu';
import { t } from './i18n';

export type QuoteHandler = (quote: Quote, newConversation?: boolean) => void;

const actions = [
  { newConversation: false, label: '添加到对话', Icon: QuoteIcon },
  { newConversation: true, label: '在新对话中讨论', Icon: MessageSquarePlus },
] as const;

/** Shared actions for selection toolbars and source menus, using official UI primitives. */
export function QuoteActions({
  variant = 'toolbar',
  onSelect,
}: {
  variant?: 'toolbar' | 'menu';
  onSelect: (newConversation: boolean) => void;
}) {
  return actions.map(({ newConversation, label, Icon }) =>
    variant === 'menu' ? (
      <DropdownMenuItem key={label} onSelect={() => onSelect(newConversation)}>
        <Icon />
        {t(label)}
      </DropdownMenuItem>
    ) : (
      <Button key={label} size="sm" variant="ghost" onClick={() => onSelect(newConversation)}>
        {t(label)}
      </Button>
    ),
  );
}
