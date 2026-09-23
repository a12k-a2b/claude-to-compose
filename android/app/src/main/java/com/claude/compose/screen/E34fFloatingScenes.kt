package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BorderColor
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Contrast
import androidx.compose.material.icons.filled.Crop
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

private val floatingInk = Color(0xFF1C1C19)
private val floatingNight = Color(0xFF20201D)
private val floatingIvory = Color(0xFFFCFBF9)
private val floatingAmber = Color(0xFFFFA20A)
private val floatingRule = Color(0xFFE9E9EB)

/**
 * Native, synthetic studies for the six e34f floating directions. Figures are 1-based.
 * Visual parity, source animation timing, real notebook actions and production ink remain BLOCKED.
 */
@Composable
fun E34fFloatingScene(sceneId: String, figureIndex: Int = 1, modifier: Modifier = Modifier,
    proofChromeOverride: Color? = null) {
    require(sceneId in setOf("3a", "3b", "3c", "4a", "4b", "4c"))
    require(figureIndex in if (sceneId.startsWith("3")) 1..2 else 1..1)
    val night = sceneId == "3b" || sceneId == "3c" && figureIndex == 2
    val article = (sceneId == "3a" || sceneId == "3b") && figureIndex == 1 || sceneId == "4a"
    val dial = sceneId == "3c"
    val fg = if (night) Color.White else floatingInk
    val surface = proofChromeOverride ?: if (night) Color(0xFF22221D) else Color.White
    var selected by rememberSaveable(sceneId, figureIndex) { mutableStateOf("Pen") }
    var page by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(if (sceneId == "3a" && figureIndex == 2 || sceneId == "3b" && figureIndex == 2 || sceneId == "4b") 3 else 2) }
    var cardOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf((sceneId == "3a" || sceneId == "3b") && figureIndex == 1) }
    var dialOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(dial) }
    var glassOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(false) }
    var glassPercent by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(if (figureIndex == 2 && sceneId.startsWith("3")) 100 else 68) }
    var menuOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(false) }
    var notebookOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(false) }
    var visible by rememberSaveable(sceneId, figureIndex) { mutableStateOf(true) }
    var history by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(1) }
    var penSize by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(3) }
    var penShade by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(1) }
    val onTool: (String) -> Unit = {
        selected = it
        if (dial && it == "Pen") dialOpen = !dialOpen
        else cardOpen = it == "Pen" && !dial
    }
    val onAction: (String) -> Unit = { action -> when (action) {
        "Notebook" -> notebookOpen = !notebookOpen
        "Glass" -> glassOpen = !glassOpen
        "Undo" -> history = 0
        "Redo" -> history = 1
        "More" -> menuOpen = !menuOpen
        "Hide" -> visible = false
        "New page" -> page = if (page == 5) 1 else page + 1
        else -> onTool(action)
    } }
    Column(modifier.fillMaxSize().background(Color(0xFFF8F7F3))) {
        Box(Modifier.weight(1f).fillMaxWidth().background(if (night) floatingNight else Color(0xFFD0CECA),
            RoundedCornerShape(24.dp)).padding(9.dp)) {
            Box(Modifier.fillMaxSize().background(if (night) floatingNight else Color.White,
                RoundedCornerShape(19.dp))) {
                FloatingPaper(article, night, Modifier.fillMaxSize())
                if (glassPercent < 100 && sceneId.startsWith("3")) Box(Modifier.fillMaxSize()
                    .background(if (night) floatingNight.copy(alpha = .22f) else Color.White.copy(alpha = .32f))
                    .semantics { contentDescription = "Glass $glassPercent percent" })
                if (visible) when (sceneId) {
                    "3a", "3b" -> FloatingSlips(fg, surface, selected, history, onAction)
                    "3c" -> {
                        NotebookSlip(fg, surface, onAction, Modifier.align(Alignment.TopStart).padding(14.dp))
                        DialControls(fg, surface, selected, dialOpen, onTool, onAction,
                            Modifier.align(Alignment.Center))
                    }
                    "4a" -> LooseCoins(fg, surface, selected, history, onAction)
                    "4b" -> OneCapsule(fg, surface, selected, history, onAction)
                    else -> SideRail(fg, surface, selected, history, onAction)
                } else FloatingButton("Show toolbar", Icons.Default.Edit, fg, surface, false,
                    { visible = true }, Modifier.align(Alignment.TopEnd).padding(12.dp))
                if (cardOpen && visible && !dial) PenCard(night, selected, penSize, penShade,
                    onSize = { penSize = it }, onShade = { penShade = it },
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = if (sceneId.startsWith("3")) 80.dp else 75.dp))
                if (glassOpen) Surface(Modifier.align(Alignment.BottomEnd).padding(bottom = 48.dp, end = 12.dp),
                    color = surface, shape = RoundedCornerShape(12.dp), shadowElevation = 5.dp) {
                    Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(68, 100).forEach { value ->
                            Text("$value%", Modifier.clickable { glassPercent = value }
                                .semantics { contentDescription = "Glass $value percent option"; this.selected = glassPercent == value }
                                .padding(8.dp), color = fg, fontFamily = AbcRomMono, fontSize = 12.sp)
                        }
                    }
                }
                if (notebookOpen) Text("Field notes · synthetic notebook", Modifier.align(Alignment.BottomStart)
                    .padding(12.dp).background(surface, RoundedCornerShape(8.dp)).padding(10.dp),
                    color = fg, fontFamily = AbcArizonaSans, fontSize = 12.sp)
                if (menuOpen) Text("Gallery options · synthetic note", Modifier.align(Alignment.BottomEnd)
                    .padding(12.dp).background(surface, RoundedCornerShape(8.dp)).padding(10.dp),
                    color = fg, fontFamily = AbcArizonaSans, fontSize = 12.sp)
                Surface(shape = CircleShape, color = surface,
                    border = BorderStroke(1.dp, fg.copy(alpha = .13f)), shadowElevation = if (night) 0.dp else 3.dp,
                    modifier = Modifier.align(if (sceneId == "4c") Alignment.BottomStart else Alignment.BottomCenter)
                        .padding(12.dp)) {
                    Text("$page of 5", Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                        .semantics { contentDescription = "Page $page of 5" }, color = fg,
                        fontFamily = AbcArizonaSans, fontSize = 12.sp)
                }
            }
            Box(Modifier.align(Alignment.TopCenter).size(60.dp, 6.dp)
                .background(Color(0xFFFF7900), RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp)))
        }
        Text("${sceneId.uppercase()} · ${if (night) "NIGHT" else "DAY"} · ${if (article) "ARTICLE" else "OPAQUE PAPER"} · VISUAL/MOTION BLOCKED",
            Modifier.align(Alignment.CenterHorizontally).padding(8.dp), color = Color(0xFF625E59),
            fontFamily = AbcRomMono, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
private fun FloatingPaper(article: Boolean, night: Boolean, modifier: Modifier) {
    val line = if (night) Color(0xFF363632) else floatingRule
    Box(modifier.semantics { contentDescription = if (article) "Synthetic article under glass" else "Synthetic ruled paper" }) {
        Canvas(Modifier.fillMaxSize()) {
            val gap = 42.dp.toPx()
            var y = gap
            while (y < size.height) { drawLine(line, Offset(0f, y), Offset(size.width, y), 1.dp.toPx()); y += gap }
            val ink = if (night) Color(0xFFD2D0CB) else Color(0xFF545451)
            val stroke = 1.8.dp.toPx()
            val path = Path().apply {
                moveTo(size.width * .13f, size.height * .46f)
                cubicTo(size.width * .30f, size.height * .42f, size.width * .41f, size.height * .48f,
                    size.width * .53f, size.height * .45f)
                moveTo(size.width * .13f, size.height * .56f)
                cubicTo(size.width * .27f, size.height * .51f, size.width * .41f, size.height * .59f,
                    size.width * .60f, size.height * .56f)
                moveTo(size.width * .13f, size.height * .72f)
                cubicTo(size.width * .23f, size.height * .68f, size.width * .31f, size.height * .75f,
                    size.width * .43f, size.height * .71f)
            }
            drawPath(path, ink.copy(alpha = .9f), style = Stroke(stroke, cap = StrokeCap.Round))
        }
        if (article) Column(Modifier.padding(start = 24.dp, top = 70.dp, end = 18.dp)) {
            Text("CLIMATE · 9 MIN READ", color = if (night) Color(0xFF77766F) else Color(0xFFAAAAAA),
                fontFamily = AbcRomMono, fontSize = 9.sp)
            Text("The quiet economics of planting a city forest", color = if (night) Color(0xFF77766F) else Color(0xFFAEAEAE),
                fontFamily = AbcArizonaFlare, fontSize = 24.sp, maxLines = 1)
            Text("For a century the ledger of a growing city was written in concrete and asphalt. " +
                "Planners now treat the canopy as infrastructure, measured in seasons rather than quarters.",
                Modifier.padding(top = 9.dp), color = if (night) Color(0xFF77766F) else Color(0xFFAAAAAA),
                fontFamily = AbcArizonaSans, fontSize = 11.sp, lineHeight = 20.sp, maxLines = 3)
        }
    }
}

@Composable
private fun FloatingSlips(fg: Color, surface: Color, selected: String, history: Int, onAction: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 14.dp, end = 14.dp, top = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
        NotebookSlip(fg, surface, onAction)
        FloatingGroup(surface, fg) {
            FloatingButton("Pen", Icons.Default.BorderColor, fg, surface, selected == "Pen", { onAction("Pen") })
            FloatingButton("Highlighter", Icons.Default.Highlight, fg, surface, selected == "Highlighter", { onAction("Highlighter") })
            FloatingButton("Eraser", Icons.Default.Edit, fg, surface, selected == "Eraser", { onAction("Eraser") })
            FloatingButton("Lasso", Icons.Default.RadioButtonUnchecked, fg, surface, selected == "Lasso", { onAction("Lasso") })
            FloatingButton("Snip", Icons.Default.Crop, fg, surface, selected == "Snip", { onAction("Snip") })
            FloatingButton("Glass", Icons.Default.Contrast, fg, surface, false, { onAction("Glass") })
        }
        FloatingGroup(surface, fg) {
            FloatingButton("Undo", Icons.AutoMirrored.Filled.Undo, fg, surface, false, { onAction("Undo") })
            FloatingButton("Redo", Icons.AutoMirrored.Filled.Redo, if (history == 0) fg else fg.copy(alpha = .4f), surface, false, { onAction("Redo") })
            FloatingButton("More", Icons.Default.MoreHoriz, fg, surface, false, { onAction("More") })
            FloatingButton("Hide", Icons.Default.Close, fg, surface, false, { onAction("Hide") })
        }
    }
}

