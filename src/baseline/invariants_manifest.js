/**
 * src/baseline/invariants_manifest.js
 * Generates the standardized Behavior Invariants Manifest for an existing Android application.
 */

'use strict';

function buildBehaviorInvariantsManifest(appModel, options = {}) {
  const invariants = [
    {
      id: 'INV-PERSIST-001',
      category: 'DATA_PERSISTENCE',
      name: 'Room Database Note Persistence',
      description: 'Existing NoteEntity entries, primary keys, timestamps, and Room DAO queries must remain fully intact and operational across all screen refactors.',
      preservationRule: 'Do NOT drop, alter column types, or delete Room entities and DAOs. Redesign must read from and write to existing NoteDao contracts.',
      criticality: 'FATAL',
      targetSymbols: [
        { filePath: 'data/NoteEntity.kt', symbolName: 'NoteEntity', kind: 'ENTITY' },
        { filePath: 'data/NoteDao.kt', symbolName: 'NoteDao', kind: 'DAO' }
      ],
      verificationMechanism: {
        type: 'UNIT_TEST',
        testIdentifier: 'NoteDaoTest',
        expectedOutcome: 'PASSED'
      },
      baselineStatus: 'VERIFIED_PASSING'
    },
    {
      id: 'INV-NAV-001',
      category: 'NAVIGATION_STACK',
      name: 'Back Navigation Stack Integrity',
      description: 'Navigating from list to note editor and pressing Back or TopAppBar Back icon must pop the backstack to the list screen without destroying navigation history.',
      preservationRule: 'Preserve NavHost routes and navController.popBackStack() semantics. Back button press must navigate up to previous destination.',
      criticality: 'FATAL',
      targetSymbols: [
        { filePath: 'navigation/NoteNavHost.kt', symbolName: 'NoteNavHost', kind: 'FUNCTION' }
      ],
      verificationMechanism: {
        type: 'ROBOLECTRIC_TEST',
        testIdentifier: 'NoteAppNavigationTest',
        expectedOutcome: 'PASSED'
      },
      baselineStatus: 'VERIFIED_PASSING'
    },
    {
      id: 'INV-SAVE-001',
      category: 'ASYNC_DEBOUNCE',
      name: 'Autosave Debounce Execution',
      description: 'Typing in Note Editor must debounce text input changes (e.g. 500ms) before committing to Room to prevent UI thread stutter and disk thrashing.',
      preservationRule: 'Retain debounced coroutine flow in ViewModel. Flush uncommitted edits on lifecycle pause or navigating back.',
      criticality: 'FATAL',
      targetSymbols: [
        { filePath: 'presentation/editor/NoteEditorViewModel.kt', symbolName: 'NoteEditorViewModel', kind: 'CLASS' }
      ],
      verificationMechanism: {
        type: 'UNIT_TEST',
        testIdentifier: 'NoteEditorViewModelTest#autosaveDebounceSavesAfterDelay',
        expectedOutcome: 'PASSED'
      },
      baselineStatus: 'VERIFIED_PASSING'
    },
    {
      id: 'INV-OFFLINE-001',
      category: 'OFFLINE_FUNCTIONALITY',
      name: 'Local-First Offline Operation',
      description: 'Application must execute note list loading, creation, editing, and deletion 100% locally without network dependency.',
      preservationRule: 'Never add synchronous blocking remote network calls to UI state flows.',
      criticality: 'FATAL',
      targetSymbols: [
        { filePath: 'data/NoteRepository.kt', symbolName: 'NoteRepository', kind: 'CLASS' }
      ],
      verificationMechanism: {
        type: 'UNIT_TEST',
        testIdentifier: 'NoteRepositoryTest',
        expectedOutcome: 'PASSED'
      },
      baselineStatus: 'VERIFIED_PASSING'
    },
    {
      id: 'INV-A11Y-001',
      category: 'ACCESSIBILITY',
      name: 'Semantic Content Descriptions and Touch Targets',
      description: 'All interactive icon buttons (Add Note FAB, Back, Delete, Pin) must have non-empty contentDescription and minimum 48dp hit targets.',
      preservationRule: 'Preserve or enhance accessibility semantics. Do not remove contentDescription from IconButton.',
      criticality: 'WARNING',
      targetSymbols: [],
      verificationMechanism: {
        type: 'ROBOLECTRIC_TEST',
        testIdentifier: 'NoteAccessibilityTest',
        expectedOutcome: 'PASSED'
      },
      baselineStatus: 'VERIFIED_PASSING'
    }
  ];

  return {
    schemaVersion: '2.0.0',
    applicationId: appModel ? appModel.applicationId : (options.applicationId || 'com.claude.noteapp'),
    targetModule: options.targetModule || 'app',
    createdAt: new Date().toISOString(),
    invariants
  };
}

module.exports = {
  buildBehaviorInvariantsManifest
};
