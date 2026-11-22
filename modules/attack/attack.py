#!/usr/bin/env python3
"""Builds modules/attack/attack-data.js from the MITRE ATT&CK Enterprise STIX bundle.

    python3 -I modules/attack/attack.py                 # downloads the latest Enterprise bundle
    python3 -I modules/attack/attack.py --source enterprise-attack-20.0.json   # a bundle carried in by hand
    python3 -I modules/attack/attack.py --version 20.0  # a specific release

The data file sets window.SPELLBOOK_ATTACK = { version, modified, tactics,
techniques } with one entry per technique and sub-technique: id, name,
tactics (shortnames, matrix order), parent, platforms, the first paragraph
of the description, the detection strategies with their analytics and log
sources (ATT&CK 17+; older bundles give the detection text), data sources
and the URL.
Deprecated and revoked techniques are left out. The page merges this into
its ATT&CK list on open whenever the version changes, keeping the notes,
indicators and tags you added.

Source: https://github.com/mitre-attack/attack-stix-data (enterprise-attack).
"""
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # the Spell Book folder
INDEX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/index.json'
BUNDLE_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-{version}.json'

CITATION = re.compile(r'\s*\(Citation:[^)]*\)')
MD_LINK = re.compile(r'\[([^\]]*)\]\([^)]*\)')
HTML_TAG = re.compile(r'<[^>]+>')


