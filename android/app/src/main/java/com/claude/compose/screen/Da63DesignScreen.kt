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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.asComposePath
import androidx.core.graphics.PathParser
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaFlareHeadline
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRom
import com.claude.compose.theme.AbcRomMono
import com.claude.compose.theme.BaseTextStyle

@Composable
fun Da63DesignScreen(
    modifier: Modifier = Modifier
) {
    // Desktop canvas has light gray background (#E5E5E5)
    Box(
        modifier = modifier
            .requiredSize(width = 1440.dp, height = 860.dp)
            .background(Color(0xFFE5E5E5))
    ) {
        // Document sheet on the left: exactly 1184dp wide (the DC1 display canvas)
        Box(
            modifier = Modifier
                .width(1184.dp)
                .fillMaxHeight()
                .background(Color.White)
        ) {
            // LAYER 1: Reading Article ("The Meridian")
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Masthead row: The Meridian + Navigation links
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 64.dp, top = 150.dp, bottom = 30.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "The Meridian",
                        fontFamily = AbcArizonaFlare,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Normal,
                        lineHeight = 51.sp,
                        letterSpacing = (-3.0).sp,
                        color = Color(0xFF1A1A1A),
                        modifier = Modifier.offset(x = 0.5.dp, y = 1.0.dp),
                        style = BaseTextStyle
                    )

                    Spacer(modifier = Modifier.width(593.0.dp))

                    Row(
                        modifier = Modifier.offset(y = (-1.0).dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("World", fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 27.sp, letterSpacing = (-0.36).sp, color = Color(0xFF535353), style = BaseTextStyle)
                        Spacer(modifier = Modifier.width(31.0.dp))
                        Text("Cities", fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 27.sp, letterSpacing = (-0.36).sp, color = Color(0xFF535353), style = BaseTextStyle)
                        Spacer(modifier = Modifier.width(24.5.dp))
                        Text("Climate", fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 27.sp, letterSpacing = (-0.36).sp, color = Color(0xFF535353), style = BaseTextStyle)
                        Spacer(modifier = Modifier.width(23.5.dp))
                        Text("Ideas", modifier = Modifier.offset(y = (-1.75).dp), fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 27.sp, letterSpacing = (-0.36).sp, color = Color(0xFF535353), style = BaseTextStyle)
                    }
                }

                // Article container
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 72.dp, end = 72.dp, top = 47.dp)
                ) {
                    // Article metadata
                    Text(
                        text = "Climate · 9 min read",
                        fontFamily = AbcRomMono,
                        fontSize = 15.sp,
                        lineHeight = 22.5.sp,
                        letterSpacing = 1.5.sp,
                        color = Color(0xFF858585),
                        modifier = Modifier
                            .offset(x = (-1.25).dp, y = 1.5.dp)
                            .padding(bottom = 18.dp),
                        style = BaseTextStyle
                    )

                    // Article headline: Single unified Text composable with precise baseline pitch (63.0sp)
                    val headlineText = buildAnnotatedString {
                        withStyle(SpanStyle(letterSpacing = (-7.0).sp)) {
                            append("The")
                        }
                        withStyle(SpanStyle(letterSpacing = 7.0.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-5.5).sp)) {
                            append("quiet")
                        }
                        withStyle(SpanStyle(letterSpacing = 5.5.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-6.2).sp)) {
                            append("economics")
                        }
                        withStyle(SpanStyle(letterSpacing = 7.0.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-5.5).sp)) {
                            append("of")
                        }
                        withStyle(SpanStyle(letterSpacing = 9.0.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-6.0).sp)) {
                            append("planting")
                        }
                        withStyle(SpanStyle(letterSpacing = 6.5.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-7.0).sp)) {
                            append("a\n")
                        }
                        withStyle(SpanStyle(letterSpacing = (-5.8).sp)) {
                            append("city")
                        }
                        withStyle(SpanStyle(letterSpacing = 3.5.sp)) {
                            append(" ")
                        }
                        withStyle(SpanStyle(letterSpacing = (-4.45).sp)) {
                            append("forest")
                        }
                    }
                    Text(
                        text = headlineText,
                        fontFamily = AbcArizonaFlareHeadline,
                        fontSize = 58.sp,
                        lineHeight = 63.0.sp,
                        color = Color(0xFF1A1A1A),
                        style = BaseTextStyle,
                        modifier = Modifier
                            .offset(x = 2.0.dp, y = (-1.25).dp)
                            .padding(bottom = 28.5.dp)
                    )

                    // Article two columns
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .offset(x = 0.5.dp, y = (-2.5).dp),
                        horizontalArrangement = Arrangement.spacedBy(56.5.dp)
                    ) {
                        Column(modifier = Modifier.width(492.dp)) {
                            Text(
                                text = "For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger. A maturing street tree returns far more than its planting cost in cooling, drainage and slowed traffic — a fact the accountants took a decade to trust.",
                                fontFamily = AbcArizonaSans,
                                fontSize = 19.sp,
                                lineHeight = 32.2.sp,
                                letterSpacing = (-0.56).sp,
                                color = Color(0xFF1A1A1A),
                                style = BaseTextStyle
                            )
                            Spacer(modifier = Modifier.height(20.5.dp))
                            Text(
                                text = "Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge. The result is a slower construction, measured in seasons rather than quarters, and a skyline that softens at its edges.",
                                fontFamily = AbcArizonaSans,
                                fontSize = 19.sp,
                                lineHeight = 32.2.sp,
                                letterSpacing = (-0.56).sp,
                                color = Color(0xFF1A1A1A),
                                style = BaseTextStyle
                            )
                        }

                        Column(modifier = Modifier.width(492.dp)) {
                            Text(
                                text = "What surprised them was not the shade but the water. A single mature plane can intercept thousands of litres of stormwater a year, water the drains no longer have to carry, and a pilot block dropped four degrees against its neighbours last July.",
                                fontFamily = AbcArizonaSans,
                                fontSize = 19.sp,
                                lineHeight = 32.2.sp,
                                letterSpacing = (-0.56).sp,
                                color = Color(0xFF1A1A1A),
                                style = BaseTextStyle
                            )
                            Spacer(modifier = Modifier.height(20.5.dp))
                            Text(
                                text = "The maintenance crews doubled as the budget line moved from parks to public works, and the forest, once an ornament, became a system with a return.",
                                fontFamily = AbcArizonaSans,
                                fontSize = 19.sp,
                                lineHeight = 32.2.sp,
                                letterSpacing = (-0.56).sp,
                                color = Color(0xFF1A1A1A),
                                style = BaseTextStyle
                            )
                        }
                    }
                }
            }

            // LAYER 2: Frosted Glass / Note Overlay Scrim (opacity: 0.79 white)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.White.copy(alpha = 0.79f))
            )

            // LAYER 2.5: Background Ruled Paper Lines on Scrim (every 56dp starting at y = 55.25dp, #F0F0F0, 1dp stroke)
            Canvas(
                modifier = Modifier
                    .width(1184.dp)
                    .fillMaxHeight()
            ) {
                val stepPx = 56.dp.toPx()
                var yPx = 55.25.dp.toPx()
                val endXPx = 1183.5.dp.toPx()
                val strokeWidthPx = 1.dp.toPx()
                val lineColor = Color(0xFFF0F0F0)

                while (yPx < size.height) {
                    drawLine(
                        color = lineColor,
                        start = Offset(0f, yPx),
                        end = Offset(endXPx, yPx),
                        strokeWidth = strokeWidthPx
                    )
                    yPx += stepPx
                }
            }

            // LAYER 3: Handwritten Ink & Highlighter Vector Annotations
            Canvas(modifier = Modifier.fillMaxSize()) {
                // 1. Highlighter rectangle over article text
                drawRoundRect(
                    color = Color(0xFF1A1A1A).copy(alpha = 0.16f),
                    topLeft = Offset(112.dp.toPx(), 818.dp.toPx()),
                    size = Size(404.dp.toPx(), 36.dp.toPx()),
                    cornerRadius = CornerRadius(8.dp.toPx())
                )

                // 2. Hand-drawn underline (node_19 path 31)
                val underlinePath = Path().apply {
                    moveTo(112.dp.toPx(), 894.dp.toPx())
                    cubicTo(
                        210.dp.toPx(), 906.dp.toPx(),
                        330.dp.toPx(), 888.dp.toPx(),
                        486.dp.toPx(), 900.dp.toPx()
                    )
                }
                drawPath(
                    path = underlinePath,
                    color = Color(0xFF1A1A1A).copy(alpha = 0.8f),
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                )

                // 3. Hand-drawn ink loop around paragraph 4 text ("moved") (node_19 path 32)
                val circlePath = Path().apply {
                    moveTo(1046.2.dp.toPx(), 662.2.dp.toPx())
                    cubicTo(
                        1072.2.dp.toPx(), 628.2.dp.toPx(),
                        1112.2.dp.toPx(), 644.2.dp.toPx(),
                        1104.2.dp.toPx(), 676.2.dp.toPx()
                    )
                    cubicTo(
                        1096.2.dp.toPx(), 706.2.dp.toPx(),
                        1052.2.dp.toPx(), 710.2.dp.toPx(),
                        1040.2.dp.toPx(), 682.2.dp.toPx()
                    )
                }
                drawPath(
                    path = circlePath,
                    color = Color(0xFF1A1A1A).copy(alpha = 0.8f),
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                )
            }

            // LAYER 4: Floating Note Overlay Chrome / Toolbar (3 Floating Pills)
            Row(
                modifier = Modifier
                    .offset(x = 80.8.dp, y = 44.5.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Pill 1: Document Pill [ 📄 | Field notes ▾ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.88f),
                    shadowElevation = 4.dp,
                    border = BorderStroke(0.5.dp, Color(0xFFE5E5E5)),
                    modifier = Modifier.size(width = 249.5.dp, height = 80.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(26.dp).offset(x = 0.3.dp, y = 0.05.dp)) {
                                // Path 1: Plus sign action badge (+)
                                drawSvgPath(
                                    this,
                                    "M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 11.250f, 10f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                                // Path 2: Top-right fold flap
                                drawSvgPath(
                                    this,
                                    "M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 11.875f, 1.875f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                                // Path 3: Document sheet body
                                drawSvgPath(
                                    this,
                                    "M 9.375 0 L 10.057 -0.731 C 9.872 -0.904 9.628 -1 9.375 -1 L 9.375 0 Z M 0.549 0.513 L -0.133 -0.218 L -0.133 -0.218 L 0.549 0.513 Z M 0.549 16.987 L 1.231 16.256 L 1.231 16.256 L 0.549 16.987 Z M 15 5.25 L 16 5.25 C 16 4.973 15.885 4.708 15.682 4.519 L 15 5.25 Z M 9.375 -1 L 1.875 -1 L 1.875 1 L 9.375 1 L 9.375 -1 Z M 1.875 -1 C 1.134 -1 0.41 -0.726 -0.133 -0.218 L 1.231 1.244 C 1.391 1.095 1.622 1 1.875 1 L 1.875 -1 Z M -0.133 -0.218 C -0.679 0.291 -1 0.998 -1 1.75 L 1 1.75 C 1 1.574 1.074 1.39 1.231 1.244 L -0.133 -0.218 Z M -1 1.75 L -1 15.75 L 1 15.75 L 1 1.75 L -1 1.75 Z M -1 15.75 C -1 16.502 -0.679 17.209 -0.133 17.718 L 1.231 16.256 C 1.074 16.11 1 15.926 1 15.75 L -1 15.75 Z M -0.133 17.718 C 0.41 18.226 1.134 18.5 1.875 18.5 L 1.875 16.5 C 1.622 16.5 1.391 16.405 1.231 16.256 L -0.133 17.718 Z M 15.682 4.519 L 10.057 -0.731 L 8.693 0.731 L 14.318 5.981 L 15.682 4.519 Z M 16 6.875 L 16 5.25 L 14 5.25 L 14 6.875 L 16 6.875 Z M 1.875 18.5 L 7.5 18.5 L 7.5 16.5 L 1.875 16.5 L 1.875 18.5 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 3.125f, 1.875f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                            }
                        }

                        // Divider
                        Box(
                            modifier = Modifier
                                .padding(horizontal = 8.dp)
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Document name dropdown (node_27 button)
                        Row(
                            modifier = Modifier
                                .size(width = 152.5.dp, height = 64.dp)
                                .padding(start = 17.85.dp, end = 21.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Field notes",
                                fontFamily = AbcArizonaSans,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Normal,
                                lineHeight = 28.5.sp,
                                letterSpacing = (-0.68).sp,
                                color = Color(0xFF1A1A1A),
                                modifier = Modifier.offset(x = (-1.0).dp, y = (-0.45).dp),
                                style = BaseTextStyle
                            )
                            Spacer(modifier = Modifier.width(2.dp))
                            Canvas(modifier = Modifier.size(18.dp).offset(x = (-0.85).dp, y = 0.0.dp)) {
                                drawSvgPath(
                                    this,
                                    "M 5 5 L 4.293 5.707 L 5 6.414 L 5.707 5.707 L 5 5 Z M -0.707 0.707 L 4.293 5.707 L 5.707 4.293 L 0.707 -0.707 L -0.707 0.707 Z M 5.707 5.707 L 10.707 0.707 L 9.293 -0.707 L 4.293 4.293 L 5.707 5.707 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 7f, 9.5f),
                                    viewBoxSize = 24f,
                                    targetSizeDp = 18f
                                )
                            }
                        }
                    }
                }

                // Pill 2: Tool Palette [ ✍️, ✏️, 🖍️, 🧼 | ➰, ✂️ | ◑ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.88f),
                    shadowElevation = 4.dp,
                    border = BorderStroke(0.5.dp, Color(0xFFE5E5E5)),
                    modifier = Modifier.size(width = 506.dp, height = 80.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Group 1: 4 tools (Pen, Pencil, Highlighter, Eraser)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Tool 0: Pen (Active with solid dark circle)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(64.dp)
                                        .background(Color(0xFF1A1A1A), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Canvas(modifier = Modifier.size(26.dp)) {
                                        drawSvgPath(
                                            this,
                                            "M 2.01 1 L 8.06 1 L 8.06 -1 L 2.01 -1 L 2.01 1 Z M 8.06 1 C 8.618 1 9.07 1.452 9.07 2.01 L 11.07 2.01 C 11.07 0.348 9.722 -1 8.06 -1 L 8.06 1 Z M 9.07 2.01 L 9.07 4.03 L 11.07 4.03 L 11.07 2.01 L 9.07 2.01 Z M 9.07 4.03 C 9.07 4.588 8.618 5.04 8.06 5.04 L 8.06 7.04 C 9.722 7.04 11.07 5.692 11.07 4.03 L 9.07 4.03 Z M 8.06 5.04 L 2.01 5.04 L 2.01 7.04 L 8.06 7.04 L 8.06 5.04 Z M 2.01 5.04 C 1.452 5.04 1 4.588 1 4.03 L -1 4.03 C -1 5.692 0.348 7.04 2.01 7.04 L 2.01 5.04 Z M 1 4.03 L 1 2.01 L -1 2.01 L -1 4.03 L 1 4.03 Z M 1 2.01 C 1 1.452 1.452 1 2.01 1 L 2.01 -1 C 0.348 -1 -1 0.348 -1 2.01 L 1 2.01 Z",
                                            Color.White,
                                            floatArrayOf(1f, 0f, 0f, 1f, 1.945f, 1.158f),
                                            floatArrayOf(0.707f, 0.707f, -0.707f, 0.707f, 13.766f, 0f),
                                            viewBoxSize = 24f,
                                            targetSizeDp = 26f
                                        )
                                        drawSvgPath(
                                            this,
                                            "M 11.665 12.78 L 11.442 11.805 L 11.43 11.808 L 11.665 12.78 Z M 1.915 15.14 L 1.68 14.168 C 1.669 14.171 1.658 14.174 1.647 14.177 L 1.915 15.14 Z M 0.055 13.28 L 1.019 13.549 C 1.022 13.536 1.025 13.524 1.028 13.511 L 0.055 13.28 Z M 2.375 3.53 L 3.348 3.761 L 3.349 3.756 L 2.375 3.53 Z M 5.935 0.45 L 6.019 1.446 L 6.025 1.446 L 5.935 0.45 Z M 10.935 0 L 11.643 -0.707 C 11.433 -0.917 11.141 -1.023 10.846 -0.996 L 10.935 0 Z M 15.205 4.27 L 16.201 4.361 C 16.228 4.065 16.122 3.773 15.913 3.563 L 15.205 4.27 Z M 14.755 9.22 L 13.76 9.129 L 13.759 9.135 L 14.755 9.22 Z M 11.43 11.808 L 1.68 14.168 L 2.151 16.112 L 11.901 13.752 L 11.43 11.808 Z M 1.647 14.177 C 1.56 14.201 1.468 14.202 1.38 14.179 L 0.873 16.113 C 1.303 16.226 1.755 16.223 2.184 16.103 L 1.647 14.177 Z M 1.38 14.179 C 1.293 14.156 1.213 14.11 1.149 14.046 L -0.265 15.46 C 0.05 15.775 0.442 16 0.873 16.113 L 1.38 14.179 Z M 1.149 14.046 C 1.085 13.982 1.04 13.902 1.017 13.815 L -0.918 14.323 C -0.805 14.753 -0.579 15.146 -0.265 15.46 L 1.149 14.046 Z M 1.017 13.815 C 0.994 13.728 0.994 13.636 1.019 13.549 L -0.908 13.011 C -1.027 13.44 -1.031 13.893 -0.918 14.323 L 1.017 13.815 Z M 1.028 13.511 L 3.348 3.761 L 1.403 3.299 L -0.917 13.049 L 1.028 13.511 Z M 3.349 3.756 C 3.493 3.139 3.829 2.582 4.309 2.167 L 3 0.655 C 2.201 1.346 1.641 2.274 1.401 3.304 L 3.349 3.756 Z M 4.309 2.167 C 4.788 1.752 5.387 1.5 6.019 1.446 L 5.851 -0.546 C 4.798 -0.458 3.8 -0.037 3 0.655 L 4.309 2.167 Z M 6.025 1.446 L 11.025 0.996 L 10.846 -0.996 L 5.846 -0.546 L 6.025 1.446 Z M 10.228 0.707 L 14.498 4.977 L 15.913 3.563 L 11.643 -0.707 L 10.228 0.707 Z M 14.21 4.179 L 13.76 9.129 L 15.751 9.311 L 16.201 4.361 L 14.21 4.179 Z M 13.759 9.135 C 13.705 9.769 13.452 10.368 13.035 10.848 L 14.546 12.159 C 15.24 11.359 15.662 10.36 15.752 9.305 L 13.759 9.135 Z M 13.035 10.848 C 12.619 11.328 12.061 11.663 11.442 11.805 L 11.889 13.755 C 12.921 13.517 13.852 12.959 14.546 12.159 L 13.035 10.848 Z",
                                            Color.White,
                                            floatArrayOf(1f, 0f, 0f, 1f, 1.945f, 1.158f),
                                            floatArrayOf(1f, 0f, 0f, 1f, 0f, 5.702f),
                                            viewBoxSize = 24f,
                                            targetSizeDp = 26f
                                        )
                                        drawSvgPath(
                                            this,
                                            "M 3.02 2.01 C 3.02 2.568 2.568 3.02 2.01 3.02 L 2.01 5.02 C 3.672 5.02 5.02 3.672 5.02 2.01 L 3.02 2.01 Z M 2.01 3.02 C 1.452 3.02 1 2.568 1 2.01 L -1 2.01 C -1 3.672 0.348 5.02 2.01 5.02 L 2.01 3.02 Z M 1 2.01 C 1 1.452 1.452 1 2.01 1 L 2.01 -1 C 0.348 -1 -1 0.348 -1 2.01 L 1 2.01 Z M 2.01 1 C 2.568 1 3.02 1.452 3.02 2.01 L 5.02 2.01 C 5.02 0.348 3.672 -1 2.01 -1 L 2.01 1 Z",
                                            Color.White,
                                            floatArrayOf(1f, 0f, 0f, 1f, 1.945f, 1.158f),
                                            floatArrayOf(1f, 0f, 0f, 1f, 5.355f, 11.522f),
                                            viewBoxSize = 24f,
                                            targetSizeDp = 26f
                                        )
                                        drawSvgPath(
                                            this,
                                            "M 5.687 0.707 C 6.078 0.317 6.078 -0.317 5.687 -0.707 C 5.297 -1.098 4.663 -1.098 4.273 -0.707 L 5.687 0.707 Z M -0.707 4.273 C -1.098 4.663 -1.098 5.297 -0.707 5.687 C -0.317 6.078 0.317 6.078 0.707 5.687 L -0.707 4.273 Z M 4.273 -0.707 L -0.707 4.273 L 0.707 5.687 L 5.687 0.707 L 4.273 -0.707 Z",
                                            Color.White,
                                            floatArrayOf(1f, 0f, 0f, 1f, 1.945f, 1.158f),
                                            floatArrayOf(1f, 0f, 0f, 1f, 0.955f, 14.962f),
                                            viewBoxSize = 24f,
                                            targetSizeDp = 26f
                                        )
                                    }
                                }
                            }

                            // Tool 1: Pencil (icon_5)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    drawSvgPath(
                                        this,
                                        "M 3.358 7.13 L 3.879 6.276 L 3.872 6.272 L 3.358 7.13 Z M 0.718 5.55 L 0.2 6.405 L 0.205 6.408 L 0.718 5.55 Z M 0.438 3.22 L 1.144 3.928 L 1.145 3.927 L 0.438 3.22 Z M 3.658 0 L 4.365 -0.707 C 4.178 -0.895 3.923 -1 3.658 -1 C 3.393 -1 3.139 -0.895 2.951 -0.707 L 3.658 0 Z M 7.878 4.22 L 8.584 4.928 C 8.772 4.741 8.878 4.486 8.878 4.221 C 8.879 3.955 8.773 3.701 8.585 3.513 L 7.878 4.22 Z M 5.178 6.91 L 4.472 6.202 L 4.469 6.205 L 5.178 6.91 Z M 3.872 6.272 L 1.232 4.692 L 0.205 6.408 L 2.845 7.988 L 3.872 6.272 Z M 1.236 4.695 C 1.173 4.656 1.119 4.604 1.078 4.541 L -0.602 5.625 C -0.397 5.943 -0.123 6.21 0.2 6.405 L 1.236 4.695 Z M 1.078 4.541 C 1.038 4.479 1.012 4.408 1.004 4.334 L -0.982 4.573 C -0.937 4.948 -0.807 5.308 -0.602 5.625 L 1.078 4.541 Z M 1.004 4.334 C 0.995 4.26 1.003 4.185 1.027 4.115 L -0.863 3.46 C -0.986 3.817 -1.027 4.197 -0.982 4.573 L 1.004 4.334 Z M 1.027 4.115 C 1.051 4.045 1.091 3.981 1.144 3.928 L -0.268 2.512 C -0.535 2.778 -0.739 3.103 -0.863 3.46 L 1.027 4.115 Z M 1.145 3.927 L 4.365 0.707 L 2.951 -0.707 L -0.269 2.513 L 1.145 3.927 Z M 2.951 0.707 L 7.171 4.927 L 8.585 3.513 L 4.365 -0.707 L 2.951 0.707 Z M 7.172 3.512 L 4.472 6.202 L 5.884 7.618 L 8.584 4.928 L 7.172 3.512 Z M 4.469 6.205 C 4.393 6.281 4.294 6.33 4.186 6.343 L 4.426 8.328 C 4.98 8.262 5.494 8.01 5.887 7.615 L 4.469 6.205 Z M 4.186 6.343 C 4.079 6.356 3.971 6.332 3.879 6.276 L 2.838 7.984 C 3.313 8.274 3.873 8.395 4.426 8.328 L 4.186 6.343 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 2.002f, 1.004f),
                                        floatArrayOf(1f, 0f, 0f, 1f, 0f, 13.386f),
                                        viewBoxSize = 24f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 3.02 0 L 3.013 1 L 3.02 1 L 3.02 0 Z M 10.02 3 L 11.02 3 L 10.02 3 Z M 10.02 15.41 L 9.02 15.41 C 9.02 15.417 9.02 15.424 9.02 15.431 L 10.02 15.41 Z M 8.49 16.93 L 8.517 15.93 C 8.508 15.93 8.499 15.93 8.49 15.93 L 8.49 16.93 Z M 0 2.98 L -1 2.973 L -1 2.98 L 0 2.98 Z M 3.02 1 L 7.02 1 L 7.02 -1 L 3.02 -1 L 3.02 1 Z M 7.02 1 C 7.55 1 8.059 1.211 8.434 1.586 L 9.848 0.172 C 9.098 -0.579 8.081 -1 7.02 -1 L 7.02 1 Z M 8.434 1.586 C 8.809 1.961 9.02 2.47 9.02 3 L 11.02 3 C 11.02 1.939 10.599 0.922 9.848 0.172 L 8.434 1.586 Z M 9.02 3 L 9.02 15.41 L 11.02 15.41 L 11.02 3 L 9.02 3 Z M 9.02 15.431 C 9.022 15.497 9.009 15.563 8.985 15.624 L 10.839 16.374 C 10.965 16.061 11.027 15.726 11.02 15.39 L 9.02 15.431 Z M 8.985 15.624 C 8.96 15.686 8.923 15.741 8.876 15.788 L 10.285 17.207 C 10.524 16.97 10.713 16.686 10.839 16.374 L 8.985 15.624 Z M 8.876 15.788 C 8.829 15.835 8.773 15.872 8.711 15.896 L 9.448 17.755 C 9.761 17.631 10.046 17.445 10.285 17.207 L 8.876 15.788 Z M 8.711 15.896 C 8.649 15.921 8.583 15.932 8.517 15.93 L 8.463 17.93 C 8.8 17.939 9.135 17.879 9.448 17.755 L 8.711 15.896 Z M 8.49 15.93 L 1.49 15.93 L 1.49 17.93 L 8.49 17.93 L 8.49 15.93 Z M 1.49 15.93 C 1.36 15.93 1.235 15.878 1.144 15.787 L -0.271 17.201 C 0.196 17.668 0.83 17.93 1.49 17.93 L 1.49 15.93 Z M 1.144 15.787 C 1.052 15.695 1 15.57 1 15.44 L -1 15.44 C -1 16.1 -0.738 16.734 -0.271 17.201 L 1.144 15.787 Z M 1 15.44 L 1 2.98 L -1 2.98 L -1 15.44 L 1 15.44 Z M 1 2.987 C 1.002 2.724 1.055 2.464 1.157 2.222 L -0.685 1.445 C -0.89 1.929 -0.996 2.448 -1 2.973 L 1 2.987 Z M 1.157 2.222 C 1.259 1.98 1.408 1.761 1.595 1.576 L 0.19 0.153 C -0.183 0.522 -0.481 0.961 -0.685 1.445 L 1.157 2.222 Z M 1.595 1.576 C 1.782 1.392 2.004 1.246 2.247 1.147 L 1.494 -0.706 C 1.007 -0.508 0.564 -0.216 0.19 0.153 L 1.595 1.576 Z M 2.247 1.147 C 2.49 1.048 2.751 0.998 3.013 1 L 3.027 -1 C 2.501 -1.003 1.981 -0.903 1.494 -0.706 L 2.247 1.147 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 2.002f, 1.004f),
                                        floatArrayOf(0.707f, 0.707f, -0.707f, 0.707f, 14.168f, 0f),
                                        viewBoxSize = 24f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 6.323 7.737 C 6.713 8.128 7.347 8.128 7.737 7.737 C 8.128 7.347 8.128 6.713 7.737 6.323 L 6.323 7.737 Z M 0.707 -0.707 C 0.317 -1.098 -0.317 -1.098 -0.707 -0.707 C -1.098 -0.317 -1.098 0.317 -0.707 0.707 L 0.707 -0.707 Z M 7.737 6.323 L 0.707 -0.707 L -0.707 0.707 L 6.323 7.737 L 7.737 6.323 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 2.002f, 1.004f),
                                        floatArrayOf(1f, 0f, 0f, 1f, 5.768f, 8.466f),
                                        viewBoxSize = 24f,
                                        targetSizeDp = 26f
                                    )
                                }
                            }

                            // Tool 2: Highlighter (icon_6)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    val scale = 26.dp.toPx() / 24f
                                    drawRoundRect(
                                        color = Color(0xFF1A1A1A),
                                        topLeft = Offset(3.5f * scale, 8f * scale),
                                        size = Size(17f * scale, 8.5f * scale),
                                        cornerRadius = CornerRadius(2.5f * scale),
                                        style = Stroke(width = 1.8f * scale)
                                    )
                                    drawRoundRect(
                                        color = Color(0xFF1A1A1A),
                                        topLeft = Offset(6.2f * scale, 10.8f * scale),
                                        size = Size(11.6f * scale, 3f * scale),
                                        cornerRadius = CornerRadius(1.5f * scale)
                                    )
                                }
                            }

                            // Tool 3: Eraser (icon_7)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    drawSvgPath(
                                        this,
                                        "M -0.759 0.651 L 4.976 7.342 L 6.495 6.04 L 0.759 -0.651 L -0.759 0.651 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(0.994f, -0.106f, 0.106f, 0.994f, 4.294f, 8.852f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 3.844 16.25 L 3.139 16.959 C 3.326 17.145 3.58 17.25 3.844 17.25 L 3.844 16.25 Z M 0.433 12.854 L 1.139 12.145 L 1.135 12.142 L 0.433 12.854 Z M 0 11.819 L 1 11.819 L 0 11.819 Z M 0.433 10.785 L 1.135 11.497 L 1.139 11.494 L 0.433 10.785 Z M 10.831 0.432 L 11.537 1.14 L 11.54 1.137 L 10.831 0.432 Z M 12.909 0.432 L 12.2 1.137 L 12.204 1.141 L 12.909 0.432 Z M 17.073 4.569 L 17.785 3.867 L 17.778 3.86 L 17.073 4.569 Z M 17.073 6.647 L 17.779 7.356 L 17.785 7.349 L 17.073 6.647 Z M 18.125 15.25 L 3.844 15.25 L 3.844 17.25 L 18.125 17.25 L 18.125 15.25 Z M 4.55 15.541 L 1.139 12.145 L -0.272 13.562 L 3.139 16.959 L 4.55 15.541 Z M 1.135 12.142 C 1.092 12.099 1.058 12.049 1.035 11.993 L -0.81 12.766 C -0.684 13.066 -0.5 13.338 -0.269 13.566 L 1.135 12.142 Z M 1.035 11.993 C 1.012 11.938 1 11.879 1 11.819 L -1 11.819 C -1 12.145 -0.935 12.466 -0.81 12.766 L 1.035 11.993 Z M 1 11.819 C 1 11.76 1.012 11.701 1.035 11.645 L -0.81 10.873 C -0.935 11.172 -1 11.494 -1 11.819 L 1 11.819 Z M 1.035 11.645 C 1.058 11.59 1.092 11.54 1.135 11.497 L -0.269 10.073 C -0.5 10.301 -0.684 10.573 -0.81 10.873 L 1.035 11.645 Z M 1.139 11.494 L 11.537 1.14 L 10.125 -0.277 L -0.272 10.076 L 1.139 11.494 Z M 11.54 1.137 C 11.583 1.094 11.634 1.059 11.691 1.036 L 10.923 -0.811 C 10.623 -0.687 10.351 -0.504 10.122 -0.273 L 11.54 1.137 Z M 11.691 1.036 C 11.747 1.012 11.808 1 11.87 1 L 11.87 -1 C 11.545 -1 11.223 -0.936 10.923 -0.811 L 11.691 1.036 Z M 11.87 1 C 11.932 1 11.992 1.012 12.049 1.036 L 12.816 -0.811 C 12.516 -0.936 12.195 -1 11.87 -1 L 11.87 1 Z M 12.049 1.036 C 12.106 1.059 12.157 1.094 12.2 1.137 L 13.618 -0.273 C 13.389 -0.504 13.116 -0.687 12.816 -0.811 L 12.049 1.036 Z M 12.204 1.141 L 16.369 5.279 L 17.778 3.86 L 13.614 -0.278 L 12.204 1.141 Z M 16.361 5.271 C 16.451 5.362 16.5 5.483 16.5 5.608 L 18.5 5.608 C 18.5 4.956 18.243 4.331 17.785 3.867 L 16.361 5.271 Z M 16.5 5.608 C 16.5 5.733 16.451 5.854 16.361 5.945 L 17.785 7.349 C 18.243 6.885 18.5 6.26 18.5 5.608 L 16.5 5.608 Z M 16.368 5.938 L 6.715 15.541 L 8.126 16.959 L 17.779 7.356 L 16.368 5.938 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 0.625f, 0.625f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                }
                            }
                        }

                        // Divider 1
                        Box(
                            modifier = Modifier
                                .padding(horizontal = 8.dp)
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Group 2: 2 tools (Lasso, Scissors)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Tool 4: Lasso (icon_8)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    val scale = 26.dp.toPx() / 24f
                                    val p1 = PathParser.createPathFromPathData("M12 3.5 C 7.3 3.5, 3.5 6, 3.5 9 C 3.5 12, 7.3 14.5, 12 14.5 C 16.7 14.5, 20.5 12, 20.5 9 C 20.5 6, 16.7 3.5, 12 3.5 Z")
                                    val p2 = PathParser.createPathFromPathData("M8.2 13.9 C 7 15.4, 7.6 17.3, 9.4 17.9 C 8 18.9, 6.2 19.4, 4.6 19")
                                    val m = android.graphics.Matrix().apply { postScale(scale, scale) }
                                    p1.transform(m)
                                    p2.transform(m)
                                    val stroke = Stroke(width = 1.8f * scale, cap = StrokeCap.Round, join = StrokeJoin.Round)
                                    drawPath(p1.asComposePath(), Color(0xFF1A1A1A), style = stroke)
                                    drawPath(p2.asComposePath(), Color(0xFF1A1A1A), style = stroke)
                                    drawCircle(Color(0xFF1A1A1A), radius = 1.1f * scale, center = Offset(9.9f * scale, 18.2f * scale))
                                }
                            }

                            // Tool 5: Scissors (icon_9)
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    drawSvgPath(
                                        this,
                                        "M 5.25 3.125 C 5.25 4.299 4.299 5.25 3.125 5.25 L 3.125 7.25 C 5.403 7.25 7.25 5.403 7.25 3.125 L 5.25 3.125 Z M 3.125 5.25 C 1.951 5.25 1 4.299 1 3.125 L -1 3.125 C -1 5.403 0.847 7.25 3.125 7.25 L 3.125 5.25 Z M 1 3.125 C 1 1.951 1.951 1 3.125 1 L 3.125 -1 C 0.847 -1 -1 0.847 -1 3.125 L 1 3.125 Z M 3.125 1 C 4.299 1 5.25 1.951 5.25 3.125 L 7.25 3.125 C 7.25 0.847 5.403 -1 3.125 -1 L 3.125 1 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 1.250f, 12.500f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 5.25 3.125 C 5.25 4.299 4.299 5.25 3.125 5.25 L 3.125 7.25 C 5.403 7.25 7.25 5.403 7.25 3.125 L 5.25 3.125 Z M 3.125 5.25 C 1.951 5.25 1 4.299 1 3.125 L -1 3.125 C -1 5.403 0.847 7.25 3.125 7.25 L 3.125 5.25 Z M 1 3.125 C 1 1.951 1.951 1 3.125 1 L 3.125 -1 C 0.847 -1 -1 0.847 -1 3.125 L 1 3.125 Z M 3.125 1 C 4.299 1 5.25 1.951 5.25 3.125 L 7.25 3.125 C 7.25 0.847 5.403 -1 3.125 -1 L 3.125 1 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 1.250f, 1.250f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 11.831 -0.743 L -0.669 10.507 L 0.669 11.993 L 13.169 0.743 L 11.831 -0.743 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 6.250f, 2.500f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M -0.707 0.707 L 4.293 5.707 L 5.707 4.293 L 0.707 -0.707 L -0.707 0.707 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 13.750f, 12.500f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M -0.6 0.8 L 4.4 4.55 L 5.6 2.95 L 0.6 -0.8 L -0.6 0.8 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(1f, 0f, 0f, 1f, 6.250f, 6.250f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                }
                            }
                        }

                        // Divider 2
                        Box(
                            modifier = Modifier
                                .padding(horizontal = 8.dp)
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Group 3: 1 tool (Contrast)
                        // Tool 6: Contrast (icon_10)
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(26.dp)) {
                                drawSvgPath(
                                    this,
                                    "M 17.5 8.75 C 17.5 13.582 13.582 17.5 8.75 17.5 C 3.918 17.5 0 13.582 0 8.75 C 0 3.918 3.918 0 8.75 0 C 13.582 0 17.5 3.918 17.5 8.75 Z M 15.75 8.75 C 15.75 12.616 12.616 15.75 8.75 15.75 L 8.75 1.75 C 12.616 1.75 15.75 4.884 15.75 8.75 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 1.250f, 1.250f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                            }
                        }
                    }
                }

                // Pill 3: History & Options [ ↺, ↻ | ⋯ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.88f),
                    shadowElevation = 4.dp,
                    border = BorderStroke(0.5.dp, Color(0xFFE5E5E5)),
                    modifier = Modifier.size(width = 227.dp, height = 80.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Group 1: 2 tools (Undo, Redo)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Undo
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    drawSvgPath(
                                        this,
                                        "M 3.75 3.125 L 4.39 3.893 L 5.312 3.125 L 4.39 2.357 L 3.75 3.125 Z M 0.64 7.018 L 4.39 3.893 L 3.11 2.357 L -0.64 5.482 L 0.64 7.018 Z M 4.39 2.357 L 0.64 -0.768 L -0.64 0.768 L 3.11 3.893 L 4.39 2.357 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(-1f, 0f, 0f, 1f, 6.250f, 2.500f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 4.375 0 L 4.375 -1 L 4.375 0 Z M 11.25 7.75 L 4.375 7.75 L 4.375 9.75 L 11.25 9.75 L 11.25 7.75 Z M 4.375 7.75 C 3.48 7.75 2.621 7.394 1.989 6.761 L 0.574 8.176 C 1.582 9.184 2.949 9.75 4.375 9.75 L 4.375 7.75 Z M 1.989 6.761 C 1.356 6.129 1 5.27 1 4.375 L -1 4.375 C -1 5.801 -0.434 7.168 0.574 8.176 L 1.989 6.761 Z M 1 4.375 C 1 3.48 1.356 2.621 1.989 1.989 L 0.574 0.574 C -0.434 1.582 -1 2.949 -1 4.375 L 1 4.375 Z M 1.989 1.989 C 2.621 1.356 3.48 1 4.375 1 L 4.375 -1 C 2.949 -1 1.582 -0.434 0.574 0.574 L 1.989 1.989 Z M 4.375 1 L 15 1 L 15 -1 L 4.375 -1 L 4.375 1 Z",
                                        Color(0xFF1A1A1A),
                                        floatArrayOf(-1f, 0f, 0f, 1f, 17.500f, 5.625f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                }
                            }

                            // Redo
                            Box(
                                modifier = Modifier.size(64.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(26.dp)) {
                                    drawSvgPath(
                                        this,
                                        "M 4.375 4.375 L 5.082 5.082 L 5.789 4.375 L 5.082 3.668 L 4.375 4.375 Z M 0.707 9.457 L 5.082 5.082 L 3.668 3.668 L -0.707 8.043 L 0.707 9.457 Z M 5.082 3.668 L 0.707 -0.707 L -0.707 0.707 L 3.668 5.082 L 5.082 3.668 Z",
                                        Color(0xFF858585),
                                        floatArrayOf(1f, 0f, 0f, 1f, 12.500f, 2.500f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                    drawSvgPath(
                                        this,
                                        "M 0 4.375 L -1 4.375 L 0 4.375 Z M 4.375 0 L 4.375 -1 L 4.375 0 Z M 11.25 7.75 L 4.375 7.75 L 4.375 9.75 L 11.25 9.75 L 11.25 7.75 Z M 4.375 7.75 C 3.48 7.75 2.621 7.394 1.989 6.761 L 0.574 8.176 C 1.582 9.184 2.949 9.75 4.375 9.75 L 4.375 7.75 Z M 1.989 6.761 C 1.356 6.129 1 5.27 1 4.375 L -1 4.375 C -1 5.801 -0.434 7.168 0.574 8.176 L 1.989 6.761 Z M 1 4.375 C 1 3.48 1.356 2.621 1.989 1.989 L 0.574 0.574 C -0.434 1.582 -1 2.949 -1 4.375 L 1 4.375 Z M 1.989 1.989 C 2.621 1.356 3.48 1 4.375 1 L 4.375 -1 C 2.949 -1 1.582 -0.434 0.574 0.574 L 1.989 1.989 Z M 4.375 1 L 13.738 1 L 13.738 -1 L 4.375 -1 L 4.375 1 Z",
                                        Color(0xFF858585),
                                        floatArrayOf(1f, 0f, 0f, 1f, 2.500f, 6.875f),
                                        viewBoxSize = 20f,
                                        targetSizeDp = 26f
                                    )
                                }
                            }
                        }

                        // Divider
                        Box(
                            modifier = Modifier
                                .padding(horizontal = 8.dp)
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // More options
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(26.dp)) {
                                drawSvgPath(
                                    this,
                                    "M 3.75 1.875 C 3.75 2.911 2.911 3.75 1.875 3.75 C 0.839 3.75 0 2.911 0 1.875 C 0 0.839 0.839 0 1.875 0 C 2.911 0 3.75 0.839 3.75 1.875 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 0.625f, 8.125f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                                drawSvgPath(
                                    this,
                                    "M 3.75 1.875 C 3.75 2.911 2.911 3.75 1.875 3.75 C 0.839 3.75 0 2.911 0 1.875 C 0 0.839 0.839 0 1.875 0 C 2.911 0 3.75 0.839 3.75 1.875 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 8.125f, 8.125f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                                drawSvgPath(
                                    this,
                                    "M 3.75 1.875 C 3.75 2.911 2.911 3.75 1.875 3.75 C 0.839 3.75 0 2.911 0 1.875 C 0 0.839 0.839 0 1.875 0 C 2.911 0 3.75 0.839 3.75 1.875 Z",
                                    Color(0xFF1A1A1A),
                                    floatArrayOf(1f, 0f, 0f, 1f, 15.625f, 8.125f),
                                    viewBoxSize = 20f,
                                    targetSizeDp = 26f
                                )
                            }
                        }
                    }
                }
            }
        }

        // Bottom right Claude watermark badge
        Surface(
            shape = CircleShape,
            color = Color.White,
            border = BorderStroke(0.5.dp, Color(0x1A000000)),
            shadowElevation = 2.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 15.dp, bottom = 13.5.dp)
                .size(width = 214.5.dp, height = 33.5.dp)
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
    }
}