@Composable
private fun NotebookSlip(fg: Color, surface: Color, onAction: (String) -> Unit, modifier: Modifier = Modifier) {
    FloatingGroup(surface, fg, modifier) {
        FloatingButton("New page", Icons.Default.Add, fg, surface, false, { onAction("New page") })
        Text("Field notes ⌄", Modifier.clickable { onAction("Notebook") }
            .semantics { contentDescription = "Field notes notebook" }.padding(horizontal = 10.dp),
            color = fg, fontFamily = AbcArizonaSans, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
private fun FloatingGroup(surface: Color, fg: Color, modifier: Modifier = Modifier,
    content: @Composable () -> Unit) {
    Surface(modifier = modifier, color = surface, shape = CircleShape,
        border = BorderStroke(1.dp, fg.copy(alpha = .09f)), shadowElevation = 6.dp) {
        Row(Modifier.padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically,
            content = { content() })
    }
}

@Composable
private fun FloatingButton(label: String, icon: ImageVector, fg: Color, surface: Color, active: Boolean,
    onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.size(44.dp).semantics { contentDescription = "$label control"; selected = active }
        .clickable(onClick = onClick), color = surface, shape = CircleShape,
        border = if (active) BorderStroke(2.dp, if (surface == Color(0xFF22221D)) floatingAmber else fg)
            else null) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(20.dp)) }
    }
}

