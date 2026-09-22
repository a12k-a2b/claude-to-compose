/**
 * src/analyzer/action_extractor.js
 * Scans Kotlin AST for sealed interfaces/classes and enum classes representing
 * UI actions/events, extracting variants and their parameters.
 */

'use strict';

function extractActionClasses(astFiles) {
  const actionClasses = [];

  for (const astFile of astFiles) {
    for (const decl of astFile.declarations) {
      if (decl.type === 'ClassDeclaration') {
        const isSealed = decl.modifiers.includes('sealed');
        const isEnum = decl.modifiers.includes('enum') || decl.kind === 'enum';
        const isActionName = decl.name.includes('Action') || decl.name.includes('Event') || decl.name.includes('Intent');

        if ((isSealed || isEnum) && (isActionName || isSealed)) {
          let kindStr = 'sealed class';
          if (decl.kind === 'interface') kindStr = 'sealed interface';
          else if (isEnum) kindStr = 'enum class';

          const variants = [];

          // 1. Check body declarations (nested variants)
          for (const member of decl.bodyDeclarations || []) {
            if (member.type === 'ClassDeclaration') {
              const isObj = member.kind === 'object';
              variants.push({
                name: member.name,
                isObject: isObj,
                parameters: (member.constructorParams || []).map(p => ({
                  name: p.name,
                  type: p.type || 'Any'
                }))
              });
            }
          }

          // 2. Check sibling declarations in the same file that implement/extend this sealed type
          for (const sibling of astFile.declarations) {
            if (sibling !== decl && sibling.type === 'ClassDeclaration') {
              if ((sibling.superTypes || []).some(st => st.startsWith(decl.name))) {
                const isObj = sibling.kind === 'object';
                variants.push({
                  name: sibling.name,
                  isObject: isObj,
                  parameters: (sibling.constructorParams || []).map(p => ({
                    name: p.name,
                    type: p.type || 'Any'
                  }))
                });
              }
            }
          }

          const symbol = `${astFile.package ? astFile.package + '.' : ''}${decl.name}`;
          actionClasses.push({
            symbol,
            filePath: astFile.filePath,
            type: kindStr,
            variants
          });
        }
      }
    }
  }

  return actionClasses;
}

module.exports = {
  extractActionClasses
};