def clean(text, limit=700):
    """First paragraph of a markdown description as plain text."""
    text = (text or '').replace('\r\n', '\n').strip()
    if not text:
        return ''
    para = re.split(r'\n\s*\n', text)[0]
    para = CITATION.sub('', para)
    para = MD_LINK.sub(r'\1', para)
    para = HTML_TAG.sub('', para)
    para = para.replace('<code>', '').replace('</code>', '')
    para = re.sub(r'\s+', ' ', para).strip()
    if len(para) > limit:
        cut = para[:limit]
        end = max(cut.rfind('. '), cut.rfind('; '))
        para = (cut[: end + 1] if end > limit // 2 else cut.rstrip()) + ' …'
    return para


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310 (fixed https host)
        return r.read()


def latest_version():
    index = json.loads(fetch(INDEX_URL))
    for collection in index.get('collections', []):
        if collection.get('name', '').startswith('Enterprise'):
            versions = collection.get('versions', [])
            if versions:
                return versions[0]['version']
    raise SystemExit('No Enterprise ATT&CK collection in the index')


def external_id(obj):
    for ref in obj.get('external_references', []):
        if ref.get('source_name') == 'mitre-attack' and ref.get('external_id'):
            return ref['external_id'], ref.get('url', '')
    return '', ''


def build(bundle):
    objects = bundle.get('objects', [])
    version = ''
    modified = ''
    for obj in objects:
        if obj.get('type') == 'x-mitre-collection':
            version = obj.get('x_mitre_version', '')
            modified = obj.get('modified', '')
    # Tactics in matrix order
    tactic_by_ref = {}
    for obj in objects:
        if obj.get('type') == 'x-mitre-tactic' and not obj.get('x_mitre_deprecated'):
            tid, _ = external_id(obj)
            tactic_by_ref[obj['id']] = {
                'id': tid,
                'shortname': obj.get('x_mitre_shortname', ''),
                'name': obj.get('name', ''),
                'description': clean(obj.get('description', ''), 300),
            }
    order = []
    for obj in objects:
        if obj.get('type') == 'x-mitre-matrix' and 'Enterprise' in obj.get('name', ''):
            order = [tactic_by_ref[r] for r in obj.get('tactic_refs', []) if r in tactic_by_ref]
    if not order:
        order = sorted(tactic_by_ref.values(), key=lambda t: t['id'])
    for i, t in enumerate(order):
        t['order'] = i
    shortnames = {t['shortname'] for t in order}

    # ATT&CK 17+ keeps detection in detection strategies (DETxxxx), each a set
    # of analytics (ANxxxx) with a platform, a description and the log sources
    # (data component name and channel) it reads.
    analytics = {}
    for obj in objects:
        if obj.get('type') == 'x-mitre-analytic' and not obj.get('x_mitre_deprecated') and not obj.get('revoked'):
            aid, _ = external_id(obj)
            analytics[obj['id']] = {
                'id': aid,
                'platforms': obj.get('x_mitre_platforms', []) or [],
                'description': clean(obj.get('description', ''), 600),
                'logs': [
                    f"{ref.get('name', '')}" + (f" ({ref['channel']})" if ref.get('channel') else '')
                    for ref in obj.get('x_mitre_log_source_references', []) or []
                ],
            }
    strategies = {}
    for obj in objects:
        if obj.get('type') == 'x-mitre-detection-strategy' and not obj.get('x_mitre_deprecated') and not obj.get('revoked'):
            did, _ = external_id(obj)
            strategies[obj['id']] = {
                'id': did,
                'name': obj.get('name', ''),
                'analytics': [analytics[r] for r in obj.get('x_mitre_analytic_refs', []) if r in analytics],
            }
    detects = {}
    for obj in objects:
        if obj.get('type') == 'relationship' and obj.get('relationship_type') == 'detects' and not obj.get('revoked'):
            if obj.get('source_ref') in strategies:
                detects.setdefault(obj.get('target_ref'), []).append(strategies[obj['source_ref']])

    techniques = []
    for obj in objects:
        if obj.get('type') != 'attack-pattern':
            continue
        if obj.get('revoked') or obj.get('x_mitre_deprecated'):
            continue
        tid, url = external_id(obj)
        if not tid.startswith('T'):
            continue
        phases = [p.get('phase_name') for p in obj.get('kill_chain_phases', []) if p.get('kill_chain_name') == 'mitre-attack']
        phases = [p for p in phases if p in shortnames]
        phases.sort(key=lambda s: next((t['order'] for t in order if t['shortname'] == s), 99))
        sub = bool(obj.get('x_mitre_is_subtechnique'))
        detections = sorted(detects.get(obj['id'], []), key=lambda d: d['id'])
        data_sources = {d.split(':')[0].strip() for d in (obj.get('x_mitre_data_sources') or [])}
        for strategy in detections:
            for analytic in strategy['analytics']:
                for log in analytic['logs']:
                    data_sources.add(log.split(' (')[0])
        techniques.append({
            'id': tid,
            'name': obj.get('name', ''),
            'tactics': phases,
            'sub': sub,
            'parent': tid.split('.')[0] if sub else '',
            'platforms': obj.get('x_mitre_platforms', []) or [],
            'description': clean(obj.get('description', '')),
            'detection': clean(obj.get('x_mitre_detection', '')),
            'dataSources': sorted(d for d in data_sources if d),
            'detections': detections,
            'url': url,
            'modified': obj.get('modified', '')[:10],
        })
    techniques.sort(key=lambda t: (t['id'].split('.')[0], t['id']))
    return {
        'source': 'MITRE ATT&CK Enterprise',
        'version': version,
        'modified': modified,
        'built': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'tactics': order,
        'techniques': techniques,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source', help='a downloaded enterprise-attack STIX bundle (.json)')
    ap.add_argument('--version', help='Enterprise ATT&CK release to download, e.g. 20.0 (default: latest)')
    ap.add_argument('--out', default=str(Path(__file__).resolve().parent / 'attack-data.js'))
    args = ap.parse_args()
    if args.source:
        bundle = json.loads(Path(args.source).read_text(encoding='utf-8'))
    else:
        version = args.version or latest_version()
        print(f'downloading Enterprise ATT&CK {version} …', file=sys.stderr)
        bundle = json.loads(fetch(BUNDLE_URL.format(version=version)))
    data = build(bundle)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    out.write_text(
        '// MITRE ATT&CK Enterprise, reduced for Spell Book (modules/attack/attack.py). '
        f'Version {data["version"]}, {data["modified"][:10]}.\n'
        'window.SPELLBOOK_ATTACK = ' + body + ';\n',
        encoding='utf-8',
    )
    subs = sum(1 for t in data['techniques'] if t['sub'])
    print(f'{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}: ATT&CK {data["version"]}, '
          f'{len(data["tactics"])} tactics, {len(data["techniques"]) - subs} techniques, {subs} sub-techniques, '
          f'{out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
