'use strict';

/**
 * tests/e2e/tier1_features/f02_ast_parser.test.js
 * Feature 2: Kotlin/Compose Syntax-Aware AST Parser
 */

module.exports = {
  name: 'Feature 02: Kotlin/Compose Syntax-Aware AST Parser',
  tests: [
    {
      id: 'F02-T1',
      name: 'AST parser module exists and exposes parseKotlinSource API',
      fn(t) {
        t.checkComponent('Kotlin AST Parser Module', 'M1', () => {
          t.checkFileExists('src/analyzer/parser.js', 'M1');
          const parser = require('../../../src/analyzer/parser');
          t.assert(typeof parser.parseKotlinSource === 'function' || typeof parser.parseAndroidProject === 'function');
        });
      }
    },
    {
      id: 'F02-T2',
      name: 'AST parser extracts @Composable functions and parameter signatures',
      fn(t) {
        t.checkComponent('Composable Function Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const sampleKotlin = `
            package com.example.notes.ui
            import androidx.compose.runtime.Composable
            @Composable
            fun SampleScreen(title: String, onBackClick: () -> Unit) {}
          `;
          const result = parser.parseKotlinSource(sampleKotlin);
          t.assert(result && result.composables && result.composables.length > 0);
          t.assertEqual(result.composables[0].name, 'SampleScreen');
          t.assert(result.composables[0].parameters.some(p => p.name === 'title'));
        });
      }
    },
    {
      id: 'F02-T3',
      name: 'AST parser identifies StateFlow properties and event lambdas in ViewModels',
      fn(t) {
        t.checkComponent('ViewModel StateFlow Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const sampleVm = `
            class SampleViewModel : ViewModel() {
              val uiState: StateFlow<UiState> = _uiState.asStateFlow()
              fun onTitleChange(title: String) {}
            }
          `;
          const result = parser.parseKotlinSource(sampleVm);
          t.assert(result && result.stateHolders && result.stateHolders.length > 0);
          t.assert(result.stateHolders[0].stateFlows.some(s => s.name === 'uiState'));
        });
      }
    },
    {
      id: 'F02-T4',
      name: 'AST parser extracts Navigation route declarations and destinations',
      fn(t) {
        t.checkComponent('Navigation Route Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const sampleNav = `
            composable("note_editor/{noteId}") {
              NoteEditorScreen()
            }
          `;
          const result = parser.parseKotlinSource(sampleNav);
          t.assert(result && result.routes && result.routes.length > 0);
          t.assertEqual(result.routes[0].route, 'note_editor/{noteId}');
        });
      }
    },
    {
      id: 'F02-T5',
      name: 'AST parser extracts UI test tags from Modifier.testTag()',
      fn(t) {
        t.checkComponent('UI Test Tag Extraction', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const sampleTag = `
            BasicTextField(
              value = text,
              modifier = Modifier.testTag("daylight#editor/title_input")
            )
          `;
          const result = parser.parseKotlinSource(sampleTag);
          t.assert(result && result.testTags && result.testTags.includes('daylight#editor/title_input'));
        });
      }
    }
  ]
};
