const ENV_VAR_CANDIDATES = [
  "ORGANIC_AGENT_BASE_URL",
  "ANTONIDAS_API_BASE_URL",
  "CONTINUUM_AGENT_BASE_URL",
  "CONTINUUM_API_BASE_URL",
];

function readEnvVar(): string | null {
  for (const name of ENV_VAR_CANDIDATES) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function getOrganicServiceBaseUrl(): string {
  const raw = readEnvVar();
  if (!raw) {
    throw new Error(
      "Missing organic content service base URL. Set ORGANIC_AGENT_BASE_URL (or ANTONIDAS_API_BASE_URL) in the environment."
    );
  }

  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
