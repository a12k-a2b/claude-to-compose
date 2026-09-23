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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

private val rotationInk = Color(0xFF222320)
private val rotationFrame = Color(0xFFD0CFCA)
private val rotationRule = Color(0xFFE9E9EB)
private val rotationOrange = Color(0xFFFF7900)

/** The six figures in section 5 are separate source layouts, not six device orientations. */
data class E34fRotationFigure(val index: Int, val sourceId: String, val title: String, val portraitDevice: Boolean)

val E34F_ROTATION_FIGURES = listOf(
    E34fRotationFigure(1, "5/figure-1", "Portrait · edge to edge", true),
    E34fRotationFigure(2, "5/figure-2", "Landscape · more air", false),
    E34fRotationFigure(3, "5/figure-3", "Floating slips · 3a", false),
    E34fRotationFigure(4, "5/figure-4", "One capsule · 4b", false),
    E34fRotationFigure(5, "5/figure-5", "Side rail · 4c", false),
    E34fRotationFigure(6, "5/figure-6", "The dial · 3c", false),
)

/** Native synthetic studies of section 5. Device rotation, gestures and pixel parity are unverified. */
@Composable
fun E34fRotationScene(figureIndex: Int, modifier: Modifier = Modifier) {
    require(figureIndex in 1..6)
    val figure = E34F_ROTATION_FIGURES[figureIndex - 1]
    var selected by rememberSaveable(figureIndex) { mutableStateOf("Pen") }
    var page by rememberSaveable(figureIndex) { mutableIntStateOf(2) }
    var visible by rememberSaveable(figureIndex) { mutableStateOf(true) }
    var options by rememberSaveable(figureIndex) { mutableStateOf(false) }
    val onAction: (String) -> Unit = { action ->
        when (action) {
            "New page" -> page = if (page == 5) 1 else page + 1
            "Hide" -> visible = false
            "Show toolbar" -> visible = true
            "More", "Field notes" -> options = !options
            else -> selected = action
        }
    }
    BoxWithConstraints(modifier.fillMaxSize().background(Color(0xFFF7F6F2))) {
        val availableWidth = maxWidth - 24.dp
        val availableHeight = maxHeight - 38.dp
        val ratio = if (figure.portraitDevice) 585f / 812f else 780f / 617f
        val deviceWidth = minOf(availableWidth, availableHeight * ratio)
        val deviceHeight = deviceWidth / ratio
        // At 4:3 portrait host width, a 570 dp landscape preview needs scaled controls.
        val compact = deviceWidth < 600.dp
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(deviceWidth, deviceHeight).background(rotationFrame, RoundedCornerShape(22.dp))
                .padding(8.dp).background(Color.White, RoundedCornerShape(16.dp))
                .semantics { contentDescription = "${figure.sourceId} native synthetic ${if (figure.portraitDevice) "portrait" else "landscape"} device; ${if (compact) "compact" else "roomy"} layout" }) {
                RotationPaper(Modifier.fillMaxSize(), figureIndex)
                Box(Modifier.align(Alignment.TopCenter).size(60.dp, 6.dp)
                    .background(rotationOrange, RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp)))
                if (visible) when (figureIndex) {
                    1, 2 -> RotationTopBar(compact, selected, onAction,
                        Modifier.align(Alignment.TopCenter).padding(top = 16.dp, start = 8.dp, end = 8.dp))
                    3 -> {
                        RotationNotebook(onAction, Modifier.align(Alignment.TopStart).padding(14.dp))
                        RotationTools(selected, onAction, Modifier.align(Alignment.TopCenter).padding(top = 14.dp), compact)
                    }
                    4 -> RotationTopBar(compact, selected, onAction,
                        Modifier.align(Alignment.TopCenter).padding(top = 16.dp, start = 12.dp, end = 12.dp), capsule = true)
                    5 -> {
                        RotationNotebook(onAction, Modifier.align(Alignment.TopStart).padding(14.dp))
                        RotationSideRail(selected, onAction, Modifier.align(Alignment.CenterEnd).padding(end = 16.dp))
                    }
                    else -> {
                        RotationNotebook(onAction, Modifier.align(Alignment.TopStart).padding(14.dp))
                        RotationDial(selected, onAction, Modifier.align(Alignment.Center))
                    }
                } else RotationControl("Show toolbar", onAction,
                    Modifier.align(Alignment.TopEnd).padding(14.dp), 12.dp)
                if (options) Text("Synthetic Field notes options", Modifier.align(Alignment.BottomEnd)
                    .padding(14.dp).background(Color.White, RoundedCornerShape(8.dp)).padding(8.dp)
                    .semantics { contentDescription = "Synthetic options open" },
                    fontFamily = AbcArizonaSans, color = rotationInk, fontSize = 12.sp)
                Surface(Modifier.align(if (figureIndex == 5) Alignment.BottomStart else Alignment.BottomCenter)
                    .padding(14.dp).clickable { onAction("New page") }
                    .semantics { contentDescription = "Page $page of 5" },
                    shape = CircleShape, color = Color.White, shadowElevation = 3.dp) {
                    Text("$page of 5", Modifier.padding(horizontal = 13.dp, vertical = 7.dp),
                        fontFamily = AbcArizonaSans, color = rotationInk, fontSize = 12.sp)
                }
            }
            Text("${figure.title.uppercase()} · VISUAL/DEVICE/MOTION BLOCKED",
                Modifier.padding(top = 7.dp), color = Color(0xFF77736E), fontFamily = AbcRomMono,
                fontSize = 9.sp, maxLines = 1)
        }
    }
}