private fun drawSvgPath(
    drawScope: androidx.compose.ui.graphics.drawscope.DrawScope,
    pathData: String,
    color: Color,
    vararg matrices: FloatArray,
    viewBoxSize: Float = 20f,
    targetSizeDp: Float = 26f
) {
    val androidPath = PathParser.createPathFromPathData(pathData)
    androidPath.fillType = android.graphics.Path.FillType.EVEN_ODD
    val finalMatrix = android.graphics.Matrix()
    for (matrixValues in matrices) {
        val stepMatrix = android.graphics.Matrix()
        val m = FloatArray(9)
        if (matrixValues.size == 6) {
            m[0] = matrixValues[0]
            m[1] = matrixValues[2]
            m[2] = matrixValues[4]
            m[3] = matrixValues[1]
            m[4] = matrixValues[3]
            m[5] = matrixValues[5]
        } else if (matrixValues.size == 2) {
            m[0] = 1f
            m[1] = 0f
            m[2] = matrixValues[0]
            m[3] = 0f
            m[4] = 1f
            m[5] = matrixValues[1]
        }
        m[8] = 1f
        stepMatrix.setValues(m)
        finalMatrix.postConcat(stepMatrix)
    }
    val scale = targetSizeDp * drawScope.density / viewBoxSize
    finalMatrix.postScale(scale, scale)
    androidPath.transform(finalMatrix)
    drawScope.drawPath(androidPath.asComposePath(), color = color)
}