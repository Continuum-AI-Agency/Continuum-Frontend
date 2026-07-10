// Automations ships dark: every entry point (sidebar toggle, message actions,
// sheets/deep-links) is live only in local development until the backend
// worker + routes are deployed. NODE_ENV is inlined into client bundles at
// build time, so production builds render the Coming-soon state with no
// runtime configuration.
export const AUTOMATIONS_AVAILABLE = process.env.NODE_ENV === 'development';
