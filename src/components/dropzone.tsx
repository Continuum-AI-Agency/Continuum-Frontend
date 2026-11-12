'use client';

import { CheckCircle, File, Loader2, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, type PropsWithChildren, useCallback, useContext } from 'react';
import { Button } from '@/components/ui/button';
import type { UseSupabaseUploadReturn } from '@/hooks/use-supabase-upload';
import { useUiErrorMessage } from '@/i18n/errors';
import { cn } from '@/lib/utils';

export const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: 'bytes' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB',
) => {
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  if (bytes === 0 || bytes === undefined) return size !== undefined ? `0 ${size}` : '0 bytes';
  const i = size !== undefined ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(dm)) + ' ' + sizes[i];
};

type DropzoneContextType = Omit<UseSupabaseUploadReturn, 'getRootProps' | 'getInputProps'>;

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined);

type DropzoneProps = UseSupabaseUploadReturn & {
  className?: string;
};

const Dropzone = ({
  className,
  children,
  getRootProps,
  getInputProps,
  ...restProps
}: PropsWithChildren<DropzoneProps>) => {
  const isSuccess = restProps.isSuccess;
  const isActive = restProps.isDragActive;
  const isInvalid =
    (restProps.isDragActive && restProps.isDragReject) ||
    (restProps.errors.length > 0 && !restProps.isSuccess) ||
    restProps.files.some((file) => file.errors.length !== 0);

  return (
    <DropzoneContext.Provider value={{ ...restProps }}>
      <div
        {...getRootProps({
          className: cn(
            'border-2 border-gray-300 rounded-lg p-4 text-center bg-card transition-colors duration-300 text-foreground text-xs leading-tight',
            className,
            isSuccess ? 'border-solid' : 'border-dashed',
            isActive && 'border-primary bg-primary/10',
            isInvalid && 'border-destructive bg-destructive/10',
          ),
        })}
      >
        <input {...getInputProps()} />
        {children}
      </div>
    </DropzoneContext.Provider>
  );
};
const DropzoneContent = ({ className }: { className?: string }) => {
  const uiText = useTranslations('common');
  const uiLocale = useLocale();
  const getUiErrorMessage = useUiErrorMessage();
  const formatSize = (bytes: number) =>
    formatBytes(bytes, 2).replace(/^[\d.]+/, (n) =>
      new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 2 }).format(Number(n)),
    );
  const {
    files,
    setFiles,
    onUpload,
    loading,
    successes,
    errors,
    maxFileSize,
    maxFiles,
    isSuccess,
  } = useDropzoneContext();

  const exceedMaxFiles = files.length > maxFiles;

  const handleRemoveFile = useCallback(
    (fileName: string) => {
      setFiles(files.filter((file) => file.name !== fileName));
    },
    [files, setFiles],
  );

  if (isSuccess) {
    return (
      <div className={cn('flex flex-row items-center gap-x-2 justify-center', className)}>
        <CheckCircle size={16} className="text-primary" />
        <p className="text-primary text-sm">{uiText('m_f4732088ed', { count: files.length })}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col text-xs leading-tight', className)}>
      {files.map((file, idx) => {
        const fileError = errors.find((e) => e.name === file.name);
        const isSuccessfullyUploaded = !!successes.find((e) => e === file.name);

        return (
          <div
            key={`${file.name}-${idx}`}
            className="flex items-center gap-x-4 border-b py-2 first:mt-4 last:mb-4 "
          >
            {file.type.startsWith('image/') && file.preview ? (
              <div className="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                <Image
                  src={file.preview}
                  alt={file.name}
                  width={40}
                  height={40}
                  className="object-cover h-full w-full"
                  unoptimized
                />
              </div>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                <File size={18} />
              </div>
            )}

            <div className="shrink grow flex flex-col items-start truncate">
              <p title={file.name} className="text-xs truncate max-w-full">
                {file.name}
              </p>
              {file.errors.length > 0 ? (
                <p className="text-xs text-destructive">
                  {file.errors
                    .map((e) =>
                      e.code === 'file-too-large'
                        ? uiText('m_da453e496a', {
                            maximum: formatSize(maxFileSize),
                            size: formatSize(file.size),
                          })
                        : e.code === 'file-invalid-type'
                          ? uiText('m_949a95b1b8')
                          : e.code === 'file-too-small'
                            ? uiText('m_9ba62c07b0')
                            : getUiErrorMessage(e),
                    )
                    .join(', ')}
                </p>
              ) : loading && !isSuccessfullyUploaded ? (
                <p className="text-xs text-muted-foreground">{uiText('uploading_5ce44dd')}</p>
              ) : fileError ? (
                <p className="text-xs text-destructive">
                  {uiText('m_8cbe01ad08')}
                  {getUiErrorMessage(fileError)}
                </p>
              ) : isSuccessfullyUploaded ? (
                <p className="text-xs text-primary">{uiText('uploaded_3cc3767')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              )}
            </div>

            {!loading && !isSuccessfullyUploaded && (
              <Button
                size="icon"
                variant="link"
                className="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
                aria-label={uiText('m_df7193a589', { name: file.name })}
                onClick={() => handleRemoveFile(file.name)}
              >
                <X />
              </Button>
            )}
          </div>
        );
      })}
      {exceedMaxFiles && (
        <p className="text-sm text-left mt-2 text-destructive">
          {uiText('m_20487e645c', {
            maximum: maxFiles,
            excess: files.length - maxFiles,
          })}
        </p>
      )}
      {files.length > 0 && !exceedMaxFiles && (
        <div className="mt-2">
          <Button
            variant="outline"
            onClick={onUpload}
            disabled={files.some((file) => file.errors.length !== 0) || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uiText('m_070e328ec8')}
              </>
            ) : (
              <>{uiText('m_41aca16f90')}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const tUi = useTranslations('common');
  const uiLocale = useLocale();
  const formatSize = (bytes: number) =>
    formatBytes(bytes, 2).replace(/^[\d.]+/, (n) =>
      new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 2 }).format(Number(n)),
    );

  const { maxFiles, maxFileSize, inputRef, isSuccess } = useDropzoneContext();

  if (isSuccess) {
    return null;
  }

  return (
    <div className={cn('flex flex-col items-center gap-y-1 text-xs leading-tight', className)}>
      <Upload size={16} className="text-muted-foreground" />
      <p className="text-xs">
        {tUi('m_cc6f4f6c17', {
          unlimited: !maxFiles ? 'yes' : 'no',
          count: maxFiles ?? 0,
        })}
      </p>
      <div className="flex flex-col items-center gap-y-0.5 text-xs">
        <p className="text-muted-foreground">
          {tUi('m_33e92dd69b')}{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="underline cursor-pointer transition hover:text-foreground"
          >
            {tUi('m_81448fe273')}
          </button>
        </p>
        {maxFileSize !== Number.POSITIVE_INFINITY && (
          <p className="text-muted-foreground">
            {tUi('m_f0a855f72e')}
            {formatSize(maxFileSize)}
          </p>
        )}
      </div>
    </div>
  );
};

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone');
  }

  return context;
};

export { Dropzone, DropzoneContent, DropzoneEmptyState, useDropzoneContext };
