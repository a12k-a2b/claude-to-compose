/**
 * src/analyzer/kotlin_parser.js
 * Fault-tolerant Kotlin CST/AST parser with pre-computed delimiter synchronization.
 */

'use strict';

class KotlinParser {
  constructor(tokens, filePath = '<anonymous>') {
    this.tokens = tokens || [];
    this.filePath = filePath;
    this.pos = 0;
    this.delimiterMap = new Map(); // Open Token Index -> Close Token Index
    this.diagnostics = [];
    this.buildDelimiterMap();
  }

  buildDelimiterMap() {
    const stack = [];
    for (let i = 0; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === 'DELIMITER') {
        if ('({['.includes(t.value)) {
          stack.push({ char: t.value, index: i });
        } else if (')}]'.includes(t.value)) {
          if (stack.length > 0) {
            const top = stack[stack.length - 1];
            if (
              (top.char === '(' && t.value === ')') ||
              (top.char === '{' && t.value === '}') ||
              (top.char === '[' && t.value === ']')
            ) {
              stack.pop();
              this.delimiterMap.set(top.index, i);
              this.delimiterMap.set(i, top.index);
            }
          }
        }
      }
    }
  }

  parseFile() {
    let packageName = '';
    const imports = [];
    const declarations = [];

    while (!this.isAtEnd()) {
      try {
        if (this.checkKeyword('package')) {
          packageName = this.parsePackage();
          continue;
        }

        if (this.checkKeyword('import')) {
          imports.push(this.parseImport());
          continue;
        }

        const decl = this.parseDeclaration();
        if (decl) {
          declarations.push(decl);
        } else {
          this.advance(); // Safely skip unhandled token
        }
      } catch (err) {
        this.diagnostics.push({
          severity: 'WARNING',
          filePath: this.filePath,
          line: this.peek().line || 1,
          column: this.peek().column || 1,
          message: `Parser recovered from error: ${err.message}`
        });
        this.synchronizeToNextDeclaration();
      }
    }

    return {
      filePath: this.filePath,
      package: packageName,
      imports,
      declarations,
      diagnostics: this.diagnostics
    };
  }

  parsePackage() {
    const startLine = this.peek().line;
    this.consumeKeyword('package');
    let pkg = '';
    while (!this.isAtEnd() && this.peek().line === startLine && !this.checkOperator(';') && !this.isDeclarationBoundary()) {
      const t = this.peek();
      if (t.type === 'IDENTIFIER' || t.type === 'KEYWORD' || t.value === '.') {
        pkg += this.advance().value;
      } else {
        break;
      }
    }
    if (this.checkOperator(';')) this.consumeOperator(';');
    return pkg;
  }

  parseImport() {
    const startLine = this.peek().line;
    this.consumeKeyword('import');
    let importedSymbol = '';
    let alias = null;

    while (!this.isAtEnd() && this.peek().line === startLine && !this.checkOperator(';') && !this.isDeclarationBoundary()) {
      if (this.checkKeyword('as')) {
        this.consumeKeyword('as');
        if (this.peek().type === 'IDENTIFIER') {
          alias = this.consumeIdentifier();
        }
        break;
      }
      const t = this.peek();
      if (t.type === 'IDENTIFIER' || t.type === 'KEYWORD' || t.value === '.' || t.value === '*') {
        importedSymbol += this.advance().value;
      } else {
        break;
      }
    }

    if (this.checkOperator(';')) this.consumeOperator(';');

    return {
      symbol: importedSymbol,
      alias,
      isWildcard: importedSymbol.endsWith('.*')
    };
  }

  parseDeclaration() {
    const annotations = this.collectAnnotations();
    const modifiers = this.collectModifiers();

    const token = this.peek();
    if (!token) return null;

    if (token.type === 'KEYWORD') {
      if (token.value === 'fun') {
        return this.parseFunctionDeclaration(annotations, modifiers);
      }
      if (['class', 'interface', 'object'].includes(token.value)) {
        return this.parseClassDeclaration(annotations, modifiers, token.value);
      }
      if (['val', 'var'].includes(token.value)) {
        return this.parsePropertyDeclaration(annotations, modifiers, token.value);
      }
      if (token.value === 'typealias') {
        return this.parseTypeAliasDeclaration(annotations, modifiers);
      }
    }

    return null;
  }

  parseFunctionDeclaration(annotations, modifiers) {
    this.consumeKeyword('fun');

    // Type parameters e.g. <T>
    let typeParameters = null;
    if (this.checkOperator('<')) {
      typeParameters = this.parseTypeParameters();
    }

    let receiver = null;
    let name = '';
    if (this.peek().type === 'IDENTIFIER') {
      name = this.consumeIdentifier();
    } else {
      name = this.advance().value;
    }

    // Check if extension function e.g. Modifier.padding()
    if (this.checkOperator('.')) {
      this.consumeOperator('.');
      receiver = name;
      if (this.peek().type === 'IDENTIFIER') {
        name = this.consumeIdentifier();
      }
    }

    // Parameters
    const parameters = [];
    if (this.checkDelimiter('(')) {
      const openIdx = this.pos;
      const closeIdx = this.delimiterMap.get(openIdx);
      this.consumeDelimiter('(');

      while (!this.checkDelimiter(')') && !this.isAtEnd()) {
        const param = this.parseParameter();
        if (param) parameters.push(param);
        if (this.checkOperator(',')) this.consumeOperator(',');
      }
      this.consumeDelimiter(')');
    }

    // Return Type
    let returnType = 'Unit';
    if (this.checkOperator(':')) {
      this.consumeOperator(':');
      returnType = this.parseTypeReference();
    }

    // Body
    let bodyTokens = [];
    let isExpressionBody = false;
    if (this.checkDelimiter('{')) {
      const openIdx = this.pos;
      const closeIdx = this.delimiterMap.get(openIdx);
      if (closeIdx !== undefined) {
        bodyTokens = this.tokens.slice(openIdx, closeIdx + 1);
        this.pos = closeIdx + 1;
      } else {
        // Unclosed brace fallback: consume up to declaration boundary
        this.consumeDelimiter('{');
        while (!this.isAtEnd() && !this.isDeclarationBoundary()) {
          bodyTokens.push(this.advance());
        }
      }
    } else if (this.checkOperator('=')) {
      isExpressionBody = true;
      this.consumeOperator('=');
      while (!this.isAtEnd() && !this.isDeclarationBoundary()) {
        bodyTokens.push(this.advance());
      }
    }

    return {
      type: 'FunctionDeclaration',
      name,
      receiver,
      typeParameters,
      annotations,
      modifiers,
      parameters,
      returnType,
      bodyTokens,
      isExpressionBody,
      line: annotations[0]?.line || this.peek().line || 1
    };
  }

  parseClassDeclaration(annotations, modifiers, kind) {
    this.consumeKeyword(kind);
    let name = '';
    if (this.peek().type === 'IDENTIFIER') {
      name = this.consumeIdentifier();
    }

    // Generic type parameters e.g. <T : Any>
    let typeParameters = null;
    if (this.checkOperator('<')) {
      typeParameters = this.parseTypeParameters();
    }

    // Primary constructor parameters
    const constructorParams = [];
    if (this.checkDelimiter('(')) {
      this.consumeDelimiter('(');
      while (!this.checkDelimiter(')') && !this.isAtEnd()) {
        const param = this.parseParameter();
        if (param) constructorParams.push(param);
        if (this.checkOperator(',')) this.consumeOperator(',');
      }
      this.consumeDelimiter(')');
    }

    // Super types
    const superTypes = [];
    if (this.checkOperator(':')) {
      this.consumeOperator(':');
      let currentType = '';
      let depth = 0;
      while (!this.isAtEnd() && !this.isDeclarationBoundary()) {
        const t = this.peek();
        if (t.value === '{' && depth === 0) break;
        if ('({<['.includes(t.value)) depth++;
        else if (')}>]'.includes(t.value)) depth--;

        if (t.value === ',' && depth === 0) {
          if (currentType.trim()) superTypes.push(currentType.trim());
          currentType = '';
          this.advance();
          continue;
        }

        currentType += (currentType.length > 0 && !'.,()[]<>'.includes(t.value) ? ' ' : '') + t.value;
        this.advance();
      }
      if (currentType.trim()) superTypes.push(currentType.trim());
    }

    // Class body
    const bodyDeclarations = [];
    if (this.checkDelimiter('{')) {
      const openIdx = this.pos;
      const closeIdx = this.delimiterMap.get(openIdx);
      this.consumeDelimiter('{');

      if (closeIdx !== undefined) {
        while (this.pos < closeIdx && !this.isAtEnd()) {
          const member = this.parseDeclaration();
          if (member) {
            bodyDeclarations.push(member);
          } else {
            this.advance();
          }
        }
        this.pos = closeIdx + 1;
      } else {
        while (!this.isAtEnd() && !this.isDeclarationBoundary()) {
          const member = this.parseDeclaration();
          if (member) {
            bodyDeclarations.push(member);
          } else {
            this.advance();
          }
        }
      }
    }

    return {
      type: 'ClassDeclaration',
      kind,
      name,
      typeParameters,
      annotations,
      modifiers,
      constructorParams,
      superTypes,
      bodyDeclarations,
      line: annotations[0]?.line || this.peek().line || 1
    };
  }

  parsePropertyDeclaration(annotations, modifiers, valOrVar) {
    this.consumeKeyword(valOrVar);
    let name = '';
    if (this.peek().type === 'IDENTIFIER') {
      name = this.consumeIdentifier();
    }

    let propertyType = null;
    if (this.checkOperator(':')) {
      this.consumeOperator(':');
      propertyType = this.parseTypeReference();
    }

    let initializerTokens = [];
    let isDelegated = false;

    if (this.checkKeyword('by')) {
      isDelegated = true;
      this.consumeKeyword('by');
      while (!this.isAtEnd() && !this.isDeclarationBoundary() && !this.checkOperator(';')) {
        initializerTokens.push(this.advance());
      }
    } else if (this.checkOperator('=')) {
      this.consumeOperator('=');
      while (!this.isAtEnd() && !this.isDeclarationBoundary() && !this.checkOperator(';')) {
        initializerTokens.push(this.advance());
      }
    }

    if (this.checkOperator(';')) this.consumeOperator(';');

    return {
      type: 'PropertyDeclaration',
      name,
      propertyType,
      valOrVar,
      isDelegated,
      annotations,
      modifiers,
      initializerTokens,
      line: annotations[0]?.line || this.peek().line || 1
    };
  }

  parseTypeAliasDeclaration(annotations, modifiers) {
    this.consumeKeyword('typealias');
    const name = this.consumeIdentifier();
    let targetType = '';
    if (this.checkOperator('=')) {
      this.consumeOperator('=');
      targetType = this.parseTypeReference();
    }
    return {
      type: 'TypeAliasDeclaration',
      name,
      targetType,
      annotations,
      modifiers
    };
  }

  parseParameter() {
    const annotations = this.collectAnnotations();
    const modifiers = this.collectModifiers();
    let isVal = false;
    let isVar = false;

    if (this.checkKeyword('val')) { this.advance(); isVal = true; }
    else if (this.checkKeyword('var')) { this.advance(); isVar = true; }

    const name = this.peek().type === 'IDENTIFIER' ? this.consumeIdentifier() : this.advance().value;
    let type = 'Any';
    let defaultValue = null;

    if (this.checkOperator(':')) {
      this.consumeOperator(':');
      type = this.parseTypeReference();
    }

    if (this.checkOperator('=')) {
      this.consumeOperator('=');
      defaultValue = this.parseDefaultValueExpression();
    }

    return {
      name,
      type,
      defaultValue,
      isVal,
      isVar,
      annotations,
      modifiers
    };
  }

  parseTypeReference() {
    let typeStr = '';
    let depth = 0;

    while (!this.isAtEnd()) {
      const t = this.peek();
      if (depth === 0) {
        if (['=', ',', ')', '{', '}', ';'].includes(t.value)) break;
        if (
          t.type === 'KEYWORD' &&
          ['fun', 'val', 'var', 'class', 'interface', 'object', 'override', 'abstract', 'suspend', 'private', 'public'].includes(t.value)
        ) {
          break;
        }
      }

      if (t.type === 'ANNOTATION') {
        typeStr += (typeStr.length > 0 && !typeStr.endsWith(' ') ? ' ' : '') + '@' + t.value + ' ';
        this.advance();
        continue;
      }

      if (t.value === '<' || t.value === '(' || t.value === '[') depth++;
      else if (t.value === '>' || t.value === ')' || t.value === ']') {
        depth--;
        if (depth < 0) break;
      }

      typeStr += (typeStr.length > 0 && !'.,()[]<>?'.includes(t.value) && !typeStr.endsWith('@') && !typeStr.endsWith(' ') ? ' ' : '') + t.value;
      this.advance();
    }

    return typeStr.trim();
  }

  parseDefaultValueExpression() {
    let expr = '';
    let depth = 0;

    while (!this.isAtEnd()) {
      const t = this.peek();
      if ((t.value === ',' || t.value === ')') && depth === 0) break;

      if ('({['.includes(t.value)) depth++;
      else if (')}]'.includes(t.value)) depth--;

      expr += (expr.length > 0 && !'.,()[]'.includes(t.value) ? ' ' : '') + t.value;
      this.advance();
    }

    return expr.trim();
  }

  parseTypeParameters() {
    this.consumeOperator('<');
    let depth = 1;
    let params = '';
    while (!this.isAtEnd() && depth > 0) {
      const t = this.advance();
      if (t.value === '<') depth++;
      else if (t.value === '>') depth--;
      if (depth > 0) params += t.value;
    }
    return params.trim();
  }

  synchronizeToNextDeclaration() {
    while (!this.isAtEnd()) {
      if (this.isDeclarationBoundary()) return;
      this.advance();
    }
  }

  isDeclarationBoundary() {
    const t = this.peek();
    if (!t) return true;
    if (t.type === 'ANNOTATION') return true;
    if (t.type === 'KEYWORD' && ['fun', 'class', 'interface', 'object', 'val', 'var', 'package', 'import'].includes(t.value)) {
      return true;
    }
    return false;
  }

  collectAnnotations() {
    const list = [];
    while (this.peek()?.type === 'ANNOTATION') {
      const annot = this.advance();
      let args = null;
      if (this.checkDelimiter('(')) {
        const openIdx = this.pos;
        const closeIdx = this.delimiterMap.get(openIdx);
        if (closeIdx) {
          args = this.tokens
            .slice(openIdx + 1, closeIdx)
            .map(x => (x.type === 'STRING_LITERAL' ? `"${x.value}"` : x.value))
            .join(' ');
          this.pos = closeIdx + 1;
        }
      }
      list.push({ name: annot.value, args, line: annot.line });
    }
    return list;
  }

  collectModifiers() {
    const mods = [];
    const MOD_KEYWORDS = [
      'sealed', 'data', 'abstract', 'open', 'override', 'private',
      'protected', 'public', 'internal', 'suspend', 'inline', 'companion', 'const'
    ];
    while (this.peek()?.type === 'KEYWORD' && MOD_KEYWORDS.includes(this.peek().value)) {
      mods.push(this.advance().value);
    }
    return mods;
  }

  peek(offset = 0) { return this.tokens[this.pos + offset] || { type: 'EOF', value: '' }; }
  isAtEnd() { return this.pos >= this.tokens.length || this.peek().type === 'EOF'; }
  advance() { return this.tokens[this.pos++]; }
  checkKeyword(kw) { return this.peek().type === 'KEYWORD' && this.peek().value === kw; }
  consumeKeyword(kw) { if (this.checkKeyword(kw)) return this.advance().value; throw new Error(`Expected keyword ${kw}`); }
  consumeIdentifier() { if (this.peek().type === 'IDENTIFIER') return this.advance().value; throw new Error(`Expected identifier at line ${this.peek().line}`); }
  checkDelimiter(d) { return this.peek().type === 'DELIMITER' && this.peek().value === d; }
  consumeDelimiter(d) { if (this.checkDelimiter(d)) return this.advance().value; throw new Error(`Expected delimiter ${d}`); }
  checkOperator(op) { return this.peek().type === 'OPERATOR' && this.peek().value === op; }
  consumeOperator(op) { if (this.checkOperator(op)) return this.advance().value; throw new Error(`Expected operator ${op}`); }
}

module.exports = KotlinParser;
