/**
 * src/analyzer/persistence_extractor.js
 * Scans Kotlin AST for Room entities, DAOs, Database definitions, and Repositories.
 */

'use strict';

const { isEntity, isDao, isDatabase, isRepository, getAnnotation } = require('./ast_symbols');

function extractPersistence(astFiles) {
  const entities = [];
  const daos = [];
  const databases = [];
  const repositories = [];

  for (const astFile of astFiles) {
    for (const decl of astFile.declarations) {
      const symbol = `${astFile.package ? astFile.package + '.' : ''}${decl.name}`;

      // 1. Entity
      if (decl.type === 'ClassDeclaration' && isEntity(decl)) {
        const entityAnnot = getAnnotation(decl, 'Entity');
        let tableName = decl.name.toLowerCase() + 's';
        if (entityAnnot && entityAnnot.args) {
          const match = entityAnnot.args.match(/tableName\s*=\s*["']([^"']+)["']/);
          if (match) tableName = match[1];
        }

        const primaryKeys = [];
        const columns = [];

        // Check constructor parameters for @PrimaryKey and columns
        for (const param of decl.constructorParams || []) {
          const isPk = (param.annotations || []).some(a => (a.name || '').includes('PrimaryKey'));
          if (isPk) {
            primaryKeys.push(param.name);
          }
          columns.push({
            name: param.name,
            type: param.type || 'String',
            isPrimaryKey: isPk,
            nullable: (param.type || '').endsWith('?')
          });
        }

        // Fallback: if no primary key explicitly annotated, check if 'id' exists
        if (primaryKeys.length === 0 && columns.some(c => c.name === 'id')) {
          primaryKeys.push('id');
        }

        entities.push({
          symbol,
          filePath: astFile.filePath,
          tableName,
          primaryKeys,
          columns
        });
      }

      // 2. Dao
      if (decl.type === 'ClassDeclaration' && isDao(decl)) {
        const methods = [];
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'FunctionDeclaration') {
            const queryAnnot = getAnnotation(member, 'Query');
            let querySql = null;
            if (queryAnnot && queryAnnot.args) {
              const qMatch = queryAnnot.args.match(/["']([^"']+)["']/);
              if (qMatch) querySql = qMatch[1];
            }

            const isInsert = (member.annotations || []).some(a => (a.name || '').includes('Insert'));
            const isDelete = (member.annotations || []).some(a => (a.name || '').includes('Delete'));
            const isUpdate = (member.annotations || []).some(a => (a.name || '').includes('Update'));

            methods.push({
              name: member.name,
              sql: querySql,
              type: querySql ? 'QUERY' : (isInsert ? 'INSERT' : (isDelete ? 'DELETE' : (isUpdate ? 'UPDATE' : 'METHOD'))),
              isSuspend: member.modifiers.includes('suspend'),
              returnType: member.returnType || 'Unit',
              parameters: (member.parameters || []).map(p => ({
                name: p.name,
                type: p.type || 'Any'
              }))
            });
          }
        }

        daos.push({
          symbol,
          filePath: astFile.filePath,
          methods
        });
      }

      // 3. Database
      if (decl.type === 'ClassDeclaration' && isDatabase(decl)) {
        const dbAnnot = getAnnotation(decl, 'Database');
        let version = 1;
        const entityNames = [];
        if (dbAnnot && dbAnnot.args) {
          const vMatch = dbAnnot.args.match(/version\s*=\s*(\d+)/);
          if (vMatch) version = parseInt(vMatch[1], 10);
          const eMatch = dbAnnot.args.match(/entities\s*=\s*\[([^\]]+)\]/);
          if (eMatch) {
            eMatch[1].split(',').forEach(s => {
              const cleaned = s.replace(/::\s*class/g, '').replace(/::.*$/, '').replace(/\s/g, '');
              if (cleaned) entityNames.push(cleaned);
            });
          }
        }

        const daoMethods = [];
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'FunctionDeclaration' && member.returnType.includes('Dao')) {
            daoMethods.push({
              name: member.name,
              returnType: member.returnType
            });
          }
        }

        databases.push({
          symbol,
          filePath: astFile.filePath,
          version,
          entities: entityNames,
          daoMethods
        });
      }

      // 4. Repository
      if (decl.type === 'ClassDeclaration' && isRepository(decl)) {
        const methods = [];
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'FunctionDeclaration') {
            methods.push({
              name: member.name,
              isSuspend: member.modifiers.includes('suspend'),
              returnType: member.returnType || 'Unit'
            });
          }
        }

        repositories.push({
          symbol,
          filePath: astFile.filePath,
          isInterface: decl.kind === 'interface',
          methods
        });
      }
    }
  }

  return {
    entities,
    daos,
    databases,
    repositories
  };
}

module.exports = {
  extractPersistence
};
