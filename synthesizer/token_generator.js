/**
 * synthesizer/token_generator.js
 * Generates Kotlin Material 3 Design Token files from design_spec.json.theme
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Normalizes any CSS color string (hex3, hex6, hex8, rgb, rgba, transparent)
 * to a Kotlin Compose Color representation.
 * @param {string} cssColor 
 * @returns {string} Kotlin code, e.g. "Color(0xFF4F46E5)" or "Color.Transparent"
 */
function cssColorToCompose(cssColor) {
  if (!cssColor || typeof cssColor !== 'string') {
    return 'Color.Unspecified';
  }
  const str = cssColor.trim().toLowerCase();
  if (str === 'transparent' || str === 'rgba(0, 0, 0, 0)' || str === 'rgba(0,0,0,0)') {
    return 'Color.Transparent';
  }

  // Handle Hex
  if (str.startsWith('#')) {
    const clean = str.replace('#', '');
    if (clean.length === 3 && /^[0-9a-f]{3}$/i.test(clean)) {
      const r = clean[0] + clean[0];
      const g = clean[1] + clean[1];
      const b = clean[2] + clean[2];
      return `Color(0xFF${(r + g + b).toUpperCase()})`;
    }
    if (clean.length === 6 && /^[0-9a-f]{6}$/i.test(clean)) {
      return `Color(0xFF${clean.toUpperCase()})`;
    }
    if (clean.length === 8 && /^[0-9a-f]{8}$/i.test(clean)) {
      // CSS hex8 is #RRGGBBAA -> Convert to ARGB for Kotlin Color (0xAARRGGBB)
      const rr = clean.slice(0, 2);
      const gg = clean.slice(2, 4);
      const bb = clean.slice(4, 6);
      const aa = clean.slice(6, 8);
      return `Color(0x${(aa + rr + gg + bb).toUpperCase()})`;
    }
    return 'Color(0xFF000000)';
  }

  // Handle rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(parseInt(rgbaMatch[1], 10)).toString(16).padStart(2, '0');
    const g = clamp(parseInt(rgbaMatch[2], 10)).toString(16).padStart(2, '0');
    const b = clamp(parseInt(rgbaMatch[3], 10)).toString(16).padStart(2, '0');
    const alphaVal = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0;
    const a = clamp(Math.round((Number.isFinite(alphaVal) ? alphaVal : 1.0) * 255)).toString(16).padStart(2, '0');
    return `Color(0x${(a + r + g + b).toUpperCase()})`;
  }

  return 'Color(0xFF000000)';
}

/**
 * Normalizes CSS font weight (100-900) into standard Compose FontWeight constant.
 * @param {number|string} weight 
 * @returns {string} "FontWeight.Bold", etc.
 */
function normalizeFontWeight(weight) {
  const num = parseInt(weight, 10);
  if (isNaN(num)) return 'FontWeight.Normal';
  if (num <= 150) return 'FontWeight.Thin';
  if (num <= 250) return 'FontWeight.ExtraLight';
  if (num <= 350) return 'FontWeight.Light';
  if (num <= 450) return 'FontWeight.Normal';
  if (num <= 550) return 'FontWeight.Medium';
  if (num <= 650) return 'FontWeight.SemiBold';
  if (num <= 750) return 'FontWeight.Bold';
  if (num <= 850) return 'FontWeight.ExtraBold';
  return 'FontWeight.Black';
}

/**
 * Formats Spacing / Letter Spacing into valid Kotlin Unit.
 * @param {number} value 
 * @returns {string} e.g. "24.sp" or "(-0.5).sp"
 */
function formatSp(value) {
  if (!Number.isFinite(value)) return '0.sp';
  if (value < 0) {
    return `(-${Math.abs(value)}).sp`;
  }
  return `${value}.sp`;
}

/**
 * Generates Color.kt
 */
