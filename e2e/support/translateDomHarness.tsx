// Browser entry for translate-dom.bench.spec.ts: the two surfaces that crashed under Chrome's
// page translation, mounted as the app mounts them, behind the same kind of error boundary the
// routes use. `?guard=0` leaves the DOM unguarded so the bench can prove it still reproduces.

import { Component, type ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OrganicSessionSidebar } from '@/components/organic/agent/OrganicSessionSidebar';
import { SkillForm } from '@/components/skills/SkillForm';
import type { OrganicSession } from '@/lib/organic/agent-sessions';
import { guardAgainstTranslatedDom } from '@/lib/translateDomGuard';

const params = new URLSearchParams(location.search);
if (params.get('guard') !== '0') guardAgainstTranslatedDom();

const errors: string[] = [];
(window as unknown as { benchErrors: string[] }).benchErrors = errors;

class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    errors.push(String(error));
  }
  render() {
    return this.state.failed ? (
      <h2 data-route-error="">Something went wrong</h2>
    ) : (
      this.props.children
    );
  }
}

// What Chrome does once the user accepts "Translate this page": every text node becomes
// <font><font>translated</font></font>, and text React adds later is translated as it lands.
function translateText(node: Text) {
  if (!node.nodeValue?.trim() || node.parentElement?.closest('font, style, script')) return;
  const outer = document.createElement('font');
  const inner = document.createElement('font');
  outer.style.verticalAlign = 'inherit';
  inner.style.verticalAlign = 'inherit';
  inner.textContent = node.nodeValue;
  outer.appendChild(inner);
  node.replaceWith(outer);
}

function translateTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  texts.forEach(translateText);
}

function startTranslating(root: HTMLElement) {
  translateTree(root);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateText(record.target as Text);
      record.addedNodes.forEach((added) => {
        if (added.isConnected) translateTree(added);
      });
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

// The organic sidebar's row for the session the agent is answering. When the reply ends, the
// "Working" marker's <span> is reused for the role label and React removes its old children.
const SESSION = {
  sessionId: 'bench-session',
  brandId: null,
  title: 'eliminar los tokens de las paletas de colores',
  lastMessageRole: 'assistant',
  lastMessagePreview: null,
  lastMessageAt: '2026-11-10T02:48:00.000Z',
  createdAt: '2026-11-10T02:40:00.000Z',
  updatedAt: '2026-11-10T02:48:00.000Z',
  initiator: 'human',
  initiatorAgent: null,
  callerRunId: null,
  callerSessionId: null,
  tags: [],
  preview: null,
} as OrganicSession;

function SidebarReplyEnds() {
  const [working, setWorking] = useState(true);
  (window as unknown as { benchEndReply: () => void }).benchEndReply = () => setWorking(false);
  return (
    <OrganicSessionSidebar
      sessions={[SESSION]}
      activeSessionId={SESSION.sessionId}
      isLoading={false}
      isInteractionDisabled={working}
      streamingSessionIds={new Set(working ? [SESSION.sessionId] : [])}
      onNewSession={() => {}}
      onSelectSession={() => {}}
      onDeleteSession={() => {}}
    />
  );
}

const SKILL = {
  id: '00000000-0000-0000-0000-00000000aaaa',
  brandId: '00000000-0000-0000-0000-00000000bbbb',
  name: 'Contenido orgánico de piscinas para ETAV',
  kind: 'creative_direction',
  surface: 'both',
  description: 'Contenido orgánico de piscinas para ETAV',
  directives: '# Contenido orgánico para piscinas ETAV\n\n## Propósito\n\nCrear ideas.',
  tags: [],
  isTemplate: false,
} as unknown as Parameters<typeof SkillForm>[0]['initial'];

const surface = params.get('surface');
const container = document.getElementById('root') as HTMLElement;
createRoot(container).render(
  <RouteBoundary>
    {surface === 'skill' ? (
      <SkillForm
        brandId="bench"
        initial={SKILL}
        onCancelAction={() => {}}
        onSavedAction={() => {}}
      />
    ) : (
      <SidebarReplyEnds />
    )}
  </RouteBoundary>,
);
requestAnimationFrame(() => startTranslating(container));
