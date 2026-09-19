package com.claude.compose.screen

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.R

// Daylight DC1 SolOS Neutral Grayscale Tokens
private val Os0 = Color(0xFFFFFFFF)     // Base paper ground (#FFFFFF)
private val Os50 = Color(0xFFF7F7F7)    // Surface cards
private val Os100 = Color(0xFFE2E0D8)   // Hairline grid & borders (#DCD5C9 / #E2E0D8)
private val Os150 = Color(0xFFF5F5F5)   // Recessed canvas
private val Os200 = Color(0xFFCECECE)   // Subtle lot outline
private val Os300 = Color(0xFF9E9E96)   // Monospace labels
private val Os400 = Color(0xFF535353)   // Secondary text & unselected chip text
private val Os800 = Color(0xFF343434)   // Description text
private val Os900 = Color(0xFF1A1A1A)   // Primary ink
private val Os1000 = Color(0xFF000000)  // Max black ink

/**
 * Daylight DC1 Native Onboarding Screen.
 * Exact replication of the Claude Design artifact at native DC1 specs:
 * 10.5in, 4:3 portrait, 1184 x 1584 px (592 x 792 dp @ 2x density).
 */
@Composable
fun DaylightDc1Screen(
    onSkipClick: () -> Unit = {},
    onGetStartedClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var selectedChipIndex by rememberSaveable { mutableIntStateOf(0) }
    val row1Chips = remember { listOf("Footprints", "Contours", "Filigree", "Flow", "Whorls", "Feather") }
    val row2Chips = remember { listOf("Streets", "Sunrise") }

    // Full screen 592 x 792 dp container
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Os0)
    ) {
        // 1. Background Cartesian Grid, Building Lots, and Footprint Lanes
        DaylightDc1BackgroundCanvas(modifier = Modifier.fillMaxSize())

        // 2a. Outer Hairline Frame (starts at y = 18dp, matching reference y = 36px)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 26.dp, vertical = 18.dp)
                .border(1.dp, Os100, RoundedCornerShape(4.dp))
        )

        // 2b. Inner Hairline Frame (inset by 8dp, matching reference y = 56px)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 34.dp, vertical = 28.dp)
                .border(1.dp, Os100.copy(alpha = 0.6f), RoundedCornerShape(2.dp))
        )

        // 3. Top-Right "Skip" Pill (nested on top-right of outer frame)
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 10.dp, end = 20.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Os0)
                .border(1.dp, Os100, RoundedCornerShape(18.dp))
                .clickable(onClick = onSkipClick)
                .padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Text(
                text = "Skip",
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal,
                color = Os900
            )
        }

        // 4. Upper-Right Compass Rose Graphic
        CompassRoseGraphic(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 96.dp, end = 50.dp)
                .size(68.dp)
        )

        // 5. Central Hero Content Stack (tuned baseline alignment at y = 411dp / 822px)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(top = 411.dp, start = 24.dp, end = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Daylight DC1 Brand Glyph
            Image(
                painter = painterResource(id = R.drawable.daylight_logo),
                contentDescription = "Daylight DC1 Logo",
                modifier = Modifier.size(42.dp)
            )

            Spacer(modifier = Modifier.height(19.dp))

            // Subtitle Label
            Text(
                text = "DAYLIGHT DC1 · THE LIVING PAGE",
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.2.sp,
                color = Os300,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(9.dp))

            // Headline in Serif
            Text(
                text = "Step into daylight",
                fontSize = 44.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = FontFamily.Serif,
                letterSpacing = (-1.2).sp,
                color = Os1000,
                textAlign = TextAlign.Center,
                lineHeight = 48.sp
            )

            Spacer(modifier = Modifier.height(9.dp))

            // Description Body Text
            Text(
                text = "A reflective paper screen that moves like ink — 60 to\n120 frames a second, and not a drop of blue light.\nLet's make it yours.",
                fontSize = 14.5.sp,
                fontWeight = FontWeight.Normal,
                color = Os800,
                textAlign = TextAlign.Center,
                lineHeight = 21.sp
            )

            Spacer(modifier = Modifier.height(17.dp))

            // "Get started" Solid Black Pill CTA
            val interactionSource = remember { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()
            val elevation by animateDpAsState(
                targetValue = if (isPressed) 2.dp else 4.dp,
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "btnElev"
            )

            Button(
                onClick = onGetStartedClick,
                interactionSource = interactionSource,
                elevation = ButtonDefaults.buttonElevation(defaultElevation = elevation),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Os1000),
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .height(48.dp)
                    .width(138.dp)
            ) {
                Text(
                    text = "Get started",
                    color = Os0,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // "PAPER MOTION" Row 1 Chips
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "PAPER MOTION",
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.2.sp,
                    color = Os300,
                    modifier = Modifier.padding(end = 4.dp)
                )

                row1Chips.forEachIndexed { index, name ->
                    PaperMotionChip(
                        text = name,
                        isSelected = selectedChipIndex == index,
                        onClick = { selectedChipIndex = index }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Row 2 Chips (centered under row 1)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                row2Chips.forEachIndexed { index, name ->
                    val chipIndex = row1Chips.size + index
                    PaperMotionChip(
                        text = name,
                        isSelected = selectedChipIndex == chipIndex,
                        onClick = { selectedChipIndex = chipIndex }
                    )
                }
            }
        }
    }
}

