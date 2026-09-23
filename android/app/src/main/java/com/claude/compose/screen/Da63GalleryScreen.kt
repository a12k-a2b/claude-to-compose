package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.AutoFixOff
import androidx.compose.material.icons.filled.BorderColor
import androidx.compose.material.icons.filled.Contrast
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Screenshot
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaFlareHeadline
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

private val ink = Color(0xFF1A1A1A)
private val rule = Color(0xFFE9E9E9)

enum class GalleryTool(val label: String, val icon: ImageVector) {
    Pen("Pen", Icons.Default.BorderColor),
    Pencil("Pencil", Icons.Default.Edit),
    Highlighter("Highlighter", Icons.Default.Highlight),
    Eraser("Eraser", Icons.Default.AutoFixOff),
    Lasso("Lasso", Icons.Default.Screenshot),
    Scissors("Scissors", Icons.Default.ContentCut),
    Contrast("Contrast", Icons.Default.Contrast)
}

/** Native interaction proof for da63; the article below is synthetic demonstration content. */
@Composable
fun Da63GalleryScreen(modifier: Modifier = Modifier, proofChromeBackdrop: Color = Color.Transparent) {
    var selectedName by rememberSaveable { mutableStateOf(GalleryTool.Pen.name) }
    var opacity by rememberSaveable { mutableFloatStateOf(0.79f) }
    var opacityOpen by rememberSaveable { mutableStateOf(false) }
    var documentOpen by rememberSaveable { mutableStateOf(false) }
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    var historyStep by rememberSaveable { mutableFloatStateOf(1f) }
    val selected = GalleryTool.valueOf(selectedName)

    BoxWithConstraints(modifier.fillMaxSize().background(Color(0xFFE5E5E5))) {
        val narrow = maxWidth < 850.dp
        val wide = maxWidth >= 1100.dp
        Box(Modifier.width(if (maxWidth > 1184.dp) 1184.dp else maxWidth).fillMaxSize().background(Color.White)) {
            SyntheticArticle(
                compact = narrow,
                opacity = opacity,
                modifier = Modifier.fillMaxSize()
            )
            Column(
                Modifier.fillMaxWidth().background(proofChromeBackdrop).padding(start = if (narrow) 12.dp else 80.dp,
                    end = if (narrow) 12.dp else 0.dp, top = if (narrow) 12.dp else 44.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (narrow) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DocumentPill(Modifier.weight(1f), documentOpen, false) { documentOpen = !documentOpen }
                        HistoryPill(historyStep > 0f, false, onUndo = { historyStep = 0f }, onRedo = { historyStep = 1f }, onMenu = { menuOpen = !menuOpen })
                    }
                    ToolPill(selected, onSelect = { selectedName = it.name }, onOpacity = { opacityOpen = !opacityOpen }, compact = true)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        DocumentPill(Modifier.width(250.dp), documentOpen, true) { documentOpen = !documentOpen }
                        ToolPill(selected, onSelect = { selectedName = it.name }, onOpacity = { opacityOpen = !opacityOpen }, compact = false)
                        if (wide) HistoryPill(historyStep > 0f, true, onUndo = { historyStep = 0f }, onRedo = { historyStep = 1f }, onMenu = { menuOpen = !menuOpen })
                    }
                    if (!wide) HistoryPill(historyStep > 0f, true, onUndo = { historyStep = 0f }, onRedo = { historyStep = 1f }, onMenu = { menuOpen = !menuOpen })
                }
                if (documentOpen) PopupLine("Field notes · synthetic gallery document", "Document options")
                if (menuOpen) PopupLine("Gallery controls · no live note", "More options")
                if (opacityOpen) {
                    Surface(shape = CircleShape, color = Color.White, border = BorderStroke(1.dp, rule), shadowElevation = 4.dp) {
                        Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Opacity", color = ink, fontFamily = AbcArizonaSans, modifier = Modifier.width(72.dp))
                            Slider(value = opacity, onValueChange = { opacity = it }, valueRange = 0f..1f,
                                modifier = Modifier.width(if (narrow) 180.dp else 260.dp).semantics { contentDescription = "Opacity slider" })
                            Text("${(opacity * 100).toInt()}%", color = ink, fontFamily = AbcRomMono,
                                modifier = Modifier.width(48.dp).semantics { contentDescription = "Opacity ${(opacity * 100).toInt()} percent" })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DocumentPill(modifier: Modifier, open: Boolean, large: Boolean, onClick: () -> Unit) {
    Pill(modifier.height(if (large) 80.dp else 64.dp)) {
        Row(Modifier.fillMaxSize().clickable(onClick = onClick).padding(horizontal = if (large) 24.dp else 14.dp).semantics { contentDescription = "Document options" },
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Description, contentDescription = null, tint = ink, modifier = Modifier.size(if (large) 26.dp else 23.dp))
            Spacer(Modifier.width(if (large) 20.dp else 12.dp))
            Box(Modifier.width(1.dp).height(30.dp).background(rule))
            Spacer(Modifier.width(if (large) 20.dp else 12.dp))
            Text("Field notes", color = ink, fontFamily = AbcArizonaSans, fontSize = if (large) 19.sp else 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (open) " ⌃" else " ⌄", color = ink)
        }
    }
}

@Composable
private fun ToolPill(selected: GalleryTool, onSelect: (GalleryTool) -> Unit, onOpacity: () -> Unit, compact: Boolean) {
    Pill(if (compact) Modifier.fillMaxWidth().height(64.dp) else Modifier.width(506.dp).height(80.dp)) {
        Row(Modifier.padding(horizontal = if (compact) 5.dp else 8.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (compact) Arrangement.SpaceEvenly else Arrangement.spacedBy(2.dp)) {
            GalleryTool.entries.take(6).forEachIndexed { index, tool ->
                if (index == 4) Divider()
                val active = selected == tool
                IconButton(onClick = { onSelect(tool) }, modifier = Modifier.size(if (compact) 46.dp else 64.dp)
                    .background(if (active) ink else Color.Transparent, CircleShape)
                    .semantics { this.selected = active; contentDescription = "${tool.label} tool" }) {
                    GalleryGlyph(tool, if (active) Color.White else ink)
                }
            }
            Divider()
            IconButton(onClick = onOpacity, modifier = Modifier.size(if (compact) 46.dp else 64.dp)
                .semantics { contentDescription = "Opacity options" }) {
                GalleryGlyph(GalleryTool.Contrast, ink)
            }
        }
    }
}

@Composable
private fun HistoryPill(canUndo: Boolean, large: Boolean, onUndo: () -> Unit, onRedo: () -> Unit, onMenu: () -> Unit) {
    Pill(if (large) Modifier.width(227.dp).height(80.dp) else Modifier.height(64.dp)) {
        Row(Modifier.padding(horizontal = if (large) 8.dp else 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onUndo, enabled = canUndo, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "Undo" }) {
                Icon(Icons.AutoMirrored.Filled.Undo, null, tint = if (canUndo) ink else Color.Gray)
            }
            IconButton(onClick = onRedo, enabled = !canUndo, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "Redo" }) {
                Icon(Icons.AutoMirrored.Filled.Redo, null, tint = if (canUndo) Color.Gray else ink)
            }
            Divider()
            IconButton(onClick = onMenu, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "More options" }) {
                Icon(Icons.Default.MoreHoriz, null, tint = ink)
            }
        }
    }
}

@Composable
private fun Pill(modifier: Modifier, content: @Composable () -> Unit) {
    Surface(modifier = modifier, shape = CircleShape, color = Color.White.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, rule), shadowElevation = 3.dp, content = content)
}

