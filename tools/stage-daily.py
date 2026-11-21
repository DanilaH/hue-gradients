"""Review the authored daily bank and stage a verified, dated catalog offline."""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'docs/spec/tools'))
from validate_release_candidates import inspect as inspect_field

BANK = ROOT / 'docs/spec/candidates/levels-0.1.json'
CONTENT_VERSION = 'gradient-daily-1'
RULES_VERSION = 'gradient-rules-1'
LEVEL_FIELDS = ('id', 'ordinal', 'title', 'width', 'height', 'solvedTileColors',
                'pinnedPositions', 'startTileAtPosition', 'minimumSwaps')


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        raise ValueError(f'Invalid UTC day: {value!r}')
    return date.fromisoformat(value).isoformat()


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def review_bank():
    raw = BANK.read_bytes()
    levels, review, fingerprints = {}, [], set()
    for candidate in json.loads(raw)['daily']:
        result = inspect_field(candidate)
        candidate_id = candidate['id']
        if result['errors'] or result['minimumSwaps'] != candidate['minimumSwaps']:
            raise ValueError(f'Invalid daily candidate {candidate_id}: {result}')
        if candidate_id in levels or result['fingerprint'] in fingerprints:
            raise ValueError(f'Duplicate daily candidate {candidate_id}')
        levels[candidate_id] = {key: candidate[key] for key in LEVEL_FIELDS} | {'contentVersion': CONTENT_VERSION}
        fingerprints.add(result['fingerprint'])
        review.append({'candidateId': candidate_id, 'fingerprint': result['fingerprint'],
                       'minimumSwaps': result['minimumSwaps'], 'warnings': result['warnings']})
    return levels, {'bankSha256': sha256(raw), 'rulesVersion': RULES_VERSION, 'candidates': review}


def prepare(levels, review, plan, through):
    if plan['bankSha256'] != review['bankSha256'] or plan['rulesVersion'] != RULES_VERSION:
        raise ValueError('Review plan belongs to a different bank or rules version')
    if not isinstance(plan['slots'], list) or not plan['slots']:
        raise ValueError('The plan has no reviewed slots')
    fingerprints = {row['candidateId']: row['fingerprint'] for row in review['candidates']}
    slots, blobs, used_ids = {}, {}, set()
    for row in plan['slots']:
        slot, candidate = day(row['date']), row['candidateId']
        if candidate not in fingerprints or row['fingerprint'] != fingerprints[candidate]:
            raise ValueError(f'Review fingerprint mismatch for {candidate!r} on {slot}')
        if slot in slots or candidate in used_ids:
            raise ValueError(f'Duplicate day or candidate: {slot}, {candidate}')
        used_ids.add(candidate)
        raw = json_bytes(levels[candidate])
        digest = sha256(raw)
        entry = {'date': slot, 'candidateId': candidate, 'fingerprint': row['fingerprint'], 'sha256': digest}
        if 'feature' in row:
            feature = row['feature']
            if not isinstance(feature, dict) or set(feature) != {'id', 'title'} or not all(
                isinstance(value, str) and value.strip() for value in feature.values()
            ):
                raise ValueError(f'Invalid event metadata: {slot}')
            entry['feature'] = {key: value.strip() for key, value in feature.items()}
        slots[slot] = entry
        if slot <= through:
            blobs[digest] = raw
    published = {key: value for key, value in sorted(slots.items()) if key <= through}
    return published, blobs, len(slots) - len(published)


def load_staged(directory):
    catalog = json.loads((directory / 'catalog.json').read_bytes())
    if catalog['schema'] != 1 or catalog['rulesVersion'] != RULES_VERSION:
        raise ValueError('Unexpected prior catalog schema or rules version')
    through = day(catalog['through'])
    slots = {}
    for month, digest in catalog['months'].items():
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}', month):
            raise ValueError(f'Invalid catalog month: {month}')
        raw = (directory / 'months' / f'{month}.json').read_bytes()
        if sha256(raw) != digest:
            raise ValueError(f'Month manifest hash mismatch: {month}')
        for entry in json.loads(raw):
            slot, blob = day(entry['date']), entry['sha256']
            if slot[:7] != month or slot > through or slot in slots or not re.fullmatch('[0-9a-f]{64}', blob):
                raise ValueError(f'Invalid prior catalog slot: {slot}')
            raw_level = (directory / 'levels' / f'{blob}.json').read_bytes()
            if sha256(raw_level) != blob:
                raise ValueError(f'Level hash mismatch: {slot}')
            if json.loads(raw_level)['id'] != entry['candidateId']:
                raise ValueError(f'Level identity mismatch: {slot}')
            slots[slot] = entry
    return through, slots


def stage(output, through, published, blobs, previous=None):
    if previous is not None:
        prior_day, prior = load_staged(previous)
        if through < prior_day:
            raise ValueError('Catalog cutoff cannot go backwards')
        for slot, entry in prior.items():
            if published.get(slot) != entry:
                raise ValueError(f'Published slot would change or disappear: {slot}')
    if output.exists():
        raise ValueError(f'Choose a new staging directory: {output}')

    months = {}
    for slot, entry in published.items():
        months.setdefault(slot[:7], []).append(entry)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.daily-stage-', dir=output.parent) as temporary:
        snapshot = Path(temporary)
        (snapshot / 'levels').mkdir()
        (snapshot / 'months').mkdir()
        for digest, raw in blobs.items():
            (snapshot / 'levels' / f'{digest}.json').write_bytes(raw)
        month_hashes = {}
        for month, entries in months.items():
            raw = json_bytes(entries)
            month_hashes[month] = sha256(raw)
            (snapshot / 'months' / f'{month}.json').write_bytes(raw)
        (snapshot / 'catalog.json').write_bytes(json_bytes({'schema': 1, 'rulesVersion': RULES_VERSION,
                                                           'through': through, 'months': month_hashes}))
        if load_staged(snapshot) != (through, published):
            raise ValueError('Staged catalog verification failed')
        snapshot.rename(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('review', help='List undated candidates and their review fingerprints')
    publish = commands.add_parser('stage', help='Prepare a local snapshot from explicitly reviewed slots')
    publish.add_argument('--plan', type=Path, required=True)
    publish.add_argument('--through', required=True, help='Explicit inclusive UTC cutoff (YYYY-MM-DD)')
    publish.add_argument('--out', type=Path, required=True)
    publish.add_argument('--previous', type=Path, help='Previous catalog snapshot when issuing an update')
    args = parser.parse_args()

    levels, review = review_bank()
    if args.command == 'review':
        print(json.dumps(review, ensure_ascii=False, indent=2))
        return
    through = day(args.through)
    published, blobs, reserve = prepare(levels, review, json.loads(args.plan.read_bytes()), through)
    stage(args.out, through, published, blobs, args.previous)
    print(json.dumps({'through': through, 'stagedSlots': len(published), 'unstagedReserve': reserve}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        sys.exit(f'Daily staging failed: {error}')
