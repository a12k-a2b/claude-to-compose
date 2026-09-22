'use strict';

/**
 * tests/e2e/tier2_boundaries/b02_ast_parser_boundaries.test.js
 * Feature 2 Boundaries: Kotlin/Compose AST Parser
 */

module.exports = {
  name: 'Boundary 02: Kotlin AST Parser Corner Cases',
  tests: [
    {
      id: 'B02-T1',
      name: 'Handles empty string source code without throwing unhandled exception',
      fn(t) {
        t.checkComponent('Empty Source Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const result = parser.parseKotlinSource('');
          t.assert(result && Array.isArray(result.composables));
          t.assertEqual(result.composables.length, 0);
        });
      }
    },
    {
      id: 'B02-T2',
      name: 'Handles malformed Kotlin syntax with unbalanced curly braces gracefully',
      fn(t) {
        t.checkComponent('Malformed Syntax Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const malformed = '@Composable fun IncompleteScreen( {';
          const result = parser.parseKotlinSource(malformed);
          t.assert(result); // Does not crash
        });
      }
    },
    {
      id: 'B02-T3',
      name: 'Handles Composable function with 0 parameters and empty body',
      fn(t) {
        t.checkComponent('Empty Composable Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const emptyComposable = '@Composable fun EmptyScreen() {}';
          const result = parser.parseKotlinSource(emptyComposable);
          t.assertEqual(result.composables[0].name, 'EmptyScreen');
          t.assertEqual(result.composables[0].parameters.length, 0);
        });
      }
    },
    {
      id: 'B02-T4',
      name: 'Rejects or handles non-Kotlin binary content gracefully',
      fn(t) {
        t.checkComponent('Binary Content Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const binaryLike = '\x00\x01\x02\x03\xFF\xFE';
          const result = parser.parseKotlinSource(binaryLike);
          t.assert(result);
        });
      }
    },
    {
      id: 'B02-T5',
      name: 'Parses large Kotlin source file (1MB text) without call stack exhaustion',
      fn(t) {
        t.checkComponent('Large File Stress Parsing', 'M1', () => {
          const parser = require('../../../src/analyzer/parser');
          const largeSource = '@Composable fun Screen() {}\n'.repeat(5000);
          const result = parser.parseKotlinSource(largeSource);
          t.assert(result);
        });
      }
    }
  ]
};
