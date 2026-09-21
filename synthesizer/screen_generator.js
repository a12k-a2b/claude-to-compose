/**
 * synthesizer/screen_generator.js
 * Generates ClaudeDesignScreen.kt and ClaudeDesignPreview.kt
 */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeIdentifier } = require('./component_generator');
const { MotionGenerator } = require('./motion_generator');
const { VectorGenerator } = require('./vector_generator');

/**
 * Resolves the appropriate ClaudeIcons.<IconName> property for a given node.
 * @param {Object} targetNode
 * @param {Object} iconContext
 * @returns {string} e.g. "ClaudeIcons.Icon2Icon"
 */
function resolveIconVector(targetNode, iconContext) {
  if (!iconContext || !iconContext.vectorList || iconContext.vectorList.length === 0) {
    return 'ClaudeIcons.Icon1Icon';
  }
  if (targetNode?.vectorId && iconContext.vectorMap.has(targetNode.vectorId)) {
    return `ClaudeIcons.${iconContext.vectorMap.get(targetNode.vectorId)}`;
  }
  if (targetNode?.vectorName && iconContext.vectorMap.has(targetNode.vectorName)) {
    return `ClaudeIcons.${iconContext.vectorMap.get(targetNode.vectorName)}`;
  }
  if (targetNode?.name && iconContext.vectorMap.has(targetNode.name)) {
    return `ClaudeIcons.${iconContext.vectorMap.get(targetNode.name)}`;
  }
  if (targetNode?.id && iconContext.vectorMap.has(targetNode.id)) {
    return `ClaudeIcons.${iconContext.vectorMap.get(targetNode.id)}`;
  }
  if (iconContext.currentIndex < iconContext.vectorList.length) {
    const prop = iconContext.vectorList[iconContext.currentIndex].propName;
    iconContext.currentIndex++;
    return `ClaudeIcons.${prop}`;
  }
  return 'ClaudeIcons.Icon1Icon';
}

/**
 * Collects interactive states required by elements in the hierarchy.
 * @param {Object} rootNode 
 * @returns {Array<Object>} list of state definitions
 */
