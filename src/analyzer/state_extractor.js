/**
 * src/analyzer/state_extractor.js
 * Scans Kotlin AST for ViewModels, StateHolders, StateFlow, SharedFlow,
 * mutableStateOf properties, and public event methods.
 */

'use strict';

const { isViewModel } = require('./ast_symbols');

function extractStateHolders(astFiles) {
  const stateHolders = [];

  for (const astFile of astFiles) {
    for (const decl of astFile.declarations) {
      if (decl.type === 'ClassDeclaration' && isViewModel(decl)) {
        const symbol = `${astFile.package ? astFile.package + '.' : ''}${decl.name}`;
        const holderType = decl.superTypes.some(t => t.includes('AndroidViewModel'))
          ? 'AndroidViewModel'
          : 'ViewModel';

        const stateFlows = [];
        const sharedFlows = [];
        const composeStates = [];
        const eventMethods = [];

        // Traverse class members
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'PropertyDeclaration') {
            const propType = member.propertyType || '';
            const initTokens = (member.initializerTokens || []).map(t => t.value).join('');

            // Check StateFlow
            if (propType.includes('StateFlow') || initTokens.includes('asStateFlow') || initTokens.includes('MutableStateFlow') || initTokens.includes('stateIn')) {
              const isMutable = propType.includes('MutableStateFlow') || initTokens.includes('MutableStateFlow');
              const innerMatch = propType.match(/StateFlow<([^>]+)>/);
              const innerType = innerMatch ? innerMatch[1] : (decl.name.replace('ViewModel', 'UiState') || 'Any');
              stateFlows.push({
                name: member.name,
                propertyName: member.name,
                type: propType || (isMutable ? `MutableStateFlow<${innerType}>` : `StateFlow<${innerType}>`),
                innerType,
                isMutable
              });
            } else if (propType.includes('SharedFlow') || initTokens.includes('asSharedFlow') || initTokens.includes('MutableSharedFlow')) {
              sharedFlows.push({
                name: member.name,
                propertyName: member.name,
                type: propType || 'SharedFlow'
              });
            } else if (member.isDelegated && initTokens.includes('mutableStateOf')) {
              composeStates.push({
                name: member.name,
                propertyName: member.name,
                type: propType || 'State'
              });
            }
          }

          if (member.type === 'FunctionDeclaration') {
            const isPrivate = member.modifiers.includes('private');
            if (!isPrivate) {
              const isSuspend = member.modifiers.includes('suspend');
              eventMethods.push({
                methodName: member.name,
                parameters: (member.parameters || []).map(p => ({
                  name: p.name,
                  type: p.type || 'Any'
                })),
                returnType: member.returnType || 'Unit',
                isSuspend
              });
            }
          }
        }

        stateHolders.push({
          symbol,
          filePath: astFile.filePath,
          type: holderType,
          stateFlows,
          sharedFlows,
          composeStates,
          eventMethods
        });
      }
    }
  }

  return stateHolders;
}

module.exports = {
  extractStateHolders
};
