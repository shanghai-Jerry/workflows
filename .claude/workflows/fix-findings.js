export const meta = {
  name: 'fix-findings',
  description: 'Apply fixes for findings from a previous analysis run',
  phases: [
    { title: 'Fix', detail: 'Apply confirmed fixes' },
  ],
};

const FIX_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    finding_id: { type: 'string' },
    status: { type: 'string', enum: ['fixed', 'partial', 'failed', 'skipped'] },
    changes: { type: 'string' },
    test_result: { type: 'string' },
    files_modified: { type: 'array', items: { type: 'string' } },
  },
  required: ['finding_id', 'status'],
};

const fixIds = args?.fix_ids || [];
const findings = args?.findings || [];
const toFix = findings.filter(function(f) { return fixIds.indexOf(f.id) !== -1; });

if (!toFix.length) {
  log('No matching findings to fix. Pass fix_ids and findings from the analysis report.');
  return { fix_results: [] };
}

phase('Fix');
log('Fixing ' + toFix.length + ' findings: ' + toFix.map(function(f) { return f.id; }).join(', '));

const results = await pipeline(
  toFix,
  finding => agent(
    'You are fixing a bug in the trpc-agent-go project.\n\n' +
    '## Finding to Fix\n' +
    '- **ID**: ' + finding.id + '\n' +
    '- **Title**: ' + finding.title + '\n' +
    '- **Location**: ' + (finding.location || 'unknown') + '\n' +
    '- **Description**: ' + finding.description + '\n' +
    '- **Root Cause**: ' + (finding.root_cause || 'see description') + '\n' +
    '- **Fix Suggestion**: ' + finding.fix_suggestion + '\n' +
    (finding.fix_code ? '**Reference Fix Code**:\n```go\n' + finding.fix_code + '\n```\n' : '') +
    '\n## Instructions\n' +
    '1. Read the file(s) at the location specified above\n' +
    '2. Understand the current implementation\n' +
    '3. Apply the fix described in the suggestion\n' +
    '4. If there are related test files, update them too\n' +
    '5. Run `go test ./...` in the relevant module directory to verify\n' +
    '6. The project requires Tencent Apache 2.0 license headers on all .go files\n' +
    '7. Use Go 1.21+ conventions: `any` instead of `interface{}`\n\n' +
    '## Important\n' +
    '- Make minimal, targeted changes — do not refactor surrounding code\n' +
    '- If the fix is complex or risky, report it as "partial" with an explanation\n' +
    '- If tests fail after the fix, report the failure and revert',
    { label: 'fix:' + finding.id, phase: 'Fix', schema: FIX_RESULT_SCHEMA }
  )
);

const fixResults = results.filter(Boolean);
const fixedCount = fixResults.filter(function(r) { return r.status === 'fixed'; }).length;
const failedCount = fixResults.filter(function(r) { return r.status === 'failed'; }).length;
log('Fix complete: ' + fixedCount + ' fixed, ' + failedCount + ' failed');
return { fix_results: fixResults };
