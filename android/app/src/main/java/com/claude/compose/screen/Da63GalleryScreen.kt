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
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaFlareHeadline
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

private val ink = Color(0xFF1A1A1A)
private val rule = Color(0xFFE9E9E9)

enum class GalleryTool(val label: String, val asset: String) {
    Pen("Pen", "pen"),
    Pencil("Pencil", "pencil"),
    Highlighter("Highlighter", "highlighter"),
    Eraser("Eraser", "eraser"),
    Lasso("Lasso", "lasso"),
    Scissors("Scissors", "scissors"),
    Contrast("Contrast", "contrast")
}

/** Native interaction scaffold for da63; the article and history are synthetic demonstration state. */
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
        Row(Modifier.fillMaxSize().clickable(onClick = onClick)
            .padding(horizontal = if (large) 8.dp else 14.dp)
            .semantics { contentDescription = "Document options" },
            verticalAlignment = Alignment.CenterVertically) {
            if (large) {
                // The source uses a 64px icon hit area, then 8px gutters around its divider.
                Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                    Da63SvgGlyph("document", ink)
                }
                Spacer(Modifier.width(8.dp))
                Box(Modifier.width(1.dp).height(30.dp).background(rule))
                Spacer(Modifier.width(8.dp))
                Row(Modifier.padding(start = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Field notes", color = ink, fontFamily = AbcArizonaSans, fontSize = 18.sp,
                        letterSpacing = (-0.38).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(9.dp))
                    Text(if (open) "⌃" else "⌄", color = ink, fontSize = 18.sp)
                }
            } else {
                Da63SvgGlyph("document", ink)
                Spacer(Modifier.width(12.dp))
                Box(Modifier.width(1.dp).height(30.dp).background(rule))
                Spacer(Modifier.width(12.dp))
                Text("Field notes", color = ink, fontFamily = AbcArizonaSans, fontSize = 17.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (open) " ⌃" else " ⌄", color = ink)
            }
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
                    Da63SvgGlyph(tool.asset, if (active) Color.White else ink)
                }
            }
            Divider()
            IconButton(onClick = onOpacity, modifier = Modifier.size(if (compact) 46.dp else 64.dp)
                .semantics { contentDescription = "Opacity options" }) {
                Da63SvgGlyph("contrast", ink)
            }
        }
    }
}

@Composable
private fun HistoryPill(canUndo: Boolean, large: Boolean, onUndo: () -> Unit, onRedo: () -> Unit, onMenu: () -> Unit) {
    Pill(if (large) Modifier.width(227.dp).height(80.dp) else Modifier.height(64.dp)) {
        Row(Modifier.padding(horizontal = if (large) 8.dp else 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onUndo, enabled = canUndo, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "Undo" }) {
                Da63SvgGlyph("undo", if (canUndo) ink else Color.Gray)
            }
            IconButton(onClick = onRedo, enabled = !canUndo, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "Redo" }) {
                Da63SvgGlyph("redo", if (canUndo) Color(0xFFB5B5B5) else ink)
            }
            Divider()
            IconButton(onClick = onMenu, modifier = Modifier.size(if (large) 64.dp else 46.dp).semantics { contentDescription = "More options" }) {
                Da63SvgGlyph("more", ink)
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

/** SVG path data is generated from the captured asset bundle and drawn natively. */
@Composable
private fun Da63SvgGlyph(name: String, tint: Color) {
    val asset = Da63VectorAssets.all.getValue(name)
    Canvas(Modifier.size(26.dp)) {
        val scale = size.width / asset.viewBox
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = tint.toArgb() }
            native.save()
            native.scale(scale, scale)
            for (part in asset.parts) {
                val path = when (part.kind) {
                    "path" -> androidx.core.graphics.PathParser.createPathFromPathData(part.data)
                    "rect" -> android.graphics.Path().apply {
                        val n = part.numbers
                        addRoundRect(n[0], n[1], n[0] + n[2], n[1] + n[3], n[4], n[4], android.graphics.Path.Direction.CW)
                    }
                    "circle" -> android.graphics.Path().apply {
                        val n = part.numbers
                        addCircle(n[0], n[1], n[2], android.graphics.Path.Direction.CW)
                    }
                    else -> error("Unsupported da63 glyph part: ${part.kind}")
                }
                path.fillType = if (part.evenOdd) android.graphics.Path.FillType.EVEN_ODD else android.graphics.Path.FillType.WINDING
                val combined = android.graphics.Matrix()
                for (values in part.matrices) {
                    val step = android.graphics.Matrix().apply {
                        setValues(floatArrayOf(values[0], values[2], values[4], values[1], values[3], values[5], 0f, 0f, 1f))
                    }
                    combined.postConcat(step)
                }
                path.transform(combined)
                if (part.fill) {
                    paint.style = android.graphics.Paint.Style.FILL
                    native.drawPath(path, paint)
                }
                if (part.stroke) {
                    paint.style = android.graphics.Paint.Style.STROKE
                    paint.strokeWidth = part.strokeWidth
                    paint.strokeCap = when (part.cap) {
                        "round" -> android.graphics.Paint.Cap.ROUND
                        "square" -> android.graphics.Paint.Cap.SQUARE
                        else -> android.graphics.Paint.Cap.BUTT
                    }
                    paint.strokeJoin = when (part.join) {
                        "round" -> android.graphics.Paint.Join.ROUND
                        "bevel" -> android.graphics.Paint.Join.BEVEL
                        else -> android.graphics.Paint.Join.MITER
                    }
                    native.drawPath(path, paint)
                }
            }
            native.restore()
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
