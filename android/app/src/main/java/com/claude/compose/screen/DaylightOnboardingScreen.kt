package com.claude.compose.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// E-Ink Warm Palette Tokens extracted from Daylight DC1
private val DaylightBezel = Color(0xFFE5E2D9)
private val DaylightScreenBg = Color(0xFFFAF9F5)
private val DaylightGridLine = Color(0xFFE5E4DE)
private val DaylightInk = Color(0xFF1C1C1A)
private val DaylightInkMuted = Color(0xFF686862)
private val DaylightInkSubtle = Color(0xFF9E9E96)
private val DaylightButtonDark = Color(0xFF383734)
private val DaylightButtonHover = Color(0xFF242321)
private val DaylightChipBg = Color(0xFFEDECE6)
private val DaylightChipActive = Color(0xFF383734)

/**
 * Daylight DC1 "The Living Page" Onboarding Screen.
 * Pixel-perfect Jetpack Compose replication of the Claude Design artifact.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DaylightOnboardingScreen(
    onSkipClick: () -> Unit = {},
    onGetStartedClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val motionPresets = remember {
        listOf(
            "Footprints", "Contours", "Filigree", "Flow",
            "Whorls", "Feather", "Streets", "Sunrise"
        )
    }
    var selectedPresetIndex by rememberSaveable { mutableIntStateOf(0) }

    // Exterior device bezel container (simulating the physical Daylight DC1 tablet chassis)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF141414))
            .padding(horizontal = 16.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center
    ) {
        // Tablet Bezel
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .shadow(elevation = 16.dp, shape = RoundedCornerShape(32.dp)),
            shape = RoundedCornerShape(32.dp),
            color = DaylightBezel
        ) {
            // Inner E-Ink Display Screen
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(14.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(DaylightScreenBg)
                    .border(0.5.dp, Color(0xFFD4D2C9), RoundedCornerShape(20.dp))
            ) {
                // Background Minimalist Grid & Architectural Guide Lines
                DaylightGridCanvas(modifier = Modifier.fillMaxSize())

                // Top Navigation Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Spacer(modifier = Modifier.size(24.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Skip Button
                        Box(
                            modifier = Modifier
                                .border(0.5.dp, DaylightInkSubtle.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                                .background(DaylightScreenBg, RoundedCornerShape(12.dp))
                                .clickable(onClick = onSkipClick)
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "Skip",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Normal,
                                color = DaylightInkMuted
                            )
                        }

                        // Compass Rose Graphic
                        CompassRoseIcon(modifier = Modifier.size(36.dp))
                    }
                }

                // Central Hero Content
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    // Daylight DC1 Logo Mark
                    DaylightLogoGlyph(
                        modifier = Modifier
                            .size(48.dp)
                            .padding(bottom = 12.dp)
                    )

                    // Subtitle / Label
                    Text(
                        text = "DAYLIGHT DC1 · THE LIVING PAGE",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp,
                        color = DaylightInkMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    // Hero Headline
                    Text(
                        text = "Step into daylight",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Serif,
                        color = DaylightInk,
                        textAlign = TextAlign.Center,
                        lineHeight = 38.sp,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    // Description paragraph
                    Text(
                        text = "A reflective paper screen that moves like ink — 60 to 120 frames a second, and not a drop of blue light. Let's make it yours.",
                        fontSize = 13.sp,
                        color = DaylightInkMuted,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                        modifier = Modifier
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    )

                    Spacer(modifier = Modifier.height(28.dp))

                    // Primary Call to Action Button with Native Ripple & Motion
                    val interactionSource = remember { MutableInteractionSource() }
                    val isPressed by interactionSource.collectIsPressedAsState()
                    val buttonElevation by animateDpAsState(
                        targetValue = if (isPressed) 1.dp else 4.dp,
                        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                        label = "ctaElevation"
                    )
                    val buttonColor by animateColorAsState(
                        targetValue = if (isPressed) DaylightButtonHover else DaylightButtonDark,
                        animationSpec = tween(150),
                        label = "ctaColor"
                    )

                    Button(
                        onClick = onGetStartedClick,
                        interactionSource = interactionSource,
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = buttonElevation),
                        shape = RoundedCornerShape(24.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = buttonColor),
                        modifier = Modifier
                            .height(48.dp)
                            .width(140.dp)
                    ) {
                        Text(
                            text = "Get started",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Spacer(modifier = Modifier.height(36.dp))

                    // "Paper Motion" Interactive Tabs
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "PAPER MOTION",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 1.5.sp,
                            color = DaylightInkSubtle,
                            modifier = Modifier.padding(bottom = 10.dp)
                        )

                        FlowRow(
                            horizontalArrangement = Arrangement.Center,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            motionPresets.forEachIndexed { index, preset ->
                                val isSelected = index == selectedPresetIndex
                                val chipBg by animateColorAsState(
                                    targetValue = if (isSelected) DaylightChipActive else DaylightChipBg,
                                    animationSpec = tween(200),
                                    label = "chipBg"
                                )
                                val chipText by animateColorAsState(
                                    targetValue = if (isSelected) Color.White else DaylightInkMuted,
                                    animationSpec = tween(200),
                                    label = "chipText"
                                )

                                Box(
                                    modifier = Modifier
                                        .padding(horizontal = 4.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(chipBg)
                                        .clickable { selectedPresetIndex = index }
                                        .padding(horizontal = 10.dp, vertical = 5.dp)
                                ) {
                                    Text(
                                        text = preset,
                                        fontSize = 11.sp,
                                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                        color = chipText
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Minimalist background grid canvas rendering subtle e-ink grid lines and topographic curve accents.
 */
