export const meta = {
  name: 'pr-review',
  description: 'Read PR review comments (inline + PR-level) and suggest fixes',
  phases: [
    { title: 'Gather', detail: 'Fetch PR comments from GitHub' },
    { title: 'Analyze', detail: 'Analyze each comment and suggest fixes' },
    { title: 'Report', detail: 'Summarize actionable items' },
  ],
};

const FIX_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    comment_id: { type: 'string' },
    comment_type: { type: 'string', enum: ['inline', 'pr-level'] },
    author: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'string' },
    original_comment: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    category: { type: 'string', enum: ['bug', 'style', 'improvement', 'question', 'nit', 'architecture'] },
    is_actionable: { type: 'boolean' },
    root_cause: { type: 'string' },
    fix_suggestion: { type: 'string' },
    fix_code: { type: 'string' },
    effort: { type: 'string', enum: ['small', 'medium', 'large'] },
    response_draft: { type: 'string' },
  },
  required: ['comment_id', 'comment_type', 'author', 'original_comment', 'is_actionable', 'fix_suggestion'],
};

// --- helper: fetch a paginated gh api endpoint, return all items ---
async function fetchAll(url) {
  var allItems = [];
  var page = 1;
  while (true) {
    var raw = await bash('gh api "' + url + '?per_page=100&page=' + page + '" 2>/dev/null || echo "[]"');
    var items;
    try { items = JSON.parse(raw); } catch (e) { break; }
    if (!Array.isArray(items) || items.length === 0) break;
    allItems = allItems.concat(items);
    if (items.length < 100) break;
    page++;
  }
  return allItems;
}

// --- args ---
var prNumber = args?.pr;
var repoArg = args?.repo;   // owner/repo — defaults to current repo

if (!prNumber) {
  log('Error: pr is required. Usage: /workflow pr-review \'{"pr":123}\'');
  return { suggestions: [], summary: 'Missing pr argument.' };
}

// resolve repo
var repo = repoArg;
if (!repo) {
  repo = (await bash('gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null')).trim();
}
if (!repo) {
  log('Error: cannot determine repo. Pass repo explicitly.');
  return { suggestions: [], summary: 'Cannot determine repo.' };
}

var prBase = '/repos/' + repo + '/pulls/' + prNumber;

// ==================== Gather ====================
phase('Gather');
log('Fetching PR #' + prNumber + ' from ' + repo + '...');

// fetch PR metadata, inline review comments, and PR-level comments in parallel
var prMetaRaw, inlineComments, prComments, reviews;
[prMetaRaw, inlineComments, prComments, reviews] = await parallel([
  function() { return bash('gh pr view ' + prNumber + ' --repo ' + repo + ' --json title,body,author,state,headRefName,baseRefName,url,additions,deletions,changedFiles 2>/dev/null || echo "{}"'); },
  function() { return fetchAll(prBase + '/comments'); },
  function() { return fetchAll(prBase + '/issues/comments'); },
  function() { return fetchAll(prBase + '/reviews'); },
]);

var prMeta;
try { prMeta = JSON.parse(prMetaRaw); } catch (e) { prMeta = {}; }

log('PR: ' + (prMeta.title || '#' + prNumber));
log('Inline comments: ' + inlineComments.length + ', PR-level comments: ' + prComments.length + ', Reviews: ' + reviews.length);

if (inlineComments.length === 0 && prComments.length === 0 && reviews.length === 0) {
  log('No comments found on this PR.');
  return { suggestions: [], summary: 'No review comments found on PR #' + prNumber + '.' };
}

// collect review body text that isn't already an inline comment
var reviewBodies = reviews
  .filter(function(r) { return r.body && r.body.trim().length > 0; })
  .map(function(r) {
    return {
      id: 'review-' + r.id,
      type: 'pr-level',
      author: (r.user && r.user.login) || 'unknown',
      file: '',
      line: '',
      body: r.body,
    };
  });

