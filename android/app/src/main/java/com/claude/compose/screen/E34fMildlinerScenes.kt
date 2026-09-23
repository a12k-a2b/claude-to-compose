package com.claude.compose.screen

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
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

/** Source screenshots are verified against gallery-packet-v3. IDs are DOM section IDs. */
data class E34fPinnedCapture(val sceneId: String, val landscapeSha256: String, val portraitSha256: String)
data class E34fPinnedFigure(val sceneId: String, val landscapeSha256: String, val portraitSha256: String)

const val E34F_MILDLINER_SOURCE_TEXT_SHA256 = "ed3c4347330f5e1b876ec08d62f50fef413924e5d4af1a235337a8af604f2d7d"
val E34F_MILDLINER_REFERENCE_CAPTURES = listOf(
    E34fPinnedCapture("m0", "29535b00b9ad05c3eded32951314e6defe846d811b24c59f6f2d577b8a7d36c8", "6170edd224ea781ed20859dec7502b1db78fbbefe976851cbde8acef17e6fbda"),
    E34fPinnedCapture("m1", "3c0eaf0561d0bc5dec833fc615e2a8045c3409ec283950d48d1741d5ea343ced", "e57586740cce9bf544c5a2eec4da712d2bf3a37107403e9aee4a5cdd0976f87e"),
    E34fPinnedCapture("m2", "3f600d7ead45c3ede63e6a2ac838f76e3d742331ddf0dc1d2f6c5896f0f4c9f5", "b01f27ee6370e26dab29b5cce8ab6e90ebc3213ccbadde898d4e9806a28be66c"),
    E34fPinnedCapture("m3", "eb79654de81a18c5a805054272b657d4a82d4b9a3a7c2c2c46128fbd2b332681", "1ef2e91564ac62ed3c53e90c696d38f811f9e25bbd87e3a10102feebfdc0f831"),
    E34fPinnedCapture("m4", "282e99d54baad82d1d186e82a427c82910dcdcb6fe996e6afd7c35cd1c32a892", "31caa54382e993be0482bfb6bd962e3ee307c523937f17dc9a10aee16d416ef5"),
    E34fPinnedCapture("presets", "86f396ec2f03ccc31665b0692ade1cc3523acc7d6ff8474effe7ca064cb833b3", "3565e5e2149ab55a370771b80dd3cc104ec88c2575cef2a9136ab50b822f4f83"),
    E34fPinnedCapture("cards", "4a4c4f1e1691a93ea2a858f2bdf1482337b1e22d89269c9b7652f8b5b17f9e89", "a3872301a31136256a8633b6a0252338bc575ac661792ac257f113e7e444f07c"),
    E34fPinnedCapture("snip", "b924c129e97844134b05ec8edc234e30606c909cbe612a5d120eebe881ea4596", "7056a7eb19823d1ded3358a572d80e7289efd8d1c1234d79dc316682d602f4f7"),
    E34fPinnedCapture("small", "5831469a4dd88ae90a896de7f6cbaf5a9d17f2d92c20ae3a83aa52936b7aeefc", "f1f9da2d1424895ba795e5c1bcba5afee4fca5adbfbd8c506db86776bf6ab35e"),
    E34fPinnedCapture("onboard", "fe517ccad5123acc5d56405fbb1bb70859e92dbf8b2519c300241445adfc8bed", "8b224912f727d5187fb9a92b67a707629cb8ab759f3c640e6d15f20f009005e2")
)

val E34F_MILDLINER_SCENE_IDS = E34F_MILDLINER_REFERENCE_CAPTURES.map { it.sceneId }
val E34F_MILDLINER_REFERENCE_FIGURES = listOf(
    E34fPinnedFigure("m1/figure-1", "faaad2ea2b274394f3fe2708c70c81c7ffe6dd494e4580e78a73e67a3bd676df", "726887c372394149fea0c65d2232f39daeef1c60cac5f6c9091b0d9af6a97cdf"),
    E34fPinnedFigure("m1/figure-2", "ab4573a6879b8bcf4b56ba39ca65803ce8a299c8c02f0cbd05e3ce69d8d37f0e", "6cd9de38dd098238213681762e329f99cb9dcdd0538d9ea65759a23aaf12e183"),
    E34fPinnedFigure("m4/figure-1", "64d4c87312978c615d37402983d44ec9e5d1bf7cd31bb7bc606049950f49b55a", "f650ac62d5b9dd358afe4f0cdca998da6d25456d3f65c61dde1a07fa65f70921"),
    E34fPinnedFigure("m4/figure-2", "1f44a52e59e89d9b0634b0ae3548e0d764369e2ce894719690aaa6d84ecdf43d", "b7fec4121f5846f0d759090d3917658d794f831e399e05b0ed8740a9f6f6e0f1"),
    E34fPinnedFigure("presets/figure-1", "6f176dc6581dc8fab692f4b4fe80e9819270e80b8a92caf1c8dea266774d200f", "4dd2b404bd1bb90384816d24bc1e99b3024ea82620940263b5c9b225d3b92bce")
)
val E34F_MILDLINER_FIGURE_COUNTS = mapOf("m1" to 2, "m4" to 2, "presets" to 1)

