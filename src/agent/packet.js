/**
 * src/agent/packet.js
 *
 * Scoped Agent Implementation Packet Generator for Claude to Compose (ctc) v2.
 *
 * Generates dual-format implementation packets:
 * 1. Machine-readable JSON (agent-packet.json) conforming to Draft 2020-12 schema.
 * 2. Context-bounded Markdown (AGENT_PACKET.md, < 300 lines) optimized for coding LLMs.
 */

'use strict';

const crypto = require('crypto');
const { sanitizePath } = require('./boundary_enforcer');
const { formatAgentPacketMarkdown } = require('./markdown_formatter');
const { validateBoundaries } = require('../mapping/planner');

/**
 * Daylight Sol:OS Pre-Calibrated 8-bit Neutral Grayscale Tokens.
 */
const SOL_OS_NEUTRAL_TOKENS = Object.freeze({
  '--os-0': { hex: '#FFFFFF', rgb: [255, 255, 255], luminance: 255, role: 'Base paper ground / canvas' },
  '--os-50': { hex: '#F7F7F7', rgb: [247, 247, 247], luminance: 247, role: 'Surface panels / cards' },
  '--os-100': { hex: '#DCD5C9', rgb: [220, 213, 201], luminance: 215, role: 'Hairline borders (1dp)' },
  '--os-150': { hex: '#F5F5F5', rgb: [245, 245, 245], luminance: 245, role: 'Recessed canvas / input fields' },
  '--os-200': { hex: '#CCCCCC', rgb: [204, 204, 204], luminance: 204, role: 'Disabled controls / inactive chips' },
  '--os-300': { hex: '#858585', rgb: [133, 133, 133], luminance: 133, role: 'Tertiary text / placeholder ink' },
  '--os-400': { hex: '#535353', rgb: [83, 83, 83], luminance: 83, role: 'Secondary body ink / icons' },
  '--os-800': { hex: '#343434', rgb: [52, 52, 52], luminance: 52, role: 'Dark fields / pressed state ink' },
  '--os-900': { hex: '#1A1A1A', rgb: [26, 26, 26], luminance: 26, role: 'Primary text ink / headlines' },
  '--os-1000': { hex: '#000000', rgb: [0, 0, 0], luminance: 0, role: 'Max black ink / focus rings' }
});

const SOL_OS_BRAND_GRAYS = Object.freeze({
  yellow: { hex: '#CECECE', rgb: [206, 206, 206], luminance: 206 },
  amber: { hex: '#9D9D9E', rgb: [157, 157, 158], luminance: 157 },
  orange: { hex: '#6C6C6D', rgb: [108, 108, 109], luminance: 108 }
});

const MATERIAL3_COLOR_SCHEME_MAPPING = Object.freeze({
  background: { token: '--os-0', hex: '#FFFFFF', composeValue: 'Color(0xFFFFFFFF)' },
  surface: { token: '--os-0', hex: '#FFFFFF', composeValue: 'Color(0xFFFFFFFF)' },
  surfaceVariant: { token: '--os-50', hex: '#F7F7F7', composeValue: 'Color(0xFFF7F7F7)' },
  surfaceContainerLowest: { token: '--os-150', hex: '#F5F5F5', composeValue: 'Color(0xFFF5F5F5)' },
  outline: { token: '--os-100', hex: '#DCD5C9', composeValue: 'Color(0xFFDCD5C9)' },
  outlineVariant: { token: '--os-100', hex: '#DCD5C9', composeValue: 'Color(0xFFDCD5C9)' },
  onSurfaceDisabled: { token: '--os-200', hex: '#CCCCCC', composeValue: 'Color(0xFFCCCCCC)' },
  onSurfaceVariant: { token: '--os-300', hex: '#858585', composeValue: 'Color(0xFF858585)' },
  secondary: { token: '--os-400', hex: '#535353', composeValue: 'Color(0xFF535353)' },
  primaryContainer: { token: '--os-800', hex: '#343434', composeValue: 'Color(0xFF343434)' },
  onBackground: { token: '--os-900', hex: '#1A1A1A', composeValue: 'Color(0xFF1A1A1A)' },
  onSurface: { token: '--os-900', hex: '#1A1A1A', composeValue: 'Color(0xFF1A1A1A)' },
  primary: { token: '--os-1000', hex: '#000000', composeValue: 'Color(0xFF000000)' }
});

/**
 * Default protected domain patterns applied when forbiddenPaths is omitted or empty.
 * Prevents domain entities, DAOs, ViewModels, and navigation logic from being targeted as allowed composables.
 */
