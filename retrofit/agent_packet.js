'use strict';

const { InputError } = require('./safety');
const { buildContract, sha256, stableJson, validateOrThrow, workspaceFile } = require('./contract_builder');

function buildAgentPacket(workspace, contractPath) {
  const source = workspaceFile(workspace, contractPath, '--contract');
  validateOrThrow('retrofit-contract.schema.json', source.value, 'retrofit contract');
  const contract = source.value;
  const resolvedInputs = new Map();
  for (const input of contract.inputs) {
    const resolved = workspaceFile(workspace, require('node:path').join(workspace, input.path), `contract input ${input.id}`);
    if (resolved.sha256 !== input.sha256) throw new InputError(`contract input hash mismatch: ${input.id}`);
    resolvedInputs.set(input.id, resolved);
  }
  const existingSource = resolvedInputs.get(contract.sources.existingAppModel.artifactId);
  const designSource = resolvedInputs.get(contract.sources.designEvidence.artifactId);
  if (!existingSource || existingSource.sha256 !== contract.sources.existingAppModel.sha256) throw new InputError('existing app source reference mismatch');
  if (!designSource || designSource.sha256 !== contract.sources.designEvidence.sha256) throw new InputError('design source reference mismatch');
  const behaviorSources = [...resolvedInputs.values()].filter((item) => item.value?.kind === 'BehaviorManifest');
  const correspondenceSources = [...resolvedInputs.values()].filter((item) => item.value?.kind === 'CorrespondenceManifest');
  if (behaviorSources.length !== 1) throw new InputError('contract must resolve exactly one behavior manifest input');
  if (correspondenceSources.length !== 1) throw new InputError('contract must resolve exactly one correspondence manifest input');
  validateOrThrow('behavior-manifest.schema.json', behaviorSources[0].value, 'behavior manifest input');
  validateOrThrow('correspondence-manifest.schema.json', correspondenceSources[0].value, 'correspondence manifest input');
  const rebuilt = buildContract({
    workspace,
    android: existingSource.value.provenance.repository.root,
    appModel: existingSource.path,
    designSpec: designSource.path,
    correspondence: correspondenceSources[0].path,
    behaviorManifest: behaviorSources[0].path,
    createdAt: contract.createdAt
  });
  if (stableJson(rebuilt.contract) !== stableJson(contract)) throw new InputError('retrofit contract does not match its hash-pinned authored inputs');
  const goldenPolicy = rebuilt.goldenPolicy;
  const calculatedRequirements = sha256(stableJson(contract.acceptanceMatrix.requirements));
  if (calculatedRequirements !== contract.acceptanceMatrix.requirementsSha256) {
    throw new InputError('retrofit contract acceptance matrix hash mismatch');
  }
  const packet = {
    schemaVersion: '1.0.0', kind: 'AgentPacket', id: `agent-packet.${source.sha256.slice(0, 24)}`,
    claimScope: 'CODING_INSTRUCTIONS_FROM_VALIDATED_CONTRACT_NOT_VERIFIED_IMPLEMENTATION',
    retrofitContract: { id: contract.id, sha256: source.sha256 },
    inputs: structuredClone(contract.inputs),
    sources: structuredClone(contract.sources),
    functionalBehaviorRule: 'Keep the inspected baseline checkout immutable. Perform candidate implementation in a separate worktree and emit hash-pinned candidate receipts. Preserve every REQUIRED behavior obligation and existing action binding. Do not add, replace, or remove behavior unless this packet carries an exact owner-approved declaration.',
    elementMappings: structuredClone(contract.elementMappings),
    actionBindings: structuredClone(contract.actionBindings),
    preservationObligations: structuredClone(contract.preservationObligations),
    goldenPolicy: structuredClone(goldenPolicy),
    capabilities: structuredClone(contract.capabilities),
    uncertainties: structuredClone(contract.uncertainties),
    implementationBoundary: structuredClone(contract.implementationBoundary),
    acceptanceRequirements: structuredClone(contract.acceptanceMatrix.requirements)
  };
  validateOrThrow('agent-packet.schema.json', packet, 'agent packet');
  return {
    packet, contract, source,
    sourcePaths: [source.path, ...[...resolvedInputs.values()].map((item) => item.path)]
  };
}

function line(value) {
  return String(value).replaceAll('\r', ' ').replaceAll('\n', ' ');
}

