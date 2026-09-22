package fixture.app

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable

class MainActivity : ComponentActivity()
class NotAScreen(val host: android.app.Activity)
class NotAView(val child: android.view.View)

data class EditorUiState(val title: String = "")
sealed interface EditorAction

@Composable
fun NoteScreen() = Unit

@Composable
fun TinyPreview() = Unit

object NestedDeclarations {
  @Composable
  fun NestedPhantom() = Unit
}

// @Composable fun CommentPhantom() = Unit
val phantom = "@Composable fun StringPhantom() = Unit"