@Composable
private fun PaperMotionChip(
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val bg by animateColorAsState(
        targetValue = if (isSelected) Os1000 else Color(0x0F000000),
        animationSpec = tween(150),
        label = "chipBg"
    )
    val textColor by animateColorAsState(
        targetValue = if (isSelected) Os0 else Os400,
        animationSpec = tween(150),
        label = "chipText"
    )

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(13.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 5.dp)
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
            color = textColor
        )
    }
}

/**
 * Background Canvas rendering:
 * 1. Cartesian coordinate grid (vertical lines start at y = 90dp, keeping header clean).
 * 2. Rectangular plot/lot outlines.
 * 3. 4 Footprint lanes with closed endcaps and alternating footprints.
 */
@Composable
fun DaylightDc1BackgroundCanvas(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height

        // 1. Cartesian Grid Lines
        // Note: In the Claude reference, the top 90dp is a clean open header with no grid!
        // The grid covers the hero illustration map and terminates above the central content stack (y <= 365dp)
        val xStep = 40.5.dp.toPx()
        val yStep = 50.dp.toPx()
        val startX = 69.dp.toPx()
        val gridTopY = 90.dp.toPx() // Vertical lines start at 90dp (180px)
        val gridBottomY = 365.dp.toPx() // Vertical lines terminate at 365dp (730px)
        val gridRightX = w - 34.5.dp.toPx()

        var gx = startX
        while (gx <= gridRightX) {
            drawLine(
                color = Os400,
                start = Offset(gx, gridTopY),
                end = Offset(gx, gridBottomY),
                strokeWidth = 1f
            )
            gx += xStep
        }

        // Horizontal grid lines start at 100dp (200px) and terminate at 350dp (700px)
        var gy = 100.dp.toPx()
        while (gy <= 360.dp.toPx()) {
            drawLine(
                color = Os400,
                start = Offset(startX, gy),
                end = Offset(gridRightX, gy),
                strokeWidth = 1f
            )
            gy += yStep
        }

        // 2. Rectangular Building / Lot Outlines
        val lotOutlines = listOf(
            Offset(76.dp.toPx(), 177.dp.toPx()) to Size(44.dp.toPx(), 31.dp.toPx()),
            Offset(207.dp.toPx(), 156.5.dp.toPx()) to Size(32.5.dp.toPx(), 30.dp.toPx()),
            Offset(269.dp.toPx(), 176.dp.toPx()) to Size(42.dp.toPx(), 22.dp.toPx()),
            Offset(325.dp.toPx(), 140.dp.toPx()) to Size(20.dp.toPx(), 18.5.dp.toPx()),
            Offset(380.dp.toPx(), 220.dp.toPx()) to Size(48.dp.toPx(), 30.dp.toPx()),
            Offset(503.dp.toPx(), 173.dp.toPx()) to Size(41.dp.toPx(), 28.dp.toPx()),
            Offset(85.dp.toPx(), 340.dp.toPx()) to Size(40.dp.toPx(), 25.dp.toPx()),
            Offset(185.dp.toPx(), 335.dp.toPx()) to Size(42.dp.toPx(), 22.dp.toPx()),
            Offset(150.dp.toPx(), 390.dp.toPx()) to Size(28.dp.toPx(), 28.dp.toPx()),
            Offset(390.dp.toPx(), 320.dp.toPx()) to Size(38.dp.toPx(), 22.dp.toPx()),
            Offset(375.dp.toPx(), 375.dp.toPx()) to Size(32.dp.toPx(), 25.dp.toPx()),
            Offset(300.dp.toPx(), 375.dp.toPx()) to Size(40.dp.toPx(), 22.dp.toPx()),
            Offset(255.dp.toPx(), 424.dp.toPx()) to Size(34.dp.toPx(), 25.dp.toPx()),
            Offset(270.dp.toPx(), 458.dp.toPx()) to Size(32.dp.toPx(), 18.dp.toPx()),
            Offset(410.dp.toPx(), 470.dp.toPx()) to Size(42.dp.toPx(), 25.dp.toPx()),
            Offset(495.dp.toPx(), 390.dp.toPx()) to Size(38.dp.toPx(), 20.dp.toPx()),
            Offset(108.dp.toPx(), 540.dp.toPx()) to Size(30.dp.toPx(), 28.dp.toPx()),
            Offset(440.dp.toPx(), 590.dp.toPx()) to Size(40.dp.toPx(), 22.dp.toPx())
        )

        lotOutlines.forEach { (pos, size) ->
            drawRoundRect(
                color = Os800,
                topLeft = pos,
                size = size,
                cornerRadius = CornerRadius(2f, 2f),
                style = Stroke(width = 1.2f)
            )
        }

        // 3. Lane 1: Diagonal curve with double rails, closed cap, and alternating footprints
        val lane1 = Path().apply {
            moveTo(311.dp.toPx(), 70.dp.toPx())
            cubicTo(
                395.dp.toPx(), 130.dp.toPx(),
                435.dp.toPx(), 195.dp.toPx(),
                462.dp.toPx(), 280.dp.toPx()
            )
            cubicTo(
                465.dp.toPx(), 390.dp.toPx(),
                440.dp.toPx(), 480.dp.toPx(),
                385.dp.toPx(), 560.dp.toPx()
            )
            cubicTo(
                350.dp.toPx(), 610.dp.toPx(),
                330.dp.toPx(), 655.dp.toPx(),
                325.dp.toPx(), 700.dp.toPx()
            )
        }
        drawLaneWithFootprints(lane1, railSpacing = 4.dp.toPx(), footprintStep = 18.dp.toPx(), roundedStartCap = false)

        // 4. Lane 2: Horizontal curve across middle
        val lane2 = Path().apply {
            moveTo(18.dp.toPx(), 215.dp.toPx())
            cubicTo(
                150.dp.toPx(), 255.dp.toPx(),
                300.dp.toPx(), 275.dp.toPx(),
                425.dp.toPx(), 270.dp.toPx()
            )
            cubicTo(
                490.dp.toPx(), 265.dp.toPx(),
                530.dp.toPx(), 245.dp.toPx(),
                560.dp.toPx(), 220.dp.toPx()
            )
        }
        drawLaneWithFootprints(lane2, railSpacing = 4.dp.toPx(), footprintStep = 18.dp.toPx(), roundedStartCap = false)

        // 5. Lane 3: Left vertical/diagonal curve with rounded dome top cap
        val lane3 = Path().apply {
            moveTo(65.dp.toPx(), 70.dp.toPx())
            cubicTo(
                95.dp.toPx(), 160.dp.toPx(),
                125.dp.toPx(), 255.dp.toPx(),
                110.dp.toPx(), 360.dp.toPx()
            )
            cubicTo(
                75.dp.toPx(), 480.dp.toPx(),
                45.dp.toPx(), 580.dp.toPx(),
                30.dp.toPx(), 670.dp.toPx()
            )
        }
        drawTwoRailLane(lane3, railSpacing = 3.5.dp.toPx(), roundedStartCap = true)

        // 6. Lane 4: Lower subtle curve passing behind text
        val lane4 = Path().apply {
            moveTo(45.dp.toPx(), 517.dp.toPx())
            cubicTo(
                225.dp.toPx(), 580.dp.toPx(),
                375.dp.toPx(), 575.dp.toPx(),
                532.dp.toPx(), 505.dp.toPx()
            )
        }
        drawPath(lane4, color = Os400, style = Stroke(width = 1.5.dp.toPx()))
    }
}

