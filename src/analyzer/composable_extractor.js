/**
 * src/analyzer/composable_extractor.js
 * Extracts @Composable functions, parameters, slot lambdas, previews, and call trees.
 */

'use strict';

const { isComposable, isPreview, classifyParameter } = require('./ast_symbols');

function extractComposables(astFile) {
  const composables = [];
  const previewMap = new Map(); // Composable Name -> Preview Name

  // Pass 1: Find previews and map them
  for (const decl of astFile.declarations) {
    if (decl.type === 'FunctionDeclaration' && isComposable(decl) && isPreview(decl)) {
      // Find invocations inside preview body
      const bodyText = (decl.bodyTokens || []).map(t => t.value).join(' ');
      previewMap.set(decl.name, decl.name);
    }
  }

  // Pass 2: Extract all @Composable functions
  for (const decl of astFile.declarations) {
    if (decl.type === 'FunctionDeclaration' && isComposable(decl)) {
      const isExt = decl.receiver !== null;
      const parameters = (decl.parameters || []).map(classifyParameter);

      // Find preview function invoking this composable if any
      let associatedPreview = null;
      if (isPreview(decl)) {
        associatedPreview = decl.name;
      } else {
        for (const [previewName, _] of previewMap.entries()) {
          const previewDecl = astFile.declarations.find(d => d.name === previewName);
          if (previewDecl) {
            const bodyTokens = previewDecl.bodyTokens || [];
            if (bodyTokens.some(t => t.value === decl.name)) {
              associatedPreview = previewName;
              break;
            }
          }
        }
      }

      // Build call tree and collect call names from body tokens
      const callTree = buildCallTree(decl.bodyTokens || []);
      const testTags = extractTestTagsFromBody(decl.bodyTokens || []);

      const symbol = `${astFile.package ? astFile.package + '.' : ''}${decl.name}`;

      composables.push({
        symbol,
        filePath: astFile.filePath,
        composableName: decl.name,
        visibility: decl.modifiers.find(m => ['public', 'private', 'protected', 'internal'].includes(m)) || 'public',
        isExtension: isExt,
        receiverType: decl.receiver,
        parameters,
        previewComposable: associatedPreview,
        testTags,
        callTree,
        modifierChains: []
      });
    }
  }

  return composables;
}

function extractTestTagsFromBody(tokens) {
  const tags = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.value === 'testTag') {
      if (tokens[i + 1] && tokens[i + 1].value === '(') {
        const tagTokens = [];
        let depth = 1;
        let j = i + 2;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].value === '(') depth++;
          else if (tokens[j].value === ')') {
            depth--;
            if (depth === 0) break;
          }
          tagTokens.push(tokens[j]);
          j++;
        }

        let tagExpr = '';
        for (let k = 0; k < tagTokens.length; k++) {
          const val = tagTokens[k].value;
          if (k > 0 && val !== '.' && tagTokens[k - 1].value !== '.') {
            tagExpr += ' ';
          }
          tagExpr += val;
        }
        tagExpr = tagExpr.trim();

        if ((tagExpr.startsWith('"') && tagExpr.endsWith('"')) || (tagExpr.startsWith("'") && tagExpr.endsWith("'"))) {
          tagExpr = tagExpr.slice(1, -1);
        }
        if (tagExpr) {
          tags.add(tagExpr);
        }
      }
    }
  }
  return Array.from(tags);
}

function buildCallTree(tokens) {
  const root = { name: 'Root', children: [] };
  const KNOWN_COMPONENTS = new Set([
    'Scaffold', 'TopAppBar', 'CenterAlignedTopAppBar', 'Column', 'Row', 'Box',
    'LazyColumn', 'LazyRow', 'LazyVerticalGrid', 'Card', 'OutlinedCard', 'ElevatedCard',
    'Text', 'TextField', 'OutlinedTextField', 'Button', 'IconButton', 'FloatingActionButton',
    'Icon', 'Spacer', 'Divider', 'HorizontalDivider', 'Surface', 'FilterChip', 'InputChip', 'AssistChip',
    'AlertDialog', 'CircularProgressIndicator', 'LinearProgressIndicator'
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'IDENTIFIER' && (KNOWN_COMPONENTS.has(t.value) || /^[A-Z][a-zA-Z0-9]+$/.test(t.value))) {
      // Check if next token is '(' or '{'
      if (tokens[i + 1] && (tokens[i + 1].value === '(' || tokens[i + 1].value === '{')) {
        root.children.push({
          component: t.value,
          line: t.line || 1
        });
      }
    }
  }

  return root;
}

module.exports = {
  extractComposables,
  extractTestTagsFromBody,
  buildCallTree
};
