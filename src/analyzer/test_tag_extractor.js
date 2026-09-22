/**
 * src/analyzer/test_tag_extractor.js
 * Scans Kotlin AST for test tag constant definitions and Modifier.testTag(...) invocations.
 */

'use strict';

function extractTestTagConstants(astFiles) {
  const constantMap = new Map(); // Tag Constant Identifier -> String Value

  for (const astFile of astFiles) {
    for (const decl of astFile.declarations) {
      if (decl.type === 'ClassDeclaration' && decl.kind === 'object') {
        const isTagCatalog = decl.name.includes('Tag') || decl.name.includes('TestTags');
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'PropertyDeclaration') {
            const initTokens = member.initializerTokens || [];
            const strToken = initTokens.find(t => t.type === 'STRING_LITERAL');
            if (strToken) {
              const fullKey = `${decl.name}.${member.name}`;
              constantMap.set(fullKey, strToken.value);
              constantMap.set(member.name, strToken.value);
            }
          }
        }
      }
    }
  }

  return constantMap;
}

function extractAllTestTags(astFiles) {
  const constantMap = extractTestTagConstants(astFiles);
  const foundTags = new Set();

  for (const astFile of astFiles) {
    const tokenLists = [];
    for (const decl of astFile.declarations) {
      if (decl.bodyTokens && decl.bodyTokens.length > 0) {
        tokenLists.push(decl.bodyTokens);
      }
    }
    if (astFile.tokens && astFile.tokens.length > 0) {
      tokenLists.push(astFile.tokens);
    }

    for (const tokens of tokenLists) {
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].value === 'testTag') {
          if (tokens[i + 1] && tokens[i + 1].value === '(') {
            let j = i + 2;
            let depth = 1;
            let expr = '';
            const argTokens = [];
            while (j < tokens.length && depth > 0) {
              if (tokens[j].value === '(') depth++;
              else if (tokens[j].value === ')') depth--;
              if (depth > 0) {
                argTokens.push(tokens[j]);
                expr += (expr.length > 0 && !'.,()[]$'.includes(tokens[j].value) ? ' ' : '') + tokens[j].value;
              }
              j++;
            }
            expr = expr.trim();
            if (argTokens.length === 1 && argTokens[0].type === 'STRING_LITERAL') {
              foundTags.add(argTokens[0].value);
            } else if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
              foundTags.add(expr.slice(1, -1));
            } else if (constantMap.has(expr)) {
              foundTags.add(constantMap.get(expr));
            } else {
              // Could be template expression like "${NoteAppTestTags.NOTE_CARD_PREFIX}${note.id}"
              let resolved = expr;
              for (const [k, v] of constantMap.entries()) {
                if (resolved.includes(k)) {
                  resolved = resolved.split(k).join(v);
                }
              }
              // Clean up template syntax e.g. "${foo}${bar}"
              resolved = resolved.replace(/[\$\{\}\"\+]/g, '').trim();
              if (resolved) {
                foundTags.add(resolved);
              }
            }
          }
        }
      }
    }
  }

  // Also include all declared constants from tag catalogs
  for (const [_, val] of constantMap.entries()) {
    foundTags.add(val);
  }

  return Array.from(foundTags).sort();
}

module.exports = {
  extractTestTagConstants,
  extractAllTestTags
};