/**
 * Draws a two-rail lane (two parallel strokes with white in between and optional end cap).
 */
private fun DrawScope.drawTwoRailLane(path: Path, railSpacing: Float, roundedStartCap: Boolean = false) {
    val measure = PathMeasure()
    measure.setPath(path, forceClosed = false)
    val length = measure.length
    val halfSpace = railSpacing / 2f

    // Thick white fill underneath to mask grid lines
    drawPath(path, color = Os0, style = Stroke(width = railSpacing + 2f, cap = if (roundedStartCap) StrokeCap.Round else StrokeCap.Square))

    val leftRail = Path()
    val rightRail = Path()
    var isFirst = true
    var curD = 0f

    var startP = Offset.Zero
    var startT = Offset.Zero

    while (curD <= length) {
        val p = measure.getPosition(curD)
        val t = measure.getTangent(curD)
        val nx = -t.y * halfSpace
        val ny = t.x * halfSpace
        if (isFirst) {
            startP = p
            startT = t
            leftRail.moveTo(p.x + nx, p.y + ny)
            rightRail.moveTo(p.x - nx, p.y - ny)
            isFirst = false
        } else {
            leftRail.lineTo(p.x + nx, p.y + ny)
            rightRail.lineTo(p.x - nx, p.y - ny)
        }
        curD += 4f
    }
    drawPath(leftRail, color = Os800, style = Stroke(width = 1.2f))
    drawPath(rightRail, color = Os800, style = Stroke(width = 1.2f))

    // Closed top cap
    val nx = -startT.y * halfSpace
    val ny = startT.x * halfSpace
    if (roundedStartCap) {
        // Dome cap connecting left and right rail
        val dome = Path().apply {
            moveTo(startP.x + nx, startP.y + ny)
            val topDome = Offset(startP.x - startT.x * halfSpace, startP.y - startT.y * halfSpace)
            quadraticTo(topDome.x, topDome.y, startP.x - nx, startP.y - ny)
        }
        drawPath(dome, color = Os800, style = Stroke(width = 1.2f))
    } else {
        // Flat cap connecting left and right rail
        drawLine(
            color = Os800,
            start = Offset(startP.x + nx, startP.y + ny),
            end = Offset(startP.x - nx, startP.y - ny),
            strokeWidth = 1.2f
        )
    }
}

