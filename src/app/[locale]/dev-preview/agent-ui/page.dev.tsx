import { AgentUiPreview } from './AgentUiPreview';

// Dev-only visual harness for the agent-ui components (components/agent-ui). Not linked from any
// nav; the data is a simulated run so every live state can be seen without a Backend.
export default function AgentUiPreviewPage() {
  return <AgentUiPreview />;
}