function extractInteractiveStates(rootNode) {
  const states = [];
  let inputIndex = 0;
  let checkIndex = 0;
  let tabIndex = 0;
  let switchIndex = 0;

  function traverse(node) {
    if (!node) return;
    const type = (node.componentType || '').toLowerCase();
    const tag = (node.tag || '').toLowerCase();

    const isCheckbox = type === 'checkbox' || 
                       node.type?.toLowerCase() === 'checkbox' || 
                       node.componentType?.toLowerCase() === 'checkbox' || 
                       node.attributes?.type === 'checkbox';
    const isRadio = type === 'radiobutton' || 
                    node.type?.toLowerCase() === 'radio' || 
                    node.componentType?.toLowerCase() === 'radiobutton' || 
                    node.attributes?.type === 'radio';

    if (isCheckbox) {
      checkIndex++;
      const rawName = node.name || `consent_${checkIndex}`;
      const cleanName = sanitizeIdentifier(rawName).replace(/`/g, '');
      states.push({
        varName: `is${capitalize(cleanName)}Checked`,
        type: 'Boolean',
        defaultVal: 'false',
        kind: 'checkbox',
        nodeId: node.id
      });
    } else if (isRadio) {
      // Radio button handling
    } else if (!isCheckbox && !isRadio && (type === 'textfield' || tag === 'input' || tag === 'textarea')) {
      inputIndex++;
      const rawName = node.name || `field_${inputIndex}`;
      const cleanName = sanitizeIdentifier(rawName).replace(/`/g, '');
      states.push({
        varName: `${cleanName}Text`,
        type: 'String',
        defaultVal: '""',
        kind: 'text',
        nodeId: node.id
      });
    } else if (type === 'navigationbar' || tag === 'nav') {
      tabIndex++;
      states.push({
        varName: `selectedTab_${tabIndex}`,
        type: 'Int',
        defaultVal: '0',
        kind: 'tab',
        nodeId: node.id
      });
    } else if (tag === 'label' || type === 'switch' || (node.interactions && node.interactions.isClickable && (node.style?.isPill || type === 'box'))) {
      if (type === 'switch' || node.children?.some(c => c.style?.isPill || c.style?.borderRadius?.isPill)) {
        switchIndex++;
        const rawName = node.name || `switch_${switchIndex}`;
        const cleanName = sanitizeIdentifier(rawName).replace(/`/g, '');
        states.push({
          varName: `is${capitalize(cleanName)}Enabled`,
          type: 'Boolean',
          defaultVal: 'true',
          kind: 'switch',
          nodeId: node.id
        });
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(rootNode);
  return states;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Determines if a layout specification represents a horizontal Row in Compose.
 * In computed CSS, block elements default to flexDirection: 'row', so display
 * MUST be explicitly checked to avoid misclassifying block elements as Rows.
 *
 * @param {Object} layout - Layout properties from design_spec.json node
 * @returns {boolean}
 */
function isRowLayout(layout = {}) {
  const display = (layout.display || '').toLowerCase();
  const flexDirection = (layout.flexDirection || '').toLowerCase();

  // Block containers must NEVER be Row, even if computed flexDirection is 'row'
  if (display === 'block') {
    return false;
  }

  // Explicit flex container with horizontal direction
  if (display === 'flex') {
    return flexDirection === 'row' || flexDirection === 'row-reverse';
  }

  // Inline-flex container with horizontal direction (or default row)
  if (display === 'inline-flex') {
    return !flexDirection.startsWith('column');
  }

  // All other display types (grid, inline, table, unset) default to Column
  return false;
}

/**
 * Translates CSS layout properties to Compose Arrangement and Alignment
 */
function translateLayout(layout = {}) {
  const isRow = isRowLayout(layout);
  const gap = layout.gap || layout.rowGap || layout.columnGap || 0;

  // Row Arrangement (Horizontal)
  let rowArrangement = 'Arrangement.Start';
  if (layout.justifyContent === 'center') rowArrangement = 'Arrangement.Center';
  else if (layout.justifyContent === 'space-between') rowArrangement = 'Arrangement.SpaceBetween';
  else if (layout.justifyContent === 'space-around') rowArrangement = 'Arrangement.SpaceAround';
  else if (layout.justifyContent === 'space-evenly') rowArrangement = 'Arrangement.SpaceEvenly';
  else if (layout.justifyContent === 'flex-end' || layout.justifyContent === 'end') rowArrangement = 'Arrangement.End';
  else if (gap > 0) rowArrangement = `Arrangement.spacedBy(${gap}.dp)`;

  // Row Alignment (Vertical)
  let rowAlignment = 'Alignment.CenterVertically';
  if (layout.alignItems === 'flex-start' || layout.alignItems === 'start') rowAlignment = 'Alignment.Top';
  else if (layout.alignItems === 'flex-end' || layout.alignItems === 'end') rowAlignment = 'Alignment.Bottom';
  else if (layout.alignItems === 'center') rowAlignment = 'Alignment.CenterVertically';

  // Column Arrangement (Vertical)
  let colArrangement = 'Arrangement.Top';
  if (layout.justifyContent === 'center') colArrangement = 'Arrangement.Center';
  else if (layout.justifyContent === 'space-between') colArrangement = 'Arrangement.SpaceBetween';
  else if (gap > 0) colArrangement = `Arrangement.spacedBy(${gap}.dp)`;

  // Column Alignment (Horizontal)
  let colAlignment = 'Alignment.Start';
  if (layout.alignItems === 'center') colAlignment = 'Alignment.CenterHorizontally';
  else if (layout.alignItems === 'flex-end' || layout.alignItems === 'end') colAlignment = 'Alignment.End';
  else if (layout.alignItems === 'flex-start' || layout.alignItems === 'start') colAlignment = 'Alignment.Start';

  return {
    isRow,
    gap,
    rowArrangement,
    rowAlignment,
    colArrangement,
    colAlignment
  };
}

/**
 * Builds idiomatic Compose modifiers respecting enclosing scope constraints.
 *
 * @param {Object} node - DesignNode
 * @param {Object} parentContext - { inRow, siblingCount, childIndex }
 * @param {boolean} isRow - whether this container itself is a Row
 * @returns {string} Kotlin modifier expression
 */
function buildContainerModifier(node, parentContext = {}, isRow = false) {
  const layout = node.layout || {};
  const inRow = Boolean(parentContext.inRow);
  const siblingCount = parentContext.siblingCount || 1;
  const modifiers = [];

  if (inRow) {
    // INSIDE A ROW: Never emit unconditional fillMaxWidth()!
    if (layout.flexGrow && layout.flexGrow > 0) {
      modifiers.push(`Modifier.weight(${layout.flexGrow}f)`);
    } else if (siblingCount > 1 && (node.componentType === 'Card' || (layout.width && layout.width > 120))) {
      // Multiple cards or wide items sharing a row expand equally
      modifiers.push('Modifier.weight(1f)');
    } else {
      // Intrinsic wrap content
      modifiers.push('Modifier');
    }
  } else {
    // INSIDE A COLUMN: Full width is standard and safe
    modifiers.push('Modifier.fillMaxWidth()');
  }

  // Padding handling
  if (layout.padding) {
    const { top = 0, right = 0, bottom = 0, left = 0 } = layout.padding;
    if (top === bottom && left === right) {
      if (top > 0 && left > 0) {
        modifiers.push(`.padding(horizontal = ${left}.dp, vertical = ${top}.dp)`);
      } else if (top > 0) {
        modifiers.push(`.padding(vertical = ${top}.dp)`);
      } else if (left > 0) {
        modifiers.push(`.padding(horizontal = ${left}.dp)`);
      }
    } else if (top > 0 || right > 0 || bottom > 0 || left > 0) {
      const parts = [];
      if (left > 0) parts.push(`start = ${left}.dp`);
      if (top > 0) parts.push(`top = ${top}.dp`);
      if (right > 0) parts.push(`end = ${right}.dp`);
      if (bottom > 0) parts.push(`bottom = ${bottom}.dp`);
      modifiers.push(`.padding(${parts.join(', ')})`);
    }
  }

  const result = modifiers.join('');
  return result === 'Modifier' ? '' : result;
}

/**
 * Recursively translates a DesignNode into Compose Kotlin code.
 */
function translateNode(node, indent = '        ', stateMap = {}, parentContext = { inRow: false, siblingCount: 1, childIndex: 0 }, iconContext = null) {
  if (!node) return `${indent}Box {}\n`;

  const type = node.componentType || 'Container';
  const textContent = node.text?.content || (typeof node.text === 'string' ? node.text : '');
  const children = Array.isArray(node.children) ? node.children : [];

  // 1. Text Component
  if (type === 'Text') {
    const safeText = JSON.stringify(textContent || '');
    let textStyle = 'MaterialTheme.typography.bodyMedium';
    if (node.text?.fontWeight >= 700 || node.tag === 'h1' || node.tag === 'h2') {
      textStyle = 'MaterialTheme.typography.titleLarge';
    } else if (node.text?.fontSize <= 12) {
      textStyle = 'MaterialTheme.typography.bodySmall';
    }
    return `${indent}Text(\n${indent}    text = ${safeText},\n${indent}    style = ${textStyle}\n${indent})\n`;
  }

  // 2. Button Component
  if (type === 'Button') {
    const label = JSON.stringify(textContent || 'Action');
    const buttonModifier = parentContext.inRow && (node.layout?.flexGrow > 0)
      ? 'Modifier.weight(1f).padding(vertical = 4.dp)'
      : 'Modifier.padding(vertical = 4.dp)';
    return `${indent}PrimaryActionButton(\n${indent}    text = ${label},\n${indent}    onClick = { /* Action */ },\n${indent}    modifier = ${buttonModifier}\n${indent})\n`;
  }

  // 3. IconButton Component
  if (type === 'IconButton') {
    const iconTarget = (children.length > 0 && (children[0].componentType === 'Icon' || children[0].tag === 'svg')) ? children[0] : node;
    const iconVector = resolveIconVector(iconTarget, iconContext);
    return `${indent}AppIconButton(\n${indent}    onClick = { /* Icon Action */ }\n${indent}) {\n${indent}    Icon(imageVector = ${iconVector}, contentDescription = null, tint = MaterialTheme.colorScheme.primary)\n${indent}}\n`;
  }

  // 4. Card Component
  if (type === 'Card') {
    let inner = '';
    if (children.length > 0) {
      inner = children.map((c, idx) => translateNode(c, indent + '        ', stateMap, {
        inRow: false,
        siblingCount: children.length,
        childIndex: idx
      }, iconContext)).join('');
    } else {
      inner = `${indent}        Text(text = ${JSON.stringify(textContent || 'Card Content')})\n`;
    }
    const cardModifier = parentContext.inRow
      ? 'Modifier.weight(1f).padding(4.dp)'
      : 'Modifier.fillMaxWidth().padding(vertical = 6.dp)';
    return `${indent}AppCard(\n${indent}    modifier = ${cardModifier},\n${indent}    onClick = { /* Card Action */ }\n${indent}) {\n${indent}    Column(modifier = Modifier.padding(16.dp)) {\n${inner}${indent}    }\n${indent}}\n`;
  }

  // 5. TextField Component
  if (type === 'TextField') {
    const state = stateMap[node.id];
    const valVar = state ? state.varName : 'textState';
    const label = JSON.stringify(node.name || 'Input');
    const tfModifier = parentContext.inRow
      ? 'Modifier.weight(1f).padding(vertical = 4.dp)'
      : 'Modifier.fillMaxWidth().padding(vertical = 4.dp)';
    return `${indent}AppInputField(\n${indent}    value = ${valVar},\n${indent}    onValueChange = { ${valVar} = it },\n${indent}    label = ${label},\n${indent}    modifier = ${tfModifier}\n${indent})\n`;
  }

  // 6. Badge Component
  if (type === 'Badge') {
    const label = JSON.stringify(textContent || 'Status');
    const isPill = node.style?.borderRadius?.isPill;
    const heightDp = node.bounds?.height ? `${Math.round(node.bounds.height)}` : '32';
    const modifier = isPill
      ? `Modifier.requiredHeight(${heightDp}.dp).padding(horizontal = 4.dp)`
      : 'Modifier.padding(2.dp)';
    return `${indent}StatusBadge(\n${indent}    text = ${label},\n${indent}    modifier = ${modifier}\n${indent})\n`;
  }

  // 7. Checkbox Component
  if (type === 'Checkbox') {
    const state = stateMap[node.id];
    const checkVar = state ? state.varName : 'isChecked';
    const label = JSON.stringify(textContent || 'I agree to the terms');
    return `${indent}AppCheckbox(\n${indent}    checked = ${checkVar},\n${indent}    onCheckedChange = { ${checkVar} = it },\n${indent}    label = ${label}\n${indent})\n`;
  }

  // 8. RadioButton Component
  if (type === 'RadioButton') {
    const label = JSON.stringify(textContent || 'Option');
    return `${indent}AppRadioButton(\n${indent}    selected = true,\n${indent}    onClick = { /* Select */ },\n${indent}    label = ${label}\n${indent})\n`;
  }

  // 9. Icon / SVG Component
  if (type === 'Icon' || node.tag === 'svg') {
    const iconVector = resolveIconVector(node, iconContext);
    return `${indent}Icon(\n${indent}    imageVector = ${iconVector},\n${indent}    contentDescription = null,\n${indent}    modifier = Modifier.size(20.dp),\n${indent}    tint = MaterialTheme.colorScheme.primary\n${indent})\n`;
  }

  // 10. Switch
  if (type === 'Switch' || (node.tag === 'label' && stateMap[node.id])) {
    const s = stateMap[node.id];
    const checkedExpr = s ? s.varName : 'true';
    const onChangeExpr = s ? `{ ${s.varName} = it }` : '{ /* toggle */ }';
    return `${indent}Switch(\n${indent}    checked = ${checkedExpr},\n${indent}    onCheckedChange = ${onChangeExpr}\n${indent})\n`;
  }

  // 10b. Chip Component
  if (type === 'Chip') {
    return `${indent}AppFilterChip(\n${indent}    selected = true,\n${indent}    onClick = { /* chip */ },\n${indent}    label = ${JSON.stringify(textContent || 'Chip')}\n${indent})\n`;
  }

  // 11. Divider Component
  if (type === 'Divider') {
    return `${indent}HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))\n`;
  }

  // 12. Spacer Component
  if (type === 'Spacer') {
    const h = node.bounds?.height || 16;
    return `${indent}Spacer(modifier = Modifier.height(${h}.dp))\n`;
  }

  // 13. TopAppBar Component
  if (type === 'TopAppBar' || (node.tag === 'header' && isRowLayout(node.layout))) {
    const inner = children.map((c, idx) => translateNode(c, indent + '    ', stateMap, {
      inRow: true,
      siblingCount: children.length,
      childIndex: idx
    }, iconContext)).join('');
    return `${indent}Row(\n${indent}    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),\n${indent}    horizontalArrangement = Arrangement.SpaceBetween,\n${indent}    verticalAlignment = Alignment.CenterVertically\n${indent}) {\n${inner}${indent}}\n`;
  }

  // 13b. Toolbar Component
  if (type === 'Toolbar') {
    const inner = children.map((c, idx) => translateNode(c, indent + '    ', stateMap, {
      inRow: true,
      siblingCount: children.length,
      childIndex: idx
    }, iconContext)).join('');
    return `${indent}Row(\n${indent}    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),\n${indent}    horizontalArrangement = Arrangement.spacedBy(8.dp),\n${indent}    verticalAlignment = Alignment.CenterVertically\n${indent}) {\n${inner}${indent}}\n`;
  }

  // 13c. Overlay / Dialog Component
  if (type === 'Overlay' || type === 'Dialog') {
    const inner = children.map((c, idx) => translateNode(c, indent + '        ', stateMap, {
      inRow: false,
      siblingCount: children.length,
      childIndex: idx
    }, iconContext)).join('');
    return `${indent}Box(\n${indent}    modifier = Modifier.fillMaxSize().background(Color(0x66000000)),\n${indent}    contentAlignment = Alignment.Center\n${indent}) {\n${indent}    AppCard(modifier = Modifier.padding(24.dp)) {\n${inner}${indent}    }\n${indent}}\n`;
  }

  // 14. NavigationBar Component
  if (type === 'NavigationBar' || node.tag === 'nav') {
    const tabState = stateMap[node.id] || { varName: 'selectedTabIndex' };
    const tabTitles = children.map(c => c.text?.content || 'Tab').filter(Boolean);
    const titlesArray = tabTitles.length > 0 ? tabTitles : ['Overview', 'Analytics', 'Infrastructure'];
    const titlesLiteral = titlesArray.map(t => JSON.stringify(t)).join(', ');

    return `${indent}TabRow(\n${indent}    selectedTabIndex = ${tabState.varName},\n${indent}    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)\n${indent}) {\n${indent}    val tabs = listOf(${titlesLiteral})\n${indent}    tabs.forEachIndexed { index, title ->\n${indent}        Tab(\n${indent}            selected = ${tabState.varName} == index,\n${indent}            onClick = { ${tabState.varName} = index },\n${indent}            text = { Text(title) }\n${indent}        )\n${indent}    }\n${indent}}\n`;
  }

  // 15. Layout Containers (Row, Column, Grid, Box, Container)
  if (children.length === 0) {
    if (textContent) {
      return `${indent}Text(text = ${JSON.stringify(textContent)})\n`;
    }
    return '';
  }

  const { isRow, rowArrangement, rowAlignment, colArrangement, colAlignment } = translateLayout(node.layout);
  const containerModifier = buildContainerModifier(node, parentContext, isRow);
  const modArg = containerModifier ? `\n${indent}    modifier = ${containerModifier},` : '';

  if (type === 'Row' || (type === 'Container' && isRow)) {
    const childCode = children.map((c, idx) => translateNode(c, indent + '    ', stateMap, {
      inRow: true,
      siblingCount: children.length,
      childIndex: idx
    }, iconContext)).join('');
    return `${indent}Row(${modArg}\n${indent}    horizontalArrangement = ${rowArrangement},\n${indent}    verticalAlignment = ${rowAlignment}\n${indent}) {\n${childCode}${indent}}\n`;
  }

  // High child count check (> 30 items switches to LazyColumn)
  if (children.length > 30) {
    const childCode = children.map((c, idx) => `${indent}    item {\n${translateNode(c, indent + '        ', stateMap, {
      inRow: false,
      siblingCount: children.length,
      childIndex: idx
    }, iconContext)}${indent}    }\n`).join('');
    return `${indent}LazyColumn(\n${indent}    modifier = Modifier.fillMaxSize()\n${indent}) {\n${childCode}${indent}}\n`;
  }

  // Default Column
  const childCode = children.map((c, idx) => translateNode(c, indent + '    ', stateMap, {
    inRow: false,
    siblingCount: children.length,
    childIndex: idx
  }, iconContext)).join('');
  return `${indent}Column(${modArg}\n${indent}    verticalArrangement = ${colArrangement},\n${indent}    horizontalAlignment = ${colAlignment}\n${indent}) {\n${childCode}${indent}}\n`;
}

/**
 * Generates ClaudeDesignScreen.kt
 */
function generateScreenFile(spec, packageName) {
  const root = spec ? spec.hierarchy : null;
  if (!root || !root.children || root.children.length === 0) {
    // Empty hierarchy boundary handling (T2_B11_01)
    return `package ${packageName}.screen

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun ClaudeDesignScreen(
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier.fillMaxSize())
}
`;
  }

  const interactiveStates = extractInteractiveStates(root);
  const stateMap = {};
  for (const s of interactiveStates) {
    if (s.nodeId) stateMap[s.nodeId] = s;
  }

  // If no tab state extracted, provide default tab state for navigation
  if (!interactiveStates.some(s => s.kind === 'tab')) {
    interactiveStates.push({
      varName: 'selectedTabIndex',
      type: 'Int',
      defaultVal: '0',
      kind: 'tab'
    });
  }

  const tabStates = interactiveStates.filter(s => s.kind === 'tab');
  const primaryTabVar = tabStates.length > 0 ? tabStates[0].varName : 'selectedTabIndex';

  let stateDecls = '';
  for (const s of interactiveStates) {
    if (s.type === 'Int') {
      stateDecls += `    var ${s.varName} by rememberSaveable { mutableIntStateOf(${s.defaultVal}) }\n`;
    } else {
      stateDecls += `    var ${s.varName} by rememberSaveable { mutableStateOf(${s.defaultVal}) }\n`;
    }
  }

  // Form validation line if multiple inputs exist
  let validationLine = '';
  const textStates = interactiveStates.filter(s => s.kind === 'text');
  const checkStates = interactiveStates.filter(s => s.kind === 'checkbox');
  if (textStates.length > 0 || checkStates.length > 0) {
    const conditions = [];
    for (const it of textStates) conditions.push(`${it.varName}.isNotBlank()`);
    for (const it of checkStates) conditions.push(`${it.varName}`);
    if (conditions.length > 0) {
      validationLine = `    val isFormValid = ${conditions.join(' && ')}\n`;
    }
  }

  // Build icon context from spec.vectors for dynamic icon binding
  const vectorList = [];
  const vectorMap = new Map();
  const generatedNames = new Set();
  const safeVectors = (spec?.vectors || []).filter(v => v && typeof v === 'object');

  for (let idx = 0; idx < safeVectors.length; idx++) {
    const vec = safeVectors[idx];
    let baseName = VectorGenerator.toPascalCase(vec.name || `Icon_${idx + 1}`);
    if (!baseName.endsWith('Icon')) baseName += 'Icon';

    let propName = baseName;
    let counter = 1;
    while (generatedNames.has(propName)) {
      propName = `${baseName}_${++counter}`;
    }
    generatedNames.add(propName);
    const safeProp = /^[0-9]/.test(propName) ? `\`${propName}\`` : propName;

    vectorList.push({ id: vec.id, name: vec.name, propName: safeProp });
    if (vec.id) vectorMap.set(vec.id, safeProp);
    if (vec.name) vectorMap.set(vec.name, safeProp);
    vectorMap.set(`index_${idx}`, safeProp);
  }

  const iconContext = { vectorList, vectorMap, currentIndex: 0 };

  const contentCode = translateNode(root, '            ', stateMap, {
    inRow: false,
    siblingCount: 1,
    childIndex: 0
  }, iconContext);

  const hasAbsoluteChildren = Array.isArray(root?.children) && root.children.some(c => 
    c?.style?.position === 'absolute' || 
    c?.layout?.position === 'absolute' || 
    c?.style?.zIndex != null || 
    c?.componentType === 'Overlay'
  );

  const containerBody = hasAbsoluteChildren
    ? `        Box(\n` +
      `            modifier = Modifier\n` +
      `                .fillMaxSize()\n` +
      `                .padding(innerPadding)\n` +
      `        ) {\n` +
      `${contentCode}` +
      `        }`
    : `        Column(\n` +
      `            modifier = Modifier\n` +
      `                .fillMaxSize()\n` +
      `                .padding(innerPadding)\n` +
      `                .verticalScroll(rememberScrollState())\n` +
      `        ) {\n` +
      `${contentCode}` +
      `        }`;

  return `package ${packageName}.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ${packageName}.components.*
import ${packageName}.icons.*
import ${packageName}.motion.*
import ${packageName}.theme.*

@Composable
fun ClaudeDesignScreen(
    modifier: Modifier = Modifier
) {
${stateDecls}${validationLine}
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
${containerBody}
    }
}
`;
}

