/**
 * src/analyzer/symbol_indexer.js
 * Domain symbol correlation engine aggregating composables, routes, state holders,
 * action classes, persistence definitions, and diagnostics into a unified ExistingAppModel.
 */

'use strict';

const { extractComposables } = require('./composable_extractor');
const { extractRoutes } = require('./navigation_extractor');
const { extractStateHolders } = require('./state_extractor');
const { extractActionClasses } = require('./action_extractor');
const { extractPersistence } = require('./persistence_extractor');
const { extractAllTestTags } = require('./test_tag_extractor');

function indexProjectSymbols(astFiles, gradleMeta) {
  const screens = [];
  const diagnostics = [];

  for (const astFile of astFiles) {
    // Collect diagnostics
    if (astFile.diagnostics && astFile.diagnostics.length > 0) {
      diagnostics.push(...astFile.diagnostics);
    }

    // Extract composables
    const compList = extractComposables(astFile);
    screens.push(...compList);
  }

  // Extract navigation routes
  const routes = extractRoutes(astFiles);

  // Extract state holders (ViewModels)
  const stateHolders = extractStateHolders(astFiles);

  // Extract sealed action classes
  const actionClasses = extractActionClasses(astFiles);

  // Extract Room persistence (entities, daos, databases, repositories)
  const persistence = extractPersistence(astFiles);

  // Extract test tags catalog
  const testTags = extractAllTestTags(astFiles);
  const testTagConstants = require('./test_tag_extractor').extractTestTagConstants(astFiles);

  // Link and resolve testTags to screens that define them
  for (const screen of screens) {
    // Resolve any constants in screen.testTags
    screen.testTags = screen.testTags.map(rawTag => {
      if (testTagConstants.has(rawTag)) return testTagConstants.get(rawTag);
      const parts = rawTag.split('.');
      const member = parts[parts.length - 1];
      if (testTagConstants.has(member)) return testTagConstants.get(member);
      return rawTag;
    });

    if (screen.testTags.length === 0) {
      // Check if any tag matches the screen name or prefix
      const lowerName = screen.composableName.toLowerCase();
      const matched = testTags.filter(t => t.toLowerCase().includes(lowerName.replace('screen', '')));
      if (matched.length > 0) {
        screen.testTags = matched;
      }
    }
  }

  const buildSystem = {
    type: 'gradle',
    compileSdk: gradleMeta.compileSdk || 34,
    minSdk: gradleMeta.minSdk || 26
  };
  if (gradleMeta.targetSdk) buildSystem.targetSdk = gradleMeta.targetSdk;
  if (gradleMeta.gradleVersion) buildSystem.gradleVersion = gradleMeta.gradleVersion;
  if (gradleMeta.agpVersion) buildSystem.agpVersion = gradleMeta.agpVersion;
  if (gradleMeta.kotlinVersion) buildSystem.kotlinVersion = gradleMeta.kotlinVersion;
  if (gradleMeta.composeBomVersion) buildSystem.composeBomVersion = gradleMeta.composeBomVersion;
  if (gradleMeta.roomVersion) buildSystem.roomVersion = gradleMeta.roomVersion;
  if (gradleMeta.navigationVersion) buildSystem.navigationVersion = gradleMeta.navigationVersion;

  const invariants = [];
  if (persistence.entities && persistence.entities.length > 0) {
    invariants.push('INVAR-01: Data persistence in Room database');
  }
  if (routes && routes.length > 0) {
    invariants.push('INVAR-02: Back navigation integrity between editor and list');
  }
  if (stateHolders && stateHolders.length > 0) {
    invariants.push('INVAR-03: Autosave debounce and zero-data-loss exit');
  }
  if (persistence.entities && persistence.entities.some(e => (e.columns || []).some(c => c.name === 'isPinned'))) {
    invariants.push('INVAR-04: Pinned notes ordering invariant');
  }
  if (persistence.repositories && persistence.repositories.length > 0) {
    invariants.push('INVAR-05: Offline local architecture');
  }

  const existingAppModel = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    projectRoot: gradleMeta.projectRoot,
    targetModule: gradleMeta.targetModule,
    packageName: gradleMeta.packageName,
    buildSystem,
    screens,
    routes,
    stateHolders,
    actionClasses,
    persistence,
    invariants,
    diagnostics
  };

  return existingAppModel;
}

module.exports = {
  indexProjectSymbols
};
