export const meta = {
  name: 'analyze-issues',
  description: 'Scan open GitHub issues, find fixable ones, suggest fixes',
  whenToUse: 'User wants to scan or triage GitHub issues. Trigger when they mention: checking open issues, finding fixable issues, analyzing GitHub issues, triaging issues, looking at issue backlog.',
  examples: [
    '看看仓库有哪些 open issues 可以修',
    '帮我分析一下 GitHub issues',
    '扫描一下 issues 找找能修的 bug',
    'check open issues and find fixable ones',
    'triage the GitHub issues',
    'analyze issues in the repo',
  ],
  phases: [
    { title: 'Gather', detail: 'Fetch open issues from GitHub' },
    { title: 'Analyze', detail: 'Deep analysis of each issue' },
    { title: 'Report', detail: 'Summarize findings' },
  ],
};

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    category: { type: 'string', enum: ['bug', 'improvement', 'refactor', 'test'] },
    location: { type: 'string' },
    description: { type: 'string' },
    root_cause: { type: 'string' },
    fix_suggestion: { type: 'string' },
    fix_code: { type: 'string' },
    effort: { type: 'string', enum: ['small', 'medium', 'large'] },
  },
  required: ['id', 'title', 'severity', 'category', 'description', 'fix_suggestion'],
};

const repo = args?.repo || 'trpc-group/trpc-agent-go';

phase('Gather');
log('Fetching open issues from GitHub...');

const issuesData = await agent(
  'Use the Bash tool to run: gh issue list --repo ' + repo + ' --state open --limit 50 --json number,title,labels,body,createdAt,url\n\n' +
  'Parse the JSON output and return it as-is. If the command fails (e.g., gh not authenticated), return an empty array and explain the error.',
  { label: 'fetch-issues', phase: 'Gather' }
);

let issues;
try {
  issues = JSON.parse(issuesData);
} catch (e) {
  log('Failed to parse issues data. Make sure gh CLI is installed and authenticated.');
  return { findings: [], summary: 'Failed to fetch issues: ' + String(issuesData).substring(0, 500) };
}

if (!issues || issues.length === 0) {
  log('No open issues found.');
  return { findings: [], summary: 'No open issues found.' };
}

log('Found ' + issues.length + ' open issues. Analyzing each...');

phase('Analyze');
const analysisResults = await pipeline(
  issues,
  issue => agent(
    'You are analyzing a GitHub issue in the trpc-agent-go project to determine if it describes a fixable bug or improvement.\n\n' +
    '## Issue Info\n' +
    '- **Number**: #' + issue.number + '\n' +
    '- **Title**: ' + issue.title + '\n' +
    '- **Labels**: ' + (issue.labels || []).map(function(l) { return l.name || l; }).join(', ') + '\n' +
    '- **URL**: ' + issue.url + '\n' +
    '- **Created**: ' + issue.createdAt + '\n\n' +
    '## Issue Body\n' +
    String(issue.body || '(empty)').substring(0, 3000) + '\n\n' +
    '## Your Task\n' +
    '1. Read the issue body carefully\n' +
    '2. Search the codebase for relevant code using Grep/Glob tools\n' +
    '3. Read the relevant source files to understand the current implementation\n' +
    '4. Determine if this is a real, fixable issue\n' +
    '5. If fixable, describe the root cause and suggest a specific fix\n\n' +
    '## Output Rules\n' +
    '- If the issue is NOT fixable (e.g., feature request, question, already fixed, needs design discussion), set category to "improvement" and severity to "low"\n' +
    '- If the issue IS fixable, provide specific file locations and code-level fix suggestions\n' +
    '- Be precise about file paths and line numbers\n' +
    '- Include reference fix code if you can determine the correct fix\n\n' +
    'Return your analysis as a structured finding.',
    { label: 'issue-' + issue.number + ': ' + issue.title.substring(0, 40), phase: 'Analyze', schema: FINDING_SCHEMA }
  )
);

phase('Report');
const findings = analysisResults.filter(Boolean);
const highCount = findings.filter(function(f) { return f.severity === 'critical' || f.severity === 'high'; }).length;
const medCount = findings.filter(function(f) { return f.severity === 'medium'; }).length;
const lowCount = findings.filter(function(f) { return f.severity === 'low'; }).length;
const summary = 'Analyzed ' + issues.length + ' open issues. Found ' + findings.length + ' actionable items: ' + highCount + ' high/critical, ' + medCount + ' medium, ' + lowCount + ' low.';
log(summary);
return { findings: findings, summary: summary };
