package com.claude.compose.screen

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.os.SystemClock
import androidx.compose.runtime.withFrameNanos
import kotlin.math.roundToInt

/**
 * Journey proof scenes based on the verified e34f v3 reference capture set.
 * Source screenshots: note-overlay-retrofit-pilot/scene-captures-e34f-1200x900-v3
 * (g2: 20-g2-figure-1..3; g4: 22-g4-figure-1..2; g5: 23-g5-figure-1;
 * g6: 24-g6-figure-1..2). These are hand-authored native studies; they do not
 * prove that claude-to-compose generated faithful output.
 */
private val JourneyCanvas = Color(0xFFFEFEFD)
private val JourneyRule = Color(0xFFE8E7E3)
private val JourneyInk = Color(0xFF252621)
private val JourneyMuted = Color(0xFF767772)
private val JourneyAmber = Color(0xFFFFA51D)

/** Content hashes pin the exact verified v3 figure screenshots used as visual references. */
data class E34fJourneyReferenceImage(val sceneId: String, val fileName: String, val sha256: String)

val E34F_JOURNEY_REFERENCE_IMAGES = listOf(
    E34fJourneyReferenceImage("g2/figure-1", "20-g2-figure-1.png", "409bed09e9e34c8d41fe0935fc4915e70e1f520f527e119f125e855b8f491d12"),
    E34fJourneyReferenceImage("g2/figure-2", "20-g2-figure-2.png", "89c60d405d3c6c0203aef034a479887876bbbca66b5e2682c3e77ad27890b8ce"),
    E34fJourneyReferenceImage("g2/figure-3", "20-g2-figure-3.png", "533034f724ffe7e2fd43b339b9808089c8368411b902d238114b421fb83160d4"),
    E34fJourneyReferenceImage("g4/figure-1", "22-g4-figure-1.png", "f76f63bd757fe9b116a3ed919c6986b58ca61cb42bcf13a9d7b63ca5974a69da"),
    E34fJourneyReferenceImage("g4/figure-2", "22-g4-figure-2.png", "d007e609a0880d0fcb4abc44baf536cd7611564bce614140c8d51b25d8892a18"),
    E34fJourneyReferenceImage("g5/figure-1", "23-g5-figure-1.png", "7028c0e57b5593ed4e6d81ff6b05711e48ba6d2b52045bdb714fdf37c496a7bc"),
    E34fJourneyReferenceImage("g6/figure-1", "24-g6-figure-1.png", "a144279fde3c73b88bb9ac27565d7d131ee60887defffb613818e5a7f472b8d1"),
    E34fJourneyReferenceImage("g6/figure-2", "24-g6-figure-2.png", "be9f2422301456c097d148d163ee2c29142fa2b2a9a77d1fc02dca5a0f9fe413")
)

/** Clock-driven fade model: callers supply time so the timeline is reproducible in tests. */
data class E34fFirstStrokeTimeline(
    val strokeStartedAtMillis: Long?,
    val fadeDurationMillis: Long = 320L
) {
    init { require(fadeDurationMillis > 0L) }

    fun promptAlpha(nowMillis: Long): Float {
        val started = strokeStartedAtMillis ?: return 1f
        val elapsed = (nowMillis - started).coerceAtLeast(0L)
        return (1f - elapsed.toFloat() / fadeDurationMillis.toFloat()).coerceIn(0f, 1f)
    }
}

/**
 * Standalone native gallery entry point for interactive source journeys.
 * g1 and g3 deliberately render a blocked card with their missing evidence reason.
 */
@Composable
fun E34fJourneyScenes(sceneId: String, modifier: Modifier = Modifier, clockMillis: Long? = null, figureIndex: Int? = null) {
    when (sceneId) {
        "g2" -> GlassJourney(modifier, figureIndex)
        "g4" -> SelectionJourney(modifier, figureIndex)
        "g5" -> PagesJourney(modifier)
        "g6" -> FirstStrokeJourney(modifier, clockMillis, figureIndex)
        "g1" -> JourneyBlocked(modifier, "g1", "Gesture grammar needs a validated source event map and native gesture evidence.")
        "g3" -> JourneyBlocked(modifier, "g3", "Ink and nib behavior needs pressure, nib, and stroke-rendering evidence before native claims.")
        else -> JourneyBlocked(modifier, sceneId, "This journey scene is not implemented in the current native proof.")
    }
}

