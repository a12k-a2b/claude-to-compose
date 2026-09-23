package com.claude.compose.screen

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Slider
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.AbcArizonaFlare
import com.claude.compose.theme.AbcArizonaSans
import com.claude.compose.theme.AbcRomMono

/** Exact verified v3 section captures used for these hand-authored studies. */
data class E34fGestureInkReference(val sceneId: String, val fileName: String, val sha256: String)

val E34F_GESTURE_INK_REFERENCES = listOf(
    E34fGestureInkReference("g1", "19-g1.png", "d0fdfbe85fa0abff9808dfbb87fdf371bb7aff6449a0b31823d6f220951e0b88"),
    E34fGestureInkReference("g3", "21-g3.png", "841611068d1796b4e4501b5e86188eec59a16adc8a4cfd729357b3b328087f5c")
)

private val paper = Color(0xFFFAF9F4)
private val ink = Color(0xFF252621)
private val muted = Color(0xFF71716D)
private val rule = Color(0xFFE7E6E1)
private val orange = Color(0xFFE7833B)

/**
 * Source-grounded native studies of e34f g1 and g3. Controls mutate synthetic
 * gallery state. Real pen gestures, pressure-sensitive ink and source motion
 * remain BLOCKED until native event/stroke evidence and visual comparison exist.
 */
@Composable
fun E34fGestureInkScene(sceneId: String, modifier: Modifier = Modifier) {
    when (sceneId) {
        "g1" -> GestureGrammar(modifier)
        "g3" -> InkAndNib(modifier)
        else -> Box(modifier.fillMaxSize().background(paper).semantics { contentDescription = "Gesture and ink scene $sceneId blocked" }) {
            Text("BLOCKED · Unknown gesture or ink scene", Modifier.align(Alignment.Center), color = ink)
        }
    }
}

@Composable
private fun StudyFrame(number: Int, title: String, subtitle: String, introduction: String, modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxSize().background(paper).verticalScroll(rememberScrollState())
        .semantics { contentDescription = "Exploration $number of 6 · $title · native study" }) {
        Row(Modifier.fillMaxWidth().border(width = 1.dp, color = rule).padding(vertical = 16.dp, horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("EXPLORATION $number OF 6", color = orange, fontFamily = AbcRomMono, fontSize = 11.sp)
            Text(title, color = ink, fontFamily = AbcArizonaFlare, fontSize = 28.sp)
            Text(subtitle, color = muted, fontFamily = AbcArizonaSans, fontSize = 13.sp)
        }
        Text(introduction, Modifier.padding(horizontal = 20.dp, vertical = 22.dp), color = ink,
            fontFamily = AbcArizonaSans, fontSize = 15.sp, lineHeight = 23.sp)
        content()
        Text("BLOCKED · Native pen behavior, source motion and visual parity are not verified.",
            Modifier.padding(20.dp).semantics { contentDescription = "Native behavior and visual parity blocked" },
            color = muted, fontFamily = AbcRomMono, fontSize = 10.sp)
    }
}

