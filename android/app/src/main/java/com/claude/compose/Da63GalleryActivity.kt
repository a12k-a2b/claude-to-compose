package com.claude.compose

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.claude.compose.screen.Da63GalleryScreen
import com.claude.compose.screen.E34fGalleryScreen

class Da63GalleryActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            var design by rememberSaveable { mutableStateOf("da63") }
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.background(Color(0xFF171717)).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("da63" to "Floating overlay", "e34f" to "Exploration gallery").forEach { (id, label) ->
                        Text(label, Modifier.background(if (design == id) Color.White else Color(0xFF404040))
                            .clickable { design = id }
                            .padding(horizontal = 14.dp, vertical = 9.dp)
                            .semantics { contentDescription = "$label design"; selected = design == id },
                            color = if (design == id) Color.Black else Color.White)
                    }
                }
                if (design == "da63") Da63GalleryScreen(Modifier.weight(1f))
                else E34fGalleryScreen(Modifier.weight(1f))
            }
        }
    }
}
