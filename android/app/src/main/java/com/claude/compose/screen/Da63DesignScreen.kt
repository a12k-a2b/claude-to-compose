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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare

@Composable
fun Da63DesignScreen(
    modifier: Modifier = Modifier
) {
    // Desktop canvas has light gray background (#E5E5E5)
    Box(
        modifier = modifier
            .fillMaxSize()
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
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 84.dp)
            ) {
                // Masthead row: The Meridian + Navigation links
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 150.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "The Meridian",
                        fontFamily = AbcArizonaFlare,
                        fontSize = 42.sp,
                        fontWeight = FontWeight.Normal,
                        color = Color(0xFF1A1A1A)
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(32.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("World", fontSize = 16.sp, color = Color(0xFF535353))
                        Text("Cities", fontSize = 16.sp, color = Color(0xFF535353))
                        Text("Climate", fontSize = 16.sp, color = Color(0xFF535353))
                        Text("Ideas", fontSize = 16.sp, color = Color(0xFF535353))
                    }
                }

                // Article metadata
                Text(
                    text = "Climate · 9 min read",
                    fontSize = 14.sp,
                    color = Color(0xFF858585),
                    modifier = Modifier.padding(top = 120.dp, bottom = 22.dp)
                )

                // Article headline
                Text(
                    text = "The quiet economics of planting a city forest",
                    fontFamily = AbcArizonaFlare,
                    fontSize = 50.sp,
                    lineHeight = 56.sp,
                    color = Color(0xFF1A1A1A),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 34.dp)
                )

                // Article two columns
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(56.dp)
                ) {
                    Column(modifier = Modifier.width(492.dp)) {
                        Text(
                            text = "For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger. A maturing street tree returns far more than its planting cost in cooling, drainage and slowed traffic — a fact the accountants took a decade to trust.",
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = Color(0xFF1A1A1A)
                        )
                        Spacer(modifier = Modifier.height(18.dp))
                        Text(
                            text = "Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge. The result is a slower construction, measured in seasons rather than quarters, and a skyline that softens at its edges.",
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = Color(0xFF1A1A1A)
                        )
                    }

                    Column(modifier = Modifier.width(492.dp)) {
                        Text(
                            text = "What surprised them was not the shade but the water. A single mature plane can intercept thousands of litres of stormwater a year, water the drains no longer have to carry, and a pilot block dropped four degrees against its neighbours last July.",
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = Color(0xFF1A1A1A)
                        )
                        Spacer(modifier = Modifier.height(18.dp))
                        Text(
                            text = "The maintenance crews doubled as the budget line moved from parks to public works, and the forest, once an ornament, became a system with a return.",
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = Color(0xFF1A1A1A)
                        )
                    }
                }
            }

            // LAYER 2: Frosted Glass / Note Overlay Scrim (opacity: 0.79 white)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.White.copy(alpha = 0.79f))
            )

            // LAYER 3: Handwritten Ink & Highlighter Vector Annotations
            Canvas(modifier = Modifier.fillMaxSize()) {
                // 1. Highlighter rectangle over article text
                drawRoundRect(
                    color = Color(0xFF1A1A1A).copy(alpha = 0.16f),
                    topLeft = Offset(112.dp.toPx(), 818.dp.toPx()),
                    size = Size(404.dp.toPx(), 36.dp.toPx()),
                    cornerRadius = CornerRadius(8.dp.toPx())
                )

                // 2. Hand-drawn underline stroke (M112 894 C 210 906, 330 888, 486 900)
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

                // 3. Hand-drawn ink loop around paragraph 4 text
                val circlePath = Path().apply {
                    moveTo(1046.dp.toPx(), 662.dp.toPx())
                    cubicTo(
                        1072.dp.toPx(), 628.dp.toPx(),
                        1112.dp.toPx(), 644.dp.toPx(),
                        1104.dp.toPx(), 676.dp.toPx()
                    )
                    cubicTo(
                        1096.dp.toPx(), 706.dp.toPx(),
                        1052.dp.toPx(), 710.dp.toPx(),
                        1040.dp.toPx(), 682.dp.toPx()
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
                    .offset(x = 80.8.dp, y = 44.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Pill 1: Document Pill [ 📄 | Field notes ▾ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White,
                    shadowElevation = 8.dp,
                    border = BorderStroke(1.dp, Color(0xFFE5E5E5)),
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
                            Canvas(modifier = Modifier.size(26.dp)) {
                                val w = size.width
                                val h = size.height
                                val fold = 7.dp.toPx()
                                val docPath = Path().apply {
                                    moveTo(0f, 0f)
                                    lineTo(w - fold, 0f)
                                    lineTo(w, fold)
                                    lineTo(w, h)
                                    lineTo(0f, h)
                                    close()
                                }
                                drawPath(
                                    docPath,
                                    color = Color(0xFF1A1A1A),
                                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                                )
                                val foldPath = Path().apply {
                                    moveTo(w - fold, 0f)
                                    lineTo(w - fold, fold)
                                    lineTo(w, fold)
                                }
                                drawPath(
                                    foldPath,
                                    color = Color(0xFF1A1A1A),
                                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                                )
                            }
                        }

                        // Divider
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Document name dropdown
                        Row(
                            modifier = Modifier
                                .size(width = 152.5.dp, height = 64.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = "Field notes",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF1A1A1A)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "▾",
                                fontSize = 14.sp,
                                color = Color(0xFF535353)
                            )
                        }
                    }
                }

                // Pill 2: Tool Palette [ ✍️, ✏️, 🖍️, 🧼 | ➰, ✂️ | ◑ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White,
                    shadowElevation = 8.dp,
                    border = BorderStroke(1.dp, Color(0xFFE5E5E5)),
                    modifier = Modifier.size(width = 506.dp, height = 80.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        // Tool 0: Pen (Active with solid dark circle)
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(54.dp)
                                    .background(Color(0xFF1A1A1A), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Canvas(modifier = Modifier.size(24.dp)) {
                                    val penPath = Path().apply {
                                        moveTo(size.width * 0.25f, size.height * 0.75f)
                                        lineTo(size.width * 0.75f, size.height * 0.25f)
                                        lineTo(size.width * 0.85f, size.height * 0.35f)
                                        lineTo(size.width * 0.35f, size.height * 0.85f)
                                        close()
                                    }
                                    drawPath(
                                        penPath,
                                        color = Color.White,
                                        style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                                    )
                                }
                            }
                        }

                        // Tool 1: Pencil
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                drawLine(
                                    color = Color(0xFF1A1A1A),
                                    start = Offset(4.dp.toPx(), 20.dp.toPx()),
                                    end = Offset(20.dp.toPx(), 4.dp.toPx()),
                                    strokeWidth = 2.dp.toPx(),
                                    cap = StrokeCap.Round
                                )
                            }
                        }

                        // Tool 2: Highlighter / Marker
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                drawRoundRect(
                                    color = Color(0xFF1A1A1A),
                                    topLeft = Offset(4.dp.toPx(), 7.dp.toPx()),
                                    size = Size(16.dp.toPx(), 10.dp.toPx()),
                                    cornerRadius = CornerRadius(2.dp.toPx()),
                                    style = Stroke(width = 2.dp.toPx())
                                )
                            }
                        }

                        // Tool 3: Eraser
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                val eraserPath = Path().apply {
                                    moveTo(4.dp.toPx(), 16.dp.toPx())
                                    lineTo(16.dp.toPx(), 4.dp.toPx())
                                    lineTo(20.dp.toPx(), 8.dp.toPx())
                                    lineTo(8.dp.toPx(), 20.dp.toPx())
                                    close()
                                }
                                drawPath(
                                    eraserPath,
                                    color = Color(0xFF1A1A1A),
                                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                                )
                            }
                        }

                        // Divider 1
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Tool 4: Lasso
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                drawCircle(
                                    color = Color(0xFF1A1A1A),
                                    radius = 8.dp.toPx(),
                                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                                )
                            }
                        }

                        // Tool 5: Scissors
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                drawCircle(
                                    color = Color(0xFF1A1A1A),
                                    radius = 3.dp.toPx(),
                                    center = Offset(6.dp.toPx(), 17.dp.toPx()),
                                    style = Stroke(width = 2.dp.toPx())
                                )
                                drawCircle(
                                    color = Color(0xFF1A1A1A),
                                    radius = 3.dp.toPx(),
                                    center = Offset(18.dp.toPx(), 17.dp.toPx()),
                                    style = Stroke(width = 2.dp.toPx())
                                )
                                drawLine(
                                    color = Color(0xFF1A1A1A),
                                    start = Offset(8.dp.toPx(), 15.dp.toPx()),
                                    end = Offset(18.dp.toPx(), 5.dp.toPx()),
                                    strokeWidth = 2.dp.toPx()
                                )
                                drawLine(
                                    color = Color(0xFF1A1A1A),
                                    start = Offset(16.dp.toPx(), 15.dp.toPx()),
                                    end = Offset(6.dp.toPx(), 5.dp.toPx()),
                                    strokeWidth = 2.dp.toPx()
                                )
                            }
                        }

                        // Divider 2
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // Tool 6: Contrast / Invert
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Canvas(modifier = Modifier.size(24.dp)) {
                                drawCircle(
                                    color = Color(0xFF1A1A1A),
                                    radius = 10.dp.toPx(),
                                    style = Stroke(width = 2.dp.toPx())
                                )
                                drawArc(
                                    color = Color(0xFF1A1A1A),
                                    startAngle = 90f,
                                    sweepAngle = 180f,
                                    useCenter = true
                                )
                            }
                        }
                    }
                }

                // Pill 3: History & Options [ ↺, ↻ | ⋯ ]
                Surface(
                    shape = CircleShape,
                    color = Color.White,
                    shadowElevation = 8.dp,
                    border = BorderStroke(1.dp, Color(0xFFE5E5E5)),
                    modifier = Modifier.size(width = 227.dp, height = 80.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        // Undo
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("↺", fontSize = 24.sp, color = Color(0xFF1A1A1A))
                        }

                        // Redo
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("↻", fontSize = 24.sp, color = Color(0xFF1A1A1A))
                        }

                        // Divider
                        Box(
                            modifier = Modifier
                                .width(1.dp)
                                .height(30.dp)
                                .background(Color(0xFFE5E5E5))
                        )

                        // More options
                        Box(
                            modifier = Modifier.size(64.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "⋯",
                                fontSize = 26.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF1A1A1A)
                            )
                        }
                    }
                }
            }
        }

        // Bottom right Claude watermark badge
        Surface(
            shape = CircleShape,
            color = Color.White,
            border = BorderStroke(1.dp, Color(0x1A000000)),
            shadowElevation = 2.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 33.dp, bottom = 16.dp)
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