/**
 * Generates ClaudeDesignPreview.kt with multi-theme and multi-device previews.
 */
function generatePreviewFile(packageName) {
  return `package ${packageName}.screen

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import ${packageName}.theme.AppTheme
import ${packageName}.theme.ClaudeDesignTheme

@Preview(
    name = "Light Theme",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
    uiMode = Configuration.UI_MODE_NIGHT_NO
)
@Composable
fun ClaudeDesignScreenLightPreview() {
    ClaudeDesignTheme(darkTheme = false) {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Dark Theme",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
    uiMode = Configuration.UI_MODE_NIGHT_YES
)
@Composable
fun ClaudeDesignScreenDarkPreview() {
    ClaudeDesignTheme(darkTheme = true) {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Mobile Pixel 7",
    device = Devices.PIXEL_7,
    showSystemUi = true
)
@Composable
fun ClaudeDesignScreenPixel7Preview() {
    ClaudeDesignTheme {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Tablet Landscape",
    widthDp = 1280,
    heightDp = 800,
    showBackground = true
)
@Composable
fun ClaudeDesignScreenTabletPreview() {
    AppTheme {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Claude Design Screen Preview",
    showBackground = true
)
@Composable
fun ClaudeDesignScreenPreview() {
    ClaudeDesignTheme {
        ClaudeDesignScreen()
    }
}
`;
}