/**
 * Draws a two-rail lane with alternating footprints along the edges.
 */
private fun DrawScope.drawLaneWithFootprints(
    path: Path,
    railSpacing: Float,
    footprintStep: Float,
    roundedStartCap: Boolean = false
) {
    // 1. Base two-rail lane
    drawTwoRailLane(path, railSpacing, roundedStartCap)

    // 2. Alternating footprints along the sides
    val measure = PathMeasure()
    measure.setPath(path, forceClosed = false)
    val length = measure.length
    val halfSpace = railSpacing / 2f

    var d = footprintStep / 2f
    var side = 1

    while (d < length - footprintStep / 2f) {
        val p = measure.getPosition(d)
        val t = measure.getTangent(d)
        val angle = Math.toDegrees(Math.atan2(t.y.toDouble(), t.x.toDouble())).toFloat()

        val normalX = -t.y * (halfSpace + 3.5.dp.toPx()) * side
        val normalY = t.x * (halfSpace + 3.5.dp.toPx()) * side
        val footCenter = Offset(p.x + normalX, p.y + normalY)

        rotate(degrees = angle, pivot = footCenter) {
            // Sole (oval)
            drawOval(
                color = Os900,
                topLeft = Offset(footCenter.x - 3.dp.toPx(), footCenter.y - 1.5.dp.toPx()),
                size = Size(6.dp.toPx(), 3.2.dp.toPx())
            )
            // Heel (small circle behind sole)
            drawCircle(
                color = Os900,
                radius = 1.3.dp.toPx(),
                center = Offset(footCenter.x - 4.2.dp.toPx(), footCenter.y)
            )
        }

        d += footprintStep
        side = -side
    }
}

