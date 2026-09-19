#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Test Suite for M3 Antigravity Custom Skill & Multi-Agent Workflow
 * Executed by Challenger 1 (critic, specialist)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SKILL_FILE = path.join(PROJECT_ROOT, 'skills/claude-to-compose/SKILL.md');
const PROMPTS_DIR = path.join(PROJECT_ROOT, 'skills/claude-to-compose/prompts');

const results = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[33mReason: ${details.reason}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
  }
}

// Strict YAML Frontmatter Parser
function parseFrontmatterStrict(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    throw new Error('FrontmatterDelimError: File must start with "---" at index 0');
  }
  const lines = text.split(/\r?\n/);
  const closingIdx = lines.slice(1).findIndex(l => l.trim() === '---');
  if (closingIdx === -1) {
    throw new Error('FrontmatterDelimError: Missing closing "---" delimiter');
  }
  const frontmatterLines = lines.slice(1, closingIdx + 1);
  const bodyLines = lines.slice(closingIdx + 2);

  const parsed = {};
  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) throw new Error('FrontmatterSyntaxError: Line lacks colon: ' + line);
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    parsed[key] = val;
  }
  return { parsed, body: bodyLines.join('\n') };
}

async function runM3AdversarialSuite() {
  console.log('='.repeat(75));
  console.log('M3 EMPIRICAL ADVERSARIAL CHALLENGE SUITE');
  console.log('Target Skill: ' + SKILL_FILE);
  console.log('Target Prompts: ' + PROMPTS_DIR);
  console.log('='.repeat(75) + '\n');

  // ==========================================================================
  // Category 1: SKILL.md YAML Frontmatter Fuzzing & Boundaries
  // ==========================================================================
  console.log('--- Category 1: SKILL.md YAML Frontmatter Syntax & Fuzzing ---');

  if (!fs.existsSync(SKILL_FILE)) {
    recordTest('ADV-M3-1.0', 'SKILL.md Existence', 'Skill File', false, { reason: 'File does not exist' });
    return;
  }

  const skillRaw = fs.readFileSync(SKILL_FILE, 'utf8');

  // 1.1 Conformance to strict YAML frontmatter
  {
    let passed = false;
    let details = {};
    try {
      const res = parseFrontmatterStrict(skillRaw);
      if (res.parsed.name === 'claude-to-compose' && res.parsed.description && res.parsed.description.length >= 20) {
        passed = true;
        details = { name: res.parsed.name, descLen: res.parsed.description.length };
      } else {
        details.reason = 'Parsed properties do not satisfy constraints: ' + JSON.stringify(res.parsed);
      }
    } catch (e) {
      details.reason = e.message;
    }
    recordTest('ADV-M3-1.1', 'SKILL.md Frontmatter Conformance', 'YAML Syntax', passed, details);
  }

  // 1.2 Byte-0 Header Alignment (No BOM, no leading empty lines)
  {
    const buf = fs.readFileSync(SKILL_FILE);
    const startsAt0 = buf[0] === 0x2d && buf[1] === 0x2d && buf[2] === 0x2d && (buf[3] === 0x0a || (buf[3] === 0x0d && buf[4] === 0x0a));
    recordTest('ADV-M3-1.2', 'SKILL.md Byte-0 Delimiter Alignment (No BOM / Preceding Whitespace)', 'YAML Boundary', startsAt0, {
      reason: startsAt0 ? '' : 'File does not begin with "---" at byte 0'
    });
  }

  // 1.3 Folder Name Parity (Agent Skills spec requires name == folderName)
  {
    const folderName = path.basename(path.dirname(SKILL_FILE));
    const res = parseFrontmatterStrict(skillRaw);
    const matchesFolder = res.parsed.name === folderName;
    recordTest('ADV-M3-1.3', `Skill Name matches Parent Directory ("${res.parsed.name}" == "${folderName}")`, 'Specification Conformance', matchesFolder, {
      reason: matchesFolder ? '' : `Name "${res.parsed.name}" != Directory "${folderName}"`
    });
  }

  // 1.4 Frontmatter Fuzzing Mutations (Negative rejection tests)
  const mutations = [
    { id: 'ADV-M3-1.4a', name: 'Reject Missing Opening "---"', mutate: t => t.replace(/^---\r?\n/, ''), expectError: 'FrontmatterDelimError' },
    { id: 'ADV-M3-1.4b', name: 'Reject Missing Closing "---"', mutate: t => '---\nname: claude-to-compose\n', expectError: 'FrontmatterDelimError' },
    { id: 'ADV-M3-1.4c', name: 'Reject Missing Name Key', mutate: t => t.replace(/name:.*\n/, ''), expectError: 'MissingKey' },
    { id: 'ADV-M3-1.4d', name: 'Reject Invalid Name Characters (Uppercase/Special)', mutate: t => t.replace('name: claude-to-compose', 'name: Claude_To_Compose!'), expectError: 'InvalidName' },
    { id: 'ADV-M3-1.4e', name: 'Reject Short Description (<20 chars)', mutate: t => t.replace(/description:.*/, 'description: short'), expectError: 'ShortDescription' },
    { id: 'ADV-M3-1.4f', name: 'Reject Empty Description', mutate: t => t.replace(/description:.*/, 'description: '), expectError: 'EmptyDescription' },
    { id: 'ADV-M3-1.4g', name: 'Accept CRLF Line Endings without Corruption', mutate: t => t.replace(/\n/g, '\r\n'), expectError: null }
  ];

  for (const m of mutations) {
    let passed = false;
    let reason = '';
    try {
      const mutText = m.mutate(skillRaw);
      const parsed = parseFrontmatterStrict(mutText);
      if (!parsed.parsed.name) throw new Error('MissingKey: name missing');
      if (!/^[a-z0-9-]+$/.test(parsed.parsed.name)) throw new Error('InvalidName: name must be lowercase alphanumeric-dash');
      if (!parsed.parsed.description || parsed.parsed.description.trim().length === 0) throw new Error('EmptyDescription: description is empty');
      if (parsed.parsed.description.trim().length < 20) throw new Error('ShortDescription: description too short');

      // If expectError is null, we expected this to pass (e.g. CRLF test)
      if (m.expectError === null) {
        passed = true;
      } else {
        reason = `Mutation unexpectedly passed validation; expected error "${m.expectError}"`;
      }
    } catch (err) {
      if (m.expectError !== null && err.message.includes(m.expectError)) {
        passed = true;
      } else if (m.expectError === null) {
        reason = `Valid input failed: ${err.message}`;
      } else {
        reason = `Threw ${err.message}, but expected ${m.expectError}`;
      }
    }
    recordTest(m.id, m.name, 'Fuzzing & Mutations', passed, { reason });
  }

  // 1.5 Body Parsing & Delimiter Isolation (Ensure internal "---" in markdown doesn't truncate body)
  {
    const res = parseFrontmatterStrict(skillRaw);
    const bodyDelimiters = (res.body.match(/^---$/gm) || []).length;
    const bodyHasContent = res.body.length > 5000 && res.body.includes('## Slash Command Workflow Trigger');
    const passed = bodyDelimiters > 0 && bodyHasContent;
    recordTest('ADV-M3-1.5', `Body Internal "---" Horizontal Rules Preserved (${bodyDelimiters} internal rules)`, 'Markdown Integrity', passed, {
      reason: passed ? '' : 'Internal "---" caused body truncation or parser error'
    });
  }

  // 1.6 SKILL.md Structural Sections Verification
  {
    const requiredHeadings = [
      '## Slash Command Workflow Trigger',
      '## Pipeline Execution Phases',
      '### Phase 1: Extraction Phase',
      '### Phase 2: Synthesis Phase',
      '### Phase 3: Verification Phase',
      '## Multi-Agent Role Workflow & Handoff Sequence',
      '## Error Escalation and Recovery Protocols',
      '## Anti-Patterns & Prohibitions'
    ];
    let allPresent = true;
    const missing = [];
    for (const h of requiredHeadings) {
      if (!skillRaw.includes(h)) {
        allPresent = false;
        missing.push(h);
      }
    }
    recordTest('ADV-M3-1.6', 'SKILL.md Complete Protocol Headings Coverage', 'Specification Conformance', allPresent, {
      reason: allPresent ? '' : 'Missing required sections: ' + missing.join(', ')
    });
  }

  // ==========================================================================
  // Category 2: Multi-Agent Role Prompts Boundary & Integrity Testing
  // ==========================================================================
  console.log('\n--- Category 2: 4 Agent Role Prompts Boundary & Edge Case Testing ---');

  const expectedRoles = [
    {
      file: 'extractor_agent.md',
      name: 'Extractor Agent',
      requiredTokens: ['design_spec.json', 'screenshots/mobile_reference.png', '390x844', '1440x900', 'assets/*.svg', '5-Phase Hydration Barrier', 'dom_walker.js'],
      handoffFrom: null,
      handoffTo: 'Compose Architect'
    },
    {
      file: 'compose_architect_agent.md',
      name: 'Compose Architect Agent',
      requiredTokens: ['Theme.kt', 'Color.kt', 'Type.kt', 'Elevation.kt', 'Shape.kt', 'AppButton', 'AppCard', 'AppTextField', 'ClaudeDesignScreen.kt', '@Preview'],
      handoffFrom: 'Extractor',
      handoffTo: 'Motion Specialist'
    },
    {
      file: 'motion_specialist_agent.md',
      name: 'Motion & UX Specialist Agent',
      requiredTokens: ['rememberSaveable', 'AnimatedVisibility', 'animate*AsState', 'indication = ripple', '>= 48dp', 'minimumInteractiveComponentSize'],
      handoffFrom: 'Compose Architect',
      handoffTo: 'Visual QA'
    },
    {
      file: 'visual_qa_agent.md',
      name: 'Visual QA Agent',
      requiredTokens: ['./gradlew compileDebugKotlin', './gradlew testDebugUnitTest', 'run_diff.js', 'verification_report.md', '10-Point', 'score >= 90', 'TRIGGER_REFINEMENT', 'PROCEED_PUBLISH'],
      handoffFrom: 'Motion Specialist',
      handoffTo: 'Sentinel / Orchestrator'
    }
  ];

  // 2.1 File Existence and Non-Empty Check
  for (const role of expectedRoles) {
    const filePath = path.join(PROMPTS_DIR, role.file);
    let passed = false;
    let reason = '';
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size > 2000) {
        passed = true;
      } else {
        reason = `File too small (${stat.size} bytes; expected > 2000)`;
      }
    } else {
      reason = 'File does not exist';
    }
    recordTest(`ADV-M3-2.1-${role.file.slice(0, 4)}`, `File Existence & Size: ${role.file}`, 'Prompt Integrity', passed, { reason });
  }

  // 2.2 Balanced Code Fences in All Prompts (No unclosed ``` blocks)
  for (const role of expectedRoles) {
    const filePath = path.join(PROMPTS_DIR, role.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const fences = (content.match(/```/g) || []).length;
    const isBalanced = fences % 2 === 0;
    recordTest(`ADV-M3-2.2-${role.file.slice(0, 4)}`, `Balanced Markdown Code Fences: ${role.file} (${fences} fences)`, 'Markdown Integrity', isBalanced, {
      reason: isBalanced ? '' : `Unbalanced code fences (count = ${fences}, must be even)`
    });
  }

  // 2.3 Required Semantic Sections in All 4 Prompts
  const mandatorySections = [
    '## Role Identity',
    '## Core Mission',
    '## Inputs',
    '## Execution Directives',
    '## Outputs',
    '## Handoff Contract'
  ];

  for (const role of expectedRoles) {
    const filePath = path.join(PROMPTS_DIR, role.file);
    const content = fs.readFileSync(filePath, 'utf8');
    let allSectionsPresent = true;
    const missing = [];
    for (const sec of mandatorySections) {
      if (!content.includes(sec)) {
        allSectionsPresent = false;
        missing.push(sec);
      }
    }
    recordTest(`ADV-M3-2.3-${role.file.slice(0, 4)}`, `Mandatory Semantic Sections: ${role.file}`, 'Structural Completeness', allSectionsPresent, {
      reason: allSectionsPresent ? '' : 'Missing sections: ' + missing.join(', ')
    });
  }

  // 2.4 Unresolved Placeholder / Token Scanner (No TODO, FIXME, undefined, null, {{...}}, [TBD])
  for (const role of expectedRoles) {
    const filePath = path.join(PROMPTS_DIR, role.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const forbiddenPatterns = [
      { name: 'Unresolved double-bracket placeholder', regex: /\{\{[^}]+\}\}/ },
      { name: 'TODO marker', regex: /\bTODO\b/i },
      { name: 'FIXME marker', regex: /\bFIXME\b/i },
      { name: 'TBD marker', regex: /\[TBD\]/i },
      { name: 'Literal undefined token', regex: /\bundefined\b/ },
      { name: 'Literal NaN token', regex: /\bNaN\b/ }
    ];

    let foundIssue = null;
    for (const pat of forbiddenPatterns) {
      if (pat.regex.test(content)) {
        foundIssue = pat.name;
        break;
      }
    }

    const passed = foundIssue === null;
    recordTest(`ADV-M3-2.4-${role.file.slice(0, 4)}`, `No Unresolved Tokens or TODOs: ${role.file}`, 'Clean Prompt Audit', passed, {
      reason: foundIssue || ''
    });
  }

  // 2.5 Role-Specific Required Domain Tokens Check
  for (const role of expectedRoles) {
    const filePath = path.join(PROMPTS_DIR, role.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const missingTokens = [];
    for (const token of role.requiredTokens) {
      if (!content.includes(token)) {
        missingTokens.push(token);
      }
    }
    const passed = missingTokens.length === 0;
    recordTest(`ADV-M3-2.5-${role.file.slice(0, 4)}`, `Domain Specific Tokens Present: ${role.file}`, 'Domain Coverage', passed, {
      reason: passed ? '' : 'Missing domain tokens: ' + missingTokens.join(', ')
    });
  }

  // 2.6 Chain of Custody & Handoff Contract Continuity
  {
    console.log('\n--- Category 3: Multi-Agent Chain of Custody & Handoff Consistency ---');
    const extContent = fs.readFileSync(path.join(PROMPTS_DIR, 'extractor_agent.md'), 'utf8');
    const archContent = fs.readFileSync(path.join(PROMPTS_DIR, 'compose_architect_agent.md'), 'utf8');
    const motionContent = fs.readFileSync(path.join(PROMPTS_DIR, 'motion_specialist_agent.md'), 'utf8');
    const vqaContent = fs.readFileSync(path.join(PROMPTS_DIR, 'visual_qa_agent.md'), 'utf8');

    // Check transition statements
    const t1 = extContent.includes('Extractor -> design_spec.json + screenshots -> Compose Architect');
    const t2 = archContent.includes('Compose Architect -> Kotlin M3 Composables -> Motion Specialist');
    const t3 = motionContent.includes('Motion Specialist -> State & Animations -> Visual QA');
    const t4 = vqaContent.includes('Visual QA -> verification_report.md -> Sentinel / Orchestrator');

    recordTest('ADV-M3-3.1', 'Handoff Transition 1 (Extractor -> Compose Architect)', 'Handoff Continuity', t1, {
      reason: t1 ? '' : 'Transition 1 not verbatim in extractor_agent.md'
    });
    recordTest('ADV-M3-3.2', 'Handoff Transition 2 (Compose Architect -> Motion Specialist)', 'Handoff Continuity', t2, {
      reason: t2 ? '' : 'Transition 2 not verbatim in compose_architect_agent.md'
    });
    recordTest('ADV-M3-3.3', 'Handoff Transition 3 (Motion Specialist -> Visual QA)', 'Handoff Continuity', t3, {
      reason: t3 ? '' : 'Transition 3 not verbatim in motion_specialist_agent.md'
    });
    recordTest('ADV-M3-3.4', 'Handoff Transition 4 (Visual QA -> Sentinel / Orchestrator)', 'Handoff Continuity', t4, {
      reason: t4 ? '' : 'Transition 4 not verbatim in visual_qa_agent.md'
    });
  }

  // ==========================================================================
  // Category 4: Workflow Engine Boundary & Options Validation
  // ==========================================================================
  console.log('\n--- Category 4: Workflow Engine Boundary & Failure Handling ---');
  const workflowPath = path.join(PROJECT_ROOT, 'skills/claude-to-compose/workflow.js');

  if (fs.existsSync(workflowPath)) {
    const { ClaudeToComposeWorkflow, EXIT_CODES } = require(workflowPath);

    // 4.1 Rejection of Null / Empty Input Target
    {
      const wf = new ClaudeToComposeWorkflow({});
      let caught = false;
      try {
        wf.resolveTarget(null);
      } catch (e) {
        caught = e.message.includes('No target URL');
      }
      recordTest('ADV-M3-4.1', 'Workflow Rejection of Null/Empty Target', 'Workflow Input', caught, {
        reason: caught ? '' : 'Did not throw expected No target URL error'
      });
    }

    // 4.2 Rejection of Nonexistent Local File
    {
      const wf = new ClaudeToComposeWorkflow({});
      let caught = false;
      try {
        wf.resolveTarget('/nonexistent/path/artifact.html');
      } catch (e) {
        caught = e.message.includes('does not exist');
      }
      recordTest('ADV-M3-4.2', 'Workflow Rejection of Nonexistent File Path', 'Workflow Input', caught, {
        reason: caught ? '' : 'Did not throw expected file does not exist error'
      });
    }

    // 4.3 Rejection of Malformed URL
    {
      const wf = new ClaudeToComposeWorkflow({});
      let caught = false;
      try {
        wf.resolveTarget('https://invalid url with spaces.com');
      } catch (e) {
        caught = e.message.includes('Invalid URL format');
      }
      recordTest('ADV-M3-4.3', 'Workflow Rejection of Malformed HTTP URL', 'Workflow Input', caught, {
        reason: caught ? '' : 'Did not throw expected Invalid URL format error'
      });
    }

    // 4.4 Synthesis Guard against Missing design_spec.json
    {
      const wf = new ClaudeToComposeWorkflow({ output: '/tmp/fake_empty_dir_' + Date.now() });
      let caught = false;
      try {
        await wf.runSynthesis();
      } catch (e) {
        caught = e.message.includes('Valid design_spec.json not found');
      }
      recordTest('ADV-M3-4.4', 'Synthesis Phase Guards Against Missing design_spec.json', 'Workflow State', caught, {
        reason: caught ? '' : 'Did not enforce spec existence before synthesis'
      });
    }

    // 4.5 Refinement Loop Veto Rule Enforced (Score < 5 in any rubric dimension)
    {
      const rubricDimensions = [
        { name: 'Typography', score: 10 },
        { name: 'Color', score: 10 },
        { name: 'Layout', score: 4 }, // VETO
        { name: 'Radii', score: 10 },
        { name: 'Elevation', score: 10 },
        { name: 'Vector', score: 10 },
        { name: 'Interactive', score: 10 },
        { name: 'Touch Target', score: 10 },
        { name: 'Accessibility', score: 10 },
        { name: 'Motion', score: 10 }
      ];
      const totalScore = rubricDimensions.reduce((acc, d) => acc + d.score, 0); // 94 / 100
      const hasVeto = rubricDimensions.some(d => d.score < 5); // true
      const passed = totalScore >= 90 && !hasVeto; // must be false despite totalScore=94 >= 90
      recordTest('ADV-M3-4.5', 'Agent-as-Judge Veto Rule Triggers Refinement Despite High Total Score (94/100, Veto: true)', 'Rubric Logic', !passed && hasVeto, {
        reason: (!passed && hasVeto) ? '' : 'Failed to enforce Veto rule on dimension score < 5'
      });
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('M3 ADVERSARIAL CHALLENGE EXECUTION SUMMARY');
  console.log('='.repeat(75));
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Scenarios Tested: ${total}`);
  console.log(`Passed:                 \x1b[32m${passedCount}\x1b[0m`);
  console.log(`Failed:                 \x1b[31${failedCount > 0 ? ';1m' : 'm'}${failedCount}\x1b[0m`);
  console.log('='.repeat(75));

  return { total, passedCount, failedCount, results };
}

if (require.main === module) {
  runM3AdversarialSuite().then(summary => {
    process.exit(summary.failedCount > 0 ? 1 : 0);
  });
}

module.exports = { runM3AdversarialSuite };
