import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { DriveAppTokens, DriveCliDownloads, DriveMountBrands } from './DriveSections';
import { DriveStorage } from './DriveStorage';

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
      <SettingsSection
        title="Mount the Library"
        description="Each brand you belong to appears as a network drive."
      >
        <DriveMountBrands email={email} />
      </SettingsSection>
      <div id="storage" className="scroll-mt-4">
        <SettingsSection
          title="Storage"
          description="How much of each brand's Library allowance is used. You are warned at 80%, before uploads stop."
        >
          <DriveStorage />
        </SettingsSection>
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
