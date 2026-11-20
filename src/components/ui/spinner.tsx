import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const uiText = useTranslations('common');
  return (
    <Loader2Icon
      role="status"
      aria-label={uiText('loading_dc38088')}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
