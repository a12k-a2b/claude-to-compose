package com.claude.compose.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.claude.compose.R

val AbcArizonaFlare = FontFamily(
    Font(R.font.abc_arizona_flare, FontWeight.Normal),
    Font(R.font.abc_arizona_flare, FontWeight.Medium),
    Font(R.font.abc_arizona_flare, FontWeight.Bold)
)

val AbcArizonaSans = FontFamily(
    Font(R.font.abc_arizona_sans, FontWeight.Normal),
    Font(R.font.abc_arizona_sans, FontWeight.Medium),
    Font(R.font.abc_arizona_sans, FontWeight.SemiBold),
    Font(R.font.abc_arizona_sans, FontWeight.Bold)
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
    trim = LineHeightStyle.Trim.Both
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
    displayLarge = BaseTextStyle.copy(
        fontFamily = AbcArizonaFlare,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 44.sp,
        letterSpacing = 0.sp
    ),
    headlineSmall = BaseTextStyle.copy(
        fontFamily = AbcArizonaFlare,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp
    ),
    titleLarge = BaseTextStyle.copy(
        fontFamily = AbcArizonaSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp
    ),
    titleMedium = BaseTextStyle.copy(
        fontFamily = AbcArizonaSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.15.sp
    ),
    bodyLarge = BaseTextStyle.copy(
        fontFamily = AbcArizonaSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    ),
    bodyMedium = BaseTextStyle.copy(
        fontFamily = AbcArizonaSans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    ),
    bodySmall = BaseTextStyle.copy(
        fontFamily = AbcArizonaSans,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp
    ),
    labelLarge = BaseTextStyle.copy(
        fontFamily = AbcRomMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    ),
    labelSmall = BaseTextStyle.copy(
        fontFamily = AbcRomMono,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)

val AppTypography = ClaudeTypography
