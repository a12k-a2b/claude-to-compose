package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.material.icons.filled.SelectAll
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

/** IDs and figure counts are frozen from the e34f live-DOM capture inventory. */
data class E34fScene(val id: String, val title: String, val figures: Int = 0) {
    val implemented: Boolean get() = id in setOf("6a", "6b", "6c", "6d")
}

val E34F_SCENES = listOf(
    E34fScene("6", "A toolbar with its own chrome"),
    E34fScene("6a", "The shelf — a hairline is all it takes"),
    E34fScene("6b", "Frosted band, pills on top"),
    E34fScene("6c", "Raised shelf — the page tucks under"),
    E34fScene("6d", "Bold — the ledger band"),
    E34fScene("1a", "Day — the glass over three worlds", 3),
    E34fScene("1b", "Night — amber glow on a black ground", 3),
    E34fScene("tb", "Toolbar anatomy"),
    E34fScene("2a", "Bold variant — the sun bloom", 2),
    E34fScene("3a", "Floating chrome — instruments on the page", 2),
    E34fScene("3b", "Night — the same slips, darkened", 2),
    E34fScene("3c", "Bold variant — the tool dial", 2),
    E34fScene("4", "Glassnote, in our voice"),
    E34fScene("4a", "Loose coins — the faithful remix"),
    E34fScene("4b", "One capsule — everything on a single slip"),
    E34fScene("4c", "Side rail — off the reading, into the thumb"),
    E34fScene("5", "Does it survive a rotate?", 6),
    E34fScene("explore", "The moments around the toolbar"),
    E34fScene("g1", "Gesture grammar"),
    E34fScene("g2", "The glass, as a real interaction", 3),
    E34fScene("g3", "Ink & nib"),
    E34fScene("g4", "Selection → action", 2),
    E34fScene("g5", "Pages & navigation", 1),
    E34fScene("g6", "The empty page & first stroke", 2),
    E34fScene("mild", "The mildliner joins"),
    E34fScene("m0", "Two siblings, tellable apart"),
    E34fScene("m1", "Both in the bar, over two worlds", 2),
    E34fScene("m2", "The mildliner card"),
    E34fScene("m3", "Notes counts → the Highlights list"),
    E34fScene("m4", "The jump flash", 2),
    E34fScene("presets", "The presets row", 1),
    E34fScene("cards", "Popup cards"),
    E34fScene("snip", "Snip selection chrome"),
    E34fScene("small", "Small things"),
    E34fScene("onboard", "Onboarding & settings")
)

private val paper = Color(0xFFFBFAF8)
private val ink = Color(0xFF1E1E1B)
private val frame = Color(0xFFD1CFCA)
private val rule = Color(0xFFE9E9EB)
private val orange = Color(0xFFFF7900)