function generateColorFile(theme, packageName) {
  const colors = (theme && theme.colors) || {};
  const light = colors.light || {};
  const dark = colors.dark || {};

  const primaryColor = light.primary || colors.primary || '#4F46E5';
  const backgroundColor = light.background || colors.background || '#FFFFFF';
  const surfaceColor = light.surface || colors.surface || '#FFFFFF';

  return `package ${packageName}.theme

import androidx.compose.ui.graphics.Color

// Primary & Brand Tokens
val PrimaryIndigo = ${cssColorToCompose(primaryColor)}
val PrimaryHover = ${cssColorToCompose(colors.primaryHover || '#4338CA')}
val SecondaryEmerald = ${cssColorToCompose(light.secondary || '#10B981')}
val TertiaryAmber = ${cssColorToCompose(light.tertiary || '#F59E0B')}
val ErrorRed = ${cssColorToCompose(light.error || '#EF4444')}
val SuccessGreen = ${cssColorToCompose(colors.success || '#10B981')}

// Named Surface Tokens
val PageBackground = ${cssColorToCompose(backgroundColor)}
val CardSurface = ${cssColorToCompose(surfaceColor)}

// Light Mode Surface & Neutral Tokens
val LightBackground = ${cssColorToCompose(backgroundColor)}
val LightOnBackground = ${cssColorToCompose(light.onBackground || '#0F172A')}
val LightSurface = ${cssColorToCompose(surfaceColor)}
val LightOnSurface = ${cssColorToCompose(light.onSurface || '#0F172A')}
val LightSurfaceVariant = ${cssColorToCompose(light.surfaceVariant || '#F1F5F9')}
val LightOnSurfaceVariant = ${cssColorToCompose(light.onSurfaceVariant || '#64748B')}
val LightOutline = ${cssColorToCompose(light.outline || '#CBD5E1')}
val LightOutlineVariant = ${cssColorToCompose(light.outlineVariant || '#E2E8F0')}

// Dark Mode Surface & Neutral Tokens
val DarkPrimary = ${cssColorToCompose(dark.primary || '#818CF8')}
val DarkBackground = ${cssColorToCompose(dark.background || '#0F172A')}
val DarkOnBackground = ${cssColorToCompose(dark.onBackground || '#F8FAFC')}
val DarkSurface = ${cssColorToCompose(dark.surface || '#1E293B')}
val DarkOnSurface = ${cssColorToCompose(dark.onSurface || '#F8FAFC')}
val DarkSurfaceVariant = ${cssColorToCompose(dark.surfaceVariant || '#334155')}
val DarkOnSurfaceVariant = ${cssColorToCompose(dark.onSurfaceVariant || '#94A3B8')}
val DarkOutline = ${cssColorToCompose(dark.outline || '#475569')}
val DarkOutlineVariant = ${cssColorToCompose(dark.outlineVariant || '#334155')}

// Official Daylight Sol:OS Neutral Scale Tokens (--os-0 through --os-1000)
val SolOs0 = Color(0xFFFFFFFF)       // Base paper / ground
val SolOs50 = Color(0xFFF7F7F7)      // Surface panels / cards
val SolOs100 = Color(0xFFDCD5C9)     // Hairline borders
val SolOs150 = Color(0xFFF5F5F5)     // Recessed canvas
val SolOs200 = Color(0xFFCCCCCC)     // Disabled
val SolOs300 = Color(0xFF858585)     // Low emphasis / tertiary text
val SolOs400 = Color(0xFF535353)     // Secondary text ink
val SolOs800 = Color(0xFF343434)     // Dark fields / pressed states
val SolOs900 = Color(0xFF1A1A1A)     // Primary text ink / headlines
val SolOs1000 = Color(0xFF000000)    // Max black ink

// Sol:OS Canvas & Shorthand Aliases
val Os0 = SolOs0
val Os50 = SolOs50
val Os100 = SolOs100
val Os150 = SolOs150
val Os200 = SolOs200
val Os300 = SolOs300
val Os400 = SolOs400
val Os800 = SolOs800
val Os900 = SolOs900
val Os1000 = SolOs1000

// Calibrated Brand Grays
val SolOsBrandYellow = Color(0xFFCECECE)
val SolOsBrandAmber = Color(0xFF9D9D9E)
val SolOsBrandOrange = Color(0xFF6C6C6D)

// Authentic Sol:OS Surface & Semantic Tokens
val SolOsBg = Color(0xFFE7E4DE)
val SolOsTextPrimary = Color(0xFF141413)
val SolOsTextSecondary = Color(0xFF4D4C48)
val SolOsTextTertiary = Color(0xFF7D7A73)
val SolOsOrange = Color(0xFFFF5200)
val SolOsWhitePill = Color(0xFFFFFFFF)
val SolOsDarkPill = Color(0xFF1A1A1A)
`;
}

/**
 * Generates Type.kt
 */