const DEFAULT_FORBIDDEN_PATHS = Object.freeze([
  'app/src/main/java/com/claude/noteapp/data/**',
  'app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt',
  'app/src/main/java/com/claude/noteapp/presentation/**Action*.kt',
  'app/src/main/java/com/claude/noteapp/navigation/**',
  'data/**',
  '**/data/**',
  'presentation/**ViewModel*.kt',
  '**/presentation/**ViewModel*.kt',
  'navigation/**',
  '**/navigation/**'
]);

/**
 * Builds the machine-readable JSON packet conforming to Draft 2020-12 schema.
 */
function buildJsonPacket(screenId, migrationPlan, correspondenceMap, designContract, existingAppModel) {
  const boundaries = migrationPlan?.boundaries || {};
  const rawAllowed = (boundaries.allowedModificationPaths && boundaries.allowedModificationPaths.length > 0)
    ? boundaries.allowedModificationPaths
    : ['app/src/main/java/com/claude/noteapp/ui/editor/**'];

  const allowedModificationPaths = rawAllowed.map(p => {
    try {
      return sanitizePath(p);
    } catch (_) {
      return p;
    }
  });

  const forbiddenPaths = (boundaries.forbiddenPaths && boundaries.forbiddenPaths.length > 0)
    ? boundaries.forbiddenPaths
    : [
      'app/src/main/java/com/claude/noteapp/data/**',
      'app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt',
      'app/src/main/java/com/claude/noteapp/presentation/**Action*.kt',
      'app/src/main/java/com/claude/noteapp/navigation/**'
    ];

  const forbiddenBehaviors = boundaries.forbiddenBehaviors || [
    'EPD screen clear waveforms / ACTION_REFRESH_SCREEN broadcast or artificial dismissal delays',
    'Mock domain data / Fake repositories in production screens replacing Room DAO',
    'Hardcoded dummy lists replacing ViewModel StateFlow collections',
    'Removing contentDescription or accessibility semantics from interactive IconButtons',
    'Tampering with verification thresholds, tolerance budgets, or golden references to force pass'
  ];

  // Derive target composable name and file path dynamically
  const cleanScreenId = screenId.replace(/^daylight#/, '').replace(/^ctc#/, '');
  const pascalName = cleanScreenId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  let targetFilePath = null;
  let targetComposableName = null;
  let targetSymbol = null;

  // 1. Check if allowed paths explicitly list a Kotlin file
  for (const p of allowedModificationPaths) {
    if (p.endsWith('.kt')) {
      targetFilePath = p;
      const base = p.split('/').pop().replace(/\.kt$/, '');
      targetComposableName = base;
      break;
    }
  }

  // 2. Check correspondenceMap mappings
  if (!targetComposableName && correspondenceMap?.mappings?.length > 0) {
    for (const m of correspondenceMap.mappings) {
      const sym = m.existingTarget?.composableSymbol || m.existingSymbol;
      if (sym && sym !== 'UnknownScreen') {
        targetComposableName = sym.split('.').pop();
        targetSymbol = sym;
        if (m.existingTarget?.filePath) targetFilePath = m.existingTarget.filePath;
        break;
      }
    }
  }

  // 3. Fallback to derived pascalName
  if (!targetComposableName) {
    if (screenId.toLowerCase().includes('screen') || screenId.toLowerCase() === 'note_editor' || screenId.toLowerCase() === 'note_list') {
      targetComposableName = pascalName.endsWith('Screen') ? pascalName : `${pascalName}Screen`;
    } else {
      targetComposableName = pascalName;
    }
  }

  if (!targetFilePath) {
    const baseDir = allowedModificationPaths[0]
      ? allowedModificationPaths[0].replace(/\/\*\*.*$/, '').replace(/\/\*.*$/, '')
      : 'app/src/main/java/com/claude/noteapp/ui/editor';
    targetFilePath = `${baseDir}/${targetComposableName}.kt`;
  }

  if (!targetSymbol) {
    targetSymbol = `com.claude.noteapp.ui.${targetComposableName}`;
  }

  const isLeafComponent = !targetComposableName.endsWith('Screen');

  let targetSignature;
  let targetParameters;

  if (isLeafComponent) {
    targetSignature = `@Composable fun ${targetComposableName}(onClick: () -> Unit, modifier: Modifier = Modifier)`;
    targetParameters = [
      { name: 'onClick', type: '() -> Unit', isState: false, isLambda: true, isModifier: false, defaultValue: null },
      { name: 'modifier', type: 'Modifier', isState: false, isLambda: false, isModifier: true, defaultValue: 'Modifier' }
    ];
  } else {
    const baseScreen = targetComposableName.replace(/Screen$/, '');
    const uiStateType = `${baseScreen}UiState`;
    const actionType = `${baseScreen}Action`;
    targetSignature = `@Composable fun ${targetComposableName}(uiState: ${uiStateType}, onAction: (${actionType}) -> Unit, onNavigateBack: () -> Unit, modifier: Modifier = Modifier)`;
    targetParameters = [
      { name: 'uiState', type: uiStateType, isState: true, isLambda: false, isModifier: false, defaultValue: null },
      { name: 'onAction', type: `(${actionType}) -> Unit`, isState: false, isLambda: true, isModifier: false, defaultValue: null },
      { name: 'onNavigateBack', type: '() -> Unit', isState: false, isLambda: true, isModifier: false, defaultValue: null },
      { name: 'modifier', type: 'Modifier', isState: false, isLambda: false, isModifier: true, defaultValue: 'Modifier' }
    ];
  }

  const targetFiles = [
    {
      path: targetFilePath,
      action: 'RETROFIT',
      purpose: `Retrofit ${targetComposableName} composable layout, Sol:OS styling, and test tag preservation`,
      targetSymbols: [targetComposableName]
    }
  ];

  const targetComposables = [
    {
      symbol: targetSymbol,
      composableName: targetComposableName,
      filePath: targetFilePath,
      signature: targetSignature,
      role: isLeafComponent ? `${targetComposableName} presentation component` : 'Primary editing screen presentation composable',
      parameters: targetParameters
    }
  ];

  const packetHash = crypto.createHash('sha256')
    .update(`${screenId}-${Date.now()}`)
    .digest('hex')
    .slice(0, 10);
  const packetId = `packet_${cleanScreenId.toLowerCase()}_${packetHash}`;

  return {
    schemaVersion: '2.0.0',
    packetId,
    generatedAt: new Date().toISOString(),
    screenId,
    correspondenceMap: correspondenceMap || null,
    designContract: designContract || null,
    existingAppModel: existingAppModel || null,
    targetScope: {
      allowedModificationPaths,
      forbiddenPaths,
      forbiddenBehaviors,
      targetFiles,
      targetComposables
    },
    designTokens: {
      solOsNeutralTokens: SOL_OS_NEUTRAL_TOKENS,
      solOsBrandGrays: SOL_OS_BRAND_GRAYS,
      material3ColorSchemeMapping: MATERIAL3_COLOR_SCHEME_MAPPING,
      typography: {
        fontFamilies: {
          headline: 'ABC Arizona Flare',
          body: 'ABC Arizona Sans'
        },
        styles: {
          title: {
            fontFamily: 'ABC Arizona Flare',
            fontSizeSp: 28,
            lineHeightSp: 34,
            letterSpacingSp: -0.5,
            fontWeight: 'Bold',
            inkToken: '--os-900'
          },
          body: {
            fontFamily: 'ABC Arizona Sans',
            fontSizeSp: 16,
            lineHeightSp: 24,
            letterSpacingSp: 0.0,
            fontWeight: 'Normal',
            inkToken: '--os-400'
          },
          chips: {
            fontFamily: 'ABC Arizona Sans',
            fontSizeSp: 12,
            lineHeightSp: 16,
            letterSpacingSp: 0.2,
            fontWeight: 'Medium',
            inkToken: '--os-300'
          }
        }
      },
      wcagContrastRequirements: {
        normalTextMinRatio: 7.0,
        largeTextMinRatio: 4.5,
        level: 'AAA'
      }
    },
    preservationInvariants: {
      summary: 'Strict preservation of Room DB persistence, debounced autosave, StateFlow emissions, and test tags.',
      invariants: [
        {
          id: 'INV-ROOM-PERSISTENCE',
          category: 'DATA_PERSISTENCE',
          name: 'Room DB NoteEntity Persistence',
          preservationRule: 'All updates must flow through NoteRepository.saveNote(NoteEntity). Do not create in-memory mock lists.',
          criticality: 'FATAL',
          targetSymbols: ['com.claude.noteapp.data.NoteDao', 'com.claude.noteapp.data.NoteEntity'],
          verificationMechanism: { type: 'TEST_RUNNER', command: './gradlew testDebugUnitTest --tests NoteDaoTest' }
        },
        {
          id: 'INV-DEBOUNCE-AUTOSAVE',
          category: 'BEHAVIOR',
          name: '500ms Debounced Autosave',
          preservationRule: 'Text changes must trigger NoteEditorAction.OnTitleChanged / OnContentChanged; ViewModel debounces for exactly 500ms before executing save.',
          criticality: 'FATAL',
          targetSymbols: ['com.claude.noteapp.presentation.editor.NoteEditorViewModel.debounceMs'],
          verificationMechanism: { type: 'TEST_RUNNER', command: './gradlew testDebugUnitTest --tests NoteEditorViewModelTest' }
        },
        {
          id: 'INV-STATEFLOW-OBSERVATION',
          category: 'STATE_MANAGEMENT',
          name: 'ViewModel StateFlow uiState Observation',
          preservationRule: 'NoteEditorScreen must remain a pure composable accepting NoteEditorUiState and emitting NoteEditorAction. Do not instantiate ViewModel inside screen.',
          criticality: 'FATAL',
          targetSymbols: ['com.claude.noteapp.presentation.editor.NoteEditorViewModel.uiState'],
          verificationMechanism: { type: 'STATIC_AST_CHECK' }
        },
        {
          id: 'INV-TEST-TAGS-PRESERVATION',
          category: 'UI_TELEMETRY',
          name: 'NoteAppTestTags Layout Telemetry',
          preservationRule: 'All 11 NoteAppTestTags for note_editor must remain assigned to interactive and structural composables via Modifier.testTag().',
          criticality: 'FATAL',
          targetSymbols: ['com.claude.noteapp.presentation.NoteAppTestTags'],
          verificationMechanism: { type: 'TELEMETRY_CHECK', failOnMissing: true }
        }
      ],
      stateFlows: [
        {
          viewModelSymbol: 'com.claude.noteapp.presentation.editor.NoteEditorViewModel',
          propertyName: 'uiState',
          type: 'StateFlow<NoteEditorUiState>',
          innerType: 'NoteEditorUiState',
          observationPattern: 'collectAsStateWithLifecycle() in NavHost destination; passed as immutable value to NoteEditorScreen'
        }
      ],
      debounceDelays: [
        {
          action: 'scheduleAutosave',
          delayMs: 500,
          mechanism: 'Coroutine Job cancellation + delay(500L) in NoteEditorViewModel'
        }
      ],
      roomPersistence: [
        {
          daoSymbol: 'com.claude.noteapp.data.NoteDao',
          entitySymbol: 'com.claude.noteapp.data.NoteEntity',
          preservedQueries: [
            'SELECT * FROM notes ORDER BY isPinned DESC, timestamp DESC',
            'SELECT * FROM notes WHERE id = :id',
            'INSERT OR REPLACE INTO notes',
            'DELETE FROM notes WHERE id = :id'
          ]
        }
      ],
      requiredTestTags: [
        'screen_note_editor',
        'editor_back_button',
        'editor_pin_button',
        'editor_save_button',
        'editor_delete_button',
        'editor_title_input',
        'editor_content_input',
        'editor_tags_row',
        'editor_add_tag_button',
        'editor_add_tag_input',
        'editor_status_indicator'
      ]
    },
    layoutConstraints: {
      viewports: {
        portrait: { widthPx: 1184, heightPx: 1584, widthDp: 592, heightDp: 792, density: 2.0 },
        landscape: { widthPx: 1584, heightPx: 1184, widthDp: 792, heightDp: 592, density: 2.0 }
      },
      hardwareInsetPx: { left: 8, top: 8, right: 8, bottom: 8 },
      minTouchTarget: { widthDp: 48, heightDp: 48, widthPx: 96, heightPx: 96 },
      elementLayouts: [
        {
          sourceId: 'daylight#note_editor/top_bar',
          category: 'container',
          portraitBounds: { xDp: 0, yDp: 0, widthDp: 592, heightDp: 56 },
          landscapeBounds: { xDp: 0, yDp: 0, widthDp: 792, heightDp: 56 },
          sizing: { widthMode: 'FILL_PARENT', heightMode: 'FIXED', fixedHeightDp: 56 },
          topology: { flowType: 'ROW', alignment: 'Alignment.CenterVertically' }
        },
        {
          sourceId: 'daylight#note_editor/title_input',
          category: 'input',
          portraitBounds: { xDp: 24, yDp: 72, widthDp: 544, heightDp: 48 },
          landscapeBounds: { xDp: 48, yDp: 72, widthDp: 696, heightDp: 48 },
          sizing: { widthMode: 'FILL_PARENT', heightMode: 'INTRINSIC_WRAP' },
          topology: { flowType: 'BOX_OVERLAY' }
        },
        {
          sourceId: 'daylight#note_editor/tags_row',
          category: 'chip_list',
          portraitBounds: { xDp: 24, yDp: 128, widthDp: 544, heightDp: 36 },
          landscapeBounds: { xDp: 48, yDp: 128, widthDp: 696, heightDp: 36 },
          sizing: { widthMode: 'FILL_PARENT', heightMode: 'FIXED', fixedHeightDp: 36 },
          topology: { flowType: 'FLOW_ROW' }
        },
        {
          sourceId: 'daylight#note_editor/content_input',
          category: 'input',
          portraitBounds: { xDp: 24, yDp: 180, widthDp: 544, heightDp: 580 },
          landscapeBounds: { xDp: 48, yDp: 180, widthDp: 696, heightDp: 380 },
          sizing: { widthMode: 'FILL_PARENT', heightMode: 'FILL_PARENT' },
          topology: { flowType: 'BOX_OVERLAY' }
        }
      ]
    },
    verification: {
      buildCommands: [
        './gradlew compileDebugKotlin --no-daemon'
      ],
      unitTestCommands: [
        './gradlew testDebugUnitTest --no-daemon'
      ],
      ctcVerifyCommands: [
        `node bin/ctc.js verify --screen ${screenId} --profile daylight-dc1`
      ],
      failureBudgets: {
        maxSpatialDriftPx: 3.0,
        maxBaselineShiftPx: 2.0,
        minInkIoU: 0.85,
        minInkDice: 0.85,
        minNormalTextContrast: 7.0,
        minLargeTextContrast: 4.5,
        marginShiftHardVetoPx: 10.0
      },
      antiTamperingRule: 'CRITICAL INSTRUCTION: You MUST NOT modify verification thresholds, tolerance margins, test assertion values, or golden reference files to make test failures disappear. All verification failures must be resolved strictly through accurate Jetpack Compose layout, typography, token mapping, and state management in permitted files.'
    }
  };
}

/**
 * Generates an agent implementation packet in markdown, json, or both formats.
 *
 * @param {object} options
 * @param {string} [options.screenId='note_editor'] Target screen identifier
 * @param {object} options.migrationPlan Phased migration plan (REQUIRED)
 * @param {object} [options.correspondenceMap] Semantic correspondence map
 * @param {object} [options.designContract] 4-layer design contract IR
 * @param {object} [options.existingAppModel] Pre-retrofit AST app model
 * @param {string} [options.format='both'] Output format: 'markdown' | 'json' | 'both'
 * @returns {{ markdown?: string, json?: object }}
 * @throws {Error} If migrationPlan is missing or format is unsupported
 */
function generateImplementationPacket(options = {}) {
  // 1. Validate format first
  if (options && options.format !== undefined && options.format !== null) {
    const formatStr = String(options.format).toLowerCase();
    if (!['markdown', 'json', 'both'].includes(formatStr)) {
      throw new Error(`Unsupported format: received "${options.format}". Supported formats are "markdown", "json", or "both".`);
    }
  }

  // 2. Validate migrationPlan (REQUIRED)
  if (!options || options.migrationPlan === null || options.migrationPlan === undefined) {
    throw new Error('migrationPlan required: options.migrationPlan cannot be null or undefined');
  }

  // 3. Boundary validation and sanitization
  const boundaries = options.migrationPlan?.boundaries || options.migrationPlan || {};
  const allowed = boundaries.allowedModificationPaths || [];
  for (const p of allowed) {
    sanitizePath(p);
  }
  const rawForbidden = boundaries.forbiddenPaths;
  const forbidden = (Array.isArray(rawForbidden) && rawForbidden.length > 0)
    ? rawForbidden
    : DEFAULT_FORBIDDEN_PATHS;

  if (allowed.length > 0) {
    validateBoundaries({ allowed, forbidden });
  }

  const format = options.format ? String(options.format).toLowerCase() : 'both';

  const screenId = (typeof options.screenId === 'string' && options.screenId.trim().length > 0)
    ? options.screenId.trim()
    : (options.migrationPlan?.screenId || 'note_editor');

  const jsonPacket = buildJsonPacket(
    screenId,
    options.migrationPlan,
    options.correspondenceMap,
    options.designContract,
    options.existingAppModel
  );

  const markdownPacket = formatAgentPacketMarkdown(jsonPacket);

  if (format === 'markdown') {
    return { markdown: markdownPacket };
  }

  if (format === 'json') {
    return { json: jsonPacket };
  }

  return {
    markdown: markdownPacket,
    json: jsonPacket
  };
}

module.exports = {
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING,
  DEFAULT_FORBIDDEN_PATHS,
  sanitizePath,
  generateImplementationPacket
};
