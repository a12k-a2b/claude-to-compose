package com.claude.compose.screen

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

private val dayInk = Color(0xFF1B1B18)
private val nightInk = Color(0xFFF3EFEA)
private val nightPaper = Color(0xFF20201C)
private val amber = Color(0xFFFFA50B)
private val frameGrey = Color(0xFFCFCDC8)

/**
 * Native static-scene and interaction proof for e34f 1a, 1b, tb and 2a.
 * Figure indices are 1-based. All book, article and card content is synthetic.
 * The source's timed bloom motion has not been measured or reproduced.
 */
@Composable
fun E34fGlassScene(sceneId: String, figureIndex: Int = 1, modifier: Modifier = Modifier,
    proofVeilOverride: Color? = null) {
    require(sceneId in setOf("1a", "1b", "tb", "2a"))
    require(figureIndex in 1..if (sceneId == "1a" || sceneId == "1b") 3 else if (sceneId == "2a") 2 else 1)
    if (sceneId == "tb") {
        GlassAnatomy(modifier)
    } else {
        val night = sceneId == "1b" || sceneId == "2a" && figureIndex == 2
        val initialOpacity = when (sceneId) {
            "2a" -> if (night) .42f else .79f
            else -> when (figureIndex) { 1 -> .42f; 2 -> .79f; else -> 1f }
        }
        var opacity by rememberSaveable(sceneId, figureIndex) { mutableFloatStateOf(initialOpacity) }
        var selected by rememberSaveable(sceneId, figureIndex) { mutableStateOf("Pen") }
        var page by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(2) }
        var glassOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(false) }
        var menuOpen by rememberSaveable(sceneId, figureIndex) { mutableStateOf(false) }
        var toolbarVisible by rememberSaveable(sceneId, figureIndex) { mutableStateOf(true) }
        var bloomExpanded by rememberSaveable(sceneId, figureIndex) { mutableStateOf(true) }
        var history by rememberSaveable(sceneId, figureIndex) { mutableIntStateOf(1) }
        val bloom = sceneId == "2a"
        Column(modifier.fillMaxSize().background(Color(0xFFF8F7F3))) {
            Box(Modifier.weight(1f).fillMaxWidth().background(if (night) Color(0xFF292924) else frameGrey,
                RoundedCornerShape(28.dp)).padding(12.dp)) {
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(22.dp)).background(if (night) nightPaper else Color.White)) {
                    Box(Modifier.fillMaxSize().blur(if (figureIndex == 1) 1.6.dp else 0.dp)) {
                        SyntheticGlassContext(figureIndex, night, bloom)
                    }
                    // At 100% the page is actually opaque. The lower presets retain a
                    // translucent frost over synthetic context, independent of toolbar opacity.
                    val veilAlpha = if (opacity >= .999f) 1f else if (night) .15f + opacity * .4f
                        else .35f + opacity * .5f
                    Box(Modifier.fillMaxSize().background(proofVeilOverride ?: if (night) nightPaper.copy(alpha = veilAlpha)
                        else Color.White.copy(alpha = veilAlpha))
                        .semantics { contentDescription = "Glass surface ${(opacity * 100).toInt()} percent" })
                    GlassInk(figureIndex, night, bloom)
                    if (figureIndex == 3 && !bloom) SnipCard(night,
                        Modifier.align(Alignment.CenterEnd).padding(end = 38.dp))
                    if (bloom) {
                        SunBloom(night, bloomExpanded, selected, opacity, page,
                            onToggle = { bloomExpanded = !bloomExpanded },
                            onTool = { selected = it }, onPage = { page = if (page == 5) 1 else page + 1 },
                            onGlass = { glassOpen = !glassOpen }, onOpacity = { opacity = it })
                    } else if (toolbarVisible) {
                        GlassToolbar(night, selected, history,
                            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                            onTool = { selected = it }, onPage = { page = if (page == 5) 1 else page + 1 },
                            onGlass = { glassOpen = !glassOpen }, onUndo = { history = 0 },
                            onRedo = { history = 1 }, onMore = { menuOpen = !menuOpen }, onHide = { toolbarVisible = false })
                    } else {
                        Text("Show toolbar", Modifier.align(Alignment.TopEnd).padding(18.dp)
                            .clickable { toolbarVisible = true }
                            .semantics { contentDescription = "Show toolbar" }, color = if (night) nightInk else dayInk)
                    }
                    Surface(shape = CircleShape, color = if (night) nightPaper else Color.White,
                        border = BorderStroke(1.dp, if (night) nightInk.copy(alpha = .3f) else Color(0xFFE7E7E7)),
                        shadowElevation = if (night) 0.dp else 4.dp,
                        modifier = Modifier.align(if (bloom) Alignment.BottomStart else Alignment.BottomCenter)
                            .padding(16.dp)) {
                        Text("$page of 5", Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                            .semantics { contentDescription = "Page $page of 5" },
                            color = if (night) nightInk else dayInk, fontFamily = AbcArizonaSans, fontSize = 13.sp)
                    }
                    if (glassOpen) GlassAdjustment(opacity, night, { opacity = it },
                        Modifier.align(Alignment.TopEnd).padding(top = if (bloom) 45.dp else 78.dp, end = 24.dp))
                    if (menuOpen) Surface(Modifier.align(Alignment.TopEnd).padding(top = 80.dp, end = 20.dp),
                        color = if (night) nightPaper else Color.White,
                        shape = RoundedCornerShape(12.dp), shadowElevation = 5.dp) {
                        Text("Gallery options · synthetic note", Modifier.padding(12.dp),
                            color = if (night) nightInk else dayInk, fontFamily = AbcArizonaSans)
                    }
                }
                Box(Modifier.align(Alignment.TopCenter).size(width = 65.dp, height = 7.dp)
                    .background(Color(0xFFFF7900), RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp)))
            }
            Text(when {
                bloom && night -> "Night · veil ${(opacity * 100).toInt()}% · MOTION BLOCKED"
                bloom -> "Day · glass ${(opacity * 100).toInt()}% · MOTION BLOCKED"
                night -> "Glass ${(opacity * 100).toInt()}% · night, ${glassGround(figureIndex)}"
                else -> "Glass ${(opacity * 100).toInt()}% · ${glassGround(figureIndex)}"
            }, Modifier.align(Alignment.CenterHorizontally).padding(top = 13.dp, bottom = 8.dp)
                .semantics { contentDescription = "Glass opacity ${(opacity * 100).toInt()} percent" },
                fontFamily = AbcRomMono, fontSize = 11.sp, color = Color(0xFF6B6966), maxLines = 1)
        }
    }
}