// format inline comments
var inlineItems = inlineComments.map(function(c) {
  return {
    id: 'inline-' + c.id,
    type: 'inline',
    author: (c.user && c.user.login) || 'unknown',
    file: c.path || '',
    line: String(c.line || c.original_line || ''),
    body: c.body || '',
    diff_hunk: c.diff_hunk || '',
    side: c.side || '',
  };
});

// format PR-level (issue) comments
var prLevelItems = prComments.map(function(c) {
  return {
    id: 'issue-' + c.id,
    type: 'pr-level',
    author: (c.user && c.user.login) || 'unknown',
    file: '',
    line: '',
    body: c.body || '',
  };
});

var allComments = inlineItems.concat(prLevelItems).concat(reviewBodies);
log('Total comments to analyze: ' + allComments.length);

// ==================== Analyze ====================
phase('Analyze');
log('Analyzing each comment for actionable fix suggestions...');

var results = await pipeline(
  allComments,
  function(comment) {
    var context = '';
    if (comment.type === 'inline' && comment.diff_hunk) {
      context = '\n\n## Diff Hunk (code context)\n```diff\n' + comment.diff_hunk + '\n```';
    }

    var prompt =
      'You are analyzing a review comment on a GitHub Pull Request.\n\n' +
      '## PR Info\n' +
      '- **Title**: ' + (prMeta.title || 'N/A') + '\n' +
      '- **Branch**: ' + (prMeta.headRefName || 'N/A') + ' → ' + (prMeta.baseRefName || 'N/A') + '\n\n' +
      '## Comment Details\n' +
      '- **Type**: ' + comment.type + '\n' +
      '- **Author**: ' + comment.author + '\n' +
      (comment.file ? '- **File**: ' + comment.file + '\n' : '') +
      (comment.line ? '- **Line**: ' + comment.line + '\n' : '') +
      '\n## Comment Body\n' + comment.body +
      context + '\n\n' +
      '## Your Task\n' +
      '1. Read the comment carefully\n' +
      '2. If it references a file, read the relevant source code using Read/Grep tools\n' +
      '3. Determine if the comment is actionable (requires code change) or just informational\n' +
      '4. If actionable, provide a specific fix with code\n' +
      '5. If the comment is a question, draft a helpful response\n\n' +
      '## Output Rules\n' +
      '- Set is_actionable=true only if a code change is needed\n' +
      '- Set is_actionable=false for questions, compliments, or already-resolved items\n' +
      '- For actionable items: provide fix_suggestion (what to do) and fix_code (the actual code)\n' +
      '- For questions: provide response_draft as a suggested reply\n' +
      '- Assess severity: critical = blocks merge, high = should fix, medium = nice to fix, low/nit = optional\n' +
      '- Include the original comment verbatim in original_comment';

    return agent(prompt, {
      label: comment.type + ':' + comment.id,
      phase: 'Analyze',
      schema: FIX_SUGGESTION_SCHEMA,
    });
  }
);

// ==================== Report ====================
phase('Report');
var suggestions = results.filter(Boolean);
var actionable = suggestions.filter(function(s) { return s.is_actionable; });
var questions = suggestions.filter(function(s) { return !s.is_actionable && s.category === 'question'; });
var critical = actionable.filter(function(s) { return s.severity === 'critical'; });
var high = actionable.filter(function(s) { return s.severity === 'high'; });

var summary =
  'Analyzed ' + allComments.length + ' comments on PR #' + prNumber + '.\n' +
  '- Actionable: ' + actionable.length + ' (critical: ' + critical.length + ', high: ' + high.length + ')\n' +
  '- Questions needing reply: ' + questions.length + '\n' +
  '- Non-actionable: ' + (suggestions.length - actionable.length - questions.length);

log(summary);
return {
  pr: '#' + prNumber,
  repo: repo,
  total_comments: allComments.length,
  suggestions: suggestions,
  summary: summary,
};
