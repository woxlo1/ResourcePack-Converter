import type { ReactElement } from 'react';
import { formatPackFormat, type DetectionConfidence } from '@rpc/core';
import {
  Badge,
  Button,
  Card,
  ChipList,
  DefinitionList,
  EmptyState,
  ScreenHeader,
  Stat,
  StatGrid,
} from '../components';
import { fileKindLabelKey, formatBytes, shortPath } from '../format';
import { useAppStore, useTranslation } from '../store';
import type { TranslationKey } from '../i18n';

const CONFIDENCE_KEYS: Record<DetectionConfidence, TranslationKey> = {
  high: 'analysis.confidence.high',
  medium: 'analysis.confidence.medium',
  low: 'analysis.confidence.low',
  unknown: 'analysis.confidence.unknown',
};

export function AnalysisScreen(): ReactElement {
  const t = useTranslation();
  const source = useAppStore((state) => state.source);
  const setScreen = useAppStore((state) => state.setScreen);

  if (!source) {
    return (
      <div className="screen">
        <ScreenHeader title={t('analysis.heading')} description={t('analysis.description')} />
        <EmptyState
          title={t('import.noFile')}
          body={t('import.description')}
          action={<Button onClick={() => setScreen('import')}>{t('home.importNow')}</Button>}
        />
      </div>
    );
  }

  const analysis = source.analysis;
  const detection = analysis.detection;
  const unknownFiles = analysis.unknownFiles.slice(0, 100);
  const missing = analysis.missingReferences.slice(0, 100);

  return (
    <div className="screen">
      <ScreenHeader
        title={t('analysis.heading')}
        description={t('analysis.description')}
        actions={
          <Button onClick={() => setScreen('configure')}>{t('analysis.continue')}</Button>
        }
      />

      <Card title={`${t('analysis.summary')} · ${source.name}`}>
        <StatGrid>
          <Stat label={t('analysis.totalFiles')} value={analysis.fileCount} />
          <Stat label={t('analysis.totalSize')} value={formatBytes(analysis.totalUncompressedSize)} />
          <Stat label={t('analysis.zipSize')} value={formatBytes(source.zipSize)} />
          <Stat label={t('analysis.jsonFiles')} value={analysis.jsonCount} />
          <Stat label={t('analysis.pngFiles')} value={analysis.pngCount} />
          <Stat label={t('analysis.oggFiles')} value={analysis.oggCount} />
          <Stat label={t('analysis.models')} value={analysis.modelCount} />
          <Stat label={t('analysis.itemDefs')} value={analysis.itemDefinitionCount} />
          <Stat label={t('analysis.blockstates')} value={analysis.blockstateCount} />
          <Stat label={t('analysis.textures')} value={analysis.textureCount} />
          <Stat label={t('analysis.sounds')} value={analysis.soundCount} />
          <Stat label={t('analysis.fonts')} value={analysis.fontCount} />
          <Stat label={t('analysis.shaders')} value={analysis.shaderCount} />
          <Stat label={t('analysis.unknown')} value={analysis.unknownCount} tone={analysis.unknownCount > 0 ? 'warn' : undefined} />
        </StatGrid>
      </Card>

      <div className="columns">
        <Card title={t('analysis.detection')}>
          <DefinitionList
            items={[
              {
                term: t('analysis.detectedFormat'),
                description: detection.format ? (
                  <Badge tone="info">
                    {t('analysis.formatValue', { format: formatPackFormat(detection.format) })}
                  </Badge>
                ) : (
                  <Badge tone="warn">{t('common.unknown')}</Badge>
                ),
              },
              {
                term: t('analysis.confidence'),
                description: (
                  <Badge tone={detection.confidence === 'high' ? 'ok' : detection.confidence === 'low' || detection.confidence === 'unknown' ? 'warn' : 'info'}>
                    {t(CONFIDENCE_KEYS[detection.confidence])}
                  </Badge>
                ),
              },
              {
                term: t('analysis.packMcmeta'),
                description: analysis.hasPackMcmeta ? t('analysis.present') : t('analysis.absent'),
              },
              {
                term: t('analysis.packPng'),
                description: analysis.hasPackPng ? t('analysis.present') : t('analysis.absent'),
              },
              {
                term: t('analysis.dependencies'),
                description: t('analysis.dependencyCount', { count: analysis.dependencies.length }),
              },
            ]}
          />
          <h3 className="subheading">{t('analysis.reasons')}</h3>
          {detection.reasons.length > 0 ? (
            <ul className="bullet-list">
              {detection.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('common.none')}</p>
          )}
          <h3 className="subheading">{t('analysis.matchedVersions')}</h3>
          <ChipList
            values={detection.matchedVersions.map(
              (version) => `${version.label} (${formatPackFormat(version.resourcePackFormat)})`,
            )}
            empty={t('common.none')}
          />
        </Card>

        <Card title={t('analysis.namespaces')}>
          <ChipList values={analysis.namespaces} empty={t('analysis.noNamespaces')} />
          <h3 className="subheading">{t('analysis.unknownFiles')}</h3>
          <p className="muted small">{t('analysis.unknownHint')}</p>
          {unknownFiles.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.path')}</th>
                  <th>{t('common.kind')}</th>
                  <th>{t('common.size')}</th>
                </tr>
              </thead>
              <tbody>
                {unknownFiles.map((file) => (
                  <tr key={file.path}>
                    <td title={file.path}>{shortPath(file.path, 52)}</td>
                    <td>{t(fileKindLabelKey(file.kind))}</td>
                    <td>{formatBytes(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('analysis.noUnknown')}</p>
          )}
          {analysis.unknownFiles.length > unknownFiles.length && (
            <p className="muted small">
              {t('common.showing', {
                shown: unknownFiles.length,
                total: analysis.unknownFiles.length,
              })}
            </p>
          )}
        </Card>
      </div>

      <Card title={t('analysis.missingRefs')} description={t('analysis.missingHint')}>
        {missing.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.path')}</th>
                <th>{t('common.details')}</th>
                <th>{t('common.kind')}</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((edge) => (
                <tr key={`${edge.from}->${edge.to}`}>
                  <td title={edge.from}>{shortPath(edge.from, 48)}</td>
                  <td title={edge.to} className="mono">
                    {shortPath(edge.to, 48)}
                  </td>
                  <td>{edge.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('analysis.noMissing')}</p>
        )}
        {analysis.missingReferences.length > missing.length && (
          <p className="muted small">
            {t('common.showing', { shown: missing.length, total: analysis.missingReferences.length })}
          </p>
        )}
      </Card>

      <div className="screen-actions">
        <Button variant="secondary" onClick={() => setScreen('import')}>
          {t('common.back')}
        </Button>
        <Button onClick={() => setScreen('configure')}>{t('analysis.continue')}</Button>
      </div>
    </div>
  );
}