@Composable
private fun GlassJourney(modifier: Modifier, figureIndex: Int?) {
    val initialFigure = (figureIndex ?: 1).coerceIn(1, 3)
    var mode by rememberSaveable(figureIndex) { mutableStateOf(listOf("Trace", "Annotate", "Page")[initialFigure - 1]) }
    var opacity by rememberSaveable(figureIndex) { mutableIntStateOf(listOf(20, 72, 100)[initialFigure - 1]) }
    val modes = listOf("Trace", "Annotate", "Page")
    JourneyScaffold("g2", "The glass, as a real interaction", "Figures 1–3 · 20%, 72%, and 100% glass", modifier) {
        Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(20.dp)).background(JourneyCanvas)) {
            RuledBackground(Modifier.fillMaxSize(), dotted = mode == "Page")
            Column(Modifier.align(Alignment.TopCenter).padding(top = 18.dp).clip(CircleShape)
                .background(Color.White.copy(alpha = opacity / 100f)).padding(horizontal = 8.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.Center) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    modes.forEach { option ->
                        Pill(option, selected = mode == option, description = "Glass mode $option") { mode = option }
                    }
                }
            }
            if (mode != "Page") {
                Column(Modifier.align(Alignment.TopStart).padding(start = 24.dp, top = 35.dp)) {
                    listOf("Cities are planting shade along the streets.", "The ledgers are turning green.",
                        "A mature plane can hold thousands of litres.").forEachIndexed { index, line ->
                        Text(line, color = JourneyInk.copy(alpha = (opacity / 100f).coerceIn(.2f, 1f)), fontSize = 13.sp,
                            modifier = Modifier.padding(bottom = 4.dp).semantics { contentDescription = "Synthetic article line ${index + 1}" })
                    }
                }
            }
            InkSample(Modifier.align(Alignment.Center).fillMaxWidth(.72f).height(150.dp), mode)
            Text("${if (mode == "Trace") "world leads, ink follows" else if (mode == "Annotate") "notes lead, world as context" else "the world is gone, just paper"}",
                Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp), color = JourneyMuted, fontSize = 12.sp)
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Glass opacity", color = JourneyMuted, fontSize = 12.sp)
            listOf(20, 72, 100).forEach { amount ->
                Pill("$amount%", selected = opacity == amount, description = "Glass opacity $amount percent") { opacity = amount }
            }
        }
    }
}

@Composable
private fun SelectionJourney(modifier: Modifier, figureIndex: Int?) {
    var lastAction by rememberSaveable(figureIndex) { mutableStateOf("") }
    var selectedInk by rememberSaveable(figureIndex) { mutableStateOf(true) }
    var cropped by rememberSaveable(figureIndex) { mutableStateOf(false) }
    var textNoteAdded by rememberSaveable(figureIndex) { mutableStateOf(false) }
    var duplicateCount by rememberSaveable(figureIndex) { mutableIntStateOf(1) }
    val actions = listOf("Text", "Crop", "Copy", "Delete")
    val selectedFigure = (figureIndex ?: 1).coerceIn(1, 2)
    JourneyScaffold("g4", "Selection → action", "Permutation $selectedFigure · selected ink and verb-at-tap", modifier) {
        Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(20.dp)).background(JourneyCanvas)) {
            RuledBackground(Modifier.fillMaxSize())
            if (selectedInk) {
                Box(Modifier.align(Alignment.Center).fillMaxWidth(if (cropped) .38f else .56f).height(if (cropped) 100.dp else 136.dp)
                    .background(Color(0xFFF4F3EF).copy(alpha = .42f), RoundedCornerShape(12.dp))
                    .semantics { contentDescription = if (cropped) "Selected ink region cropped" else "Selected ink region" }) {
                    SelectionInk(Modifier.fillMaxSize().padding(horizontal = 14.dp), duplicateCount)
                    Canvas(Modifier.fillMaxSize()) {
                        val dash = Path().apply {
                            moveTo(0f, 1f); lineTo(size.width, 1f); lineTo(size.width, size.height - 1f)
                            lineTo(0f, size.height - 1f); close()
                        }
                        drawPath(dash, JourneyMuted, style = Stroke(width = 2.dp.toPx(), pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx()))))
                    }
                }
            }
            if (selectedFigure == 1) {
                Row(Modifier.align(Alignment.Center).clip(CircleShape).background(JourneyInk).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    actions.forEach { verb -> SelectionAction(verb) {
                        lastAction = verb
                        when (verb) {
                            "Text" -> textNoteAdded = true
                            "Crop" -> cropped = true
                            "Copy" -> duplicateCount += 1
                            "Delete" -> selectedInk = false
                        }
                    } }
                }
            } else {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                        listOf("Crop", "Copy").forEach { verb -> SelectionAction(verb, circular = true) {
                            lastAction = verb
                            if (verb == "Crop") cropped = true else duplicateCount += 1
                        } }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                        listOf("Text", "Delete").forEach { verb -> SelectionAction(verb, circular = true) {
                            lastAction = verb
                            if (verb == "Text") textNoteAdded = true else selectedInk = false
                        } }
                    }
                }
            }
            if (textNoteAdded) Text("City shade", Modifier.align(Alignment.TopCenter).padding(top = 18.dp)
                .semantics { contentDescription = "Synthetic note City shade added" }, color = JourneyInk, fontSize = 14.sp)
            if (!selectedInk) Text("Selected ink deleted", Modifier.align(Alignment.Center)
                .semantics { contentDescription = "Synthetic ink deleted" }, color = JourneyMuted, fontSize = 13.sp)
            if (duplicateCount > 1) Text("${duplicateCount - 1} copied stroke", Modifier.align(Alignment.BottomEnd).padding(14.dp)
                .semantics { contentDescription = "Synthetic selection copies $duplicateCount" }, color = JourneyMuted, fontSize = 12.sp)
            if (lastAction.isNotEmpty()) Text("Synthetic document updated: $lastAction", Modifier.align(Alignment.BottomCenter)
                .padding(bottom = 16.dp).semantics { contentDescription = "Synthetic document updated $lastAction" }, color = JourneyMuted, fontSize = 13.sp)
        }
        Text("Actions mutate only this disposable synthetic selection.", color = JourneyMuted, fontSize = 12.sp)
    }
}

