import { Trash } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type StartOverButtonProps = {
  onConfirm: () => void;
  disabled?: boolean;
};

export function StartOverButton({ onConfirm, disabled }: StartOverButtonProps) {
  const tUi = useTranslations('onboarding');

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="gap-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash className="h-3.5 w-3.5" />
            {tUi('m_51dd91dc98')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tUi('m_8b82a80f36')}</AlertDialogTitle>
          <AlertDialogDescription>{tUi('m_576d1135f0')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tUi('m_77dfd2135f')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {tUi('m_ebb72de392')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
