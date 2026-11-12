import { useTranslations } from 'next-intl';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { DriveBrands } from './DriveBrands';
import { DriveAppTokens, DriveCliDownloads } from './DriveSections';

/** Everything Drive: rendered at /settings/drive and as the Settings → Drive section. */
export function DriveSettings({ email }: { email: string }) {
  const tUi = useTranslations('settings');

  return (
    <>
      <SettingsSection title={tUi('m_a975cb8282')} description={tUi('m_9e42f5ce48')}>
        <DriveAppTokens />
      </SettingsSection>
      <div id="storage" className="scroll-mt-4">
        <DriveBrands email={email} />
      </div>
      <SettingsSection title={tUi('m_f0184918ee')} description={tUi('m_d37284ffa7')}>
        <DriveCliDownloads />
      </SettingsSection>
    </>
  );
}
