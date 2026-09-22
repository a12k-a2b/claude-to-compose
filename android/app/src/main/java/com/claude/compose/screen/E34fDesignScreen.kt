package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaFlareHeadline
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono
import com.claude.compose.theme.BaseTextStyle

// Sol:OS Authentic Color Palette sampled from reference
private val SolOsBg = Color(0xFFE7E4DE)
private val SolOsTextPrimary = Color(0xFF141413)
private val SolOsTextSecondary = Color(0xFF4D4C48)
private val SolOsTextTertiary = Color(0xFF7D7A73)
private val SolOsOrange = Color(0xFFFF5200)
private val SolOsWhitePill = Color.White
private val SolOsDarkPill = Color(0xFF1A1A1A)

@Composable
fun E34fDesignScreen(
    useFlaredSerifHeadline: Boolean = true,
    modifier: Modifier = Modifier
) {
    val headlineFont = if (useFlaredSerifHeadline) AbcArizonaFlareHeadline else AbcArizonaSans

    Box(
        modifier = modifier
            .requiredSize(width = 1440.dp, height = 860.dp)
            .background(SolOsBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = 72.dp, top = 64.5.dp, end = 72.dp)
        ) {
            // Category Tag: NOTE OVERLAY · SOL:OS · DAYLIGHTLOOK RESKIN
            Text(
                text = "NOTE OVERLAY · SOL:OS · DAYLIGHTLOOK RESKIN",
                fontFamily = AbcRomMono,
                fontSize = 12.sp,
                fontWeight = FontWeight.Normal,
                lineHeight = 18.sp,
                letterSpacing = 1.68.sp,
                color = Color(0xFF6C6C6D),
                modifier = Modifier
                    .offset(x = (-1.75).dp, y = (-1.0).dp)
                    .padding(bottom = 12.5.dp),
                style = BaseTextStyle
            )

            // Screen Headline: A sheet of glass (Unified natural text layout)
            Text(
                text = "A sheet of glass",
                modifier = Modifier
                    .offset(x = 0.dp, y = 0.dp)
                    .padding(bottom = 13.0.dp),
                fontFamily = headlineFont,
                fontSize = 76.sp,
                lineHeight = 77.52.sp,
                letterSpacing = (-3.8).sp,
                color = Color(0xFF17190F),
                style = BaseTextStyle
            )

            // Lead Paragraph
            Text(
                text = "The overlay sits over whatever you're reading, so its chrome has to stay legible over anything\nand never compete with the ink. This page collects the directions we explored for that\nchrome, arranged for reading top to bottom — from the most conventional to the most\nexperimental — rather than in the order they were drawn.",
                fontFamily = AbcArizonaSans,
                fontSize = 20.sp,
                lineHeight = 31.sp,
                letterSpacing = (-0.4).sp,
                color = Color(0xFF3A3A37),
                modifier = Modifier
                    .width(790.dp)
                    .padding(bottom = 21.5.dp),
                style = BaseTextStyle
            )

            // Sub-paragraph with inline emphasis
            val subText = buildAnnotatedString {
                append("Read top to bottom, biggest decision first: the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = SolOsTextPrimary)) {
                    append("four toolbar directions")
                }
                append(" and their bolder variants, a ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = SolOsTextPrimary)) {
                    append("rotation check")
                }
                append("\nthat stress-tests them, the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = SolOsTextPrimary)) {
                    append("Beyond the bar")
                }
                append(" interaction explorations, the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = SolOsTextPrimary)) {
                    append("mildliner")
                }
                append(" feature built on them, and the\n")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = SolOsTextPrimary)) {
                    append("shared system")
                }
                append(" every direction inherits. Within a section, permutations sit side by side — scroll across to compare\nthem; scroll down for the next section.")
            }
            Text(
                text = subText,
                fontFamily = AbcArizonaSans,
                fontSize = 16.sp,
                lineHeight = 25.35.sp,
                letterSpacing = (-0.32).sp,
                color = Color(0xFF6C6C6D),
                modifier = Modifier
                    .width(742.dp)
                    .padding(bottom = 22.5.dp),
                style = BaseTextStyle
            )

            // Category rows and pills (50dp pitch, 100px center-to-center)
            Column(
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                // Row 1: DIRECTIONS (Pill 1 starts at 166.5dp -> 94.5dp column)
                PillCategoryRow(
                    category = "DIRECTIONS",
                    items = listOf(
                        PillItem("6 · Toolbar band", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("1 · Frosted plate", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("3 · Floating slips", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("4 · Loose coins", SolOsWhitePill, SolOsTextPrimary, true)
                    ),
                    spacing = 11.2.dp,
                    categoryColumnWidth = 94.5.dp
                )

                // Row 2: BOLDER IDEAS (Pill 1 starts at 180.5dp -> 108.5dp column)
                PillCategoryRow(
                    category = "BOLDER IDEAS",
                    items = listOf(
                        PillItem("2a · Sun bloom", SolOsOrange, Color.White, false),
                        PillItem("3c · The dial", SolOsOrange, Color.White, false),
                        PillItem("6d · Ledger band", SolOsOrange, Color.White, false)
                    ),
                    spacing = 8.0.dp,
                    categoryColumnWidth = 108.5.dp
                )

                // Row 3: EVALUATE (Pill 1 starts at 151.5dp -> 79.5dp column)
                PillCategoryRow(
                    category = "EVALUATE",
                    items = listOf(
                        PillItem("5 · Rotation / landscape check", SolOsWhitePill, SolOsTextPrimary, true)
                    ),
                    spacing = 11.0.dp,
                    categoryColumnWidth = 79.5.dp
                )

                // Row 4: BEYOND THE BAR (Pill 1 starts at 196.5dp -> 124.5dp column)
                PillCategoryRow(
                    category = "BEYOND THE BAR",
                    items = listOf(
                        PillItem("g1 · Gestures", SolOsDarkPill, Color.White, false),
                        PillItem("g2 · The glass", SolOsDarkPill, Color.White, false),
                        PillItem("g3 · Ink", SolOsDarkPill, Color.White, false),
                        PillItem("g4 · Selection", SolOsDarkPill, Color.White, false),
                        PillItem("g5 · Pages", SolOsDarkPill, Color.White, false),
                        PillItem("g6 · First stroke", SolOsDarkPill, Color.White, false)
                    ),
                    spacing = 10.4.dp,
                    categoryColumnWidth = 124.5.dp
                )

                // Row 5: MILDLINER (Pill 1 starts at 157.5dp -> 85.5dp column)
                PillCategoryRow(
                    category = "MILDLINER",
                    items = listOf(
                        PillItem("m · The mildliner", SolOsOrange, Color.White, false)
                    ),
                    spacing = 8.0.dp,
                    categoryColumnWidth = 85.5.dp,
                    labelModifier = Modifier.offset(y = (-0.5).dp),
                    categoryFontSize = 12.sp,
                    categoryLetterSpacing = 0.75.sp
                )

                // Row 6: SHARED SYSTEM (Pill 1 starts at 189.5dp -> 117.5dp column)
                PillCategoryRow(
                    category = "SHARED SYSTEM",
                    items = listOf(
                        PillItem("presets", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("cards", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("snip", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("small", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("onboard", SolOsWhitePill, SolOsTextPrimary, true)
                    ),
                    spacing = 9.0.dp,
                    categoryColumnWidth = 117.5.dp
                )
            }
        }

        Surface(
            shape = CircleShape,
            color = Color.White,
            border = BorderStroke(0.5.dp, Color(0x1A000000)),
            shadowElevation = 2.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.5.dp, bottom = 17.dp)
                .size(width = 211.dp, height = 29.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 10.dp, end = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Canvas(modifier = Modifier.size(14.dp)) {
                        drawCircle(color = Color(0xFFD97757), radius = 6.dp.toPx(), center = Offset(7.dp.toPx(), 7.dp.toPx()))
                        drawCircle(color = Color.White, radius = 1.2.dp.toPx(), center = Offset(4.5.dp.toPx(), 5.5.dp.toPx()))
                        drawCircle(color = Color.White, radius = 1.2.dp.toPx(), center = Offset(7.dp.toPx(), 4.dp.toPx()))
                        drawCircle(color = Color.White, radius = 1.2.dp.toPx(), center = Offset(9.5.dp.toPx(), 5.5.dp.toPx()))
                    }
                    Text(
                        text = "Made with Claude Design",
                        fontFamily = AbcArizonaSans,
                        fontSize = 12.5.sp,
                        lineHeight = 12.5.sp,
                        color = Color(0xFF141413),
                        style = BaseTextStyle
                    )
                }
                Box(
                    modifier = Modifier.size(20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Canvas(modifier = Modifier.size(12.dp)) {
                        drawLine(Color(0xFF141413), Offset(2.dp.toPx(), 2.dp.toPx()), Offset(10.dp.toPx(), 10.dp.toPx()), strokeWidth = 1.5.dp.toPx(), cap = StrokeCap.Round)
                        drawLine(Color(0xFF141413), Offset(10.dp.toPx(), 2.dp.toPx()), Offset(2.dp.toPx(), 10.dp.toPx()), strokeWidth = 1.5.dp.toPx(), cap = StrokeCap.Round)
                    }
                }
            }
        }

        // Browser horizontal scrollbar track (2dp height at y = 844.5dp from x = 72dp to 1368dp)
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawLine(
                color = Color(0xFF17190F),
                start = Offset(72.dp.toPx(), 844.5.dp.toPx()),
                end = Offset(1368.dp.toPx(), 844.5.dp.toPx()),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round
            )
        }
    }
}

private data class PillItem(
    val label: String,
    val bg: Color,
    val text: Color,
    val hasBorder: Boolean
)

// Category row component: guarantees unified 140dp horizontal pill baseline via categoryColumnWidth
@Composable
private fun PillCategoryRow(
    category: String,
    items: List<PillItem>,
    spacing: Dp = 10.5.dp,
    labelModifier: Modifier = Modifier,
    categoryColumnWidth: Dp = 140.dp,
    categoryFontSize: androidx.compose.ui.unit.TextUnit = 11.5.sp,
    categoryLetterSpacing: androidx.compose.ui.unit.TextUnit = 1.25.sp
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.width(categoryColumnWidth),
            contentAlignment = Alignment.CenterStart
        ) {
            Text(
                text = category,
                fontFamily = AbcRomMono,
                fontSize = categoryFontSize,
                fontWeight = FontWeight.Normal,
                letterSpacing = categoryLetterSpacing,
                color = Color(0xFF9A968F),
                maxLines = 1,
                softWrap = false,
                modifier = labelModifier
                    .width(140.dp)
                    .padding(start = 3.0.dp),
                style = BaseTextStyle
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEach { pill ->
                Surface(
                    shape = CircleShape,
                    color = pill.bg,
                    border = if (pill.hasBorder) BorderStroke(0.5.dp, Color(0x20000000)) else null,
                    shadowElevation = if (pill.hasBorder) 1.dp else 0.dp,
                    modifier = Modifier.requiredHeight(30.5.dp)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.requiredHeight(30.5.dp)
                    ) {
                        Text(
                            text = pill.label,
                            fontFamily = AbcRomMono,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            letterSpacing = 0.28.sp,
                            color = pill.text,
                            modifier = Modifier.padding(
                                horizontal = if (pill.bg == SolOsOrange) 14.3.dp else 13.dp
                            ),
                            style = BaseTextStyle
                        )
                    }
                }
            }
        }
    }
}