private val ML_PAPER = Color(0xFFF1F0EA)
private val ML_INK = Color(0xFF22221F)
private val ML_MUTED = Color(0xFF74736E)
private val ML_AMBER = Color(0xFFFFA000)
private val ML_NIGHT = Color(0xFF171816)
private val ML_NIGHT_CARD = Color(0xFF22231F)

/** Synthetic, self-contained UI study. It has no access to the real Note Overlay app or its data. */
@Composable
fun E34fMildlinerScenes(sceneId: String, figureIndex: Int = 1, modifier: Modifier = Modifier) {
    require(sceneId in E34F_MILDLINER_SCENE_IDS) { "Unknown e34f mildliner scene: $sceneId" }
    val figureCount = E34F_MILDLINER_FIGURE_COUNTS[sceneId] ?: 1
    require(figureIndex in 1..figureCount) { "Scene $sceneId has $figureCount source figures" }
    var night by rememberSaveable(sceneId, figureIndex) { mutableStateOf((sceneId == "m1" || sceneId == "m4") && figureIndex == 2) }
    var message by rememberSaveable(sceneId) { mutableStateOf("") }
    var highlights by rememberSaveable(sceneId) { mutableStateOf(listOf("canopy as infrastructure", "thousands of litres", "four degrees cooler", "water the drains no longer carry")) }
    val bg = if (night) ML_NIGHT else ML_PAPER
    val fg = if (night) Color(0xFFF0EFEA) else ML_INK
    Column(modifier.fillMaxSize().background(bg).verticalScroll(rememberScrollState()).padding(22.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(sceneId.uppercase(), color = ML_AMBER, fontFamily = AbcRomMono, fontSize = 12.sp)
            Spacer(Modifier.width(14.dp))
            Text(E34F_MILDLINER_REFERENCE_CAPTURES.first { it.sceneId == sceneId }.sceneId,
                color = fg, fontFamily = AbcArizonaFlare, fontSize = 24.sp, modifier = Modifier.weight(1f))
            Chip(if (night) "Night" else "Day", fg, bg) { night = !night }
        }
        Text(when (sceneId) {
            "m0" -> "Two siblings, tellable apart"
            "m1" -> "Both in the bar, over two worlds"
            "m2" -> "The mildliner card"
            "m3" -> "Notes counts → the Highlights list"
            "m4" -> "The jump flash"
            "presets" -> "The presets row"
            "cards" -> "Popup cards"
            "snip" -> "Snip selection chrome"
            "small" -> "Small things"
            else -> "Onboarding & settings"
        }, Modifier.padding(top = 10.dp, bottom = 18.dp), color = fg, fontFamily = AbcArizonaFlare, fontSize = 30.sp)
        when (sceneId) {
            "m0" -> MildlinerSiblings(fg, night) { message = it }
            "m1" -> MildlinerToolbar(fg, night, highlights.size, setMessage = { message = it }, onKeep = { item -> highlights = highlights + item; message = "Kept new synthetic highlight: $item" })
            "m2" -> MildlinerSizeCard(fg, night, message) { message = it }
            "m3" -> HighlightsList(fg, night, message) { message = it }
            "m4" -> JumpFlash(fg, night, message) { message = it }
            "presets" -> PresetRow(fg, night, message) { message = it }
            "cards" -> PopupCards(fg, night, message) { message = it }
            "snip" -> SnipControls(fg, night, message) { message = it }
            "small" -> SmallControls(fg, night, message) { message = it }
            "onboard" -> OnboardingSettings(fg, night, message) { message = it }
        }
        if (sceneId == "m1") Text("Highlights · ${highlights.size} · ${highlights.last()}",
            Modifier.padding(top = 10.dp).semantics { contentDescription = "Synthetic highlights count ${highlights.size}" },
            color = fg, fontFamily = AbcRomMono)
        if (message.isNotBlank()) Text(message, Modifier.padding(top = 16.dp).semantics {
            contentDescription = "Synthetic feedback: $message"
        }, color = if (night) ML_AMBER else ML_MUTED, fontFamily = AbcRomMono, fontSize = 13.sp)
        Text("SYNTHETIC GALLERY STUDY · NO REAL NOTES", Modifier.padding(top = 28.dp),
            color = ML_MUTED, fontFamily = AbcRomMono, fontSize = 10.sp)
    }
}

