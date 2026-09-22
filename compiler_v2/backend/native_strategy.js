'use strict';

/**
 * compiler_v2/backend/native_strategy.js
 *
 * Implements the Native-First lowering strategy:
 * Uses standard Jetpack Compose components (Button, Text, Chip)
 * with verified accessibility semantics and minimum 48dp touch targets.
 */

function lowerTextNode(node, context = {}) {
  const text = node.measured.textRun;
  if (!text) return '';

  const sourceTag = `testTag("${node.sourceId}")`;
  const bounds = node.measured.boundsDp;
  const viewportWidth = context.viewport?.widthDp || (bounds.x > 500 ? 792 : 592);

  let fontCall = 'AbcArizonaSans';
  if (text.fontFamily.includes('Flare')) {
    fontCall = 'AbcArizonaFlare';
  } else if (text.fontFamily.includes('Mono')) {
    fontCall = 'FontFamily.Monospace';
  }

  const weightConst = text.fontWeight >= 600 ? 'FontWeight.SemiBold' : (text.fontWeight >= 500 ? 'FontWeight.Medium' : 'FontWeight.Normal');
  const alignConst = text.textAlign === 'center' ? 'TextAlign.Center' : 'TextAlign.Start';

  const colorHex = text.color.replace('#', '');
  const colorCall = colorHex.length === 6 ? `Color(0xFF${colorHex})` : `Color(0x${colorHex})`;

  let modifierCode = `Modifier`;
  if (bounds.width >= (viewportWidth - 10)) {
    modifierCode += `\n        .fillMaxWidth()`;
  } else {
    modifierCode += `\n        .width(${bounds.width}.dp)`;
  }

  // Handle spacing/offset if present
  if (bounds.x > 0) {
    modifierCode += `\n        .padding(start = ${bounds.x}.dp)`;
  }
  if (bounds.y > 0) {
    modifierCode += `\n        .padding(top = ${bounds.y}.dp)`;
  }
  modifierCode += `\n        .${sourceTag}`;

  const escapedContent = text.content.replace(/\n/g, '\\n').replace(/"/g, '\\"');
  const letterSpacingParam = (text.letterSpacing !== undefined && text.letterSpacing !== 0)
    ? `\n        letterSpacing = (${text.letterSpacing}).sp,`
    : '';

  return `    Text(
        text = "${escapedContent}",
        fontFamily = ${fontCall},
        fontSize = ${text.fontSizeSp}.sp,
        fontWeight = ${weightConst},
        lineHeight = ${text.lineHeightSp}.sp,${letterSpacingParam}
        color = ${colorCall},
        textAlign = ${alignConst},
        modifier = ${modifierCode}
    )`;
}

function lowerButtonNode(node, context = {}) {
  const text = node.measured.textRun?.content || 'Action';
  const bounds = node.measured.boundsDp;
  const sourceTag = `testTag("${node.sourceId}")`;
  const actionName = node.behavior?.action || 'onActionClick';

  const isDark = node.measured.style?.backgroundColor === '#000000';
  const bgColor = isDark ? 'Color(0xFF000000)' : 'Color.White';
  const textColor = isDark ? 'Color.White' : 'Color(0xFF1A1A1A)';
  const borderColor = node.measured.style?.borderColor ? `BorderStroke(1.dp, Color(0xFF${node.measured.style.borderColor.replace('#', '')}))` : 'null';
  const shapeCall = node.measured.style?.borderRadius ? `RoundedCornerShape(${node.measured.style.borderRadius}.dp)` : 'CircleShape';

  const viewportWidth = context.viewport?.widthDp || (bounds.x > 500 ? 792 : 592);
  const midX = viewportWidth / 2;

  let positioning = '';
  if (Math.abs((bounds.x + bounds.width / 2) - midX) <= 4) {
    positioning = `\n            .align(Alignment.TopCenter)\n            .padding(top = ${bounds.y}.dp)`;
  } else if (bounds.x > midX) {
    const endDp = Math.max(0, Number((viewportWidth - bounds.x - bounds.width).toFixed(1)));
    positioning = `\n            .align(Alignment.TopEnd)\n            .padding(top = ${bounds.y}.dp, end = ${endDp}.dp)`;
  } else {
    positioning = `\n            .align(Alignment.TopStart)\n            .padding(top = ${bounds.y}.dp, start = ${bounds.x}.dp)`;
  }

  return `    Surface(
        onClick = ${actionName},
        shape = ${shapeCall},
        color = ${bgColor},
        border = ${borderColor},
        modifier = Modifier${positioning}
            .minimumInteractiveComponentSize()
            .size(width = ${bounds.width}.dp, height = ${bounds.height}.dp)
            .testTag("${node.sourceId}")
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = "${text}",
                fontFamily = AbcArizonaSans,
                fontSize = ${node.measured.textRun?.fontSizeSp || 14}.sp,
                fontWeight = ${node.measured.textRun?.fontWeight >= 600 ? 'FontWeight.SemiBold' : (node.measured.textRun?.fontWeight >= 500 ? 'FontWeight.Medium' : 'FontWeight.Normal')},
                color = ${textColor}
            )
        }
    }`;
}

function lowerChipGroupNode(node, context = {}) {
  const chips = node.chipsData || {};
  const row1 = chips.row1 || [];
  const row2 = chips.row2 || [];
  const selected = chips.selected || row1[0];

  return `    // Paper Motion Interactive Selection Chips (Sol:OS Native Chip Row)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = ${node.measured.boundsDp.y}.dp)
            .testTag("${node.sourceId}")
    ) {
        // Row 1 Chips with inline kicker label
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "${chips.label || 'PAPER MOTION'}",
                fontSize = 8.5.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 0.5.sp,
                color = Color(0xFF535353),
                modifier = Modifier.padding(end = 1.dp)
            )
${row1.map((c, idx) => `            DaylightChip(
                text = "${c}",
                isSelected = (selectedChip == "${c}"),
                onClick = { selectedChip = "${c}"; onChipSelected("${c}") },
                sourceId = "${node.sourceId}/chip_${idx}"
            )`).join('\n')}
        }
        
        Spacer(modifier = Modifier.height(7.dp))
        
        // Row 2 Chips
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            modifier = Modifier.fillMaxWidth()
        ) {
${row2.map((c, idx) => `            DaylightChip(
                text = "${c}",
                isSelected = (selectedChip == "${c}"),
                onClick = { selectedChip = "${c}"; onChipSelected("${c}") },
                sourceId = "${node.sourceId}/chip_r2_${idx}"
            )`).join('\n')}
        }
    }`;
}

function lowerImageNode(node, context = {}) {
  const bounds = node.measured.boundsDp;
  const sourceTag = `testTag("${node.sourceId}")`;
  const viewportWidth = context.viewport?.widthDp || (bounds.x > 500 ? 792 : 592);
  const midX = viewportWidth / 2;

  let positioning = '';
  if (Math.abs((bounds.x + bounds.width / 2) - midX) <= 4) {
    positioning = `\n        .align(Alignment.TopCenter)\n        .padding(top = ${bounds.y}.dp)`;
  } else {
    positioning = `\n        .align(Alignment.TopStart)\n        .padding(start = ${bounds.x}.dp, top = ${bounds.y}.dp)`;
  }

  return `    // Daylight Brand Logo Glyph (Native Asset)
    Image(
        painter = painterResource(id = R.drawable.daylight_logo),
        contentDescription = "${node.sourceId}",
        modifier = Modifier${positioning}
            .${sourceTag}
            .size(${bounds.width}.dp)
    )`;
}

module.exports = {
  lowerTextNode,
  lowerButtonNode,
  lowerChipGroupNode,
  lowerImageNode
};