@Composable
fun DaylightGridCanvas(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height
        val gridSpacing = 40.dp.toPx()

        // Vertical Grid lines
        var x = gridSpacing
        while (x < width) {
            drawLine(
                color = DaylightGridLine,
                start = Offset(x, 0f),
                end = Offset(x, height),
                strokeWidth = 0.5f
            )
            x += gridSpacing
        }

        // Horizontal Grid lines
        var y = gridSpacing
        while (y < height) {
            drawLine(
                color = DaylightGridLine,
                start = Offset(0f, y),
                end = Offset(width, y),
                strokeWidth = 0.5f
            )
            y += gridSpacing
        }

        // Decorative subtle topographic curve path
        val path = Path().apply {
            moveTo(0f, height * 0.28f)
            cubicTo(
                width * 0.3f, height * 0.29f,
                width * 0.7f, height * 0.32f,
                width, height * 0.30f
            )
        }
        drawPath(
            path = path,
            color = DaylightGridLine.copy(alpha = 0.8f),
            style = Stroke(width = 1f)
        )
    }
}

/**
 * Daylight DC1 Logo Glyph (circle with nested crescent curves).
 */
@Composable
fun DaylightLogoGlyph(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val radius = size.minDimension / 2f
        val center = Offset(size.width / 2f, size.height / 2f)

        // Outer circle
        drawCircle(
            color = DaylightInk,
            radius = radius,
            center = center
        )

        // Inner cutouts creating the Daylight Living Page icon
        drawCircle(
            color = DaylightScreenBg,
            radius = radius * 0.55f,
            center = Offset(center.x - radius * 0.2f, center.y - radius * 0.2f)
        )

        drawCircle(
            color = DaylightInk,
            radius = radius * 0.28f,
            center = Offset(center.x + radius * 0.15f, center.y + radius * 0.15f)
        )
    }
}

/**
 * Compass Rose Graphic in top-right.
 */
@Composable
fun CompassRoseIcon(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = size.minDimension / 2.2f

        // Outer ring
        drawCircle(
            color = DaylightInkMuted,
            radius = radius,
            center = center,
            style = Stroke(width = 1f)
        )

        // 4-Point Star
        val starPath = Path().apply {
            moveTo(center.x, center.y - radius * 0.9f) // Top
            lineTo(center.x + radius * 0.2f, center.y - radius * 0.2f)
            lineTo(center.x + radius * 0.9f, center.y) // Right
            lineTo(center.x + radius * 0.2f, center.y + radius * 0.2f)
            lineTo(center.x, center.y + radius * 0.9f) // Bottom
            lineTo(center.x - radius * 0.2f, center.y + radius * 0.2f)
            lineTo(center.x - radius * 0.9f, center.y) // Left
            lineTo(center.x - radius * 0.2f, center.y - radius * 0.2f)
            close()
        }

        drawPath(path = starPath, color = DaylightInk)
    }
}

@Preview(showBackground = true, widthDp = 390, heightDp = 844)
@Composable
fun DaylightOnboardingPreview() {
    MaterialTheme {
        DaylightOnboardingScreen()
    }
}