@Composable private fun MildlinerSiblings(fg: Color, night: Boolean, message: (String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf("Marker") }
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        listOf("Marker" to "Bold markup · a ringed band that draws the eye.",
            "Mildliner" to "A quiet wash, no ring — and it quietly keeps a highlight.").forEachIndexed { i, (title, detail) ->
            Card(night, Modifier.weight(1f)) {
                Text(if (i == 0) "▱" else "◩", color = fg, fontSize = 25.sp)
                Text(title, color = fg, fontFamily = AbcArizonaSans, fontSize = 20.sp, modifier = Modifier.padding(top = 12.dp))
                Text(detail, color = fg.copy(alpha = .72f), fontFamily = AbcArizonaSans, modifier = Modifier.padding(top = 8.dp))
                ClickText("Select $title", fg) { selected = title; message("$title selected") }
                Text(if (i == 0) "MARKER · RINGED" else "MILDLINER · NO RING", color = ML_AMBER,
                    fontFamily = AbcRomMono, fontSize = 10.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
    Text(if (selected == "Marker") "Planners treat the canopy as infrastructure, mapped and budgeted like a bridge."
        else "A mature plane can hold thousands of litres a year, unbanked.", color = fg, fontFamily = AbcArizonaFlare,
        fontSize = 22.sp, modifier = Modifier.padding(top = 24.dp).background(if (night) ML_NIGHT_CARD else Color(0xFFD8D8D4), RoundedCornerShape(4.dp)).padding(6.dp))
}

@Composable private fun MildlinerToolbar(fg: Color, night: Boolean, count: Int, setMessage: (String) -> Unit, onKeep: (String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf("Mildliner") }
    Card(night) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf("Pen", "Marker", "Mildliner", "Eraser").forEach { tool ->
                Chip(tool, fg, if (selected == tool) ML_AMBER.copy(alpha = .28f) else Color.Transparent, selected = selected == tool) {
                    selected = tool; setMessage("$tool selected · toolbar state changed")
                }
            }
        }
        Text("Field notes", color = fg, fontFamily = AbcArizonaSans, fontSize = 24.sp, modifier = Modifier.padding(top = 18.dp))
        Text("For a century the ledger of a growing city was written in concrete. The new arithmetic is greener: planners now treat the canopy as infrastructure.",
            color = fg, fontFamily = AbcArizonaFlare, fontSize = 21.sp, modifier = Modifier.padding(top = 14.dp))
        ClickText("Keep added to highlights", fg) { onKeep("Synthetic highlight ${count + 1}") }
    }
}

@Composable private fun MildlinerSizeCard(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var size by rememberSaveable { mutableIntStateOf(3) }
    var open by rememberSaveable { mutableStateOf(true) }
    if (!open) {
        ClickText("Open Mildliner settings", fg) { open = true }
        return
    }
    Card(night) {
        Text("◩  Mildliner", color = fg, fontFamily = AbcArizonaSans, fontSize = 22.sp)
        Text("SIZE · band width", color = ML_MUTED, fontFamily = AbcRomMono, fontSize = 11.sp, modifier = Modifier.padding(top = 20.dp))
        Row(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            (1..5).forEach { n ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { size = n; setMessage("Mildliner size $n selected") }.semantics { contentDescription = "Mildliner size $n"; selected = size == n }) {
                    Box(Modifier.width((8 + n * 7).dp).height((5 + n * 4).dp).background(if (size == n) ML_AMBER else ML_MUTED, RoundedCornerShape(20.dp)))
                    if (size == n) Text("⌑", color = fg, fontSize = 18.sp)
                }
            }
        }
        Text("Anything you mild-line is kept as a highlight.", color = fg, fontFamily = AbcArizonaSans)
        ClickText("Done", fg) { open = false; setMessage("Mildliner settings closed · selected width $size remains") }
    }
}