@Composable
private fun SnipCard(night: Boolean, modifier: Modifier) {
    val fg = if (night) nightInk else dayInk
    val panel = if (night) Color(0xFF333330) else Color.White
    Surface(modifier = modifier.size(width = 205.dp, height = 158.dp),
        shape = RoundedCornerShape(10.dp), color = panel,
        border = BorderStroke(1.dp, fg.copy(alpha = .14f)), shadowElevation = 9.dp) {
        Column(Modifier.padding(10.dp)) {
            Box(Modifier.fillMaxWidth().height(83.dp).background(fg.copy(alpha = .06f), RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Crop, contentDescription = null, tint = fg.copy(alpha = .48f),
                    modifier = Modifier.size(24.dp))
            }
            Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(6.dp).background(fg.copy(alpha = .08f)))
            Box(Modifier.padding(top = 5.dp).fillMaxWidth(.78f).height(6.dp).background(fg.copy(alpha = .08f)))
            Text("↗ The Meridian", Modifier.padding(top = 8.dp)
                .semantics { contentDescription = "Synthetic source snip from The Meridian" },
                color = fg, fontFamily = AbcRomMono, fontSize = 10.sp)
        }
    }
}

private fun glassGround(figure: Int) = when (figure) {
    1 -> "tracing over a book"
    2 -> "the default, over a busy page"
    else -> "opaque paper with a source snip"
}

