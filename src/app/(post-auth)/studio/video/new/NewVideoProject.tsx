'use client';

import { exportSettingsForPreset } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import { createVideoProject } from '@/lib/api/videoProjects.client';

export function NewVideoProject({ brandId }: { brandId: string }) {
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
        title: 'Untitled edit',
        width: 1080,
        height: 1920,
      });
      await runVideoEditorOp(project.projectId, 'apply_commands', {
        expectedRevision: project.revision,
        commands: [
          { commandType: 'set_export_settings', exportSettings: exportSettingsForPreset('tiktok') },
        ],
      });
      router.replace(studioVideoHref({ projectId: project.projectId, origin: 'library' }));
    })().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'The project could not be created.'),
    );
  }, [brandId, router]);

  return (
    <div className="flex h-[var(--app-content-h)] items-center justify-center gap-2 text-sm text-muted-foreground">
      {error ? (
        <span role="alert">Could not start a new edit: {error}</span>
      ) : (
        <>
          <Loader2 className="size-4 animate-spin" /> Starting a new edit…
        </>
      )}
    </div>
  );
}