@Composable
private fun GestureGrammar(modifier: Modifier) {
    var helpOpen by rememberSaveable { mutableStateOf(true) }
    var selectedGesture by rememberSaveable { mutableStateOf("Correct") }
    val gestures = listOf(
        Triple("Correct", "Scribble to erase", "Scrub back and forth over a stroke and it rubs out — no eraser, no pause."),
        Triple("Select", "Circle to lasso", "Ring anything and hold a beat — the loop turns into a live selection."),
        Triple("Step", "Two fingers back, three forward", "Tap with the other hand while the pen keeps its place — undo and redo without a pause."),
        Triple("Snap", "Draw rough, hold to true", "Sketch a shape in one stroke and pause at the end — it snaps to a clean line, arc or polygon."),
        Triple("Summon", "Squeeze for the dial", "A squeeze on the barrel blooms the tool dial (3c) right at the nib, then it fades on release."),
        Triple("Flip", "Double-tap for last tool", "Two taps on the barrel flip between pen and your most recent tool — usually the eraser.")
    )
    StudyFrame(1, "Gesture grammar", "The pen does the work, so you rarely reach for the bar.",
        "The calmest chrome is chrome you don't touch. Six gestures cover the everyday moves without a trip to the toolbar — each one a natural mark rather than a memorised command.", modifier) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            gestures.forEachIndexed { index, (name, title, detail) ->
                Column(Modifier.width(258.dp).height(230.dp).background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, if (selectedGesture == name) ink else rule, RoundedCornerShape(16.dp))
                    .clickable { selectedGesture = name }
                    .semantics { contentDescription = "Gesture example $name"; selected = selectedGesture == name }) {
                    GestureMark(index, Modifier.fillMaxWidth().height(126.dp))
                    Text(name.uppercase(), Modifier.padding(start = 16.dp, top = 14.dp), color = muted,
                        fontFamily = AbcRomMono, fontSize = 10.sp)
                    Text(title, Modifier.padding(start = 16.dp, top = 7.dp), color = ink,
                        fontFamily = AbcArizonaSans, fontWeight = FontWeight.Medium, fontSize = 16.sp)
                    Text(detail, Modifier.padding(start = 16.dp, end = 12.dp, top = 6.dp), color = muted,
                        fontFamily = AbcArizonaSans, fontSize = 11.sp, lineHeight = 14.sp, maxLines = 2)
                }
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(Modifier.width(330.dp).background(Color(0xFFF3F1ED), RoundedCornerShape(18.dp)).padding(20.dp)) {
                Label("PERMUTATION A · LEARNED IN PASSING")
                Box(Modifier.fillMaxWidth().height(96.dp).padding(top = 18.dp).background(Color.White, RoundedCornerShape(12.dp))) {
                    Text("Tip · scribble over a stroke to erase it", Modifier.align(Alignment.Center)
                        .background(ink, CircleShape).padding(horizontal = 20.dp, vertical = 12.dp),
                        color = Color.White, fontFamily = AbcArizonaSans, fontSize = 12.sp)
                }
                Text("One quiet tip, then never again.", Modifier.padding(top = 16.dp), color = ink,
                    fontFamily = AbcArizonaSans, fontSize = 13.sp)
            }
            Column(Modifier.width(330.dp).background(Color(0xFFF3F1ED), RoundedCornerShape(18.dp)).padding(20.dp)) {
                Label("PERMUTATION B · A CARD YOU CAN PULL UP")
                Text(if (helpOpen) "Hide pen gestures" else "Show pen gestures", Modifier.padding(top = 18.dp)
                    .background(Color.White, RoundedCornerShape(12.dp)).clickable { helpOpen = !helpOpen }
                    .padding(14.dp).semantics { contentDescription = "Gesture help toggle" },
                    color = ink, fontFamily = AbcArizonaSans, fontSize = 14.sp)
                if (helpOpen) {
                    Column(Modifier.fillMaxWidth().padding(top = 8.dp).background(Color.White, RoundedCornerShape(12.dp)).padding(14.dp)) {
                        listOf("Erase" to "scribble over", "Select" to "circle + hold", "Undo · redo" to "2 · 3 fingers",
                            "Snap shape" to "draw + hold", "Tools" to "squeeze").forEach { (action, motion) ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(action, color = ink, fontFamily = AbcArizonaSans, fontSize = 12.sp)
                                Text(motion, color = muted, fontFamily = AbcArizonaSans, fontSize = 12.sp)
                            }
                        }
                    }
                }
                Text("A calm reference, one tap away.", Modifier.padding(top = 14.dp), color = ink,
                    fontFamily = AbcArizonaSans, fontSize = 13.sp)
            }
        }
        Text("Selected synthetic gesture: $selectedGesture", Modifier.padding(horizontal = 20.dp)
            .semantics { contentDescription = "Selected synthetic gesture $selectedGesture" },
            color = muted, fontFamily = AbcRomMono, fontSize = 11.sp)
    }
}

