'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const rootDir = path.resolve(__dirname, '..');
  const files = ['.env.local', '.env'];
  for (const filename of files) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
  let projectRef = process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!projectRef) {
    if (!supabaseUrl) {
      console.error('Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL (https://<project-ref>.supabase.co)');
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

  const schemas = process.env.SUPABASE_SCHEMAS || 'public,brand_profiles';

  const args = ['gen', 'types', 'typescript', '--project-id', projectRef, '--schema', schemas];

  execFile('supabase', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr || error.message);
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


