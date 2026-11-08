import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { formatPackFormat } from '@rpc/core';
import { Badge, Button, Card, DefinitionList, EmptyState, ScreenHeader } from '../components';
import { formatBytes } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';

const FOLDER_PROPS = { webkitdirectory: '', directory: '' } as unknown as Record<string, string>;

export function ImportScreen(): ReactElement {
  const t = useTranslation();
  const source = useAppStore((state) => state.source);
  const isImporting = useAppStore((state) => state.status.isImporting);
  const setScreen = useAppStore((state) => state.setScreen);
  const { importZipFile, importFolderFiles, importDrop } = useAppActions();
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragActive(false);
    void importDrop(event.dataTransfer);
  };

  return (
    <div className="screen">
      <ScreenHeader title={t('import.heading')} description={t('import.description')} />

      <div className="columns columns--wide">
        <Card title={t('import.dropTitle')} description={t('import.dropHint')}>
          <div
            className={`dropzone${dragActive ? ' is-active' : ''}${isImporting ? ' is-busy' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <span className="dropzone__icon" aria-hidden="true">
              📦
            </span>
            <p className="dropzone__title">{dragActive ? t('import.dragActive') : t('import.dropTitle')}</p>
            <p className="muted">{isImporting ? t('import.analyzing') : t('import.dropHint')}</p>
            <div className="dropzone__actions">
              <Button onClick={() => zipInput.current?.click()} disabled={isImporting}>
                {t('import.chooseZip')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => folderInput.current?.click()}
                disabled={isImporting}
              >
                {t('import.chooseFolder')}
              </Button>
            </div>
            <input
              ref={zipInput}
              className="visually-hidden"
              type="file"
              accept=".zip,application/zip"
              aria-label={t('import.zipInputLabel')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importZipFile(file);
              }}
            />
            <input
              ref={folderInput}
              className="visually-hidden"
              type="file"
              multiple
              aria-label={t('import.folderInputLabel')}
              {...FOLDER_PROPS}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length > 0) void importFolderFiles(files);
              }}
            />
          </div>
          <p className="muted small">{t('import.folderNote')}</p>
        </Card>

        <div className="stack">
          <Card title={t('import.requirements')}>
            <ul className="checklist">
              <li>{t('import.req1')}</li>
              <li>{t('import.req2')}</li>
              <li>{t('import.req3')}</li>
              <li>{t('import.req4')}</li>
            </ul>
          </Card>
          <Card title={t('import.supportedTitle')} description={t('import.supportedBody')}>
            <p className="privacy-note">
              <span aria-hidden="true">🔒</span> {t('import.privacy')}
            </p>
          </Card>
        </div>
      </div>

      {source ? (
        <Card
          title={t('import.source')}
          actions={
            <Button size="sm" onClick={() => setScreen('analysis')}>
              {t('analysis.continue')}
            </Button>
          }
        >
          <DefinitionList
            items={[
              { term: t('common.name'), description: source.name },
              {
                term: t('common.format'),
                description: source.analysis.detection.format ? (
                  <Badge tone="info">{t('analysis.formatValue', {
                    format: formatPackFormat(source.analysis.detection.format),
                  })}</Badge>
                ) : (
                  <Badge tone="warn">{t('common.unknown')}</Badge>
                ),
              },
              {
                term: t('common.files'),
                description: `${source.analysis.fileCount} / ${formatBytes(source.analysis.totalUncompressedSize)}`,
              },
              { term: t('analysis.zipSize'), description: formatBytes(source.zipSize) },
            ]}
          />
        </Card>
      ) : (
        <EmptyState title={t('import.noFile')} body={t('import.description')} />
      )}
    </div>
  );
}