@Composable
private fun GestureMark(index: Int, modifier: Modifier) {
    Canvas(modifier) {
        val y = size.height * .55f
        repeat(4) { line ->
            val ruledY = size.height * (.18f + line * .25f)
            drawLine(rule, Offset(0f, ruledY), Offset(size.width, ruledY), 1.dp.toPx())
        }
        val path = Path()
        when (index) {
            0 -> { path.moveTo(size.width * .2f, y * .6f); path.lineTo(size.width * .48f, y * 1.1f); path.lineTo(size.width * .18f, y * 1.4f); path.lineTo(size.width * .54f, y * 1.7f) }
            1 -> path.addOval(androidx.compose.ui.geometry.Rect(size.width * .2f, size.height * .2f, size.width * .8f, size.height * .8f))
            2 -> { path.moveTo(size.width * .32f, y); path.lineTo(size.width * .42f, y * 1.2f); path.lineTo(size.width * .52f, y * .7f); path.lineTo(size.width * .75f, y * .55f) }
            else -> { path.moveTo(size.width * .2f, y * 1.3f); path.lineTo(size.width * .55f, y * .4f); path.lineTo(size.width * .8f, y * 1.2f) }
        }
        drawPath(path, ink.copy(alpha = .75f), style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round))
    }
}

private data class Nib(val name: String, val description: String)
private val nibs = listOf(
    Nib("Fountain", "Swells with speed and pressure."), Nib("Ballpoint", "Even, unfussy, always the same."),
    Nib("Pencil", "Soft graphite grain, smudgeable."), Nib("Marker", "Broad, flat, for highlighting weight."),
    Nib("Fineliner", "Precise, technical, hairline-even.")
)
private val shades = listOf(Color.Black, Color(0xFF565656), Color(0xFF929292))

@Composable
private fun InkAndNib(modifier: Modifier) {
    var selectedNib by rememberSaveable { mutableStateOf("Fountain") }
    var selectedSize by rememberSaveable { mutableIntStateOf(2) }
    var selectedShade by rememberSaveable { mutableIntStateOf(0) }
    var pressure by rememberSaveable { mutableFloatStateOf(.6f) }
    var fullCard by rememberSaveable { mutableStateOf(true) }
    StudyFrame(3, "Ink & nib", "The part reMarkable wins on — how the mark itself feels.",
        "Choosing a nib should be choosing a feeling, shown as the real stroke it makes — never a dropdown of words. Sizes stay literal ink dots and shades stay swatches, so nothing needs reading. Grayscale only, calibrated for epaper.", modifier) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            nibs.forEachIndexed { index, nib ->
                Column(Modifier.width(190.dp).height(140.dp).background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, if (selectedNib == nib.name) ink else rule, RoundedCornerShape(16.dp))
                    .clickable { selectedNib = nib.name }
                    .semantics { contentDescription = "Nib ${nib.name}"; selected = selectedNib == nib.name }
                    .padding(16.dp)) {
                    NibMark(index, Modifier.fillMaxWidth().height(46.dp))
                    Text(nib.name, Modifier.padding(top = 14.dp), color = ink, fontFamily = AbcArizonaSans,
                        fontWeight = FontWeight.Medium, fontSize = 15.sp)
                    Text(nib.description, Modifier.padding(top = 5.dp), color = muted, fontFamily = AbcArizonaSans,
                        fontSize = 10.sp, maxLines = 2)
                }
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(Modifier.width(320.dp)) {
                Label("PERMUTATION A · THE FULL PEN CARD")
                Column(Modifier.fillMaxWidth().padding(top = 12.dp).background(Color.White, RoundedCornerShape(18.dp))
                    .padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(if (fullCard) "Pen · full card" else "Pen · quick strip", Modifier.clickable { fullCard = !fullCard }
                        .semantics { contentDescription = "Pen card toggle" }, color = ink,
                        fontFamily = AbcArizonaSans, fontSize = 17.sp)
                    if (fullCard) {
                        Label("NIB")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            nibs.take(3).forEach { nib ->
                                Text(nib.name, Modifier.border(1.dp, if (selectedNib == nib.name) ink else rule,
                                    RoundedCornerShape(8.dp)).clickable { selectedNib = nib.name }
                                    .semantics { contentDescription = "Pen card nib ${nib.name}"; selected = selectedNib == nib.name }
                                    .padding(horizontal = 9.dp, vertical = 7.dp), color = ink, fontSize = 11.sp)
                            }
                        }
                    }
                    Label("SIZE")
                    SizeSelector(selectedSize) { selectedSize = it }
                    if (fullCard) {
                        Label("PRESSURE")
                        Slider(value = pressure, onValueChange = { pressure = it }, modifier = Modifier.fillMaxWidth()
                            .semantics { contentDescription = "Synthetic pressure curve" })
                    }
                    Label("SHADE")
                    ShadeSelector(selectedShade) { selectedShade = it }
                }
            }
            Column(Modifier.width(320.dp)) {
                Label("PERMUTATION B · THE QUICK STRIP")
                Column(Modifier.fillMaxWidth().padding(top = 12.dp).background(Color.White, RoundedCornerShape(30.dp))
                    .padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SizeSelector(selectedSize) { selectedSize = it }
                    ShadeSelector(selectedShade) { selectedShade = it }
                }
                Text("Tap the pen card title to switch between full card and quick strip.",
                    Modifier.padding(top = 16.dp), color = ink, fontFamily = AbcArizonaSans, fontSize = 13.sp)
            }
        }
        Text("Synthetic pen: $selectedNib · size ${selectedSize + 1} · shade ${selectedShade + 1} · pressure ${(pressure * 100).toInt()}%",
            Modifier.padding(horizontal = 20.dp).semantics {
                contentDescription = "Synthetic pen $selectedNib size ${selectedSize + 1} shade ${selectedShade + 1} pressure ${(pressure * 100).toInt()} percent"
            }, color = muted, fontFamily = AbcRomMono, fontSize = 10.sp)
    }
}

