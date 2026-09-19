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

        // 2a & 2b. Hairline Frames (matching authentic open-bottom reference layout)
        Canvas(modifier = Modifier.fillMaxSize()) {
            val outerColor = Color(0xFFA8A8A0)
            val innerColor = Os100.copy(alpha = 0.6f)

            val outerLeft = 27.5.dp.toPx()
            val outerRight = size.width - 27.5.dp.toPx()
            val outerTop = 26.5.dp.toPx()
            val outerBottom = 680.dp.toPx()

            val innerLeft = 34.dp.toPx()
            val innerRight = size.width - 34.dp.toPx()
            val innerTop = 34.dp.toPx()
            val innerBottom = 650.dp.toPx()

            // Outer Frame (top + sides with rounded top corners)
            val outerPath = Path().apply {
                moveTo(outerLeft, outerBottom)
                lineTo(outerLeft, outerTop + 4.dp.toPx())
                quadraticTo(outerLeft, outerTop, outerLeft + 4.dp.toPx(), outerTop)
                lineTo(outerRight - 4.dp.toPx(), outerTop)
                quadraticTo(outerRight, outerTop, outerRight, outerTop + 4.dp.toPx())
                lineTo(outerRight, outerBottom)
            }
            drawPath(outerPath, color = outerColor, style = Stroke(width = 1.dp.toPx()))

            // Inner Frame (top + sides with rounded top corners)
            val innerPath = Path().apply {
                moveTo(innerLeft, innerBottom)
                lineTo(innerLeft, innerTop + 2.dp.toPx())
                quadraticTo(innerLeft, innerTop, innerLeft + 2.dp.toPx(), innerTop)
                lineTo(innerRight - 2.dp.toPx(), innerTop)
                quadraticTo(innerRight, innerTop, innerRight, innerTop + 2.dp.toPx())
                lineTo(innerRight, innerBottom)
            }
            drawPath(innerPath, color = innerColor, style = Stroke(width = 1.dp.toPx()))
        }

        // 3. Top-Right "Skip" Pill (anchored on reference coordinates cx ~ 1100px, cy ~ 63px)
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 21.dp, end = 20.5.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(Os0)
                .border(1.dp, Os100, RoundedCornerShape(11.dp))
                .clickable(onClick = onSkipClick)
                .padding(horizontal = 14.dp, vertical = 4.dp)
        ) {
            Text(
                text = "Skip",
                fontSize = 12.sp,
                fontWeight = FontWeight.Normal,
                color = Os900
            )
        }

        // 4. Upper-Right Compass Rose Graphic (anchored on reference cx = 1010px, cy = 272px)
        CompassRoseGraphic(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 102.dp, end = 53.dp)
                .size(68.dp)
        )

        // 5. Central Hero Content Stack (calibrated alignment to match reference coordinates)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(top = 410.dp, start = 24.dp, end = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Daylight DC1 Brand Glyph
            Image(
                painter = painterResource(id = R.drawable.daylight_logo),
                contentDescription = "Daylight DC1 Logo",
                modifier = Modifier.size(42.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Subtitle Label (matching reference "Daylight DC1 · the living page")
            Text(
                text = "Daylight DC1 · the living page",
                fontSize = 12.sp,
                fontWeight = FontWeight.Normal,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 1.1.sp,
                color = Os400,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(11.dp))

            // Headline in Serif
            Text(
                text = "Step into daylight",
                fontSize = 44.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.Serif,
                letterSpacing = (-3.2).sp,
                color = Os1000,
                textAlign = TextAlign.Center,
                lineHeight = 48.sp
            )

            Spacer(modifier = Modifier.height(5.dp))

            // Description Body Text
            Text(
                text = "A reflective paper screen that moves like ink — 60 to\n120 frames a second, and not a drop of blue light.\nLet's make it yours.",
                fontSize = 14.5.sp,
                fontWeight = FontWeight.Normal,
                color = Os800,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp
            )

            Spacer(modifier = Modifier.height(23.dp))

            // "Get started" Solid Black Pill CTA
            val interactionSource = remember { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()

            Button(
                onClick = onGetStartedClick,
                interactionSource = interactionSource,
                elevation = ButtonDefaults.buttonElevation(
                    defaultElevation = 0.dp,
                    pressedElevation = 0.dp,
                    focusedElevation = 0.dp,
                    hoveredElevation = 0.dp
                ),
                shape = RoundedCornerShape(22.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Os1000),
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .height(44.dp)
                    .width(126.dp)
            ) {
                Text(
                    text = "Get started",
                    color = Os0,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(21.dp))

            // "PAPER MOTION" Row 1 Chips
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "PAPER MOTION",
                    fontSize = 9.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.6.sp,
                    color = Os400
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

            // Row 2 Chips
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
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
            .padding(horizontal = 4.5.dp, vertical = 5.dp)
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
        // Bound vertical and horizontal lines to authentic reference grid tracks
        val vertGridSegments = listOf(
            Triple(69.5.dp, 100.5.dp, 221.0.dp),
            Triple(69.5.dp, 249.0.dp, 255.5.dp),
            Triple(110.5.dp, 127.0.dp, 226.0.dp),
            Triple(110.5.dp, 259.0.dp, 265.5.dp),
            Triple(150.0.dp, 90.0.dp, 264.0.dp),
            Triple(150.0.dp, 265.0.dp, 296.5.dp),
            Triple(150.0.dp, 299.5.dp, 365.0.dp),
            Triple(188.5.dp, 179.0.dp, 209.5.dp),
            Triple(188.5.dp, 213.5.dp, 267.0.dp),
            Triple(188.5.dp, 268.5.dp, 309.5.dp),
            Triple(229.0.dp, 182.5.dp, 264.0.dp),
            Triple(271.0.dp, 103.5.dp, 273.0.dp),
            Triple(271.0.dp, 274.5.dp, 365.0.dp),
            Triple(314.0.dp, 111.0.dp, 119.5.dp),
            Triple(314.0.dp, 135.0.dp, 277.5.dp),
            Triple(314.0.dp, 279.0.dp, 289.5.dp),
            Triple(355.5.dp, 149.0.dp, 155.5.dp),
            Triple(355.5.dp, 170.0.dp, 272.5.dp),
            Triple(395.0.dp, 110.0.dp, 204.5.dp),
            Triple(395.0.dp, 207.0.dp, 283.0.dp),
            Triple(395.0.dp, 284.0.dp, 352.0.dp),
            Triple(433.5.dp, 146.0.dp, 265.0.dp),
            Triple(433.5.dp, 268.0.dp, 279.5.dp),
            Triple(433.5.dp, 281.0.dp, 292.0.dp),
            Triple(473.0.dp, 188.5.dp, 259.0.dp),
            Triple(514.5.dp, 132.0.dp, 137.5.dp),
            Triple(514.5.dp, 175.0.dp, 252.0.dp),
            Triple(514.5.dp, 253.5.dp, 313.0.dp),
            Triple(557.5.dp, 90.5.dp, 226.5.dp),
            Triple(557.5.dp, 228.0.dp, 288.0.dp),
        )
        for ((xDp, startYDp, endYDp) in vertGridSegments) {
            drawLine(
                color = Os100,
                start = Offset(xDp.toPx(), startYDp.toPx()),
                end = Offset(xDp.toPx(), endYDp.toPx()),
                strokeWidth = 1f
            )
        }

        val horizGridSegments = listOf(
            Triple(98.5.dp, 34.0.dp, 112.5.dp),
            Triple(98.5.dp, 305.0.dp, 314.0.dp),
            Triple(149.0.dp, 34.0.dp, 146.0.dp),
            Triple(149.0.dp, 350.5.dp, 357.0.dp),
            Triple(200.0.dp, 34.0.dp, 104.0.dp),
            Triple(200.0.dp, 384.0.dp, 390.5.dp),
            Triple(250.5.dp, 34.0.dp, 76.5.dp),
            Triple(250.5.dp, 80.5.dp, 103.5.dp),
            Triple(301.5.dp, 34.0.dp, 140.5.dp),
            Triple(353.0.dp, 34.0.dp, 120.0.dp),
            Triple(353.0.dp, 121.5.dp, 221.5.dp),
        )
        for ((yDp, startXDp, endXDp) in horizGridSegments) {
            drawLine(
                color = Os100,
                start = Offset(startXDp.toPx(), yDp.toPx()),
                end = Offset(endXDp.toPx(), yDp.toPx()),
                strokeWidth = 1f
            )
        }

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
