'use client';

import { classifyLibraryFile } from '@continuum/contracts';
import { useSearchParams } from 'next/navigation';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { expandDesignArchives } from '@/components/forge/designArchive';
import {
  FORGE_PROJECT_ACCEPT,
  isForgeDesignFile,
  partitionForgeProjectFiles,
} from '@/components/forge/ForgeProjectDrop';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import { ACCEPTED_DOCUMENT_EXTENSIONS, hasDocumentExtension } from '@/lib/documents/uploadLimits';
import {
  fetchTemplateSources,
  importDesignTemplate,
  uploadTemplateFontFiles,
} from '@/lib/library/templateSources';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SourceRef =
  | { kind: 'document'; document_id: string }
  | { kind: 'media' | 'template'; asset_id: string; version_id: string };

/** A template project the way the gallery takes it in: a PSD or AI becomes its own authored package. */
async function uploadTemplateProject(brandId: string, file: File): Promise<SourceRef> {
  const uploaded = await uploadMediaAsset({ brandId, file });
  if (!isForgeDesignFile(file.name))
    return {
      kind: 'template',
      asset_id: uploaded.assetId,
      version_id: uploaded.versionId,
    };
  const imported = await importDesignTemplate(brandId, uploaded.assetId);
  const source = (await fetchTemplateSources(brandId)).find(
    (item) => item.assetId === imported.assetId,
  );
  if (!source)
    throw new Error(`${file.name} was imported but its template is not listed yet. Try again.`);
  return {
    kind: 'template',
    asset_id: source.assetId,
    version_id: source.versionId,
  };
}

export function ForgeSourceHandoff({ brandId }: { brandId: string }) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

  const intentId = useSearchParams().get('mcpSourceIntent');
  const [status, setStatus] = useState<'checking' | 'ready' | 'uploading' | 'completed' | 'error'>(
    'checking',
  );
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string[]>([]);
  const [completedRefs, setCompletedRefs] = useState<SourceRef[]>([]);

  useEffect(() => {
    if (!intentId) return;
    let cancelled = false;
    void createSupabaseBrowserClient()
      .functions.invoke('library-upload', {
        body: {
          action: 'get_forge_source_intent',
          brandId,
          uploadIntentId: intentId,
        },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.status === 'expired') {
          setStatus('error');
          setMessage(translateUi('this_upload_link_expired_ask_the_ag_7ea73eb3'));
        } else if (data.status === 'completed') {
          setStatus('completed');
          setMessage(translateUi('sources_are_ready_for_the_agent_d15cd9f8'));
        } else setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, intentId, translateUi]);

  if (!intentId) return null;
  const upload = async () => {
    if (files.length < 1 || files.length > 8) return;
    setStatus('uploading');
    setMessage('');
    const refs: SourceRef[] = [...completedRefs];
    try {
      // A ZIP of Photoshop or Illustrator files opens into those files, as in the gallery; fonts are
      // stored first because a project is parsed seconds after it lands and that parse looks for them.
      const expanded = await expandDesignArchives(files);
      const { fonts } = partitionForgeProjectFiles(expanded);
      if (fonts.length && !refs.length) {
        const { stored, refused } = await uploadTemplateFontFiles(brandId, fonts);
        setProgress((current) => [
          ...current,
          ...(stored.length ? [`Fonts added: ${stored.join(', ')}`] : []),
          ...(refused.length ? [`Fonts not added: ${refused.join('; ')}`] : []),
        ]);
      }
      for (const file of expanded.filter((file) => !fonts.includes(file)).slice(refs.length)) {
        const kind = classifyLibraryFile({
          fileName: file.name,
          mimeType: file.type,
        });
        const project = partitionForgeProjectFiles([file]).accepted.length > 0;
        if (kind.accepted && (kind.originalKind === 'image' || kind.originalKind === 'video')) {
          if (refs.filter((ref) => ref.kind === 'media').length >= 6)
            throw new Error('Use at most six images or videos.');
          const asset = await uploadMediaAsset({ brandId, file });
          refs.push({
            kind: 'media',
            asset_id: asset.assetId,
            version_id: asset.versionId,
          });
        } else if (hasDocumentExtension(file.name)) {
          if (refs.filter((ref) => ref.kind === 'document').length >= 5)
            throw new Error('Use at most five documents.');
          const document = await uploadBrandDocument({ brandId, file });
          refs.push({ kind: 'document', document_id: document.documentId });
        } else if (project) {
          if (refs.filter((ref) => ref.kind === 'template').length >= 3)
            throw new Error('Use at most three template projects.');
          refs.push(await uploadTemplateProject(brandId, file));
        } else throw new Error(`Unsupported file: ${file.name}`);
        setProgress((current) => [...current, `${file.name} uploaded`]);
        setCompletedRefs([...refs]);
      }
      const { error } = await createSupabaseBrowserClient().functions.invoke('library-upload', {
        body: {
          action: 'complete_forge_source_intent',
          brandId,
          uploadIntentId: intentId,
          sourceRefs: refs,
        },
      });
      if (error) throw error;
      setStatus('completed');
      setMessage(translateUi('sources_uploaded_the_agent_can_cont_913243b6'));
    } catch (error) {
      setStatus('error');
      setMessage(uiErrorText(error));
    }
  };

  return (
    <section
      aria-label={translateUi('forge_source_handoff_b08eee91')}
      className="mb-3 shrink-0 rounded-lg border bg-card p-3 text-sm"
    >
      <h2 className="font-medium">{translateUi('add_files_for_the_agent_aab38c64')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {' '}
        {translateUi('choose_a_template_project_an_after__1bee29cf')}{' '}
      </p>
      {status === 'ready' || status === 'error' ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label={translateUi('choose_forge_source_files_284cd4e5')}
            type="file"
            multiple
            accept={`${ACCEPTED_DOCUMENT_EXTENSIONS},image/*,video/*,${FORGE_PROJECT_ACCEPT}`}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setCompletedRefs([]);
              setProgress([]);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={
              files.length === 0 ||
              files.length > 8 ||
              (status === 'error' && message.includes('expired'))
            }
            onClick={() => void upload()}
          >
            {translateUi('upload_865e89de')}
          </Button>
        </div>
      ) : null}
      {progress.length ? (
        <ul className="mt-2 text-xs" role="status">
          {progress.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs" role={status === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      ) : null}
      {status === 'uploading' ? (
        <p className="mt-2 text-xs" role="status">
          {translateUi('uploading_files_b6abaa85')}
        </p>
      ) : null}
    </section>
  );
}