@Composable
private fun Divider() { Box(Modifier.padding(horizontal = 3.dp).width(1.dp).height(28.dp).background(rule)) }

/** Compact native strokes based on the da63 SVG silhouettes, shared by every toolbar state. */
@Composable
private fun GalleryGlyph(tool: GalleryTool, tint: Color) {
    Canvas(Modifier.size(26.dp)) {
        val k = size.width / 26f
        fun o(x: Float, y: Float) = Offset(x * k, y * k)
        val stroke = Stroke(width = 2.1f * k, cap = StrokeCap.Round)
        when (tool) {
            GalleryTool.Pen -> {
                val nib = Path().apply {
                    moveTo(5*k, 22*k); lineTo(7*k, 12*k); lineTo(15*k, 4*k)
                    quadraticTo(17*k, 2*k, 19*k, 4*k); lineTo(23*k, 8*k)
                    quadraticTo(24*k, 10*k, 22*k, 12*k); lineTo(14*k, 20*k)
                    close()
                }
                drawPath(nib, tint, style = stroke)
                drawCircle(tint, 1.3f*k, o(14f, 11f))
                drawLine(tint, o(6f, 22f), o(14f, 14f), 1.8f*k)
            }
            GalleryTool.Pencil -> {
                val body = Path().apply {
                    moveTo(4*k, 17*k); lineTo(16*k, 5*k); lineTo(22*k, 11*k)
                    lineTo(10*k, 23*k); lineTo(4*k, 23*k); close()
                }
                drawPath(body, tint, style = stroke)
                drawLine(tint, o(13f, 8f), o(19f, 14f), 1.8f*k)
            }
            GalleryTool.Highlighter -> {
                drawRoundRect(tint, o(5f, 10f), Size(16*k, 7*k), CornerRadius(2*k), style = stroke)
                drawLine(tint, o(9f, 13.5f), o(17f, 13.5f), 2f*k)
            }
            GalleryTool.Eraser -> {
                val eraser = Path().apply {
                    moveTo(3*k, 17*k); lineTo(15*k, 4*k); lineTo(23*k, 12*k)
                    lineTo(12*k, 23*k); lineTo(9*k, 23*k); close()
                }
                drawPath(eraser, tint, style = stroke)
                drawLine(tint, o(9f, 11f), o(17f, 19f), 2f*k)
                drawLine(tint, o(10f, 23f), o(24f, 23f), 2f*k)
            }
            GalleryTool.Lasso -> {
                drawOval(tint, o(3f, 4f), Size(20*k, 13*k), style = stroke)
                val tail = Path().apply { moveTo(9*k, 16*k); quadraticTo(10*k, 21*k, 4*k, 23*k) }
                drawPath(tail, tint, style = stroke)
            }
            GalleryTool.Scissors -> {
                drawCircle(tint, 3.2f*k, o(6f, 7f), style = stroke)
                drawCircle(tint, 3.2f*k, o(6f, 19f), style = stroke)
                drawLine(tint, o(9f, 9f), o(22f, 21f), 2f*k, cap = StrokeCap.Round)
                drawLine(tint, o(9f, 17f), o(22f, 4f), 2f*k, cap = StrokeCap.Round)
            }
            GalleryTool.Contrast -> {
                drawCircle(tint, 10f*k, o(13f, 13f), style = stroke)
                drawArc(tint, -90f, 180f, true, o(3f, 3f), Size(20*k, 20*k))
            }
        }
    }
}