/** Browsable source inventory. A section's label alone is never reported as a native implementation. */
@Composable
fun E34fGalleryScreen(modifier: Modifier = Modifier) {
    var currentId by rememberSaveable { mutableStateOf("6a") }
    var currentFigure by rememberSaveable { mutableIntStateOf(1) }
    val current = E34F_SCENES.first { it.id == currentId }
    Column(modifier.fillMaxSize().background(paper)) {
        Text("CLAUDE DESIGN · NATIVE PROOF", Modifier.padding(start = 20.dp, top = 12.dp, bottom = 6.dp),
            color = Color.Gray, fontFamily = AbcRomMono, fontSize = 11.sp)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            E34F_SCENES.forEach { scene ->
                val active = currentId == scene.id
                Surface(shape = CircleShape, color = if (active) ink else Color.White,
                    border = BorderStroke(1.dp, Color(0xFFDAD8D3)),
                    modifier = Modifier.clickable { currentId = scene.id; currentFigure = 1 }
                        .semantics { contentDescription = "Scene ${scene.id}: ${scene.title}"; selected = active }) {
                    Text(scene.id, Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                        color = if (active) Color.White else ink, fontFamily = AbcRomMono, fontSize = 12.sp)
                }
            }
        }
        if (current.figures > 0) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..current.figures).forEach { figure ->
                    val active = currentFigure == figure
                    Surface(shape = CircleShape, color = if (active) ink else Color.White,
                        border = BorderStroke(1.dp, frame), modifier = Modifier.clickable { currentFigure = figure }
                            .semantics { contentDescription = "Figure $figure of ${current.figures}"; selected = active }) {
                        Text("Figure $figure", Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            color = if (active) Color.White else ink, fontSize = 12.sp)
                    }
                }
            }
        }
        if (current.implemented) {
            E34fBandScene(current.id, Modifier.weight(1f))
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
                Text("${current.id} · ${current.title}", fontFamily = AbcArizonaFlare, fontSize = 30.sp, color = ink)
                Text("BLOCKED · Native scene and behavior have not been implemented.",
                    Modifier.padding(top = 18.dp).semantics { contentDescription = "Scene ${current.id} blocked" },
                    fontFamily = AbcArizonaSans, fontSize = 17.sp, color = Color(0xFF8A3A2C))
                if (current.figures > 0) Text("Source figure $currentFigure of ${current.figures} is inventoried only.",
                    Modifier.padding(top = 8.dp), fontFamily = AbcRomMono, fontSize = 13.sp)
            }
        }
    }
}

private data class BandStyle(val frosted: Boolean, val raised: Boolean, val dark: Boolean)
private fun bandStyle(id: String) = BandStyle(id == "6b", id == "6c", id == "6d")