/**
 * Geometric Compass Rose:
 * - Outer circle: 2px stroke Os1000
 * - Inner concentric circle: 1.5px stroke Os300
 * - 4 Cardinal diamond points with 3D shading
 * - 4 Diagonal tick lines
 */
@Composable
fun CompassRoseGraphic(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val r = size.minDimension / 2f

        // Outer Ring
        drawCircle(
            color = Os1000,
            radius = r * 0.96f,
            center = c,
            style = Stroke(width = 2.dp.toPx())
        )

        // Inner Concentric Ring
        drawCircle(
            color = Os300,
            radius = r * 0.70f,
            center = c,
            style = Stroke(width = 1.2.dp.toPx())
        )

        // 4 Diagonal Ticks
        val tickR1 = r * 0.38f
        val tickR2 = r * 0.68f
        val angles = listOf(45f, 135f, 225f, 315f)
        angles.forEach { angle ->
            val rad = Math.toRadians(angle.toDouble())
            val cos = Math.cos(rad).toFloat()
            val sin = Math.sin(rad).toFloat()
            drawLine(
                color = Os400,
                start = Offset(c.x + cos * tickR1, c.y + sin * tickR1),
                end = Offset(c.x + cos * tickR2, c.y + sin * tickR2),
                strokeWidth = 1.2.dp.toPx()
            )
        }

        // 4-Point Star Cardinal Points with two-tone shading
        val spikeLen = r * 0.94f
        val baseW = r * 0.16f

        // North Point
        val northLeft = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x - baseW, c.y)
            lineTo(c.x, c.y - spikeLen)
            close()
        }
        val northRight = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x + baseW, c.y)
            lineTo(c.x, c.y - spikeLen)
            close()
        }
        drawPath(northLeft, color = Os800)
        drawPath(northRight, color = Os1000)

        // South Point
        val southLeft = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x - baseW, c.y)
            lineTo(c.x, c.y + spikeLen)
            close()
        }
        val southRight = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x + baseW, c.y)
            lineTo(c.x, c.y + spikeLen)
            close()
        }
        drawPath(southLeft, color = Os1000)
        drawPath(southRight, color = Os800)

        // East Point
        val eastTop = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x, c.y - baseW)
            lineTo(c.x + spikeLen, c.y)
            close()
        }
        val eastBottom = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x + baseW, c.y)
            lineTo(c.x + spikeLen, c.y)
            close()
        }
        drawPath(eastTop, color = Os800)
        drawPath(eastBottom, color = Os1000)

        // West Point
        val westTop = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x, c.y - baseW)
            lineTo(c.x - spikeLen, c.y)
            close()
        }
        val westBottom = Path().apply {
            moveTo(c.x, c.y)
            lineTo(c.x, c.y + baseW)
            lineTo(c.x - spikeLen, c.y)
            close()
        }
        drawPath(westTop, color = Os1000)
        drawPath(westBottom, color = Os800)
    }
}

@Preview(
    name = "Daylight DC1 Native Screen",
    widthDp = 592,
    heightDp = 792,
    showBackground = true
)
@Composable
fun DaylightDc1ScreenPreview() {
    DaylightDc1Screen()
}