function generateTypeFile(theme, packageName) {
  const styles = (theme && theme.typography && theme.typography.styles) || {};
  const s = (name, fallbackSize, fallbackWeight, fallbackLine) => {
    const item = styles[name] || {};
    const size = item.fontSize || fallbackSize;
    const weight = normalizeFontWeight(item.fontWeight || fallbackWeight);
    const line = item.lineHeight || fallbackLine;
    const letter = item.letterSpacing !== undefined ? item.letterSpacing : 0;
    return `    ${name} = BaseTextStyle.copy(
        fontWeight = ${weight},
        fontSize = ${formatSp(size)},
        lineHeight = ${formatSp(line)},
        letterSpacing = ${formatSp(letter)}
    )`;
  };

  return `@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package ${packageName}.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.claude.compose.R

// Optical sizing helper for variable fonts across display sizes (16..48)
fun createOpticalFontFamily(resId: Int, opsz: Float = 32f): FontFamily {
    val clampedOpsz = opsz.coerceIn(16f, 48f)
    return FontFamily(
        Font(resId, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", clampedOpsz))),
        Font(resId, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", clampedOpsz))),
        Font(resId, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", clampedOpsz))),
        Font(resId, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", clampedOpsz)))
    )
}

val AbcArizonaFlare = FontFamily(
    Font(R.font.abc_arizona_flare, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 32f))),
    Font(R.font.abc_arizona_flare, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 32f))),
    Font(R.font.abc_arizona_flare, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 32f)))
)

val AbcArizonaFlareHeadline = FontFamily(
    Font(R.font.abc_arizona_flare, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 48f))),
    Font(R.font.abc_arizona_flare, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 48f))),
    Font(R.font.abc_arizona_flare, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 48f)))
)

val AbcArizonaSans = FontFamily(
    Font(R.font.abc_arizona_sans, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 16f))),
    Font(R.font.abc_arizona_sans, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 16f))),
    Font(R.font.abc_arizona_sans, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 16f))),
    Font(R.font.abc_arizona_sans, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", 16f)))
)

val AbcRom = FontFamily(
    Font(R.font.abc_rom, FontWeight.Normal)
)

val AbcRomMono = FontFamily(
    Font(R.font.abc_rom_mono, FontWeight.Normal),
    Font(R.font.abc_rom_mono, FontWeight.Medium),
    Font(R.font.abc_rom_mono, FontWeight.SemiBold),
    Font(R.font.abc_rom_mono, FontWeight.Bold)
)

@Suppress("DEPRECATION")
val BasePlatformTextStyle = PlatformTextStyle(
    includeFontPadding = false
)

val BaseLineHeightStyle = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None
)

val BaseTextStyle = TextStyle(
    platformStyle = BasePlatformTextStyle,
    lineHeightStyle = BaseLineHeightStyle
)

fun claudeTextStyle(
    fontFamily: FontFamily = AbcArizonaSans,
    fontWeight: FontWeight = FontWeight.Normal,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = TextUnit.Unspecified,
    letterSpacing: TextUnit = 0.sp,
    baselineShift: BaselineShift? = null,
    color: Color = Color.Unspecified
): TextStyle = TextStyle(
    fontFamily = fontFamily,
    fontWeight = fontWeight,
    fontSize = fontSize,
    lineHeight = if (lineHeight != TextUnit.Unspecified) lineHeight else (fontSize.value * 1.3).sp,
    letterSpacing = letterSpacing,
    baselineShift = baselineShift,
    color = color,
    platformStyle = BasePlatformTextStyle,
    lineHeightStyle = BaseLineHeightStyle
)

val ClaudeTypography = Typography(
${s('displayLarge', 36, 700, 44)},
${s('headlineSmall', 28, 700, 32)},
${s('titleLarge', 22, 600, 28)},
${s('titleMedium', 16, 600, 24)},
${s('bodyLarge', 16, 400, 24)},
${s('bodyMedium', 14, 400, 20)},
${s('bodySmall', 12, 400, 16)},
${s('labelLarge', 14, 600, 20)},
${s('labelSmall', 11, 500, 16)}
)

val AppTypography = ClaudeTypography
`;
}

/**
 * Generates Theme.kt
 */