@Composable
private fun RotationPaper(modifier: Modifier, figureIndex: Int) {
    Canvas(modifier.semantics { contentDescription = "Synthetic ruled note paper" }) {
        val gap = if (figureIndex == 1) 33.dp.toPx() else 32.dp.toPx()
        var y = 60.dp.toPx()
        while (y < size.height) {
            drawLine(rotationRule, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
            y += gap
        }
        val start = size.width * if (figureIndex == 1) .13f else .12f
        val end = size.width * if (figureIndex == 1) .62f else .54f
        val stroke = 1.4.dp.toPx()
        val drawn = Path().apply {
            moveTo(start, size.height * .42f)
            cubicTo(size.width * .28f, size.height * .39f, size.width * .37f, size.height * .44f, end, size.height * .42f)
            moveTo(start, size.height * .52f)
            cubicTo(size.width * .24f, size.height * .50f, size.width * .33f, size.height * .52f, end * .79f, size.height * .52f)
            moveTo(start, size.height * .64f)
            cubicTo(size.width * .16f, size.height * .58f, size.width * .18f, size.height * .69f, size.width * .21f, size.height * .64f)
            moveTo(start, size.height * .74f)
            cubicTo(size.width * .25f, size.height * .71f, size.width * .35f, size.height * .75f, end * .9f, size.height * .74f)
        }
        drawPath(drawn, rotationInk.copy(alpha = .72f), style = Stroke(stroke, cap = StrokeCap.Round))
        drawOval(rotationInk.copy(alpha = .70f), Offset(size.width * if (figureIndex == 1) .41f else .60f,
            size.height * if (figureIndex == 1) .66f else .47f),
            androidx.compose.ui.geometry.Size(size.width * .24f, size.height * .19f), style = Stroke(stroke))
    }
}

@Composable
private fun RotationTopBar(compact: Boolean, selected: String, onAction: (String) -> Unit,
    modifier: Modifier = Modifier, capsule: Boolean = false) {
    Row(modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(if (compact) 2.dp else 7.dp),
        verticalAlignment = Alignment.CenterVertically) {
        RotationNotebook(onAction, compact = compact)
        if (capsule) Surface(shape = CircleShape, color = Color.White, shadowElevation = 4.dp) {
            RotationTools(selected, onAction, Modifier.padding(3.dp), compact)
        } else RotationTools(selected, onAction, compact = compact)
    }
}

@Composable
private fun RotationNotebook(onAction: (String) -> Unit, modifier: Modifier = Modifier, compact: Boolean = false) {
    Surface(modifier, shape = CircleShape, color = Color.White, shadowElevation = 4.dp,
        border = BorderStroke(1.dp, Color(0xFFF1F0ED))) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RotationControl("New page", onAction, size = if (compact) 24.dp else 30.dp)
            Text("Field notes ⌄", Modifier.clickable { onAction("Field notes") }
                .semantics { contentDescription = "Field notes notebook" }
                .padding(horizontal = if (compact) 5.dp else 9.dp), fontFamily = AbcArizonaSans,
                color = rotationInk, fontSize = if (compact) 10.sp else 12.sp)
        }
    }
}