@Composable private fun HighlightsList(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var notebook by rememberSaveable { mutableStateOf("Field notes") }
    var firstRemoved by rememberSaveable { mutableStateOf(false) }
    val highlights = listOf("canopy as infrastructure", "thousands of litres", "four degrees cooler", "four degrees against its neighbours")
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(night, Modifier.weight(1f)) {
            Text("Notebooks", color = fg, fontFamily = AbcArizonaSans, fontSize = 20.sp)
            listOf("Field notes" to 4, "Reading marginalia" to 11, "Studio" to 7).forEach { (name, count) ->
                val visibleCount = if (name == "Field notes") highlights.size - if (firstRemoved) 1 else 0 else count
                ClickText("$name · $visibleCount highlights", fg) { notebook = name }
            }
        }
        Card(night, Modifier.weight(1.25f)) {
            Text("$notebook · highlights", color = fg, fontFamily = AbcArizonaSans, fontSize = 20.sp)
            val visibleItems = if (notebook == "Field notes") highlights.drop(if (firstRemoved) 1 else 0) else listOf("four degrees cooler", "canopy as infrastructure")
            visibleItems.forEach { item ->
                ClickText(item, fg) { setMessage("Selected highlight: $item") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf("Copy", "Source").forEach { action -> InlineAction(action, fg) { setMessage("BLOCKED · $action needs real selection/source integration") } }
                InlineAction("Remove", fg) { firstRemoved = true; setMessage("Removed synthetic highlight · ${highlights.size - 1} remain") }
            }
        }
    }
}

@Composable private fun JumpFlash(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var pulseSequence by rememberSaveable { mutableIntStateOf(0) }
    var pulseActive by rememberSaveable { mutableStateOf(false) }
    val amount = remember { Animatable(0f) }
    LaunchedEffect(pulseSequence) {
        if (pulseSequence > 0) {
            pulseActive = true
            repeat(2) {
                amount.animateTo(.34f, tween(300))
                amount.animateTo(0f, tween(300))
            }
            pulseActive = false
        }
    }
    fun pulse() { pulseSequence += 1; setMessage("Synthetic pulse started · source timing and scrolling remain BLOCKED") }
    val wash = ML_AMBER.copy(alpha = amount.value * .22f)
    Card(night) {
        Text("A single mature plane can intercept thousands of litres of stormwater a year, water the drains no longer have to carry, and a pilot block dropped four degrees against its neighbours last July.",
            color = fg, fontFamily = AbcArizonaFlare, fontSize = 23.sp)
        Surface(color = wash, shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, ML_AMBER.copy(alpha = amount.value)),
            modifier = Modifier.padding(top = 20.dp).fillMaxWidth().clickable { pulse() }
            .semantics { contentDescription = if (pulseActive) "Jump flash active" else "Jump flash inactive" }) {
            Text("four degrees against its neighbours", Modifier.padding(12.dp), color = fg, fontFamily = AbcArizonaSans)
        }
        ClickText("Pulse highlight", fg) { pulse() }
    }
}

@Composable private fun PresetRow(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var active by rememberSaveable { mutableIntStateOf(0) }
    Card(night) {
        Text("The mark itself · active preset", color = fg, fontFamily = AbcArizonaSans)
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("Ink", "Pencil", "Dashed").forEachIndexed { index, preset ->
                Chip(preset, fg, if (active == index) ML_AMBER else Color.Transparent, selected = active == index) {
                    active = index; setMessage("Preset $preset applied to synthetic selection")
                }
            }
        }
        Text("Tap switches presets; long-press reorder is not implemented in this study.", color = ML_MUTED, fontFamily = AbcArizonaSans, modifier = Modifier.padding(top = 15.dp))
    }
}

