/**
 * src/analyzer/navigation_extractor.js
 * Scans Kotlin AST for NavHost, destination objects/classes, composable("route")
 * navigation routes, destination composables, and route arguments.
 */

'use strict';

function extractRoutes(astFiles) {
  const destinationRoutes = collectDestinationRoutes(astFiles);
  const routes = [];

  for (const astFile of astFiles) {
    let foundInNavHost = false;
    for (const decl of astFile.declarations) {
      if (decl.type === 'FunctionDeclaration') {
        const bodyTokens = decl.bodyTokens || [];
        for (let i = 0; i < bodyTokens.length; i++) {
          if (bodyTokens[i].value === 'NavHost') {
            const navHostRoutes = parseNavHostBody(bodyTokens.slice(i), decl.name, astFile, destinationRoutes);
            routes.push(...navHostRoutes);
            foundInNavHost = true;
          }
        }
      }
    }

    if (!foundInNavHost && astFile.tokens) {
      const standaloneRoutes = parseNavHostBody(astFile.tokens, 'StandaloneNav', astFile, destinationRoutes);
      routes.push(...standaloneRoutes);
    }
  }

  return routes;
}

function collectDestinationRoutes(astFiles) {
  const map = new Map();

  for (const astFile of astFiles) {
    for (const decl of astFile.declarations) {
      if (decl.type === 'ClassDeclaration') {
        const className = decl.name;

        // Check if class constructor has route string
        for (const st of decl.superTypes || []) {
          const match = st.match(/\(\s*["']?([^"')\s]+)["']?\s*\)/);
          if (match) {
            map.set(className, match[1].trim());
          }
        }

        // Check body declarations e.g. data object NotesList : NoteAppDestination("notes_list")
        for (const member of decl.bodyDeclarations || []) {
          if (member.type === 'ClassDeclaration') {
            for (const st of member.superTypes || []) {
              const match = st.match(/\(\s*["']?([^"')\s]+)["']?\s*\)/);
              if (match) {
                const route = match[1].trim();
                map.set(`${className}.${member.name}`, route);
                map.set(`${className}.${member.name}.route`, route);
                map.set(member.name, route);
                map.set(`${member.name}.route`, route);
              }
            }
          } else if (member.type === 'PropertyDeclaration') {
            const strToken = (member.initializerTokens || []).find(t => t.type === 'STRING_LITERAL');
            if (strToken) {
              const route = strToken.value.replace(/^["']|["']$/g, '');
              map.set(`${className}.${member.name}`, route);
              map.set(`${className}.${member.name}.route`, route);
              map.set(member.name, route);
              map.set(`${member.name}.route`, route);
            }
          }
        }
      } else if (decl.type === 'PropertyDeclaration') {
        const strToken = (decl.initializerTokens || []).find(t => t.type === 'STRING_LITERAL');
        if (strToken) {
          const route = strToken.value.replace(/^["']|["']$/g, '');
          map.set(decl.name, route);
          map.set(`${decl.name}.route`, route);
        }
      }
    }
  }

  return map;
}

function parseNavHostBody(tokens, navHostSymbol, astFile, destinationRoutes) {
  const routes = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.value === 'composable') {
      if (tokens[i + 1] && tokens[i + 1].value === '(') {
        let routeTokens = [];
        let j = i + 2;
        let parenDepth = 1;

        // Skip 'route =' if present
        if (tokens[j] && tokens[j].value === 'route' && tokens[j + 1] && tokens[j + 1].value === '=') {
          j += 2;
        }

        const routeTokenObjs = [];
        // Collect route tokens until first comma at parenDepth 1 or closing paren
        while (j < tokens.length && parenDepth > 0) {
          if (tokens[j].value === '(') parenDepth++;
          else if (tokens[j].value === ')') {
            parenDepth--;
            if (parenDepth === 0) break;
          }
          if (tokens[j].value === ',' && parenDepth === 1) {
            break;
          }
          routeTokenObjs.push(tokens[j]);
          routeTokens.push(tokens[j].value);
          j++;
        }

        // Advance j past the closing ')' of composable(...)
        while (j < tokens.length && parenDepth > 0) {
          if (tokens[j].value === '(') parenDepth++;
          else if (tokens[j].value === ')') parenDepth--;
          j++;
        }

        // Join route tokens without extraneous spaces around dots
        let routeExpr = '';
        for (let idx = 0; idx < routeTokens.length; idx++) {
          const val = routeTokens[idx];
          if (idx > 0 && val !== '.' && routeTokens[idx - 1] !== '.') {
            routeExpr += ' ';
          }
          routeExpr += val;
        }
        routeExpr = routeExpr.trim();

        // Resolve routeExpr against string literal or destination table
        let finalRoute = routeExpr;
        if (routeTokenObjs.length === 1 && routeTokenObjs[0].type === 'STRING_LITERAL') {
          finalRoute = routeTokenObjs[0].value;
        } else if ((routeExpr.startsWith('"') && routeExpr.endsWith('"')) || (routeExpr.startsWith("'") && routeExpr.endsWith("'"))) {
          finalRoute = routeExpr.slice(1, -1);
        } else if (routeTokenObjs.some(t => t.type === 'STRING_LITERAL')) {
          let concatenated = '';
          for (const t of routeTokenObjs) {
            if (t.type === 'STRING_LITERAL') concatenated += t.value;
            else if (t.value === '/') concatenated += '/';
          }
          if (concatenated) finalRoute = concatenated;
        } else if (destinationRoutes.has(routeExpr)) {
          finalRoute = destinationRoutes.get(routeExpr);
        } else if (routeExpr.endsWith('.route') && destinationRoutes.has(routeExpr.slice(0, -6))) {
          finalRoute = destinationRoutes.get(routeExpr.slice(0, -6));
        } else if (routeExpr.includes('/') || routeExpr.includes('{')) {
          finalRoute = routeExpr;
        } else {
          const parts = routeExpr.split('.');
          const destName = parts[parts.length - 2] || parts[0];
          finalRoute = camelToSnakeCase(destName);
        }

        // Parse path parameters e.g. note_editor/{noteId}
        const routeArgs = [];
        const paramRegex = /\{([a-zA-Z0-9_]+)\}/g;
        let pMatch;
        while ((pMatch = paramRegex.exec(finalRoute)) !== null) {
          routeArgs.push({
            name: pMatch[1],
            type: 'Long',
            nullable: false,
            defaultValue: null
          });
        }

        // Now find the trailing lambda '{' after composable(...) closing ')'
        let destComposable = 'UnknownScreen';
        while (j < tokens.length && tokens[j].value !== '{') {
          j++;
        }
        if (tokens[j] && tokens[j].value === '{') {
          let lambdaDepth = 1;
          let k = j + 1;
          while (k < tokens.length && lambdaDepth > 0) {
            if (tokens[k].value === '{') lambdaDepth++;
            else if (tokens[k].value === '}') lambdaDepth--;

            // Find screen composable invocation
            if (
              tokens[k].type === 'IDENTIFIER' &&
              /^[A-Z][a-zA-Z0-9]+Screen$/.test(tokens[k].value)
            ) {
              destComposable = tokens[k].value;
              break;
            }
            k++;
          }
        }

        routes.push({
          route: finalRoute,
          navHostSymbol,
          filePath: astFile.filePath,
          arguments: routeArgs,
          destinationComposable: destComposable
        });
      }
    }
  }

  return routes;
}

function camelToSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
}

module.exports = {
  extractRoutes
};
