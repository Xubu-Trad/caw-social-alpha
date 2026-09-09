"""Offline Python reconstruction and four malformed-history checks per dataset.

Reads retained JSON only. Creates a new output directory; never replaces source
evidence. No node, wallet, network request or JavaScript subprocess is started.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or not args.output.parent.is_dir():
        raise RuntimeError('NEW_OUTPUT_DIRECTORY_REQUIRED')
    args.output.mkdir()
    reader_path = HERE / '../../reference/paid_action_reader.py'
    reader = runpy.run_path(str(reader_path))
    manifest = json.loads((HERE / 'manifest.json').read_bytes())
    started = time.monotonic()
    checks, outputs = [], []
    def write(name, value):
        (args.output / name).write_text(json.dumps(value, sort_keys=True, ensure_ascii=True, indent=2) + '\n', encoding='utf-8', newline='\n')
    for name in ('number', 'hash'):
        history = json.loads((HERE / ('history-' + name + '.json')).read_bytes())
        result = reader['reconstruct'](history, manifest)
        outputs.append(result)
        write('reconstruction-python-' + name + '.json', result)
        checks.append({'dataset': name, 'case': 'complete_history', 'result': 'pass', 'messages': len(result['messages'])})
        for label in ('omitted_block', 'missing_post_log', 'duplicate_transaction', 'conflicting_endpoint'):
            h, m = copy.deepcopy(history), copy.deepcopy(manifest)
            if label == 'omitted_block':
                del h['blocks'][5]
            elif label == 'missing_post_log':
                posts = [t for b in h['blocks'] for t in b['transactions'] if t['transaction']['data'].startswith('0x62f509b3') and t['receipt']['status'] == '0x1']
                posts[0]['receipt']['logs'].pop()
            elif label == 'duplicate_transaction':
                h['blocks'][0]['transactions'].append(copy.deepcopy(h['blocks'][0]['transactions'][0]))
            else:
                m['end_block_hash'] = '0x' + '11' * 32
            try:
                reader['reconstruct'](h, m)
            except reader['HistoryError'] as error:
                checks.append({'dataset': name, 'case': label, 'result': 'rejected', 'reason': str(error)})
            else:
                raise RuntimeError('READER_ACCEPTED_' + label)
    if outputs[0] != outputs[1]:
        raise RuntimeError('RECONSTRUCTION_DISAGREEMENT')
    receipt = {'schema': 'caw-paid-python-reconstruction/1', 'python': sys.version.split()[0],
        'reader_sha256': hashlib.sha256(reader_path.read_bytes()).hexdigest(),
        'checker_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'network_requests': 0, 'seconds': round(time.monotonic() - started, 3), 'checks': checks}
    write('reconstruction-checks.json', receipt)
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
