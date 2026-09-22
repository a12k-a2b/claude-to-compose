/**
 * tests/unit/analyzer.test.js
 * Unit test suite for Kotlin/Compose Syntax-Aware AST Parser (src/analyzer/)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Ajv = require('ajv/dist/2020');

const KotlinLexer = require('../../src/analyzer/kotlin_lexer');
const KotlinParser = require('../../src/analyzer/kotlin_parser');
const { parseJavaFile } = require('../../src/analyzer/java_parser');
const { parseGradleProject } = require('../../src/analyzer/gradle_parser');
const { extractComposables } = require('../../src/analyzer/composable_extractor');
const { extractRoutes } = require('../../src/analyzer/navigation_extractor');
const { extractStateHolders } = require('../../src/analyzer/state_extractor');
const { extractActionClasses } = require('../../src/analyzer/action_extractor');
const { extractPersistence } = require('../../src/analyzer/persistence_extractor');
const { extractAllTestTags, extractTestTagConstants } = require('../../src/analyzer/test_tag_extractor');
const { parseAndroidProject } = require('../../src/analyzer/index');
const schema = require('../../src/analyzer/schema.json');

describe('Kotlin Lexer Tests', () => {
  it('tokenizes basic identifiers, keywords, numbers, and operators', () => {
    const code = 'package com.example\nfun calculate(x: Int = 42, rate: Double = 3.14): Boolean = x > 10';
    const lexer = new KotlinLexer(code, 'Test.kt');
    const { tokens, diagnostics } = lexer.tokenize();

    assert.strictEqual(diagnostics.length, 0);
    assert.ok(tokens.some(t => t.type === 'KEYWORD' && t.value === 'package'));
    assert.ok(tokens.some(t => t.type === 'KEYWORD' && t.value === 'fun'));
    assert.ok(tokens.some(t => t.type === 'IDENTIFIER' && t.value === 'calculate'));
    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '42'));
    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '3.14'));
    assert.ok(tokens.some(t => t.type === 'OPERATOR' && t.value === '>'));
  });

  it('handles nested block comments accurately', () => {
    const code = '/* outer /* inner comment */ still comment */ fun valid() {}';
    const lexer = new KotlinLexer(code, 'CommentTest.kt');
    const { tokens, diagnostics } = lexer.tokenize();

    assert.strictEqual(diagnostics.length, 0);
    const funToken = tokens.find(t => t.type === 'KEYWORD' && t.value === 'fun');
    assert.ok(funToken, 'fun keyword must be tokenized after nested block comment');
    assert.strictEqual(tokens[tokens.indexOf(funToken) + 1].value, 'valid');
  });

  it('tokenizes raw multi-line strings with embedded quotes and newlines', () => {
    const code = 'val json = """{"key": "value",\n"num": 123}"""';
    const lexer = new KotlinLexer(code, 'RawStringTest.kt');
    const { tokens, diagnostics } = lexer.tokenize();

    assert.strictEqual(diagnostics.length, 0);
    const rawToken = tokens.find(t => t.type === 'STRING_LITERAL' && t.isRaw);
    assert.ok(rawToken, 'Raw string literal token must exist');
    assert.ok(rawToken.value.includes('"key": "value"'));
  });

  it('tokenizes backtick identifiers and annotations with use-site targets', () => {
    const code = '@file:OptIn(ExperimentalMaterial3Api::class)\n@get:Rule\nval `custom test property` = true';
    const lexer = new KotlinLexer(code, 'BacktickTest.kt');
    const { tokens } = lexer.tokenize();

    assert.ok(tokens.some(t => t.type === 'ANNOTATION' && t.value === 'file:OptIn'));
    assert.ok(tokens.some(t => t.type === 'ANNOTATION' && t.value === 'get:Rule'));
    assert.ok(tokens.some(t => t.type === 'IDENTIFIER' && t.value === 'custom test property'));
  });

  it('tokenizes hexadecimal, binary, and floating point literals', () => {
    const code = 'val hex = 0xFF; val bin = 0b1010; val floatVal = 16.5f; val longVal = 1000L';
    const lexer = new KotlinLexer(code, 'NumbersTest.kt');
    const { tokens } = lexer.tokenize();

    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '0xFF'));
    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '0b1010'));
    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '16.5f'));
    assert.ok(tokens.some(t => t.type === 'NUMBER_LITERAL' && t.value === '1000L'));
  });
});