function renderMarkdown(packet) {
  const out = [
    '# Retrofit coding-agent packet', '',
    `Contract: \`${packet.retrofitContract.id}\``,
    `Contract SHA-256: \`${packet.retrofitContract.sha256}\``, '',
    '## Hash-pinned source inputs', ''
  ];
  for (const input of packet.inputs) out.push(`- \`${input.id}\` [${input.kind}] \`${line(input.path)}\` SHA-256 \`${input.sha256}\``);
  out.push('', '## Source artifacts', '',
    `- Existing app model: \`${packet.sources.existingAppModel.artifactId}\` at \`${line(packet.sources.existingAppModel.path)}\` SHA-256 \`${packet.sources.existingAppModel.sha256}\``,
    `- Design evidence: \`${packet.sources.designEvidence.artifactId}\` at \`${line(packet.sources.designEvidence.path)}\` SHA-256 \`${packet.sources.designEvidence.sha256}\``, '',
    '## Non-negotiable behavior rule', '', line(packet.functionalBehaviorRule), '',
    '## Allowed implementation paths', ''
  );
  for (const value of packet.implementationBoundary.allowedPaths) out.push(`- \`${line(value)}\``);
  out.push('', '## Prohibited changes', '');
  for (const value of packet.implementationBoundary.prohibitedChanges) out.push(`- ${line(value)}`);
  out.push('', '## Exact element mappings', '');
  for (const item of packet.elementMappings) {
    const approval = item.ownerApprovalStatement ? ` — owner-approved scope: ${line(item.ownerApprovalStatement)}` : '';
    out.push(`- \`${item.designIdentity}\` → \`${item.existingUiSymbolRef}\` (${item.mappingStatus})${approval}`);
  }
  out.push('', '## Exact action bindings', '');
  if (packet.actionBindings.length === 0) out.push('- None declared. Do not invent callbacks.');
  for (const item of packet.actionBindings) out.push(`- \`${item.designIdentity}\` ${item.event} → \`${item.existingActionRef || item.newBehaviorStatement}\` (${item.bindingStatus})`);
  out.push('', '## Functional preservation obligations', '');
  for (const item of packet.preservationObligations) out.push(`- **${item.id}** [${item.status}] ${line(item.statement)} Verification: ${line(item.verificationRequirement)}`);
  out.push('', '## Golden policy', '', `- [${packet.goldenPolicy.status}] ${line(packet.goldenPolicy.statement)}`, '', '## Capabilities and limitations', '');
  for (const item of packet.capabilities) out.push(`- \`${item.subjectRef}\`: ${item.status} — ${line(item.rationale)}`);
  out.push('', '## Uncertainties that must remain visible', '');
  if (packet.uncertainties.length === 0) out.push('- None declared.');
  for (const item of packet.uncertainties) out.push(`- **${item.impact}** \`${item.subjectRef}\`: ${line(item.statement)} Resolution: ${line(item.resolution)}`);
  out.push('', '## Exact verification commands', '');
  for (const value of packet.implementationBoundary.verificationCommands) out.push(`- \`${line(value)}\``);
  out.push('', '## Acceptance requirements', '');
  for (const item of packet.acceptanceRequirements) {
    out.push(`- **${item.id}**: ${line(item.description)} [${item.domains.join(', ')}]`);
    for (const context of item.requiredContexts) {
      const config = context.configuration;
      out.push(`  - Context \`${context.id}\`: scene=\`${context.sceneId}\`, scenario=\`${context.scenarioId}\`, state=\`${context.stateId}\`, viewport=${context.viewport.widthPx}x${context.viewport.heightPx}@${context.viewport.deviceScaleFactor}, device=\`${line(context.deviceProfile)}\`, variant=\`${line(config.buildVariant)}\`, locale=\`${line(config.locale)}\`, theme=\`${line(config.theme)}\`, fontScale=${config.fontScale}, orientation=${config.orientation}, reducedMotion=${config.reducedMotion}`);
    }
    if (item.numericBudgets.length === 0) out.push('  - Numeric budgets: none explicitly declared.');
    for (const budget of item.numericBudgets) out.push(`  - Budget \`${budget.id}\`: ${line(budget.metric)} ${budget.operator} ${budget.threshold} ${line(budget.unit)}`);
  }
  return `${out.join('\n')}\n`;
}

module.exports = { buildAgentPacket, renderMarkdown };