@Composable
private fun PenCard(night: Boolean, selected: String, penSize: Int, penShade: Int,
    onSize: (Int) -> Unit, onShade: (Int) -> Unit, modifier: Modifier) {
    val fg = if (night) Color.White else floatingInk
    Surface(modifier = modifier.width(240.dp).semantics { contentDescription = "$selected card" },
        color = if (night) Color(0xFF22221D) else Color.White,
        shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, fg.copy(alpha = .14f)),
        shadowElevation = 8.dp) {
        Column(Modifier.padding(15.dp)) {
            Text(selected, color = fg, fontFamily = AbcArizonaSans, fontSize = 16.sp)
            Text("SIZE", Modifier.padding(top = 12.dp), color = fg.copy(alpha = .55f), fontFamily = AbcRomMono, fontSize = 10.sp)
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(4, 7, 11, 15, 20).forEachIndexed { index, diameter ->
                    Box(Modifier.size(38.dp).border(if (penSize == index + 1) 1.5.dp else 0.dp,
                        fg.copy(alpha = if (penSize == index + 1) 1f else 0f), CircleShape)
                        .clickable { onSize(index + 1) }
                        .semantics { contentDescription = "Pen size ${index + 1}"; this.selected = penSize == index + 1 },
                        contentAlignment = Alignment.Center) {
                        Box(Modifier.size(diameter.dp).background(fg, CircleShape))
                    }
                }
            }
            Text("SHADE", Modifier.padding(top = 8.dp), color = fg.copy(alpha = .55f), fontFamily = AbcRomMono, fontSize = 10.sp)
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(fg, fg.copy(alpha = .65f), fg.copy(alpha = .35f)).forEachIndexed { index, shade ->
                    Box(Modifier.size(38.dp).border(if (penShade == index + 1) 2.dp else 0.dp,
                        fg.copy(alpha = if (penShade == index + 1) 1f else 0f), CircleShape)
                        .padding(3.dp).background(shade, CircleShape).clickable { onShade(index + 1) }
                        .semantics { contentDescription = "Pen shade ${index + 1}"; this.selected = penShade == index + 1 })
                }
            }
        }
    }
}

