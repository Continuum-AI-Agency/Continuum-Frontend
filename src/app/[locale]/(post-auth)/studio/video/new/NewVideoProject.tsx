'use client';

import { exportSettingsForPreset } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client.ts';
import { createVideoProject } from '@/lib/api/videoProjects.client.ts';

export function NewVideoProject({ brandId }: { brandId: string }) {
  const translateUi = useUiTranslations('studio');

  const uiErrorText = useUiErrorMessage();

  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Dev StrictMode runs effects twice; one visit makes one project.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const project = await createVideoProject({
        brandId,
        title: translateUi('untitled_edit_90509ba9'),
        width: 1080,
        height: 1920,
      });
      await runVideoEditorOp(project.projectId, 'apply_commands', {
        expectedRevision: project.revision,
        commands: [
          {
            commandType: 'set_export_settings',
            exportSettings: exportSettingsForPreset('tiktok'),
          },
        ],
      });
      router.replace(studioVideoHref({ projectId: project.projectId, origin: 'library' }));
    })().catch((caught: unknown) => setError(uiErrorText(caught)));
  }, [brandId, router, uiErrorText, translateUi]);

  return (
    <div className="flex h-[var(--app-content-h)] items-center justify-center gap-2 text-sm text-muted-foreground">
      {error ? (
        <span role="alert">
          {translateUi('could_not_start_a_new_edit_43ef0fad')} {error}
        </span>
      ) : (
        <>
          <Loader2 className="size-4 animate-spin" /> {translateUi(
            'starting_a_new_edit_b9afebbf',
          )}{' '}
        </>
      )}
    </div>
  );
}
