/**
 * synthesizer/component_generator.js
 * Generates standalone atomic Material 3 composables with state hoisting and event lambdas
 */

const fs = require('node:fs');
const path = require('node:path');

const KOTLIN_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
  'if', 'in', 'is', 'null', 'object', 'package', 'return', 'super', 'this',
  'throw', 'true', 'try', 'typealias', 'val', 'var', 'when', 'while'
]);

/**
 * Sanitizes an identifier to be a safe Kotlin name.
 * @param {string} name 
 * @returns {string}
 */
function sanitizeIdentifier(name) {
  if (!name || typeof name !== 'string') return 'item';
  const clean = name.trim();
  if (KOTLIN_KEYWORDS.has(clean.toLowerCase())) {
    return `\`${clean}\``;
  }
  return clean.replace(/[^a-zA-Z0-9_]/g, '') || 'item';
}

/**
 * Generates AppButton.kt
 */
function generateButtonComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PrimaryActionButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: RoundedCornerShape = RoundedCornerShape(8.dp),
    onClick: () -> Unit = {}
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = shape,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary
        )
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
fun SecondaryOutlinedButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {}
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
fun GhostTextButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {}
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
fun AppIconButton(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {},
    content: @Composable () -> Unit
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
        content = content
    )
}
`;
}

/**
 * Generates AppCard.kt
 */
function generateCardComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Material 3 Card component with support for interactive clicks, native ripples,
 * and animated pressed elevation feedback.
 */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    elevation: Dp = 2.dp,
    pressedElevation: Dp = 6.dp,
    shape: RoundedCornerShape = RoundedCornerShape(12.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val animatedElevation by animateDpAsState(
        targetValue = if (isPressed && onClick != null) pressedElevation else elevation,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "cardElevation"
    )

    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier
                .fillMaxWidth()
                .minimumInteractiveComponentSize(),
            shape = shape,
            elevation = CardDefaults.cardElevation(
                defaultElevation = animatedElevation,
                pressedElevation = pressedElevation
            ),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface
            ),
            interactionSource = interactionSource,
            content = content
        )
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            elevation = CardDefaults.cardElevation(defaultElevation = elevation),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface
            ),
            content = content
        )
    }
}

/**
 * MetricCard displaying a KPI metric with title, value, optional badge, and interactive click ripple.
 */
@Composable
fun MetricCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    badgeText: String? = null,
    onClick: (() -> Unit)? = null
) {
    AppCard(
        modifier = modifier,
        onClick = onClick,
        elevation = 2.dp,
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (badgeText != null) {
                StatusBadge(
                    text = badgeText,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}
`;
}

/**
 * Generates AppTextField.kt
 */
function generateTextFieldComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.VisualTransformation

@Composable
fun AppInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    isError: Boolean = false,
    errorMessage: String? = null,
    singleLine: Boolean = true,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (placeholder.isNotEmpty()) { { Text(placeholder) } } else null,
        isError = isError,
        singleLine = singleLine,
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        supportingText = if (isError && errorMessage != null) {
            { Text(text = errorMessage, color = MaterialTheme.colorScheme.error) }
        } else null,
        modifier = modifier.fillMaxWidth()
    )
}
`;
}

/**
 * Generates AppBadge.kt
 */
function generateBadgeComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun StatusBadge(
    text: String,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    contentColor: Color = MaterialTheme.colorScheme.onPrimaryContainer
) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = containerColor,
        contentColor = contentColor,
        modifier = modifier
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}
`;
}

/**
 * Generates AppCheckbox.kt
 */
function generateCheckboxComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AppCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minHeight = 48.dp)
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
`;
}

/**
 * Generates AppRadioButton.kt
 */
function generateRadioButtonComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AppRadioButton(
    selected: Boolean,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit = {}
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .defaultMinSize(minHeight = 48.dp)
            .clickable(enabled = enabled) { onClick() }
    ) {
        RadioButton(
            selected = selected,
            onClick = onClick,
            enabled = enabled
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
`;
}

/**
 * Generates AppNavigation.kt
 */
function generateNavigationComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector

data class NavigationItemData(
    val title: String,
    val icon: ImageVector? = null,
    val route: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {}
) {
    TopAppBar(
        title = { Text(text = title) },
        navigationIcon = navigationIcon,
        actions = actions,
        modifier = modifier
    )
}

@Composable
fun AppNavigationBar(
    items: List<NavigationItemData>,
    selectedIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(modifier = modifier) {
        items.forEachIndexed { index, item ->
            NavigationBarItem(
                selected = selectedIndex == index,
                onClick = { onItemSelected(index) },
                label = { Text(item.title) },
                icon = {
                    if (item.icon != null) {
                        Icon(imageVector = item.icon, contentDescription = item.title)
                    }
                }
            )
        }
    }
}
`;
}

/**
 * Generates AppChip.kt
 */
function generateChipComponent(packageName) {
  return `package ${packageName}.components

import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun AppFilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: String,
    modifier: Modifier = Modifier
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier
    )
}

@Composable
fun AppAssistChip(
    onClick: () -> Unit,
    label: String,
    modifier: Modifier = Modifier
) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier
    )
}
`;
}

class ComponentGenerator {
  /**
   * Main component synthesis driver.
   * @param {Object} hierarchy DOM node hierarchy
   * @param {string|Object} optionsOrOutputDir Root directory or options object { outputDir, packageName }
   * @param {string} [packageName='com.claude.compose'] e.g. "com.claude.compose"
   * @returns {Array<string>} list of generated file paths
   */
  static generateComponents(hierarchy, optionsOrOutputDir, packageName = 'com.claude.compose') {
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

    const targetDir = targetBaseDir.endsWith('components')
      ? path.resolve(targetBaseDir)
      : path.resolve(targetBaseDir, 'components');

    fs.mkdirSync(targetDir, { recursive: true });

    const basePkg = pkg.endsWith('.components') ? pkg.slice(0, -11) : pkg;

    const files = [
      { name: 'AppButton.kt', content: generateButtonComponent(basePkg) },
      { name: 'AppCard.kt', content: generateCardComponent(basePkg) },
      { name: 'AppTextField.kt', content: generateTextFieldComponent(basePkg) },
      { name: 'AppBadge.kt', content: generateBadgeComponent(basePkg) },
      { name: 'AppCheckbox.kt', content: generateCheckboxComponent(basePkg) },
      { name: 'AppRadioButton.kt', content: generateRadioButtonComponent(basePkg) },
      { name: 'AppNavigation.kt', content: generateNavigationComponent(basePkg) },
      { name: 'AppChip.kt', content: generateChipComponent(basePkg) }
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

function generateComponents(hierarchy, optionsOrOutputDir, packageName = 'com.claude.compose') {
  return ComponentGenerator.generateComponents(hierarchy, optionsOrOutputDir, packageName);
}

module.exports = {
  ComponentGenerator,
  generateComponents,
  sanitizeIdentifier,
  generateButtonComponent,
  generateCardComponent,
  generateTextFieldComponent,
  generateBadgeComponent,
  generateCheckboxComponent,
  generateRadioButtonComponent,
  generateNavigationComponent,
  generateChipComponent
};