/** The four source treatments share the same controls and page geometry. */
@Composable
fun E34fBandScene(sceneId: String, modifier: Modifier = Modifier, proofBandOverride: Color? = null) {
    require(sceneId in setOf("6a", "6b", "6c", "6d"))
    val scene = E34F_SCENES.first { it.id == sceneId }
    val style = bandStyle(sceneId)
    var selected by rememberSaveable(sceneId) { mutableStateOf("Pen") }
    var page by rememberSaveable(sceneId) { mutableIntStateOf(2) }
    var contrastOpen by rememberSaveable(sceneId) { mutableStateOf(false) }
    var highContrast by rememberSaveable(sceneId) { mutableStateOf(false) }
    var optionsOpen by rememberSaveable(sceneId) { mutableStateOf(false) }
    var documentOpen by rememberSaveable(sceneId) { mutableStateOf(false) }
    var toolbarVisible by rememberSaveable(sceneId) { mutableStateOf(true) }
    var history by rememberSaveable(sceneId) { mutableIntStateOf(1) }
    val tint = if (style.dark) Color(0xFFF3EFEA) else ink
    val bandColor = proofBandOverride ?: when {
        style.dark -> Color(0xFF2B2B28)
        style.frosted -> Color(0xFFF4F3F0)
        else -> Color.White
    }
    Column(modifier.fillMaxSize().background(paper).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp, bottom = 17.dp)) {
            Text(sceneId, Modifier.background(if (style.dark) orange else ink, CircleShape).padding(horizontal = 13.dp, vertical = 7.dp),
                color = Color.White, fontFamily = AbcRomMono, fontSize = 12.sp)
            Text(scene.title, Modifier.padding(start = 14.dp).weight(1f), color = ink,
                fontFamily = AbcArizonaFlare, fontSize = 23.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.fillMaxWidth().height(560.dp).background(frame, RoundedCornerShape(31.dp)).padding(12.dp)) {
            Box(Modifier.align(Alignment.TopCenter).size(width = 65.dp, height = 7.dp).background(orange, RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp)))
            Column(Modifier.fillMaxSize().background(Color.White, RoundedCornerShape(23.dp))) {
                Box(Modifier.fillMaxWidth().height(60.dp).background(bandColor)
                    .semantics { contentDescription = "${sceneId} toolbar band" }) {
                    if (toolbarVisible) BandControls(style, tint, selected, page, history, onTool = { selected = it },
                        onPage = { page = if (page == 5) 1 else page + 1 },
                        onDocument = { documentOpen = !documentOpen },
                        onUndo = { history = 0 }, onRedo = { history = 1 },
                        onContrast = { contrastOpen = !contrastOpen }, onMore = { optionsOpen = !optionsOpen },
                        onHide = { toolbarVisible = false })
                    else Text("Show toolbar", Modifier.align(Alignment.CenterEnd).padding(end = 16.dp)
                        .clickable { toolbarVisible = true }
                        .semantics { contentDescription = "Show toolbar" },
                        fontFamily = AbcArizonaSans, color = tint)
                }
                Box(Modifier.fillMaxWidth().height(if (style.raised) 4.dp else 1.dp)
                    .background(if (style.raised) Color(0xFFE3E3E3) else Color(0xFFE0E0DF)))
                Box(Modifier.fillMaxSize()) {
                    RuledPage(Modifier.fillMaxSize(), sceneId, highContrast)
                    Surface(shape = CircleShape, color = Color.White, shadowElevation = 3.dp,
                        border = BorderStroke(1.dp, rule), modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)) {
                        Text("$page of 5", Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                            .semantics { contentDescription = "Page $page of 5" }, fontFamily = AbcArizonaSans, fontSize = 13.sp)
                    }
                }
            }
        }
        if (contrastOpen) Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Glass contrast", color = ink, fontFamily = AbcArizonaSans)
            Text(if (highContrast) "HIGH" else "STANDARD", Modifier.padding(start = 15.dp)
                .clickable { highContrast = !highContrast }
                .semantics { contentDescription = "Toggle high contrast" }, color = ink, fontFamily = AbcRomMono)
        }
        if (documentOpen) Text("Field notes · synthetic gallery document", Modifier.padding(top = 8.dp), fontFamily = AbcArizonaSans)
        if (optionsOpen) Text("Gallery options · synthetic note", Modifier.padding(top = 8.dp), fontFamily = AbcArizonaSans)
        Text(when (sceneId) {
            "6a" -> "The paper shelf is separated by a one-pixel hairline."
            "6b" -> "Three white pill clusters rest on a frosted paper band."
            "6c" -> "A lifted shelf casts a short shadow onto the page."
            else -> "A slate ledger band separates controls from the page."
        }, Modifier.padding(top = 14.dp, bottom = 20.dp), fontFamily = AbcArizonaSans, fontSize = 14.sp, color = Color(0xFF55534F))
    }
}

@Composable
private fun BandControls(style: BandStyle, tint: Color, selected: String, page: Int, history: Int,
    onTool: (String) -> Unit, onPage: () -> Unit, onDocument: () -> Unit,
    onUndo: () -> Unit, onRedo: () -> Unit,
    onContrast: () -> Unit, onMore: () -> Unit, onHide: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val tight = maxWidth < 610.dp
        Row(Modifier.fillMaxSize().horizontalScroll(rememberScrollState()).padding(horizontal = if (tight) 5.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            BandCluster(style, tint) {
                BandAction(Icons.Default.Add, "New page", tint, onPage)
                Text("Field notes  ⌄", Modifier.padding(start = 4.dp).clickable(onClick = onDocument)
                    .semantics { contentDescription = "Field notes; page $page" },
                    fontFamily = AbcArizonaSans, color = tint, fontSize = if (tight) 12.sp else 14.sp)
            }
            Spacer(Modifier.width(if (tight) 5.dp else 12.dp))
            BandCluster(style, tint) {
                val tools = listOf(
                    Triple("Pen", Icons.Default.BorderColor, true),
                    Triple("Highlighter", Icons.Default.Highlight, true),
                    Triple("Eraser", Icons.Default.Edit, true),
                    Triple("Lasso", Icons.Default.RadioButtonUnchecked, true),
                    Triple("Snip", Icons.Default.Crop, true)
                )
                tools.forEach { (name, icon, _) ->
                    BandAction(icon, "$name tool", tint, { onTool(name) }, selected == name, style.dark)
                }
                Box(Modifier.padding(horizontal = 3.dp).width(1.dp).height(24.dp).background(tint.copy(alpha = .18f)))
                BandAction(Icons.Default.Contrast, "Glass contrast", tint, onContrast)
            }
            Spacer(Modifier.width(if (tight) 5.dp else 12.dp))
            BandCluster(style, tint) {
                BandAction(Icons.AutoMirrored.Filled.Undo, "Undo", if (history > 0) tint else tint.copy(alpha = .35f), onUndo)
                if (!style.frosted) BandAction(Icons.AutoMirrored.Filled.Redo, "Redo", if (history == 0) tint else tint.copy(alpha = .35f), onRedo)
                BandAction(Icons.Default.MoreHoriz, "More", tint, onMore)
                BandAction(Icons.Default.Close, "Hide", tint, onHide)
            }
        }
    }
}