function generateThemeFile(theme, packageName) {
  return `package ${packageName}.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = PrimaryIndigo,
    onPrimary = LightBackground,
    primaryContainer = LightSurfaceVariant,
    onPrimaryContainer = PrimaryIndigo,
    secondary = SecondaryEmerald,
    onSecondary = LightBackground,
    background = PageBackground,
    onBackground = LightOnBackground,
    surface = CardSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    outlineVariant = LightOutlineVariant,
    error = ErrorRed,
    onError = LightBackground
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    onPrimary = DarkBackground,
    primaryContainer = DarkSurfaceVariant,
    onPrimaryContainer = DarkPrimary,
    secondary = SecondaryEmerald,
    onSecondary = DarkBackground,
    background = DarkBackground,
    onBackground = DarkOnBackground,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    outlineVariant = DarkOutlineVariant,
    error = ErrorRed,
    onError = DarkBackground
)

@Composable
fun ClaudeDesignTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                window.statusBarColor = colorScheme.background.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = ClaudeTypography,
        shapes = ClaudeShapes,
        content = content
    )
}

@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    ClaudeDesignTheme(darkTheme = darkTheme, content = content)
}
`;
}

/**
 * Generates Shape.kt
 */
function generateShapeFile(theme, packageName) {
  const radii = (theme && theme.radii) || {};
  const small = radii.small !== undefined ? radii.small : 4;
  const medium = radii.medium !== undefined ? radii.medium : 8;
  const large = radii.large !== undefined ? radii.large : 16;
  const extraSmall = radii.none !== undefined ? 4 : 4;

  return `package ${packageName}.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val ClaudeShapes = Shapes(
    extraSmall = RoundedCornerShape(${extraSmall}.dp),
    small = RoundedCornerShape(${small}.dp),
    medium = RoundedCornerShape(${medium}.dp),
    large = RoundedCornerShape(${large}.dp),
    extraLarge = CircleShape
)

val CardShape = RoundedCornerShape(${medium}.dp)
val PillShape = CircleShape
`;
}

/**
 * Generates Elevation.kt
 */
function generateElevationFile(theme, packageName) {
  return `package ${packageName}.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Immutable
data class ElevationTokens(
    val level0: Dp = 0.dp,
    val level1: Dp = 1.dp,
    val level2: Dp = 3.dp,
    val level3: Dp = 6.dp,
    val level4: Dp = 8.dp,
    val level5: Dp = 12.dp
)

val LocalElevations = staticCompositionLocalOf { ElevationTokens() }

@Immutable
data class SpacingTokens(
    val none: Dp = 0.dp,
    val extraSmall: Dp = 4.dp,
    val small: Dp = 8.dp,
    val medium: Dp = 16.dp,
    val large: Dp = 24.dp,
    val extraLarge: Dp = 32.dp,
    val xxl: Dp = 48.dp
)

val LocalSpacing = staticCompositionLocalOf { SpacingTokens() }

val CardElevation = 2.dp
val DialogElevation = 8.dp
val AppBarElevation = 4.dp
`;
}

class TokenGenerator {
  /**
   * Main token synthesis driver.
   * @param {Object} theme spec.theme
   * @param {string|Object} optionsOrOutputDir Root directory or options object { outputDir, packageName }
   * @param {string} [packageName='com.claude.compose'] e.g. "com.claude.compose"
   * @returns {Array<string>} list of generated file paths
   */
  static generateTokens(theme, optionsOrOutputDir, packageName = 'com.claude.compose') {
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

    // Ensure we write to .../theme subdirectory if not already at .../theme
    const targetDir = targetBaseDir.endsWith('theme')
      ? path.resolve(targetBaseDir)
      : path.resolve(targetBaseDir, 'theme');

    fs.mkdirSync(targetDir, { recursive: true });

    // Strip trailing .theme if pkg ended with .theme to avoid com.claude.compose.theme.theme
    const basePkg = pkg.endsWith('.theme') ? pkg.slice(0, -6) : pkg;

    const files = [
      { name: 'Color.kt', content: generateColorFile(theme, basePkg) },
      { name: 'Type.kt', content: generateTypeFile(theme, basePkg) },
      { name: 'Theme.kt', content: generateThemeFile(theme, basePkg) },
      { name: 'Shape.kt', content: generateShapeFile(theme, basePkg) },
      { name: 'Elevation.kt', content: generateElevationFile(theme, basePkg) }
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

function generateTokens(theme, optionsOrOutputDir, packageName = 'com.claude.compose') {
  return TokenGenerator.generateTokens(theme, optionsOrOutputDir, packageName);
}

module.exports = {
  TokenGenerator,
  generateTokens,
  cssColorToCompose,
  normalizeFontWeight,
  formatSp,
  generateColorFile,
  generateTypeFile,
  generateThemeFile,
  generateShapeFile,
  generateElevationFile
};
