/**
 * src/analyzer/ast_symbols.js
 * Definitions and classification helpers for Kotlin/Compose AST symbols.
 */

'use strict';

const SymbolTypes = {
  SCREEN: 'SCREEN',
  COMPONENT: 'COMPONENT',
  ROUTE: 'ROUTE',
  VIEW_MODEL: 'VIEW_MODEL',
  STATE_HOLDER: 'STATE_HOLDER',
  ACTION: 'ACTION',
  ENTITY: 'ENTITY',
  DAO: 'DAO',
  DATABASE: 'DATABASE',
  REPOSITORY: 'REPOSITORY',
  TEST_TAG: 'TEST_TAG'
};

const NodeTypes = {
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  CLASS_DECLARATION: 'ClassDeclaration',
  PROPERTY_DECLARATION: 'PropertyDeclaration',
  TYPE_ALIAS_DECLARATION: 'TypeAliasDeclaration'
};

function hasAnnotation(declaration, annotationName) {
  if (!declaration || !declaration.annotations) return false;
  const target = annotationName.toLowerCase();
  return declaration.annotations.some(a => {
    const name = (a.name || '').toLowerCase();
    return name === target || name.endsWith('.' + target) || name.endsWith(':' + target);
  });
}

function getAnnotation(declaration, annotationName) {
  if (!declaration || !declaration.annotations) return null;
  const target = annotationName.toLowerCase();
  return declaration.annotations.find(a => {
    const name = (a.name || '').toLowerCase();
    return name === target || name.endsWith('.' + target) || name.endsWith(':' + target);
  }) || null;
}

function isComposable(declaration) {
  return hasAnnotation(declaration, 'Composable');
}

function isPreview(declaration) {
  return hasAnnotation(declaration, 'Preview');
}

function isEntity(declaration) {
  return hasAnnotation(declaration, 'Entity');
}

function isDao(declaration) {
  return hasAnnotation(declaration, 'Dao');
}

function isDatabase(declaration) {
  return hasAnnotation(declaration, 'Database');
}

function isViewModel(declaration) {
  if (!declaration || !declaration.superTypes) return false;
  return declaration.superTypes.some(t => t.includes('ViewModel') || t.includes('AndroidViewModel'));
}

function isRepository(declaration) {
  if (!declaration || !declaration.name) return false;
  return declaration.name.endsWith('Repository') || declaration.name.endsWith('RepositoryImpl');
}

function classifyParameter(param) {
  const type = param.type || '';
  const isLambda = type.includes('->') || type.startsWith('Function') || type.startsWith('()');
  const isModifier = type === 'Modifier' || type.endsWith('.Modifier') || param.name === 'modifier';
  const isState =
    type.endsWith('State') ||
    type.endsWith('UiState') ||
    type.endsWith('Model') ||
    type.startsWith('StateFlow') ||
    type.startsWith('State<');
  const nullable = type.endsWith('?');

  return {
    name: param.name,
    type,
    isState,
    isLambda,
    isModifier,
    defaultValue: param.defaultValue,
    nullable
  };
}

module.exports = {
  SymbolTypes,
  NodeTypes,
  hasAnnotation,
  getAnnotation,
  isComposable,
  isPreview,
  isEntity,
  isDao,
  isDatabase,
  isViewModel,
  isRepository,
  classifyParameter
};
