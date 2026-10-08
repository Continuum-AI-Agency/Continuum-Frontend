import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { DriveBrands } from './DriveBrands';
import { DriveAppTokens, DriveCliDownloads } from './DriveSections';

/** Everything Drive: rendered at /settings/drive and as the Settings → Drive section. */
export function DriveSettings({ email }: { email: string }) {
  return (
    <>
      <SettingsSection
        title="App tokens"
        description="A token signs a desktop app or the continuum CLI in as you. Revoke one to cut that app off at once."
      >
        <DriveAppTokens />
      </SettingsSection>
      <div id="storage" className="scroll-mt-4">
        <DriveBrands email={email} />
      </div>
      <SettingsSection
        title="Command-line transfer (continuum)"
        description="Move large files in and out of the Library from a terminal."
      >
        <DriveCliDownloads />
      </SettingsSection>
    </>
  );
}
