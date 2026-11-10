// Produce a complete SQL file for the owner's existing Supabase SQL editor.
// No database connection, secret access, migration execution or account action.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const paths = [
  'migrations/030_account_deletion_fulfillment.sql',
  'migrations/031_account_deletion_local_cleanup.sql',
  'migrations/032_account_deletion_operations.sql',
];
const parts = await Promise.all(paths.map(async path => `-- SOURCE: ${path}\n${await readFile(path, 'utf8')}`));
const footer = `
SELECT to_regclass('public.nanivio_deletion_jobs') IS NOT NULL
  AND to_regclass('public.nanivio_deletion_operation_reviews') IS NOT NULL
  AND to_regprocedure('public.nanivio_deletion_clean_local(uuid,uuid,boolean)') IS NOT NULL
  AND to_regprocedure('public.nanivio_deletion_operations(uuid,uuid,text,jsonb)') IS NOT NULL
  AS account_deletion_setup_installed;
`;
await mkdir('generated-artifacts', { recursive: true });
await writeFile('generated-artifacts/account-deletion-setup.sql',
  '-- Install-only. Requires migration 029 and the existing billing/storage schema.\n' +
  '-- Does not enable a runner, queue requests, deactivate users or erase accounts.\n' +
  parts.join('\n\n') + footer);
console.log('Created generated-artifacts/account-deletion-setup.sql');