class ScreenGenerator {
  static generateScreenFile(spec, packageName) {
    return generateScreenFile(spec, packageName);
  }

  static generatePreviewFile(packageName) {
    return generatePreviewFile(packageName);
  }

  /**
   * Main screen synthesis driver.
   * @param {Object} spec design_spec.json
   * @param {string|Object} optionsOrOutputDir Root directory or options object { outputDir, packageName }
   * @param {string} [packageName='com.claude.compose'] e.g. "com.claude.compose"
   * @returns {Array<string>} list of generated file paths
   */
  static generateScreen(spec, optionsOrOutputDir, packageName = 'com.claude.compose') {
    let targetBaseDir;
    let pkg = packageName;

    if (typeof optionsOrOutputDir === 'object' && optionsOrOutputDir !== null) {
      targetBaseDir = optionsOrOutputDir.outputDir;
      if (optionsOrOutputDir.packageName) {
        pkg = optionsOrOutputDir.packageName;
      }
    } else {
      targetBaseDir = optionsOrOutputDir;
    }

    const targetDir = targetBaseDir.endsWith('screen')
      ? path.resolve(targetBaseDir)
      : path.resolve(targetBaseDir, 'screen');

    fs.mkdirSync(targetDir, { recursive: true });

    const basePkg = pkg.endsWith('.screen') ? pkg.slice(0, -7) : pkg;

    const files = [
      { name: 'ClaudeDesignScreen.kt', content: generateScreenFile(spec, basePkg) },
      { name: 'ClaudeDesignPreview.kt', content: generatePreviewFile(basePkg) }
    ];

    const written = [];
    for (const f of files) {
      const fullPath = path.join(targetDir, f.name);
      fs.writeFileSync(fullPath, f.content, 'utf8');
      written.push(fullPath);
    }
    return written;
  }
}

function generateScreen(spec, optionsOrOutputDir, packageName = 'com.claude.compose') {
  return ScreenGenerator.generateScreen(spec, optionsOrOutputDir, packageName);
}

module.exports = {
  ScreenGenerator,
  generateScreen,
  generateScreenFile,
  generatePreviewFile,
  translateLayout,
  isRowLayout,
  buildContainerModifier,
  translateNode,
  extractInteractiveStates
};
