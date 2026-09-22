/**
 * src/analyzer/kotlin_lexer.js
 * Robust Kotlin syntax tokenizer with nested comments, raw multiline strings, annotations & backticked identifiers.
 */

'use strict';

const KEYWORDS = new Set([
  'package', 'import', 'as', 'fun', 'val', 'var', 'class', 'interface', 'object',
  'sealed', 'data', 'enum', 'annotation', 'abstract', 'open', 'override', 'private',
  'protected', 'public', 'internal', 'suspend', 'inline', 'by', 'return', 'if',
  'else', 'when', 'for', 'while', 'is', 'in', 'typealias', 'companion', 'constructor',
  'init', 'this', 'super', 'where', 'actual', 'expect', 'value', 'const', 'lateinit'
]);

class KotlinLexer {
  constructor(source, filePath = '<anonymous>') {
    this.source = source || '';
    this.filePath = filePath;
    this.length = this.source.length;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.diagnostics = [];
  }

  tokenize() {
    while (this.pos < this.length) {
      const ch = this.source[this.pos];

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }
      if (ch === '\n') {
        this.line++;
        this.column = 1;
        this.pos++;
        continue;
      }

      // Comments & Slash operator
      if (ch === '/') {
        const next = this.peek(1);
        if (next === '/') {
          this.scanSingleLineComment();
          continue;
        } else if (next === '*') {
          this.scanNestedBlockComment();
          continue;
        }
      }

      // Backticked Identifier
      if (ch === '`') {
        this.scanBacktickIdentifier();
        continue;
      }

      // Annotations
      if (ch === '@') {
        this.scanAnnotation();
        continue;
      }

      // Strings
      if (ch === '"') {
        if (this.peek(1) === '"' && this.peek(2) === '"') {
          this.scanRawString();
        } else {
          this.scanRegularString();
        }
        continue;
      }

      // Characters
      if (ch === '\'') {
        this.scanCharLiteral();
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        this.scanNumber();
        continue;
      }

      // Identifiers & Keywords
      if (this.isAlphaOrUnderscore(ch)) {
        this.scanIdentifierOrKeyword();
        continue;
      }

      // Delimiters
      if ('(){}[]'.includes(ch)) {
        this.addToken('DELIMITER', ch);
        this.advance();
        continue;
      }

      // Multi-char Operators & Punctuation
      if (this.scanOperator()) {
        continue;
      }

      // Fallback unknown character
      this.diagnostics.push({
        severity: 'WARNING',
        line: this.line,
        column: this.column,
        message: `Unexpected character '${ch}'`
      });
      this.advance();
    }

    this.addToken('EOF', '');
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  scanNestedBlockComment() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    let depth = 1;
    this.advance(2); // Skip /*

    while (this.pos < this.length && depth > 0) {
      if (this.source[this.pos] === '/' && this.peek(1) === '*') {
        depth++;
        this.advance(2);
      } else if (this.source[this.pos] === '*' && this.peek(1) === '/') {
        depth--;
        this.advance(2);
      } else {
        if (this.source[this.pos] === '\n') {
          this.line++;
          this.column = 1;
          this.pos++;
        } else {
          this.advance();
        }
      }
    }