@Composable
private fun PopupLine(text: String, label: String) {
    Surface(shape = CircleShape, color = Color.White, border = BorderStroke(1.dp, rule), shadowElevation = 3.dp) {
        Text(text, Modifier.padding(horizontal = 20.dp, vertical = 12.dp).semantics { contentDescription = label },
            color = ink, fontFamily = AbcArizonaSans)
    }
}

@Composable
private fun SyntheticArticle(compact: Boolean, opacity: Float, modifier: Modifier = Modifier) {
    Box(modifier) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = if (compact) 28.dp else 72.dp)) {
            Spacer(Modifier.height(if (compact) 174.dp else 150.dp))
            Text("The Meridian", color = ink, fontFamily = AbcArizonaFlare, fontSize = 34.sp)
            Spacer(Modifier.height(if (compact) 76.dp else 88.dp))
            Text("CLIMATE · 9 MIN READ", color = Color(0xFF858585), fontFamily = AbcRomMono, fontSize = 13.sp)
            Spacer(Modifier.height(26.dp))
            Text(if (compact) "The quiet economics of planting a city forest" else "The quiet economics of planting a\ncity forest",
                color = ink, fontFamily = AbcArizonaFlareHeadline, fontSize = if (compact) 39.sp else 58.sp,
                lineHeight = if (compact) 45.sp else 63.sp)
            Spacer(Modifier.height(32.dp))
            if (compact) {
                Text("For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger.",
                    color = ink, fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 31.sp)
                Spacer(Modifier.height(22.dp))
                Text("Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge.",
                    color = ink, fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 31.sp)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                    Column(Modifier.width(492.dp)) {
                        Text("For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger. A maturing street tree returns far more than its planting cost in cooling, drainage and slowed traffic — a fact the accountants took a decade to trust.",
                            color = ink, fontFamily = AbcArizonaSans, fontSize = 19.sp, lineHeight = 32.sp)
                        Spacer(Modifier.height(20.dp))
                        Text("Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge. The result is a slower construction, measured in seasons rather than quarters, and a skyline that softens at its edges.",
                            color = ink, fontFamily = AbcArizonaSans, fontSize = 19.sp, lineHeight = 32.sp)
                    }
                    Column(Modifier.width(492.dp)) {
                        Text("What surprised them was not the shade but the water. A single mature plane can intercept thousands of litres of stormwater a year, water the drains no longer have to carry, and a pilot block dropped four degrees against its neighbours last July.",
                            color = ink, fontFamily = AbcArizonaSans, fontSize = 19.sp, lineHeight = 32.sp)
                        Spacer(Modifier.height(20.dp))
                        Text("The maintenance crews doubled as the budget line moved from parks to public works, and the forest, once an ornament, became a system with a return.",
                            color = ink, fontFamily = AbcArizonaSans, fontSize = 19.sp, lineHeight = 32.sp)
                    }
                }
            }
        }
        Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = opacity)))
        Canvas(Modifier.fillMaxSize()) {
            val step = 56.dp.toPx()
            var y = 55.dp.toPx()
            while (y < size.height) {
                drawLine(Color(0xFFF0F0F0), androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), 1.dp.toPx())
                y += step
            }
        }
        Text("SYNTHETIC ARTICLE BACKDROP", color = Color(0xFFB8B8B8), fontFamily = AbcRomMono,
            fontSize = 10.sp, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp)
                .semantics { contentDescription = "Synthetic article backdrop" })
    }
}
