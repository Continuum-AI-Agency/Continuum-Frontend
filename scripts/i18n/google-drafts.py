#!/usr/bin/env python3
"""Create review-only, offline Cloud Translation NMT drafts. Never edits application catalogs."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.request

PROJECT = 'continuum-production-477821'
GIB = 1024 ** 3
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', action='append', required=True, type=Path)
parser.add_argument('--locale', action='append', choices=['pt-BR', 'es'])
parser.add_argument('--staging', required=True, type=Path)
parser.add_argument('--prefix', required=True)
parser.add_argument('--max-source-characters', type=int, default=100_000)
args = parser.parse_args()
targets = [(locale, {'pt-BR': 'pt', 'es': 'es'}[locale]) for locale in dict.fromkeys(args.locale or ['pt-BR', 'es'])]
if not args.prefix.startswith('gs://continuum-production-477821-creative-benchmarks/i18n/'):
    raise SystemExit('Use the approved i18n evidence bucket/prefix')
if args.staging.exists():
    raise SystemExit('Use a fresh isolated staging directory; prior paid requests are never retried implicitly')
args.staging.mkdir(mode=0o700, parents=True)

def storage_check():
    size = sum(file.stat().st_size for file in args.staging.rglob('*') if file.is_file())
    if size > 2 * GIB or shutil.disk_usage(args.staging).free < 20 * GIB:
        raise RuntimeError('Draft generation stopped at the storage limit; all local files retained')

def seal(name, value):
    storage_check()
    file = args.staging / name
    if file.exists():
        raise RuntimeError('Refusing to overwrite a sealed draft batch')
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    destination = args.prefix.rstrip('/') + '/' + name
    subprocess.run(['gcloud', 'storage', 'cp', '--if-generation-match=0', str(file), destination],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    metadata = json.loads(subprocess.check_output(['gcloud', 'storage', 'objects', 'describe', destination,
                         '--format=json(size,md5_hash,generation)']))
    data = file.read_bytes()
    if int(metadata['size']) != len(data) or metadata['md5_hash'] != base64.b64encode(hashlib.md5(data).digest()).decode():
        raise RuntimeError('GCS verification failed; local files retained for recovery')
    (args.staging / (name + '.receipt.json')).write_text(json.dumps(metadata, indent=2) + '\n')

sources = []
input_hashes = {}
for file in args.input:
    data = file.read_bytes()
    input_hashes[str(file)] = hashlib.sha256(data).hexdigest()
    rows = json.loads(data)
    if not isinstance(rows, list):
        raise SystemExit('Draft input must be a JSON array of static strings or {source, refs} records')
    for row in rows:
        text = row if isinstance(row, str) else row.get('source') if isinstance(row, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise SystemExit('Every draft row must contain a nonempty source string')
        sources.append(text)
sources = list(dict.fromkeys(sources))
# Complex ICU/markup is authored as whole messages by reviewers. Sending its syntax
# through plain-text machine translation could change selectors or executable tokens.
skipped = [text for text in sources if any(character in text for character in '{}<>')]
sources = [text for text in sources if text not in skipped]
characters = sum(len(text) for text in sources)
if characters > args.max_source_characters or args.max_source_characters > 100_000:
    raise SystemExit('The bounded source-character budget was exceeded')
print(f'owner=Claighmor/i18n project={PROJECT} prefix={args.prefix} staging={args.staging} budget=2GiB', flush=True)
print(f'{len(sources)} static messages; {characters} source codepoints; {len(targets)} NMT targets; {len(skipped)} syntax-bearing rows require review', flush=True)
manifest = {'owner': 'Claighmor/i18n', 'project': PROJECT, 'model': 'general/nmt',
            'reviewStatus': 'DRAFT', 'inputs': input_hashes, 'messages': len(sources),
            'sourceCodepoints': characters, 'maxSourceCodepoints': args.max_source_characters,
            'targets': dict(targets), 'skippedSyntax': skipped,
            'note': 'User authorized paid offline drafts. Existing reviewed catalogs remain unchanged. Requested codepoints are not a billing receipt.'}
seal('manifest.json', manifest)
token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
endpoint = f'https://translate.googleapis.com/v3/projects/{PROJECT}/locations/global:translateText'
drafts = {text: {} for text in sources}
for locale, language in targets:
    batches = []
    current = []
    length = 0
    for text in sources:
        if current and (length + len(text) > 20_000 or len(current) >= 128):
            batches.append(current)
            current, length = [], 0
        current.append(text)
        length += len(text)
    if current:
        batches.append(current)
    for index, contents in enumerate(batches):
        storage_check()
        request_body = {'contents': contents, 'sourceLanguageCode': 'en', 'targetLanguageCode': language,
                        'mimeType': 'text/plain', 'model': f'projects/{PROJECT}/locations/global/models/general/nmt',
                        'labels': {'workstream': 'i18n', 'purpose': 'offline-draft'}}
        # Seal the request before sending; a timeout is uncertain and is never retried automatically.
        seal(f'{locale}-{index:03d}-request.json', request_body)
        request = urllib.request.Request(endpoint, data=json.dumps(request_body).encode(), method='POST',
                  headers={'Authorization': 'Bearer ' + token, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json'})
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.load(response)
        except (urllib.error.URLError, TimeoutError) as error:
            seal(f'{locale}-{index:03d}-failure.json', {'status': 'FAILED_OR_UNCERTAIN', 'error': str(error), 'automaticRetry': False})
            raise
        translations = body.get('translations', [])
        if len(translations) != len(contents) or any(not isinstance(row.get('translatedText'), str) for row in translations):
            seal(f'{locale}-{index:03d}-invalid-response.json', body)
            raise RuntimeError('Translation response did not match the sealed input; no automatic retry')
        rows = [{'source': source, 'locale': locale, 'translatedText': translated['translatedText'], 'reviewStatus': 'DRAFT'}
                for source, translated in zip(contents, translations)]
        seal(f'{locale}-{index:03d}-drafts.json', {'elapsedSeconds': time.monotonic() - started, 'rows': rows})
        for row in rows:
            drafts[row['source']][locale] = row['translatedText']
        print(f'{locale}: batch {index + 1}/{len(batches)} verified; {len(rows)} review-only drafts', flush=True)
seal('drafts.json', drafts)
print(f'Completed {len(drafts) * len(targets)} offline drafts. Review before integrating; no application catalog was edited.', flush=True)
