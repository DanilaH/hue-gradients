import copy
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


TOOL = Path(__file__).resolve().parents[1] / 'tools/stage-daily.py'


class DailyStagingTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        report = json.loads(self.run_tool('review').stdout)
        start = date(2026, 1, 30)
        self.plan = {
            'bankSha256': report['bankSha256'], 'rulesVersion': report['rulesVersion'],
            'slots': [{'date': str(start + timedelta(days=index)), 'candidateId': row['candidateId'],
                       'fingerprint': row['fingerprint']} for index, row in enumerate(report['candidates'])],
        }

    def run_tool(self, *args, check=True):
        return subprocess.run([sys.executable, str(TOOL), *map(str, args)],
                              text=True, capture_output=True, check=check)

    def stage(self, name, through, plan=None, previous=None, check=True):
        input_path = self.root / 'reviewed-plan.json'
        input_path.write_text(json.dumps(self.plan if plan is None else plan), encoding='utf-8')
        arguments = ['stage', '--plan', input_path, '--through', through, '--out', self.root / name]
        if previous:
            arguments.extend(['--previous', self.root / previous])
        return self.run_tool(*arguments, check=check)

    def snapshot(self, name):
        return {path.relative_to(self.root / name): path.read_bytes()
                for path in (self.root / name).rglob('*.json')}

    def test_authored_bank_month_turn_and_deterministic_bytes(self):
        self.assertEqual(len(self.plan['slots']), 30)
        january = self.stage('day-two', '2026-01-31')
        self.assertEqual(json.loads(january.stdout)['unstagedReserve'], 28)
        first = self.snapshot('day-two')
        self.assertEqual(sum(path.parts[0] == 'levels' for path in first), 2)
        self.assertNotIn(b'2026-02-01', b''.join(first.values()))

        self.stage('day-three', '2026-02-01', previous='day-two')
        second = self.snapshot('day-three')
        for path in first.keys() - {Path('catalog.json')}:
            self.assertEqual(first[path], second[path])
        self.stage('day-three-again', '2026-02-01', previous='day-two')
        self.assertEqual(second, self.snapshot('day-three-again'))

    def test_published_date_cannot_change_disappear_or_roll_back(self):
        self.stage('original', '2026-02-01')
        before = self.snapshot('original')
        changed = copy.deepcopy(self.plan)
        changed['slots'][0]['date'], changed['slots'][1]['date'] = changed['slots'][1]['date'], changed['slots'][0]['date']
        missing = copy.deepcopy(self.plan)
        del missing['slots'][0]
        cases = [(changed, '2026-02-02', 'Published slot would change'),
                 (missing, '2026-02-02', 'Published slot would change'),
                 (self.plan, '2026-01-31', 'cannot go backwards')]
        for plan, through, error in cases:
            with self.subTest(error=error, through=through):
                result = self.stage('rejected', through, plan, previous='original', check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(error, result.stderr)
                self.assertFalse((self.root / 'rejected').exists())
                self.assertEqual(before, self.snapshot('original'))

    def test_corrupt_bytes_and_unreviewed_fingerprint_rejected(self):
        self.stage('original', '2026-01-30')
        blob = next((self.root / 'original/levels').glob('*.json'))
        blob.write_bytes(blob.read_bytes() + b' ')
        bad_previous = self.stage('rejected', '2026-01-31', previous='original', check=False)
        self.assertNotEqual(bad_previous.returncode, 0)
        self.assertIn('Level hash mismatch', bad_previous.stderr)

        changed = copy.deepcopy(self.plan)
        changed['slots'][-1]['fingerprint'] = '0' * 64
        bad_future = self.stage('rejected', '2026-01-31', changed, check=False)
        self.assertNotEqual(bad_future.returncode, 0)
        self.assertIn('Review fingerprint mismatch', bad_future.stderr)
        self.assertFalse((self.root / 'rejected').exists())

    def test_event_appears_with_its_date_and_remains_immutable(self):
        self.plan['slots'][2]['feature'] = {'id': 'warm-day', 'title': 'Мягкий свет'}
        self.stage('before-event', '2026-01-31')
        self.assertNotIn(b'warm-day', b''.join(self.snapshot('before-event').values()))
        self.stage('event', '2026-02-01', previous='before-event')
        entries = json.loads((self.root / 'event/months/2026-02.json').read_bytes())
        self.assertEqual(entries[0]['feature'], self.plan['slots'][2]['feature'])

        self.plan['slots'][2]['feature']['title'] = 'Другая тема'
        rejected = self.stage('changed', '2026-02-02', previous='event', check=False)
        self.assertIn('Published slot would change', rejected.stderr)
        self.plan['slots'][2]['feature']['id'] = ' '
        invalid = self.stage('invalid', '2026-01-31', check=False)
        self.assertIn('Invalid event metadata', invalid.stderr)
        self.assertFalse((self.root / 'invalid').exists())


if __name__ == '__main__':
    unittest.main()