@Composable
private fun RotationTools(selected: String, onAction: (String) -> Unit,
    modifier: Modifier = Modifier, compact: Boolean = false) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(if (compact) 1.dp else 5.dp),
        verticalAlignment = Alignment.CenterVertically) {
        listOf("Pen", "Highlighter", "Eraser", "Lasso", "Snip", "Glass", "Undo", "Redo", "More", "Hide")
            .forEach { RotationControl(it, onAction, size = if (compact) 25.dp else 36.dp, selected = selected == it) }
    }
}

@Composable
private fun RotationSideRail(selected: String, onAction: (String) -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier, shape = CircleShape, color = Color.White, shadowElevation = 5.dp) {
        Column(Modifier.padding(3.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            listOf("Pen", "Highlighter", "Eraser", "Lasso", "Snip", "Glass", "Undo", "Redo", "More", "Hide")
                .forEach { RotationControl(it, onAction, size = 35.dp, selected = selected == it) }
        }
    }
}

@Composable
private fun RotationDial(selected: String, onAction: (String) -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.size(210.dp, 140.dp).semantics { contentDescription = "Orientation free tool dial; gesture unverified" }) {
        RotationControl("Pen", onAction, Modifier.align(Alignment.Center), 52.dp, selected == "Pen")
        listOf(
            Triple("Highlighter", (-72).dp, 2.dp), Triple("Eraser", (-46).dp, (-44).dp),
            Triple("Lasso", 0.dp, (-59).dp), Triple("Snip", 45.dp, (-44).dp),
            Triple("Glass", 71.dp, 2.dp), Triple("Undo", 75.dp, 49.dp)
        ).forEach { (name, x, y) ->
            RotationControl(name, onAction, Modifier.align(Alignment.Center).offset(x = x, y = y), 33.dp, selected == name)
        }
    }
}

@Composable
private fun RotationControl(name: String, onAction: (String) -> Unit, modifier: Modifier = Modifier,
    size: Dp = 36.dp, selected: Boolean = false) {
    val glyph = when (name) {
        "New page" -> "+"; "Pen" -> "✎"; "Highlighter" -> "▰"; "Eraser" -> "⌫"
        "Lasso" -> "○"; "Snip" -> "⌗"; "Glass" -> "◐"; "Undo" -> "↶"
        "Redo" -> "↷"; "More" -> "⋯"; "Hide" -> "×"; else -> "☰"
    }
    Surface(modifier.size(size).clickable { onAction(name) }
        .semantics { contentDescription = "$name control"; this.selected = selected },
        shape = CircleShape, color = Color.White, shadowElevation = if (selected) 4.dp else 2.dp,
        border = if (selected) BorderStroke(1.5.dp, rotationInk) else null) {
        Box(contentAlignment = Alignment.Center) {
            Text(glyph, fontSize = 20.sp, color = if (name == "Redo") Color.LightGray else rotationInk)
        }
    }
}
