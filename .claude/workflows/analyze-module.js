export const meta = {
  name: 'analyze-module',
  description: 'Deep-dive into a Go module, learn its architecture, find bugs',
  whenToUse: 'User wants a deep code analysis of a specific Go module or directory. Trigger when they mention: analyzing a module, finding bugs in code, code review of a package, deep dive into a directory, auditing code quality of a module.',
  examples: [
    '分析一下 agent 模块的代码质量',
    '帮我找找 agent 目录下有没有 bug',
    '深入分析这个 Go 包的架构',
    'analyze the agent module for bugs',
    'deep dive into the codebase and find issues',
    'audit the code quality of ./pkg/handler',
  ],
  phases: [
    { title: 'Gather', detail: 'Explore module structure and interfaces' },
    { title: 'Analyze', detail: 'Deep analysis of each file' },
    { title: 'Report', detail: 'Summarize findings' },
  ],
};

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
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
      },
    },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
};

const modulePath = args?.path;
if (!modulePath) {
  log('Error: path is required. Usage: /workflow analyze-module \'{"path":"./agent"}\'');
  return { findings: [], summary: 'Missing path argument.' };
}

phase('Gather');
log('Exploring module: ' + modulePath);

const exploration = await agent(
  'Explore the Go module at "' + modulePath + '" in the trpc-agent-go project.\n\n' +
  '## Tasks\n' +
  '1. List all .go files in the directory (non-test first, then test files)\n' +
  '2. Read the main entry files to understand the package\'s purpose\n' +
  '3. Identify core types, interfaces, and exported functions\n' +
  '4. Map the dependency relationships between files\n' +
  '5. Note the overall architecture pattern\n\n' +
  '## Output\n' +
  'Provide a structured overview:\n' +
  '- Package purpose (1-2 sentences)\n' +
  '- Key files and their roles\n' +
  '- Core interfaces/types\n' +
  '- Architecture pattern\n' +
  '- List of all .go files with brief descriptions\n\n' +
  'Be thorough — this overview will guide the deep analysis phase.',
  { label: 'explore:' + modulePath, phase: 'Gather' }
);

phase('Analyze');
log('Analyzing each file for potential bugs and improvements...');

const fileAnalysis = await agent(
  'Based on this module exploration:\n\n' +
  exploration + '\n\n' +
  'Now do a deep analysis of the module at "' + modulePath + '" for potential bugs and improvements.\n\n' +
  '## Analysis Checklist\n' +
  'For each .go file (skip test files for now):\n' +
  '1. **Error handling**: Are errors properly checked and propagated? Any swallowed errors?\n' +
  '2. **Resource leaks**: Are connections, files, goroutines properly closed/cleaned up?\n' +
  '3. **Concurrency**: Any race conditions, missing locks, goroutine leaks?\n' +
  '4. **Nil pointer risks**: Any potential nil dereference without checks?\n' +
  '5. **Logic errors**: Off-by-one, wrong comparisons, missing edge cases?\n' +
  '6. **API misuse**: Incorrect use of standard library or dependencies?\n' +
  '7. **Type safety**: Any unsafe type assertions without ok check?\n' +
  '8. **Test coverage**: Are there test files? Any obvious untested edge cases?\n\n' +
  '## For Each Finding\n' +
  'Provide:\n' +
  '- Exact file path and line number\n' +
  '- Severity assessment\n' +
  '- Root cause explanation\n' +
  '- Specific fix suggestion with code\n\n' +
  'Focus on REAL bugs, not style issues. Prefer fewer, high-confidence findings over many low-confidence ones.\n\n' +
  'Return all findings as a structured array.',
  { label: 'analyze:' + modulePath, phase: 'Analyze', schema: REPORT_SCHEMA }
);

phase('Report');
const findings = fileAnalysis?.findings || [];
const summary = fileAnalysis?.summary || 'Analyzed module ' + modulePath + '. Found ' + findings.length + ' findings.';
log(summary);
return { path: modulePath, findings: findings, summary: summary };
