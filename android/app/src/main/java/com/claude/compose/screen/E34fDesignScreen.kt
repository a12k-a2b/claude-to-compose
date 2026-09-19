package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare

// Sol:OS Authentic Color Palette sampled from reference
private val SolOsBg = Color(0xFFE7E4DE)
private val SolOsTextPrimary = Color(0xFF141413)
private val SolOsTextSecondary = Color(0xFF4D4C48)
private val SolOsTextTertiary = Color(0xFF7D7A73)
private val SolOsOrange = Color(0xFFFF5200)
private val SolOsWhitePill = Color(0xFFFAF8F5)
private val SolOsDarkPill = Color(0xFF1A1A1A)

@Composable
fun E34fDesignScreen(
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SolOsBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = 80.dp, top = 54.dp, end = 72.dp)
        ) {
            // Category Tag: Note Overlay · Sol:OS · DaylightLook Reskin
            Text(
                text = "NOTE OVERLAY · SOL:OS · DAYLIGHTLOOK RESKIN",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp,
                color = SolOsTextTertiary,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            // Screen Headline: A sheet of glass
            Text(
                text = "A sheet of glass",
                fontFamily = AbcArizonaFlare,
                fontSize = 54.sp,
                fontWeight = FontWeight.Normal,
                lineHeight = 60.sp,
                color = SolOsTextPrimary,
                modifier = Modifier.padding(bottom = 28.dp)
            )

            // Lead Paragraph
            Text(
                text = "The overlay sits over whatever you're reading, so its chrome has to stay legible over anything and never compete with the ink. This page collects the directions we explored for that chrome, arranged for reading top to bottom — from the most conventional to the most experimental — rather than in the order they were drawn.",
                fontSize = 19.sp,
                lineHeight = 31.sp,
                color = SolOsTextSecondary,
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .padding(bottom = 28.dp)
            )

            // Sub-paragraph with inline emphasis
            val subText = buildAnnotatedString {
                append("Read top to bottom, biggest decision first: the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SolOsTextPrimary)) {
                    append("four toolbar directions")
                }
                append(" and their bolder variants, a ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SolOsTextPrimary)) {
                    append("rotation check")
                }
                append(" that stress-tests them, the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SolOsTextPrimary)) {
                    append("Beyond the bar")
                }
                append(" interaction explorations, the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SolOsTextPrimary)) {
                    append("mildliner")
                }
                append(" feature built on them, and the ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = SolOsTextPrimary)) {
                    append("shared system")
                }
                append(" every direction inherits. Within a section, permutations sit side by side — scroll across to compare them; scroll down for the next section.")
            }
            Text(
                text = subText,
                fontSize = 15.sp,
                lineHeight = 26.sp,
                color = SolOsTextTertiary,
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .padding(bottom = 32.dp)
            )

            // Category rows and pills
            Column(
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Row 1: DIRECTIONS
                PillCategoryRow(
                    category = "DIRECTIONS",
                    items = listOf(
                        PillItem("6 · Toolbar band", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("1 · Frosted plate", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("3 · Floating slips", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("4 · Loose coins", SolOsWhitePill, SolOsTextPrimary, true)
                    )
                )

                // Row 2: BOLDER IDEAS
                PillCategoryRow(
                    category = "BOLDER IDEAS",
                    items = listOf(
                        PillItem("2a · Sun bloom", SolOsOrange, Color.White, false),
                        PillItem("3c · The dial", SolOsOrange, Color.White, false),
                        PillItem("6d · Ledger band", SolOsOrange, Color.White, false)
                    )
                )

                // Row 3: EVALUATE
                PillCategoryRow(
                    category = "EVALUATE",
                    items = listOf(
                        PillItem("5 · Rotation / landscape check", SolOsWhitePill, SolOsTextPrimary, true)
                    )
                )

                // Row 4: BEYOND THE BAR
                PillCategoryRow(
                    category = "BEYOND THE BAR",
                    items = listOf(
                        PillItem("g1 · Gestures", SolOsDarkPill, Color.White, false),
                        PillItem("g2 · The glass", SolOsDarkPill, Color.White, false),
                        PillItem("g3 · Ink", SolOsDarkPill, Color.White, false),
                        PillItem("g4 · Selection", SolOsDarkPill, Color.White, false),
                        PillItem("g5 · Pages", SolOsDarkPill, Color.White, false),
                        PillItem("g6 · First stroke", SolOsDarkPill, Color.White, false)
                    )
                )

                // Row 5: MILDLINER
                PillCategoryRow(
                    category = "MILDLINER",
                    items = listOf(
                        PillItem("m · The mildliner", SolOsOrange, Color.White, false)
                    )
                )

                // Row 6: SHARED SYSTEM
                PillCategoryRow(
                    category = "SHARED SYSTEM",
                    items = listOf(
                        PillItem("presets", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("cards", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("snip", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("small", SolOsWhitePill, SolOsTextPrimary, true),
                        PillItem("onboard", SolOsWhitePill, SolOsTextPrimary, true)
                    )
                )
            }
        }

        // Bottom border line & Claude Design watermark
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(Color(0xFF1A1A1A))
            )
        }

        Surface(
            shape = CircleShape,
            color = Color.White,
            border = BorderStroke(1.dp, Color(0x1A000000)),
            shadowElevation = 2.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 20.dp, bottom = 12.dp)
                .height(30.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("🎨", fontSize = 12.sp)
                Text("Made with Claude Design", fontSize = 11.sp, color = Color(0xFF64748B))
                Text("✕", fontSize = 10.sp, color = Color(0xFF94A3B8))
            }
        }
    }
}

private data class PillItem(
    val label: String,
    val bg: Color,
    val text: Color,
    val hasBorder: Boolean
)

@Composable
private fun PillCategoryRow(
    category: String,
    items: List<PillItem>
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = category,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.2.sp,
            color = SolOsTextTertiary,
            modifier = Modifier.width(100.dp)
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEach { pill ->
                Surface(
                    shape = CircleShape,
                    color = pill.bg,
                    border = if (pill.hasBorder) BorderStroke(1.dp, Color(0x14000000)) else null,
                    shadowElevation = if (pill.hasBorder) 1.dp else 0.dp
                ) {
                    Text(
                        text = pill.label,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = pill.text,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp)
                    )
                }
            }
        }
    }
}