@Composable private fun PopupCards(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var size by rememberSaveable { mutableIntStateOf(3) }
    var shade by rememberSaveable { mutableIntStateOf(0) }
    var glass by rememberSaveable { mutableIntStateOf(79) }
    var peek by rememberSaveable { mutableStateOf(false) }
    var snapshots by rememberSaveable { mutableIntStateOf(0) }
    Card(night) {
        Text("Pen", color = fg, fontFamily = AbcArizonaSans, fontSize = 22.sp)
        Text("SIZE", color = ML_MUTED, fontFamily = AbcRomMono, modifier = Modifier.padding(top = 12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(13.dp), modifier = Modifier.padding(vertical = 12.dp)) {
            (1..5).forEach { n -> PopupChoice("Pen size $n", size == n, fg, if (size == n) ML_AMBER else fg.copy(alpha = .55f)) {
                size = n; setMessage("Synthetic pen size $n selected")
            } }
        }
        Text("SHADE", color = ML_MUTED, fontFamily = AbcRomMono)
        Row(horizontalArrangement = Arrangement.spacedBy(13.dp), modifier = Modifier.padding(top = 10.dp)) {
            val shades = listOf(Color(0xFF111111), Color(0xFF666666), Color(0xFFAAAAAA))
            shades.forEachIndexed { n, color -> PopupChoice("Pen shade ${n + 1}", shade == n, fg, color) {
                shade = n; setMessage("Synthetic pen shade ${n + 1} selected")
            } }
        }
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InlineAction("Glass $glass%", fg) { glass = when (glass) { 79 -> 0; 0 -> 100; else -> 79 }; setMessage("Synthetic glass opacity $glass percent") }
            InlineAction(if (peek) "Hide below" else "Peek below", fg) { peek = !peek; setMessage(if (peek) "Synthetic page peek shown" else "Synthetic page peek hidden") }
            InlineAction("Snap PNG", fg) { snapshots += 1; setMessage("Synthetic capture $snapshots · no image file written") }
        }
        Text("Underlying page ${when { peek -> "peeked through"; glass == 0 -> "fully clear"; glass == 100 -> "covered by opaque paper"; else -> "visible through $glass% glass" }}",
            Modifier.padding(top = 9.dp).semantics { contentDescription = "Synthetic underlying page state" }, color = fg, fontFamily = AbcArizonaSans)
        if (snapshots > 0) Text("Synthetic capture $snapshots · no image file written", color = ML_MUTED, fontFamily = AbcRomMono,
            modifier = Modifier.semantics { contentDescription = "Synthetic capture count $snapshots; no file written" })
    }
}

@Composable private fun PopupChoice(id: String, active: Boolean, foreground: Color, fill: Color, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clip(CircleShape).border(if (active) 2.dp else 1.dp, if (active) ML_AMBER else foreground.copy(alpha = .4f), CircleShape)
        .clickable(onClick = onClick).semantics { contentDescription = id; selected = active }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(18.dp).clip(CircleShape).background(fill))
        if (active) Text("✓", color = if (fill.luminance() < .5f) Color.White else ML_INK, fontSize = 10.sp)
    }
}

@Composable private fun SnipControls(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var kind by rememberSaveable { mutableStateOf("Ink") }
    var selected by rememberSaveable { mutableStateOf(false) }
    Card(night) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { Chip(kind, fg, ML_AMBER) { kind = if (kind == "Ink") "Pencil" else "Ink"; setMessage("Snip style changed to $kind") } }
        Text("Notebooks", color = fg, fontFamily = AbcArizonaSans, fontSize = 21.sp, modifier = Modifier.padding(top = 30.dp))
        listOf("Field notes", "Reading marginalia", "Studio").forEach { ClickText(it, fg) { selected = !selected; setMessage(if (selected) "Synthetic notebook selected" else "Selection cleared") } }
        Text("Selection handles, rotation, resizing, and source attribution require native geometry work; this study shows only the chrome.",
            Modifier.padding(top = 20.dp), color = ML_MUTED, fontFamily = AbcArizonaSans)
        Text(if (selected) "Selected · $kind" else "No snip selected", color = ML_AMBER, fontFamily = AbcRomMono, modifier = Modifier.padding(top = 14.dp))
    }
}