@Composable
private fun PagesJourney(modifier: Modifier) {
    var selectedPage by rememberSaveable { mutableIntStateOf(2) }
    var pageCount by rememberSaveable { mutableIntStateOf(5) }
    JourneyScaffold("g5", "Pages & navigation", "Permutation A · thumbnail rail", modifier) {
        Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(20.dp)).background(JourneyCanvas)) {
            RuledBackground(Modifier.fillMaxSize())
            Column(Modifier.align(Alignment.CenterStart).fillMaxWidth(.75f).padding(start = 28.dp), verticalArrangement = Arrangement.spacedBy(26.dp)) {
                repeat(3) { index ->
                    Canvas(Modifier.fillMaxWidth().height(18.dp).semantics { contentDescription = "Synthetic page ink line ${index + 1}" }) {
                        val path = Path().apply {
                            moveTo(0f, size.height * .55f); cubicTo(size.width * .24f, 0f, size.width * .58f, size.height, size.width, size.height * .45f)
                        }
                        drawPath(path, JourneyInk.copy(alpha = if (index == 1) .55f else .85f), style = Stroke(2.1.dp.toPx(), cap = StrokeCap.Round))
                    }
                }
            }
            Text("Page $selectedPage of $pageCount", Modifier.align(Alignment.TopEnd).padding(14.dp)
                .semantics { contentDescription = "Current page $selectedPage of $pageCount" }, color = JourneyMuted, fontSize = 12.sp)
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            (1..pageCount).forEach { page ->
                PageThumbnail(page, selectedPage == page) { selectedPage = page }
            }
            PageThumbnail(pageCount + 1, selected = false, isAdd = true) {
                pageCount += 1
                selectedPage = pageCount
            }
        }
        Text("Swipe the rail to skim; tap a page to jump; the last slot adds one.", color = JourneyMuted, fontSize = 12.sp)
    }
}