@Composable
private fun BandCluster(style: BandStyle, tint: Color, content: @Composable () -> Unit) {
    Surface(shape = if (style.frosted) CircleShape else RoundedCornerShape(4.dp),
        color = if (style.frosted) Color.White else Color.Transparent,
        shadowElevation = if (style.frosted) 3.dp else 0.dp) {
        Row(Modifier.height(48.dp).padding(horizontal = if (style.frosted) 6.dp else 0.dp),
            verticalAlignment = Alignment.CenterVertically, content = { content() })
    }
}

@Composable
private fun BandAction(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit,
    active: Boolean = false, dark: Boolean = false) {
    val stroke = if (active) BorderStroke(if (dark) 1.5.dp else 2.dp, tint) else null
    Surface(shape = RoundedCornerShape(11.dp), color = if (active) tint.copy(alpha = if (dark) .15f else .06f) else Color.Transparent,
        border = stroke, modifier = Modifier.size(42.dp).clickable(onClick = onClick)
            .semantics { contentDescription = label; selected = active }) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun RuledPage(modifier: Modifier, sceneId: String, highContrast: Boolean) {
    Canvas(modifier) {
        val line = 43.dp.toPx()
        var y = line
        while (y < size.height) {
            drawLine(if (highContrast) Color(0xFFADADAD) else rule,
                Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
            y += line
        }
        val scale = size.width / 800f
        fun stroke(points: List<Offset>, offsetY: Float) {
            val path = Path().apply {
                moveTo(points.first().x * scale, points.first().y * scale + offsetY)
                for (p in points.drop(1)) lineTo(p.x * scale, p.y * scale + offsetY)
            }
            drawPath(path, Color(0xFF666664), style = Stroke(width = 1.7.dp.toPx(), cap = StrokeCap.Round))
        }
        stroke(listOf(Offset(68f, 107f), Offset(135f, 96f), Offset(230f, 101f), Offset(340f, 108f), Offset(448f, 106f)), 0f)
        stroke(listOf(Offset(68f, 152f), Offset(143f, 145f), Offset(250f, 147f), Offset(320f, 153f)), 0f)
        if (sceneId != "6b") {
            stroke(listOf(Offset(68f, 225f), Offset(85f, 206f), Offset(112f, 237f), Offset(135f, 210f), Offset(150f, 223f)), 0f)
            drawOval(Color(0xFF666664), topLeft = Offset(size.width * .59f, size.height * .43f),
                size = androidx.compose.ui.geometry.Size(size.width * .27f, size.height * .24f), style = Stroke(1.7.dp.toPx()))
        }
        stroke(listOf(Offset(68f, 268f), Offset(170f, 253f), Offset(270f, 258f), Offset(345f, 263f)), 0f)
    }
}
