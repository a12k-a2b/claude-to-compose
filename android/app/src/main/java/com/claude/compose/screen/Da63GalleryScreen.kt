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
import androidx.compose.material.icons.filled.Brush
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
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
        val compact = maxWidth < 850.dp
        val chromeHeight = if (compact) 152.dp else 104.dp
        Box(Modifier.fillMaxSize().background(Color.White)) {
            SyntheticArticle(
                compact = compact,
                opacity = opacity,
                modifier = Modifier.fillMaxSize().padding(top = chromeHeight)
            )
            Column(
                Modifier.fillMaxWidth().background(proofChromeBackdrop).padding(horizontal = if (compact) 12.dp else 24.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (compact) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DocumentPill(Modifier.weight(1f), documentOpen) { documentOpen = !documentOpen }
                        HistoryPill(historyStep > 0f, onUndo = { historyStep = 0f }, onRedo = { historyStep = 1f }, onMenu = { menuOpen = !menuOpen })
                    }
                    ToolPill(selected, onSelect = { selectedName = it.name }, onOpacity = { opacityOpen = !opacityOpen }, compact = true)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        DocumentPill(Modifier.width(198.dp), documentOpen) { documentOpen = !documentOpen }
                        ToolPill(selected, onSelect = { selectedName = it.name }, onOpacity = { opacityOpen = !opacityOpen }, compact = false)
                        HistoryPill(historyStep > 0f, onUndo = { historyStep = 0f }, onRedo = { historyStep = 1f }, onMenu = { menuOpen = !menuOpen })
                    }
                }
                if (documentOpen) PopupLine("Field notes · synthetic gallery document", "Document options")
                if (menuOpen) PopupLine("Gallery controls · no live note", "More options")
                if (opacityOpen) {
                    Surface(shape = CircleShape, color = Color.White, border = BorderStroke(1.dp, rule), shadowElevation = 4.dp) {
                        Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Opacity", color = ink, fontFamily = AbcArizonaSans, modifier = Modifier.width(72.dp))
                            Slider(value = opacity, onValueChange = { opacity = it }, valueRange = 0f..1f,
                                modifier = Modifier.width(if (compact) 180.dp else 260.dp).semantics { contentDescription = "Opacity slider" })
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
private fun DocumentPill(modifier: Modifier, open: Boolean, onClick: () -> Unit) {
    Pill(modifier.height(64.dp)) {
        Row(Modifier.fillMaxSize().clickable(onClick = onClick).padding(horizontal = 14.dp).semantics { contentDescription = "Document options" },
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Description, contentDescription = null, tint = ink, modifier = Modifier.size(23.dp))
            Spacer(Modifier.width(12.dp))
            Box(Modifier.width(1.dp).height(26.dp).background(rule))
            Spacer(Modifier.width(12.dp))
            Text("Field notes", color = ink, fontFamily = AbcArizonaSans, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (open) " ⌃" else " ⌄", color = ink)
        }
    }
}

@Composable
private fun ToolPill(selected: GalleryTool, onSelect: (GalleryTool) -> Unit, onOpacity: () -> Unit, compact: Boolean) {
    Pill(if (compact) Modifier.fillMaxWidth().height(64.dp) else Modifier.height(64.dp)) {
        Row(Modifier.padding(horizontal = 5.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (compact) Arrangement.SpaceEvenly else Arrangement.spacedBy(2.dp)) {
            GalleryTool.entries.forEachIndexed { index, tool ->
                if (index == 4 || index == 6) Divider()
                val active = selected == tool
                IconButton(onClick = { onSelect(tool) }, modifier = Modifier.size(if (compact) 46.dp else 52.dp)
                    .background(if (active) ink else Color.Transparent, CircleShape)
                    .semantics { this.selected = active; contentDescription = "${tool.label} tool" }) {
                    Icon(tool.icon, contentDescription = null, tint = if (active) Color.White else ink, modifier = Modifier.size(24.dp))
                }
            }
            Divider()
            IconButton(onClick = onOpacity, modifier = Modifier.size(if (compact) 46.dp else 52.dp)
                .semantics { contentDescription = "Opacity options" }) {
                Icon(Icons.Default.Contrast, contentDescription = null, tint = ink, modifier = Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun HistoryPill(canUndo: Boolean, onUndo: () -> Unit, onRedo: () -> Unit, onMenu: () -> Unit) {
    Pill(Modifier.height(64.dp)) {
        Row(Modifier.padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onUndo, enabled = canUndo, modifier = Modifier.size(46.dp).semantics { contentDescription = "Undo" }) {
                Icon(Icons.AutoMirrored.Filled.Undo, null, tint = if (canUndo) ink else Color.Gray)
            }
            IconButton(onClick = onRedo, enabled = !canUndo, modifier = Modifier.size(46.dp).semantics { contentDescription = "Redo" }) {
                Icon(Icons.AutoMirrored.Filled.Redo, null, tint = if (canUndo) Color.Gray else ink)
            }
            Divider()
            IconButton(onClick = onMenu, modifier = Modifier.size(46.dp).semantics { contentDescription = "More options" }) {
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
            Text("SYNTHETIC ARTICLE BACKDROP", color = Color(0xFF858585), fontFamily = AbcRomMono, fontSize = 11.sp,
                modifier = Modifier.padding(top = 20.dp).semantics { contentDescription = "Synthetic article backdrop" })
            Spacer(Modifier.height(24.dp))
            Text("The Meridian", color = ink, fontFamily = AbcArizonaFlare, fontSize = 32.sp)
            Spacer(Modifier.height(if (compact) 34.dp else 70.dp))
            Text("CLIMATE · 9 MIN READ", color = Color(0xFF858585), fontFamily = AbcRomMono, fontSize = 13.sp)
            Spacer(Modifier.height(20.dp))
            Text("The quiet economics of planting a city forest", color = ink, fontFamily = AbcArizonaFlare,
                fontSize = if (compact) 39.sp else 54.sp, lineHeight = if (compact) 45.sp else 61.sp)
            Spacer(Modifier.height(32.dp))
            Text("For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger.",
                color = ink, fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 31.sp)
            Spacer(Modifier.height(22.dp))
            Text("Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge.",
                color = ink, fontFamily = AbcArizonaSans, fontSize = 18.sp, lineHeight = 31.sp)
        }
        Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = opacity)))
        Canvas(Modifier.fillMaxSize()) {
            val step = 56.dp.toPx()
            var y = 0f
            while (y < size.height) {
                drawLine(rule, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), 1.dp.toPx())
                y += step
            }
        }
    }
}