@Composable
private fun FirstStrokeJourney(modifier: Modifier, injectedClockMillis: Long?, figureIndex: Int?) {
    val selectedFigure = (figureIndex ?: 2).coerceIn(1, 2)
    var paper by rememberSaveable(figureIndex) { mutableStateOf("Blank") }
    var strokeStartedAt by rememberSaveable(figureIndex) { mutableStateOf<Long?>(null) }
    var runtimeFadeRequested by rememberSaveable(figureIndex) { mutableStateOf(false) }
    var runtimeFrameMillis by remember { mutableLongStateOf(SystemClock.uptimeMillis()) }
    val points = remember(figureIndex) { mutableStateListOf<Offset>() }
    LaunchedEffect(runtimeFadeRequested, injectedClockMillis, selectedFigure) {
        if (runtimeFadeRequested && injectedClockMillis == null && selectedFigure == 2) {
            val firstFrameMillis = withFrameNanos { it / 1_000_000L }
            strokeStartedAt = firstFrameMillis
            runtimeFrameMillis = firstFrameMillis
            while (runtimeFrameMillis - firstFrameMillis < 320L) {
                runtimeFrameMillis = withFrameNanos { it / 1_000_000L }
            }
        }
    }
    val timelineStart = if (selectedFigure == 2) strokeStartedAt else null
    val nowMillis = injectedClockMillis ?: runtimeFrameMillis
    val promptAlpha = E34fFirstStrokeTimeline(timelineStart).promptAlpha(nowMillis)
    JourneyScaffold("g6", "The empty page & first stroke", "Permutation $selectedFigure · ${if (selectedFigure == 1) "quiet invitation" else "dissolves on contact"}", modifier) {
        Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(20.dp)).background(JourneyCanvas)) {
            if (paper != "Blank") RuledBackground(Modifier.fillMaxSize(), dotted = paper == "Dots", strong = paper == "Lined")
            if (points.isEmpty() || strokeStartedAt != null) Column(Modifier.align(Alignment.Center).alpha(promptAlpha)
                .semantics { contentDescription = "First stroke prompt alpha ${(promptAlpha * 100).roundToInt()} percent" }, horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(JourneyAmber))
                Text("A fresh sheet", Modifier.padding(top = 16.dp), color = JourneyInk, fontFamily = FontFamily.Serif, fontSize = 27.sp)
                Text("We’ll leave the rest to you.", Modifier.padding(top = 8.dp), color = JourneyMuted, fontSize = 14.sp)
            }
            Canvas(Modifier.fillMaxSize().semantics {
                contentDescription = if (points.isEmpty()) "Empty page canvas" else "Page canvas with first stroke"
            }.pointerInput(injectedClockMillis, selectedFigure) {
                detectDragGestures(
                    onDragStart = { point ->
                        if (strokeStartedAt == null && !runtimeFadeRequested) {
                            if (injectedClockMillis == null && selectedFigure == 2) runtimeFadeRequested = true
                            else strokeStartedAt = injectedClockMillis ?: SystemClock.uptimeMillis()
                        }
                        points.add(point)
                    },
                    onDrag = { change, _ -> points.add(change.position); change.consume() }
                )
            }) {
                if (points.isNotEmpty()) {
                    val path = Path().apply {
                        moveTo(points.first().x, points.first().y)
                        points.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                    drawPath(path, JourneyInk, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
                    if (points.size == 1) drawCircle(JourneyInk, radius = 1.5.dp.toPx(), center = points.first())
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Paper for a new notebook", color = JourneyMuted, fontSize = 12.sp)
            listOf("Blank", "Lined", "Dots").forEach { choice ->
                Pill(choice, selected = paper == choice, description = "Paper choice $choice") { paper = choice }
            }
        }
        Text("Synthetic canvas · prompt fade is a clock-driven 320 ms demo timeline.", color = JourneyMuted, fontSize = 11.sp)
    }
}

@Composable
private fun SelectionAction(label: String, circular: Boolean = false, onClick: () -> Unit) {
    val shape = if (circular) CircleShape else RoundedCornerShape(50)
    Surface(shape = shape, color = if (circular) Color.White else JourneyInk,
        modifier = Modifier.size(if (circular) 58.dp else 48.dp, if (circular) 58.dp else 40.dp)
            .clip(shape).clickable(onClick = onClick)
            .semantics { contentDescription = "Selection action $label" }) {
        Box(contentAlignment = Alignment.Center) {
            Text(label, color = if (circular) JourneyInk else Color.White, fontSize = 12.sp)
        }
    }
}

@Composable
private fun SelectionInk(modifier: Modifier, duplicateCount: Int) {
    Canvas(modifier.semantics { contentDescription = "Synthetic selected ink, ${duplicateCount - 1} duplicates" }) {
        val visibleCopies = duplicateCount.coerceAtMost(4)
        repeat(visibleCopies) { copyIndex ->
            drawContext.transform.translate(left = copyIndex * 8.dp.toPx(), top = copyIndex * 3.dp.toPx())
            val path = Path().apply {
                moveTo(size.width * .03f, size.height * .55f)
                cubicTo(size.width * .2f, size.height * .05f, size.width * .45f, size.height * .98f, size.width * .63f, size.height * .48f)
                cubicTo(size.width * .76f, size.height * .12f, size.width * .85f, size.height * .8f, size.width * .97f, size.height * .46f)
            }
            drawPath(path, JourneyInk.copy(alpha = if (copyIndex == 0) .9f else .48f), style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
            drawContext.transform.translate(left = -copyIndex * 8.dp.toPx(), top = -copyIndex * 3.dp.toPx())
        }
    }
}

@Composable
private fun JourneyScaffold(id: String, title: String, subtitle: String, modifier: Modifier, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(modifier.fillMaxSize().background(Color(0xFFF2F1ED)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("EXPLORATION · $id", color = JourneyAmber, fontFamily = FontFamily.Monospace, fontSize = 11.sp, letterSpacing = 1.2.sp)
        Text(title, color = JourneyInk, fontFamily = FontFamily.Serif, fontSize = 27.sp, lineHeight = 31.sp)
        Text(subtitle, color = JourneyMuted, fontSize = 13.sp)
        Column(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun JourneyBlocked(modifier: Modifier, id: String, reason: String) {
    Column(modifier.fillMaxSize().background(Color(0xFFF2F1ED)).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("EXPLORATION · $id", color = JourneyAmber, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
        Text("BLOCKED · Native behavior not implemented", Modifier.semantics { contentDescription = "Scene $id blocked" }, color = JourneyInk, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Text(reason, color = JourneyMuted, fontSize = 15.sp)
    }
}

@Composable
private fun Pill(label: String, selected: Boolean, description: String, onClick: () -> Unit) {
    Surface(shape = CircleShape, color = if (selected) JourneyInk else Color.White,
        modifier = Modifier.clip(CircleShape).clickable(onClick = onClick)
            .semantics { contentDescription = description; this.selected = selected }) {
        Text(label, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = if (selected) Color.White else JourneyInk, fontSize = 12.sp)
    }
}

@Composable
private fun PageThumbnail(page: Int, selected: Boolean, isAdd: Boolean = false, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.width(58.dp).semantics { contentDescription = if (isAdd) "Add page" else "Select page $page"; this.selected = selected }.clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().aspectRatio(.72f).clip(RoundedCornerShape(8.dp))
            .border(if (selected) 2.dp else 1.dp, if (selected) JourneyInk else JourneyRule, RoundedCornerShape(8.dp))
            .background(if (selected) Color.White else Color(0xFFFAFAF8))) {
            if (isAdd) Text("+", Modifier.align(Alignment.Center), fontSize = 24.sp, color = JourneyInk)
            else Column(Modifier.align(Alignment.Center).padding(horizontal = 7.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(if (page % 2 == 0) 2 else 4) { Box(Modifier.fillMaxWidth(if (it % 2 == 0) .95f else .68f).height(1.dp).background(JourneyRule)) }
            }
        }
        Text(if (isAdd) "New" else "Page $page", color = if (selected) JourneyInk else JourneyMuted, fontSize = 10.sp)
    }
}

@Composable
private fun RuledBackground(modifier: Modifier, dotted: Boolean = false, strong: Boolean = false) {
    Canvas(modifier) {
        if (dotted) {
            val step = 24.dp.toPx()
            var y = 12.dp.toPx()
            while (y < size.height) {
                var x = 12.dp.toPx()
                while (x < size.width) { drawCircle(JourneyRule, 1.3.dp.toPx(), Offset(x, y)); x += step }
                y += step
            }
        } else {
            val step = if (strong) 30.dp.toPx() else 34.dp.toPx()
            var y = step
            while (y < size.height) {
                drawLine(if (strong) Color(0xFFD6D5D1) else JourneyRule, Offset(0f, y), Offset(size.width, y), if (strong) 1.dp.toPx() else .8.dp.toPx())
                y += step
            }
        }
    }
}

@Composable
private fun InkSample(modifier: Modifier, mode: String) {
    Canvas(modifier.semantics { contentDescription = "Synthetic ink example" }) {
        val path = Path().apply {
            moveTo(size.width * .03f, size.height * .45f)
            cubicTo(size.width * .27f, size.height * .12f, size.width * .44f, size.height * .82f, size.width * .62f, size.height * .48f)
            cubicTo(size.width * .72f, size.height * .28f, size.width * .80f, size.height * .55f, size.width * .97f, size.height * .48f)
        }
        drawPath(path, JourneyInk, style = Stroke(width = 2.8.dp.toPx(), cap = StrokeCap.Round))
        drawLine(JourneyMuted, Offset(size.width * .03f, size.height * .72f), Offset(size.width * .43f, size.height * .69f), 2.dp.toPx(), cap = StrokeCap.Round)
        if (mode == "Page") drawLine(JourneyInk, Offset(size.width * .03f, size.height * .22f), Offset(size.width * .28f, size.height * .20f), 2.8.dp.toPx(), cap = StrokeCap.Round)
    }
}