@Composable private fun SizeSelector(selectedSize: Int, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(17.dp), verticalAlignment = Alignment.CenterVertically) {
        (0..3).forEach { index ->
            Box(Modifier.size(34.dp).border(if (index == selectedSize) 2.dp else 0.dp, ink, CircleShape)
                .clickable { onSelect(index) }.semantics { contentDescription = "Ink size ${index + 1}"; selected = index == selectedSize },
                contentAlignment = Alignment.Center) {
                Box(Modifier.size((5 + index * 5).dp).background(ink, CircleShape))
            }
        }
    }
}

@Composable private fun ShadeSelector(selectedShade: Int, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        shades.forEachIndexed { index, color ->
            Box(Modifier.size(40.dp).border(if (index == selectedShade) 2.dp else 0.dp, ink, CircleShape)
                .clickable { onSelect(index) }.semantics { contentDescription = "Ink shade ${index + 1}"; selected = index == selectedShade },
                contentAlignment = Alignment.Center) {
                Box(Modifier.size(29.dp).background(color, CircleShape))
            }
        }
    }
}

@Composable private fun NibMark(index: Int, modifier: Modifier) {
    Canvas(modifier) {
        val stroke = when (index) { 0 -> 11.dp.toPx(); 1 -> 2.5.dp.toPx(); 2 -> 4.dp.toPx(); 3 -> 9.dp.toPx(); else -> 1.dp.toPx() }
        val path = Path().apply {
            moveTo(0f, size.height * .55f)
            cubicTo(size.width * .27f, size.height * .35f, size.width * .7f, size.height * .45f, size.width, size.height * .55f)
        }
        drawPath(path, if (index == 2 || index == 3) muted else ink, style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

@Composable private fun Label(value: String) {
    Text(value, color = muted, fontFamily = AbcRomMono, fontSize = 10.sp, letterSpacing = 1.sp)
}