@Composable
private fun DialControls(fg: Color, surface: Color, selected: String, open: Boolean,
    onTool: (String) -> Unit, onAction: (String) -> Unit, modifier: Modifier) {
    Box(modifier.size(228.dp).semantics { contentDescription = if (open) "Tool dial open; motion BLOCKED" else "Tool dial closed; motion BLOCKED" }) {
        if (open) {
            FloatingButton("Lasso", Icons.Default.RadioButtonUnchecked, fg, surface, selected == "Lasso", { onTool("Lasso") }, Modifier.align(Alignment.TopCenter))
            FloatingButton("Snip", Icons.Default.Crop, fg, surface, selected == "Snip", { onTool("Snip") }, Modifier.align(Alignment.TopEnd).offset(x = (-34).dp, y = 32.dp))
            FloatingButton("Eraser", Icons.Default.Edit, fg, surface, selected == "Eraser", { onTool("Eraser") }, Modifier.align(Alignment.TopStart).offset(x = 34.dp, y = 32.dp))
            FloatingButton("Highlighter", Icons.Default.Highlight, fg, surface, selected == "Highlighter", { onTool("Highlighter") }, Modifier.align(Alignment.CenterStart))
            FloatingButton("Glass", Icons.Default.Contrast, fg, surface, false, { onAction("Glass") }, Modifier.align(Alignment.CenterEnd))
            FloatingButton("Undo", Icons.AutoMirrored.Filled.Undo, fg, surface, false, { onAction("Undo") }, Modifier.align(Alignment.BottomEnd).offset(x = (-23).dp, y = (-25).dp))
        }
        FloatingButton("Pen", Icons.Default.BorderColor, fg, surface, selected == "Pen", { onTool("Pen") },
            Modifier.align(Alignment.Center).size(60.dp))
    }
}

@Composable
private fun LooseCoins(fg: Color, surface: Color, selected: String, history: Int, onAction: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 16.dp, start = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        NotebookSlip(fg, surface, onAction)
        floatingActions(fg, surface, selected, history, onAction)
    }
}

@Composable
private fun OneCapsule(fg: Color, surface: Color, selected: String, history: Int, onAction: (String) -> Unit) {
    FloatingGroup(surface, fg, Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
        .padding(horizontal = 14.dp, vertical = 16.dp)) {
        FloatingButton("New page", Icons.Default.Add, fg, surface, false, { onAction("New page") })
        Text("Field notes ⌄", Modifier.clickable { onAction("Notebook") }
            .semantics { contentDescription = "Field notes notebook" }.padding(horizontal = 9.dp),
            color = fg, fontFamily = AbcArizonaSans, fontSize = 12.sp, maxLines = 1)
        floatingActions(fg, surface, selected, history, onAction)
    }
}

@Composable
private fun SideRail(fg: Color, surface: Color, selected: String, history: Int, onAction: (String) -> Unit) {
    Box(Modifier.fillMaxSize()) {
        NotebookSlip(fg, surface, onAction, Modifier.align(Alignment.TopStart).padding(14.dp))
        Surface(Modifier.align(Alignment.CenterEnd).padding(end = 12.dp), color = surface,
            shape = CircleShape, border = BorderStroke(1.dp, fg.copy(alpha = .09f)), shadowElevation = 6.dp) {
            Column(Modifier.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                actionEntries().forEach { (label, icon) ->
                    FloatingButton(label, icon, if (label == "Redo" && history == 1) fg.copy(alpha = .4f) else fg,
                        surface, selected == label, { onAction(label) })
                }
            }
        }
    }
}

private fun actionEntries() = listOf(
    "Pen" to Icons.Default.BorderColor, "Highlighter" to Icons.Default.Highlight,
    "Eraser" to Icons.Default.Edit, "Lasso" to Icons.Default.RadioButtonUnchecked,
    "Snip" to Icons.Default.Crop, "Glass" to Icons.Default.Contrast,
    "Undo" to Icons.AutoMirrored.Filled.Undo, "Redo" to Icons.AutoMirrored.Filled.Redo,
    "More" to Icons.Default.MoreHoriz, "Hide" to Icons.Default.Close
)

@Composable
private fun floatingActions(fg: Color, surface: Color, selected: String, history: Int,
    onAction: (String) -> Unit) {
    actionEntries().forEach { (label, icon) ->
        FloatingButton(label, icon, if (label == "Redo" && history == 1) fg.copy(alpha = .4f) else fg,
            surface, selected == label, { onAction(label) })
    }
}
