import { Suspense } from 'react';
import { AutomationWorkspace } from '@/components/automations/workspace/AutomationWorkspace';
import {
  AutomationWorkspaceLoader,
  type AutomationWorkspacePageProps,
} from './automationWorkspaceLoader';

// The page awaits nothing: params and the brand context are resolved inside the
// boundary, so everything above it prerenders as the shell.
export default function AutomationWorkspacePage(props: AutomationWorkspacePageProps) {
  return (
    <Suspense fallback={null}>
      <AutomationWorkspaceLoader {...props} />
    </Suspense>
  );
}