@Composable
private fun SyntheticGlassContext(figure: Int, night: Boolean, bloom: Boolean) {
    val fg = if (night) Color(0xFF8C8B87) else Color(0xFF585858)
    BoxWithConstraints(Modifier.fillMaxSize().semantics { contentDescription = "Synthetic context" }) {
        when {
            bloom && !night -> Column(Modifier.padding(start = 25.dp, top = 12.dp)) {
                Text("The Meridian", color = fg, fontFamily = AbcArizonaFlare, fontSize = 23.sp)
                Spacer(Modifier.height(24.dp))
                Text("Cities are planting forests on their rooftops", color = fg,
                    fontFamily = AbcArizonaSans, fontSize = 23.sp)
            }
            figure == 1 || bloom -> Column(Modifier.padding(start = 52.dp, end = 50.dp, top = 76.dp)) {
                Text(if (night) "CHAPTER FOUR" else "", color = fg, fontFamily = AbcRomMono, fontSize = 10.sp)
                Text("The long field", color = fg, fontFamily = AbcArizonaFlare, fontSize = 34.sp)
                Spacer(Modifier.height(18.dp))
                Text("By the time the light reached the far hedgerow it had gone the color of pressed straw, and the whole slope seemed to lean toward the last of it. She walked the way she always walked when there was nothing to hurry for, letting the grass drag at her hem.",
                    color = fg, fontFamily = AbcArizonaSans, fontSize = 14.sp, lineHeight = 27.sp)
                Spacer(Modifier.height(16.dp))
                Text("There was a kind of patience in the field that the town had never managed. It kept its own hours. It forgave the weather.",
                    color = fg, fontFamily = AbcArizonaSans, fontSize = 14.sp, lineHeight = 27.sp)
            }
            figure == 2 -> Column(Modifier.padding(start = 25.dp, top = 72.dp)) {
                Text("CITIES · 6 MIN READ", color = fg, fontFamily = AbcRomMono, fontSize = 10.sp)
                Text("Cities are planting forests on their rooftops", color = fg,
                    fontFamily = AbcArizonaSans, fontSize = 25.sp)
                Spacer(Modifier.height(25.dp))
                Box(Modifier.fillMaxWidth(.7f).height(130.dp).background(fg.copy(alpha = .13f), RoundedCornerShape(5.dp)))
                Spacer(Modifier.height(12.dp))
                repeat(3) { Box(Modifier.padding(top = 8.dp).fillMaxWidth(.7f - it * .07f).height(7.dp).background(fg.copy(alpha = .13f))) }
            }
            else -> Unit
        }
        if (figure == 2 || bloom) Canvas(Modifier.fillMaxSize()) {
            var y = 32.dp.toPx()
            while (y < size.height) {
                drawLine(fg.copy(alpha = .14f), Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
                y += 34.dp.toPx()
            }
        }
    }
}

@Composable
private fun GlassInk(figure: Int, night: Boolean, bloom: Boolean) {
    val pen = if (night) nightInk.copy(alpha = .75f) else dayInk.copy(alpha = .72f)
    Canvas(Modifier.fillMaxSize()) {
        val sx = size.width / 616f
        val sy = size.height / 454f
        fun path(vararg xy: Float) {
            val p = Path().apply {
                moveTo(xy[0] * sx, xy[1] * sy)
                var i = 2
                while (i < xy.size) { lineTo(xy[i] * sx, xy[i + 1] * sy); i += 2 }
            }
            drawPath(p, pen, style = Stroke(width = 1.8.dp.toPx(), cap = StrokeCap.Round))
        }
        if (bloom) {
            path(88f, 280f, 140f, 270f, 220f, 280f, 300f, 278f)
            path(88f, 318f, 148f, 310f, 235f, 315f)
        } else when (figure) {
            1 -> {
                drawOval(pen, topLeft = Offset(150f * sx, 120f * sy),
                    size = androidx.compose.ui.geometry.Size(160f * sx, 47f * sy), style = Stroke(1.7.dp.toPx()))
                path(290f, 272f, 350f, 258f, 425f, 270f, 496f, 264f)
                path(290f, 290f, 360f, 286f, 430f, 292f)
                path(445f, 344f, 475f, 375f, 490f, 367f)
            }
            2 -> {
                path(95f, 195f, 108f, 210f, 134f, 172f)
                path(151f, 196f, 230f, 192f, 290f, 198f)
                path(95f, 262f, 108f, 276f, 134f, 242f)
                path(151f, 262f, 230f, 258f, 280f, 263f)
                path(95f, 324f, 160f, 316f, 245f, 324f, 294f, 321f)
            }
            else -> {
                path(68f, 142f, 82f, 124f, 111f, 156f, 135f, 126f, 150f, 143f)
                path(68f, 194f, 155f, 186f, 260f, 194f, 350f, 188f)
                path(68f, 232f, 145f, 225f, 255f, 229f)
                path(68f, 302f, 140f, 291f, 212f, 301f)
            }
        }
    }
}

@Composable
private fun GlassToolbar(night: Boolean, selected: String, history: Int, modifier: Modifier,
    onTool: (String) -> Unit, onPage: () -> Unit, onGlass: () -> Unit,
    onUndo: () -> Unit, onRedo: () -> Unit, onMore: () -> Unit, onHide: () -> Unit,
    highContrast: Boolean = false) {
    val fg = if (night) nightInk else dayInk
    Surface(modifier = modifier.height(52.dp), shape = if (highContrast) RoundedCornerShape(0.dp) else CircleShape,
        color = if (night) Color(0xFF1B1B18).copy(alpha = .96f) else Color.White.copy(alpha = .96f),
        border = if (highContrast) null else BorderStroke(1.dp, if (night) fg.copy(alpha = .25f) else Color(0xFFEAEAEA)),
        shadowElevation = if (night || highContrast) 0.dp else 9.dp) {
        Row(Modifier.fillMaxSize().horizontalScroll(androidx.compose.foundation.rememberScrollState())
            .padding(horizontal = 7.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween) {
            GlassButton(Icons.Default.Add, "New page", fg, onPage)
            Text("Notes  ⌄", Modifier.clickable(onClick = onPage).padding(horizontal = 4.dp)
                .semantics { contentDescription = "Notebook Notes" }, color = fg,
                fontFamily = AbcArizonaSans, fontSize = 13.sp)
            GlassDivider(fg)
            listOf(
                "Pen" to Icons.Default.BorderColor,
                "Highlighter" to Icons.Default.Highlight,
                "Eraser" to Icons.Default.Edit,
                "Lasso" to Icons.Default.RadioButtonUnchecked,
                "Snip" to Icons.Default.Crop
            ).forEach { (name, icon) ->
                GlassButton(icon, "$name tool", fg, { onTool(name) }, selected == name, night)
            }
            GlassDivider(fg)
            GlassButton(Icons.Default.Contrast, "Glass adjustment", fg, onGlass)
            GlassButton(Icons.AutoMirrored.Filled.Undo, "Undo", if (history > 0) fg else fg.copy(alpha = .35f), onUndo)
            GlassButton(Icons.AutoMirrored.Filled.Redo, "Redo", if (history == 0) fg else fg.copy(alpha = .35f), onRedo)
            GlassDivider(fg)
            GlassButton(Icons.Default.MoreHoriz, "More", fg, onMore)
            GlassButton(Icons.Default.Close, "Hide", fg, onHide)
        }
    }
}

@Composable private fun GlassDivider(tint: Color) {
    Box(Modifier.width(1.dp).height(26.dp).background(tint.copy(alpha = .16f)))
}

@Composable
private fun GlassButton(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit,
    active: Boolean = false, night: Boolean = false) {
    val bg = if (active) if (night) amber else dayInk else Color.Transparent
    val iconTint = if (active) if (night) dayInk else Color.White else tint
    Box(Modifier.size(39.dp).background(bg, RoundedCornerShape(11.dp)).clickable(onClick = onClick)
        .semantics { contentDescription = label; selected = active }, contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun GlassAdjustment(opacity: Float, night: Boolean, onOpacity: (Float) -> Unit, modifier: Modifier) {
    Surface(modifier, shape = RoundedCornerShape(14.dp), shadowElevation = 8.dp,
        color = if (night) Color(0xFF30302C) else Color.White) {
        Column(Modifier.width(210.dp).padding(12.dp)) {
            Text("Glass ${(opacity * 100).toInt()}%", color = if (night) nightInk else dayInk,
                fontFamily = AbcArizonaSans, fontSize = 14.sp)
            Slider(value = opacity, onValueChange = onOpacity, valueRange = 0f..1f,
                modifier = Modifier.semantics { contentDescription = "Glass opacity slider" })
        }
    }
}

@Composable
private fun SunBloom(night: Boolean, expanded: Boolean, selected: String, opacity: Float, page: Int,
    onToggle: () -> Unit, onTool: (String) -> Unit, onPage: () -> Unit,
    onGlass: () -> Unit, onOpacity: (Float) -> Unit) {
    val fg = if (night) nightInk else dayInk
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val cx = maxWidth / 2
        val railHeight = maxHeight * .65f
        Surface(shape = CircleShape, color = if (night) amber else Color(0xFF777777),
            shadowElevation = if (night) 9.dp else 4.dp,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 35.dp)
                .size(47.dp).clickable(onClick = onToggle)
                .semantics { contentDescription = "Sun bloom ${if (expanded) "expanded" else "collapsed"}; motion BLOCKED" }) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.WbSunny, null, tint = if (night) dayInk else Color.White,
                    modifier = Modifier.size(23.dp))
            }
        }
        if (expanded) {
            val items = listOf(
                Triple("New page", Icons.Default.Add, -.187f to .23f),
                Triple("Highlighter", Icons.Default.Highlight, -.138f to .34f),
                Triple("Eraser", Icons.Default.Edit, -.068f to .41f),
                Triple("Pen", Icons.Default.BorderColor, .0f to .43f),
                Triple("Lasso", Icons.Default.RadioButtonUnchecked, .109f to .41f),
                Triple("Snip", Icons.Default.Crop, .178f to .34f),
                Triple("More", Icons.Default.MoreHoriz, .227f to .23f)
            )
            items.forEach { (name, icon, position) ->
                val active = selected == name
                val bg = when {
                    active && night -> amber
                    active -> dayInk
                    night -> Color(0xFF23231F)
                    else -> Color.White
                }
                Surface(shape = CircleShape, color = bg,
                    border = if (active) null else BorderStroke(1.dp, fg.copy(alpha = .12f)),
                    shadowElevation = if (night) 0.dp else 4.dp,
                    modifier = Modifier.offset(x = cx + maxWidth * position.first - 24.dp,
                        y = maxHeight * position.second - 24.dp).size(if (active) 56.dp else 48.dp)
                        .clickable { if (name == "New page") onPage() else if (name == "More") onGlass() else onTool(name) }
                        .semantics { contentDescription = "Bloom $name"; this.selected = active }) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(icon, null, tint = if (active) if (night) dayInk else Color.White else fg,
                            modifier = Modifier.size(23.dp))
                    }
                }
            }
            Box(Modifier.align(Alignment.CenterEnd).padding(end = 18.dp).height(railHeight).width(3.dp)
                .background(fg.copy(alpha = .28f), CircleShape))
            Box(Modifier.align(Alignment.CenterEnd).padding(end = 7.dp).size(26.dp)
                .background(if (night) amber.copy(alpha = .35f) else Color.White, CircleShape)
                .pointerInput(Unit) { detectDragGestures { change, drag ->
                    change.consume()
                    onOpacity((opacity - drag.y / size.height).coerceIn(0f, 1f))
                } }
                .clickable { onOpacity(if (opacity < .79f) .79f else .42f) }
                .semantics {
                    contentDescription = "Bloom glass opacity slider"
                    progressBarRangeInfo = ProgressBarRangeInfo(opacity, 0f..1f)
                    setProgress { onOpacity(it.coerceIn(0f, 1f)); true }
                })
            Surface(shape = CircleShape, color = if (night) nightPaper else Color.White,
                border = BorderStroke(1.dp, fg.copy(alpha = .2f)),
                modifier = Modifier.align(Alignment.CenterEnd).padding(end = 44.dp, top = 52.dp)) {
                Text("Glass ${(opacity * 100).toInt()}%", Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    color = fg, fontFamily = AbcArizonaSans, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun GlassAnatomy(modifier: Modifier) {
    Column(modifier.fillMaxSize().background(Color(0xFFF8F7F3)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Toolbar anatomy", fontFamily = AbcArizonaFlare, fontSize = 26.sp, color = dayInk)
        Text("Three materials · one control grouping", fontFamily = AbcArizonaSans, fontSize = 13.sp, color = Color.Gray)
        listOf(
            Triple("DAY · OVER RULED CONTENT", false, false),
            Triple("NIGHT · AMBER ACCENT", true, false),
            Triple("HIGH CONTRAST · BORDERS REPLACE THE FROST", false, true)
        ).forEach { (title, night, highContrast) ->
            Box(Modifier.fillMaxWidth().weight(1f)
                .background(if (night) nightPaper else if (highContrast) Color.White else Color(0xFFF3F1EE),
                    RoundedCornerShape(14.dp))
                .then(if (highContrast) Modifier.border(BorderStroke(2.dp, dayInk), RoundedCornerShape(14.dp)) else Modifier)) {
                GlassToolbar(night, "Pen", 1,
                    Modifier.align(Alignment.Center).fillMaxWidth(.88f), {}, {}, {}, {}, {}, {}, {}, highContrast)
                Text(title, Modifier.align(Alignment.BottomCenter).padding(bottom = 9.dp),
                    color = if (night) nightInk else dayInk, fontFamily = AbcRomMono, fontSize = 11.sp)
            }
        }
        Text("BLOCKED · This anatomy is a material reference; behavior is exercised in 1a/1b.",
            fontFamily = AbcRomMono, fontSize = 10.sp, color = Color(0xFF8A3A2C))
    }
}