describe('Kotlin Parser Tests', () => {
  it('parses packages with soft keywords and aliased imports', () => {
    const code = 'package com.claude.noteapp.data\n\nimport androidx.compose.runtime.Composable\nimport kotlinx.coroutines.flow.StateFlow as UiStateFlow\n\nclass Dummy';
    const lexer = new KotlinLexer(code, 'ImportTest.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'ImportTest.kt');
    const ast = parser.parseFile();

    assert.strictEqual(ast.package, 'com.claude.noteapp.data');
    assert.strictEqual(ast.imports.length, 2);
    assert.strictEqual(ast.imports[0].symbol, 'androidx.compose.runtime.Composable');
    assert.strictEqual(ast.imports[1].symbol, 'kotlinx.coroutines.flow.StateFlow');
    assert.strictEqual(ast.imports[1].alias, 'UiStateFlow');
  });

  it('parses Composable function declarations with multiline parameters and default values', () => {
    const code = `
      package com.claude.noteapp.ui

      @Composable
      fun NoteCard(
          note: NoteEntity,
          onClick: () -> Unit,
          modifier: Modifier = Modifier.fillMaxWidth().padding(8.dp)
      ): Unit {
          Card(modifier = modifier) {
              Text(text = note.title)
          }
      }
    `;
    const lexer = new KotlinLexer(code, 'NoteCard.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'NoteCard.kt');
    const ast = parser.parseFile();

    assert.strictEqual(ast.declarations.length, 1);
    const func = ast.declarations[0];
    assert.strictEqual(func.name, 'NoteCard');
    assert.ok(func.annotations.some(a => a.name === 'Composable'));
    assert.strictEqual(func.parameters.length, 3);
    assert.strictEqual(func.parameters[0].name, 'note');
    assert.strictEqual(func.parameters[1].name, 'onClick');
    assert.strictEqual(func.parameters[2].name, 'modifier');
    assert.ok(func.parameters[2].defaultValue.includes('Modifier'));
  });

  it('parses sealed interface and sealed class hierarchies with data objects', () => {
    const code = `
      package com.claude.noteapp.presentation

      sealed interface NoteEditorAction {
          data class OnTitleChanged(val title: String) : NoteEditorAction
          data class OnContentChanged(val content: String) : NoteEditorAction
          data object OnManualSave : NoteEditorAction
          data object OnBackClicked : NoteEditorAction
      }
    `;
    const lexer = new KotlinLexer(code, 'Action.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Action.kt');
    const ast = parser.parseFile();

    assert.strictEqual(ast.declarations.length, 1);
    const actionClass = ast.declarations[0];
    assert.strictEqual(actionClass.name, 'NoteEditorAction');
    assert.ok(actionClass.modifiers.includes('sealed'));
    assert.strictEqual(actionClass.bodyDeclarations.length, 4);

    const saveObj = actionClass.bodyDeclarations.find(d => d.name === 'OnManualSave');
    assert.ok(saveObj);
    assert.strictEqual(saveObj.kind, 'object');
  });

  it('recovers from syntax errors inside a function without aborting subsequent declarations', () => {
    const code = `
      package com.claude.broken

      fun brokenMethod(invalid: ,,,) {
          broken syntax here
      }

      fun validMethod(x: Int): Int = x + 1
    `;
    const lexer = new KotlinLexer(code, 'Broken.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Broken.kt');
    const ast = parser.parseFile();

    assert.ok(ast.declarations.some(d => d.name === 'validMethod'));
  });
});

describe('Java Parser Compatibility Tests', () => {
  it('parses legacy Java Room entity and DAO declarations', () => {
    const javaCode = `
      package com.claude.legacy;

      import androidx.room.Entity;
      import androidx.room.PrimaryKey;
      import androidx.room.Dao;
      import androidx.room.Query;
      import java.util.List;

      @Entity(tableName = "legacy_notes")
      public class LegacyNote {
          @PrimaryKey
          public long id;
          public String title;
          public String body;
      }

      @Dao
      public interface LegacyDao {
          @Query("SELECT * FROM legacy_notes")
          List<LegacyNote> getAllNotes();
      }
    `;

    const ast = parseJavaFile(javaCode, 'LegacyNote.java');
    assert.strictEqual(ast.package, 'com.claude.legacy');
    assert.strictEqual(ast.declarations.length, 2);

    const entityDecl = ast.declarations[0];
    assert.strictEqual(entityDecl.name, 'LegacyNote');
    assert.ok(entityDecl.annotations.some(a => a.name === 'Entity'));

    const daoDecl = ast.declarations[1];
    assert.strictEqual(daoDecl.name, 'LegacyDao');
    assert.strictEqual(daoDecl.kind, 'interface');
    assert.ok(daoDecl.annotations.some(a => a.name === 'Dao'));
    assert.strictEqual(daoDecl.bodyDeclarations.length, 1);
    assert.strictEqual(daoDecl.bodyDeclarations[0].name, 'getAllNotes');
  });
});

describe('Domain Extractors & Fixture Verification', () => {
  it('inspects note-app Gradle metadata accurately', () => {
    const gradleMeta = parseGradleProject('./fixtures/note-app', 'app');
    assert.strictEqual(gradleMeta.targetModule, 'app');
    assert.strictEqual(gradleMeta.namespace, 'com.claude.noteapp');
    assert.strictEqual(gradleMeta.compileSdk, 35);
    assert.strictEqual(gradleMeta.minSdk, 26);
    assert.strictEqual(gradleMeta.composeBomVersion, '2024.10.01');
    assert.strictEqual(gradleMeta.roomVersion, '2.6.1');
    assert.strictEqual(gradleMeta.navigationVersion, '2.8.8');
  });

  it('extracts test tags and resolves tag constants from note-app', async () => {
    const model = await parseAndroidProject('./fixtures/note-app', 'app');
    assert.ok(model.screens.length >= 2, 'Must extract at least NotesListScreen and NoteEditorScreen');

    const listScreen = model.screens.find(s => s.composableName === 'NotesListScreen');
    assert.ok(listScreen, 'NotesListScreen must be present');
    assert.ok(listScreen.testTags.includes('screen_notes_list'));
    assert.ok(listScreen.testTags.includes('add_note_fab'));

    const editorScreen = model.screens.find(s => s.composableName === 'NoteEditorScreen');
    assert.ok(editorScreen, 'NoteEditorScreen must be present');
    assert.ok(editorScreen.testTags.includes('screen_note_editor'));
    assert.ok(editorScreen.testTags.includes('editor_title_input'));
    assert.ok(editorScreen.testTags.includes('editor_back_button'));
  });

  it('extracts navigation routes and binds destination composables', async () => {
    const model = await parseAndroidProject('./fixtures/note-app', 'app');
    assert.strictEqual(model.routes.length, 2);

    const listRoute = model.routes.find(r => r.route === 'notes_list');
    assert.ok(listRoute);
    assert.strictEqual(listRoute.destinationComposable, 'NotesListScreen');

    const editorRoute = model.routes.find(r => r.route === 'note_editor/{noteId}');
    assert.ok(editorRoute);
    assert.strictEqual(editorRoute.destinationComposable, 'NoteEditorScreen');
    assert.strictEqual(editorRoute.arguments.length, 1);
    assert.strictEqual(editorRoute.arguments[0].name, 'noteId');
  });

  it('extracts ViewModels, StateFlows, and public event methods', async () => {
    const model = await parseAndroidProject('./fixtures/note-app', 'app');
    const editorVm = model.stateHolders.find(s => s.symbol.includes('NoteEditorViewModel'));
    assert.ok(editorVm);
    assert.strictEqual(editorVm.type, 'ViewModel');
    assert.ok(editorVm.stateFlows.some(f => f.propertyName === 'uiState'));
    assert.ok(editorVm.eventMethods.some(m => m.methodName === 'onAction'));
    assert.ok(editorVm.eventMethods.some(m => m.methodName === 'flushPendingSave'));
  });

  it('extracts Room persistence: Entity, Dao, Database, and Repositories', async () => {
    const model = await parseAndroidProject('./fixtures/note-app', 'app');

    assert.strictEqual(model.persistence.entities.length, 1);
    const noteEntity = model.persistence.entities[0];
    assert.strictEqual(noteEntity.tableName, 'notes');
    assert.ok(noteEntity.primaryKeys.includes('id'));
    assert.ok(noteEntity.columns.some(c => c.name === 'title'));
    assert.ok(noteEntity.columns.some(c => c.name === 'content'));
    assert.ok(noteEntity.columns.some(c => c.name === 'isPinned'));

    assert.strictEqual(model.persistence.daos.length, 1);
    const noteDao = model.persistence.daos[0];
    assert.ok(noteDao.methods.some(m => m.name === 'getAllNotes'));
    assert.ok(noteDao.methods.some(m => m.name === 'insertOrUpdateNote'));
    assert.ok(noteDao.methods.some(m => m.name === 'deleteNoteById'));

    assert.strictEqual(model.persistence.databases.length, 1);
    assert.strictEqual(model.persistence.databases[0].entities[0], 'NoteEntity');

    assert.strictEqual(model.persistence.repositories.length, 2);
  });

  it('validates the complete ExistingAppModel against Draft 2020-12 JSON Schema', async () => {
    const model = await parseAndroidProject('./fixtures/note-app', 'app');
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(model);

    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }
    assert.strictEqual(valid, true, 'ExistingAppModel must conform to schema');
  });
});