    if (depth > 0) {
      this.diagnostics.push({
        severity: 'ERROR',
        line: startLine,
        column: startCol,
        message: 'Unterminated nested block comment'
      });
    }
  }

  scanSingleLineComment() {
    this.advance(2);
    while (this.pos < this.length && this.source[this.pos] !== '\n') {
      this.advance();
    }
  }

  scanBacktickIdentifier() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    this.advance(); // Skip `
    let name = '';
    while (this.pos < this.length && this.source[this.pos] !== '`' && this.source[this.pos] !== '\n') {
      name += this.source[this.pos];
      this.advance();
    }
    if (this.source[this.pos] === '`') {
      this.advance();
    }
    this.tokens.push({
      type: 'IDENTIFIER',
      value: name,
      line: startLine,
      column: startCol,
      start: startPos,
      end: this.pos
    });
  }

  scanRawString() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    this.advance(3); // Skip """
    let content = '';

    while (this.pos < this.length) {
      if (this.source[this.pos] === '"' && this.peek(1) === '"' && this.peek(2) === '"') {
        this.advance(3);
        this.tokens.push({
          type: 'STRING_LITERAL',
          isRaw: true,
          value: content,
          line: startLine,
          column: startCol,
          start: startPos,
          end: this.pos
        });
        return;
      }
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      content += this.source[this.pos];
      this.pos++;
    }

    this.diagnostics.push({
      severity: 'ERROR',
      line: startLine,
      column: startCol,
      message: 'Unterminated raw string literal'
    });
  }

  scanRegularString() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    this.advance(); // Skip "
    let content = '';

    while (this.pos < this.length) {
      const ch = this.source[this.pos];
      if (ch === '"') {
        this.advance();
        this.tokens.push({
          type: 'STRING_LITERAL',
          isRaw: false,
          value: content,
          line: startLine,
          column: startCol,
          start: startPos,
          end: this.pos
        });
        return;
      }
      if (ch === '\\') {
        content += ch + (this.peek(1) || '');
        this.advance(2);
        continue;
      }
      if (ch === '\n') {
        this.diagnostics.push({
          severity: 'ERROR',
          line: startLine,
          column: startCol,
          message: 'Newline in single-line string literal'
        });
        return;
      }
      content += ch;
      this.advance();
    }
  }

  scanCharLiteral() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    this.advance(); // Skip '
    let ch = '';
    if (this.source[this.pos] === '\\') {
      ch += '\\' + (this.peek(1) || '');
      this.advance(2);
    } else {
      ch += this.source[this.pos] || '';
      this.advance();
    }
    if (this.source[this.pos] === '\'') {
      this.advance();
    }
    this.tokens.push({
      type: 'CHAR_LITERAL',
      value: ch,
      line: startLine,
      column: startCol,
      start: startPos,
      end: this.pos
    });
  }

  scanNumber() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    let num = '';

    if (this.source[this.pos] === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      num += this.source[this.pos] + this.peek(1);
      this.advance(2);
      while (this.pos < this.length && /[0-9a-fA-F_]/.test(this.source[this.pos])) {
        num += this.source[this.pos];
        this.advance();
      }
    } else if (this.source[this.pos] === '0' && (this.peek(1) === 'b' || this.peek(1) === 'B')) {
      num += this.source[this.pos] + this.peek(1);
      this.advance(2);
      while (this.pos < this.length && /[01_]/.test(this.source[this.pos])) {
        num += this.source[this.pos];
        this.advance();
      }
    } else {
      while (this.pos < this.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === '_')) {
        num += this.source[this.pos];
        this.advance();
      }
      if (this.source[this.pos] === '.' && this.isDigit(this.peek(1))) {
        num += '.';
        this.advance();
        while (this.pos < this.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === '_')) {
          num += this.source[this.pos];
          this.advance();
        }
      }
    }

    if (this.pos < this.length && /[fFlLuU]/.test(this.source[this.pos])) {
      num += this.source[this.pos];
      this.advance();
    }

    this.tokens.push({
      type: 'NUMBER_LITERAL',
      value: num,
      line: startLine,
      column: startCol,
      start: startPos,
      end: this.pos
    });
  }

  scanAnnotation() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    this.advance(); // Skip @

    // Check for use-site target e.g. @file:OptIn, @get:Rule
    let name = '';
    while (
      this.pos < this.length &&
      (this.isAlphaOrUnderscore(this.source[this.pos]) ||
        this.isDigit(this.source[this.pos]) ||
        this.source[this.pos] === '.' ||
        this.source[this.pos] === ':')
    ) {
      name += this.source[this.pos];
      this.advance();
    }

    this.tokens.push({
      type: 'ANNOTATION',
      value: name,
      line: startLine,
      column: startCol,
      start: startPos,
      end: this.pos
    });
  }

  scanOperator() {
    const threeChar = this.source.slice(this.pos, this.pos + 3);
    if (['===', '!==', '..<'].includes(threeChar)) {
      this.addToken('OPERATOR', threeChar);
      this.advance(3);
      return true;
    }

    const twoChar = this.source.slice(this.pos, this.pos + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '->', '::', '?.', '?:', '!!', '..', '+=', '-=', '*=', '/='].includes(twoChar)) {
      this.addToken('OPERATOR', twoChar);
      this.advance(2);
      return true;
    }

    if ('.:,;?+-*/%<>=!&|^'.includes(this.source[this.pos])) {
      this.addToken('OPERATOR', this.source[this.pos]);
      this.advance();
      return true;
    }

    return false;
  }

  scanIdentifierOrKeyword() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    let ident = '';

    while (
      this.pos < this.length &&
      (this.isAlphaOrUnderscore(this.source[this.pos]) || this.isDigit(this.source[this.pos]))
    ) {
      ident += this.source[this.pos];
      this.advance();
    }

    const type = KEYWORDS.has(ident) ? 'KEYWORD' : 'IDENTIFIER';
    this.tokens.push({
      type,
      value: ident,
      line: startLine,
      column: startCol,
      start: startPos,
      end: this.pos
    });
  }

  advance(n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.pos < this.length) {
        this.column++;
        this.pos++;
      }
    }
  }

  peek(n = 0) {
    return this.pos + n < this.length ? this.source[this.pos + n] : '';
  }

  addToken(type, value) {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column,
      start: this.pos,
      end: this.pos + value.length
    });
  }

  isAlphaOrUnderscore(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }

  isDigit(c) {
    return c >= '0' && c <= '9';
  }
}

module.exports = KotlinLexer;