@Composable private fun SmallControls(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var page by rememberSaveable { mutableIntStateOf(2) }
    var armed by rememberSaveable { mutableStateOf(false) }
    var cleared by rememberSaveable { mutableStateOf(false) }
    Card(night) {
        Text("PAGE PILL", color = ML_MUTED, fontFamily = AbcRomMono)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 12.dp)) {
            InlineAction("‹", fg) { page = (page - 1).coerceAtLeast(1) }
            Text("$page of 5", color = fg, fontFamily = AbcArizonaSans, modifier = Modifier.semantics { contentDescription = "Synthetic page $page of 5" })
            InlineAction("›", fg) { page = (page + 1).coerceAtMost(5) }
        }
        ClickText(if (armed) "Tap again to clear" else "Clear page", fg) {
            if (armed) { cleared = true; armed = false; setMessage("Synthetic page cleared · undo available") }
            else { armed = true; setMessage("Clear armed · confirmation required") }
        }
        Text(if (cleared) "Page cleared · synthetic canvas is empty" else "Synthetic page contains ink",
            Modifier.padding(top = 12.dp).semantics { contentDescription = if (cleared) "Synthetic page empty" else "Synthetic page contains ink" },
            color = fg, fontFamily = AbcArizonaSans)
        if (cleared) ClickText("Undo clear", fg) { cleared = false; setMessage("Synthetic page restored") }
        Text("Snip saved to Field notes · Field notes.pdf exported", color = ML_MUTED, fontFamily = AbcArizonaSans, modifier = Modifier.padding(top = 12.dp))
    }
}

@Composable private fun OnboardingSettings(fg: Color, night: Boolean, message: String, setMessage: (String) -> Unit) {
    var page by rememberSaveable { mutableIntStateOf(1) }
    var look by rememberSaveable { mutableStateOf(true) }
    var penOnly by rememberSaveable { mutableStateOf(true) }
    Card(night) {
        Text("Note Overlay", color = fg, fontFamily = AbcArizonaFlare, fontSize = 28.sp)
        Text(if (page == 1) "Overlay is ready · Learn the top button" else "The calm resin is on · Tune how it writes",
            color = fg, fontFamily = AbcArizonaSans, modifier = Modifier.padding(top = 14.dp))
        ClickText("Daylight look · ${if (look) "on" else "off"}", fg) { look = !look; setMessage("Daylight look ${if (look) "enabled" else "disabled"}") }
        ClickText("Pen only · ${if (penOnly) "on" else "off"}", fg) { penOnly = !penOnly; setMessage("Pen only ${if (penOnly) "enabled" else "disabled"}") }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 20.dp)) {
            InlineAction("Back", fg) { page = (page - 1).coerceAtLeast(1) }
            InlineAction(if (page == 1) "Next" else "Got it", fg) { page = if (page == 1) 2 else 1; setMessage("Synthetic setup page changed to $page") }
        }
        Text("Account setup, device permission, button teaching, and persisted settings are not connected.",
            Modifier.padding(top = 18.dp), color = ML_MUTED, fontFamily = AbcArizonaSans)
    }
}

@Composable private fun Card(night: Boolean, modifier: Modifier = Modifier, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Surface(modifier = modifier, color = if (night) ML_NIGHT_CARD else Color(0xFFFFFEFC),
        shape = RoundedCornerShape(22.dp), border = BorderStroke(1.dp, if (night) Color(0xFF383A34) else Color(0xFFE4E2DC)),
        shadowElevation = if (night) 0.dp else 2.dp) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp), content = content)
    }
}

@Composable private fun Chip(text: String, fg: Color, color: Color, selected: Boolean = false, onClick: () -> Unit) {
    Surface(color = color, shape = CircleShape, border = BorderStroke(1.dp, if (selected) ML_AMBER else fg.copy(alpha = .2f)),
        modifier = Modifier.clickable(onClick = onClick).semantics { if (selected) this.selected = true }) {
        Text(text, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = fg, fontFamily = AbcArizonaSans, fontSize = 13.sp)
    }
}

@Composable private fun ClickText(text: String, color: Color = ML_INK, onClick: () -> Unit) {
    Text(text, Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 9.dp)
        .semantics { contentDescription = text }, color = color, fontFamily = AbcArizonaSans, fontSize = 15.sp,
        maxLines = 2, overflow = TextOverflow.Ellipsis)
}

@Composable private fun InlineAction(text: String, color: Color, onClick: () -> Unit) {
    Surface(color = color.copy(alpha = .07f), shape = CircleShape, border = BorderStroke(1.dp, color.copy(alpha = .18f)),
        modifier = Modifier.clickable(onClick = onClick).semantics { contentDescription = text }) {
        Text(text, Modifier.padding(horizontal = 13.dp, vertical = 8.dp), color = color, fontFamily = AbcArizonaSans, fontSize = 14.sp)
    }
}
