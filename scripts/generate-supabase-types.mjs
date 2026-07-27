import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv() {
  const rootDir = path.resolve(__dirname, '..');
  // This command targets the linked hosted project. `.env.local` is reserved
  // for the explicit local-Supabase workflow, so the hosted `.env` wins here.
  const files = ['.env', '.env.local'];
  for (const filename of files) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function generateTypes() {
  loadDotEnv();
  // Prefer explicit project ref, otherwise try to derive from NEXT_PUBLIC_SUPABASE_URL
  let projectRef =
    process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!projectRef) {
    if (!supabaseUrl) {
      console.error(
        'Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL (https://<project-ref>.supabase.co)',
      );
      process.exit(1);
    }
    try {
      const url = new URL(supabaseUrl);
      projectRef = url.hostname.split('.')[0];
    } catch {
      console.error('Invalid NEXT_PUBLIC_SUPABASE_URL. Expected https://<project-ref>.supabase.co');
      process.exit(1);
    }
  }

  const schemas =
    process.env.SUPABASE_SCHEMAS ||
    'public,brand_profiles,organic,paid_media,media,brand_trends,brand_integrations,DCO_Campaigns,integrations,plugin_mcp,external_connections,agent_workspace,jaina';

  const args = ['gen', 'types', 'typescript', '--project-id', projectRef, '--schema', schemas];

  execFile('supabase', args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      if (stderr) console.error(stderr);
      console.error(error.message);
      console.error('Ensure the Supabase CLI is installed and you are logged in.');
      process.exit(error.code || 1);
    }

    const outputPath = path.resolve(__dirname, '../src/lib/supabase/types.ts');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, stdout, 'utf8');
    console.log(`Supabase types generated for project: ${projectRef} (schemas: ${schemas})`);
    console.log(`→ ${outputPath}`);
  });
}

generateTypes();
