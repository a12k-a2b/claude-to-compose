/**
 * src/analyzer/java_parser.js
 * Scans Java source files (.java) in mixed Java/Kotlin projects for Room entities,
 * DAOs, Databases, and Repositories, preserving full persistence metadata.
 */

'use strict';

function parseJavaFile(content, filePath = '<anonymous>') {
  const declarations = [];
  const diagnostics = [];

  // Package extraction
  const packageMatch = content.match(/package\s+([a-zA-Z0-9_.]+)\s*;/);
  const packageName = packageMatch ? packageMatch[1] : '';

  // Class / interface extraction
  const classRegex = /(@[A-Za-z0-9_]+(?:\([^)]*\))?\s+)*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|static\s+|final\s+)*(class|interface)\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_.]+))?(?:\s+implements\s+([A-Za-z0-9_.,\s]+))?\s*\{/g;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const rawAnnots = match[1] || '';
    const kind = match[2];
    const name = match[3];
    const extendsType = match[4] || null;
    const implementsTypes = match[5] ? match[5].split(',').map(s => s.trim()) : [];

    const annotations = parseJavaAnnotations(rawAnnots);
    const superTypes = [];
    if (extendsType) superTypes.push(extendsType);
    if (implementsTypes.length > 0) superTypes.push(...implementsTypes);

    // Extract body between { and matching }
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(content, openBrace);
    const bodyContent = closeBrace !== -1 ? content.slice(openBrace + 1, closeBrace) : '';

    const bodyDeclarations = parseJavaMembers(bodyContent);

    declarations.push({
      type: 'ClassDeclaration',
      kind,
      name,
      annotations,
      modifiers: [],
      constructorParams: [],
      superTypes,
      bodyDeclarations,
      line: getLineNumber(content, match.index)
    });
  }

  return {
    filePath,
    package: packageName,
    imports: [],
    declarations,
    diagnostics
  };
}

function parseJavaAnnotations(annotStr) {
  const list = [];
  const annotRegex = /@([A-Za-z0-9_]+)(?:\(([^)]*)\))?/g;
  let m;
  while ((m = annotRegex.exec(annotStr)) !== null) {
    list.push({
      name: m[1],
      args: m[2] || null,
      line: 1
    });
  }
  return list;
}

function findMatchingBrace(content, openPos) {
  let depth = 1;
  for (let i = openPos + 1; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function parseJavaMembers(body) {
  const members = [];

  // Methods with annotations e.g. @Query("SELECT * FROM...") List<Note> getAll();
  const methodRegex = /(@[A-Za-z0-9_]+(?:\([^)]*\))?\s+)*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|static\s+|final\s+)*([A-Za-z0-9_<>,.\s]+)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?:throws\s+[A-Za-z0-9_,\s]+)?(?:\s*\{|\s*;)/g;

  let m;
  while ((m = methodRegex.exec(body)) !== null) {
    const rawAnnots = m[1] || '';
    const returnType = (m[2] || '').trim();
    const methodName = m[3];
    const rawParams = m[4] || '';

    // Ignore if keyword or constructor
    if (['class', 'interface', 'new', 'return'].includes(methodName)) continue;

    const annotations = parseJavaAnnotations(rawAnnots);
    const parameters = rawParams
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(p => {
        const parts = p.split(/\s+/);
        return {
          name: parts[parts.length - 1],
          type: parts.slice(0, parts.length - 1).join(' ') || 'Object'
        };
      });

    members.push({
      type: 'FunctionDeclaration',
      name: methodName,
      receiver: null,
      annotations,
      modifiers: [],
      parameters,
      returnType,
      bodyTokens: []
    });
  }

  // Field declarations e.g. @PrimaryKey public long id;
  const fieldRegex = /(@[A-Za-z0-9_]+(?:\([^)]*\))?\s+)*(?:public\s+|protected\s+|private\s+)?(?:final\s+)?([A-Za-z0-9_<>,.]+)\s+([A-Za-z0-9_]+)\s*;/g;
  let f;
  while ((f = fieldRegex.exec(body)) !== null) {
    const rawAnnots = f[1] || '';
    const fieldType = f[2];
    const fieldName = f[3];

    members.push({
      type: 'PropertyDeclaration',
      name: fieldName,
      propertyType: fieldType,
      annotations: parseJavaAnnotations(rawAnnots),
      modifiers: [],
      initializerTokens: []
    });
  }

  return members;
}

module.exports = {
  parseJavaFile
};
