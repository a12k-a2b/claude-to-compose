/**
 * src/analyzer/indexer.js
 * App Indexer entrypoint and compatibility facade.
 */

'use strict';

const { parseAndroidProject } = require('./index');
const { indexProjectSymbols } = require('./symbol_indexer');
const { extractComposables } = require('./composable_extractor');
const { extractRoutes } = require('./navigation_extractor');
const { extractStateHolders } = require('./state_extractor');
const { extractPersistence } = require('./persistence_extractor');
const { runInspectApp } = require('../baseline/inspect_app_runner');

/**
 * Inspects target Android application and builds ExistingAppModel.
 *
 * @param {string} projectPath Path to project root
 * @param {object} options Inspection options
 * @returns {Promise<object>} ExistingAppModel
 */
async function inspectApp(projectPath, options = {}) {
  return parseAndroidProject(projectPath, options.module || 'app');
}

/**
 * Synthesizes a structured ExistingAppModel from parsed intermediate data collections.
 *
 * @param {object} data Parsed data containing screens, routes, persistence, etc.
 * @returns {object} ExistingAppModel
 */
function buildModelFromParsedData(data = {}) {
  const screens = (data.screens || []).map(s => ({
    symbol: s.symbol || s.name || s.composableName || '',
    composableName: s.composableName || s.name || s.symbol || '',
    filePath: s.filePath || 'ui/Screen.kt',
    parameters: s.parameters || [],
    testTags: s.testTags || []
  }));

  const routes = (data.routes || []).map(r => ({
    route: r.route || '',
    destinationComposable: r.destinationComposable || '',
    arguments: r.arguments || []
  }));

  const persistence = data.persistence || [];

  return {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    projectRoot: data.projectRoot || process.cwd(),
    targetModule: data.targetModule || 'app',
    packageName: data.packageName || 'com.example.notes',
    buildSystem: data.buildSystem || { type: 'gradle', compileSdk: 35, minSdk: 26 },
    screens,
    routes,
    stateHolders: data.stateHolders || [],
    actionClasses: data.actionClasses || [],
    persistence,
    invariants: data.invariants || [],
    diagnostics: data.diagnostics || []
  };
}

/**
 * Extracts and normalizes behavior invariants into an invariants manifest.
 *
 * @param {Array} items Invariant definitions
 * @returns {object} Invariant manifest
 */
function extractInvariants(items = []) {
  return {
    schemaVersion: '2.0.0',
    invariants: items.map(item => ({
      id: item.id || 'INVAR-01',
      category: item.category || 'GENERAL',
      description: item.description || '',
      criticality: item.criticality || 'FATAL'
    }))
  };
}

function resolveTypeHierarchy(className, classMap = {}) {
  return [className];
}

function validateRouteSyntax(routePattern) {
  if (!routePattern || typeof routePattern !== 'string') return false;
  // Route parameters must use {param} syntax
  if (routePattern.includes('/:') || routePattern.includes('?=')) return false;
  return true;
}

function normalizeRoomEntity(entity = {}) {
  return {
    tableName: entity.tableName || entity.entitySymbol || 'Note',
    entitySymbol: entity.entitySymbol || 'NoteEntity',
    ...entity
  };
}

module.exports = {
  inspectApp,
  buildModelFromParsedData,
  extractInvariants,
  indexSymbols: indexProjectSymbols,
  extractComposables,
  extractRoutes,
  extractStateHolders,
  extractPersistence,
  resolveTypeHierarchy,
  validateRouteSyntax,
  normalizeRoomEntity,
  runInspectApp
};
