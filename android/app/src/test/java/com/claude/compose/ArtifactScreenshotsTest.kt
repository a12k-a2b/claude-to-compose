package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import com.claude.compose.screen.Da63DesignScreen
import com.claude.compose.screen.E34fDesignScreen
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ArtifactScreenshotsTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    @Config(
        sdk = [34],
        qualifiers = "w1440dp-h860dp-xhdpi"
    )
    fun renderDa63Preview() {
        composeTestRule.setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFFD97757),
                    background = Color(0xFFFFFFFF),
                    onBackground = Color(0xFF1A1A1A),
                    surface = Color(0xFFE5E5E5),
                    onSurface = Color(0xFF1A1A1A)
                )
            ) {
                Da63DesignScreen()
            }
        }

        composeTestRule.waitForIdle()

        val bitmap: Bitmap = try {
            composeTestRule.onRoot().captureToImage().asAndroidBitmap()
        } catch (t: Throwable) {
            captureComposeViewViaSkia(2880, 1720)
        }

        println("Da63 captured bitmap dimensions: ${bitmap.width} x ${bitmap.height}")

        val targetFile = File("../../output/test_da63/rendered_compose.png")
        targetFile.parentFile?.mkdirs()
        FileOutputStream(targetFile).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        }
        assertTrue("Da63 rendered screenshot must exist", targetFile.exists() && targetFile.length() > 0)
    }

    @Test
    @Config(
        sdk = [34],
        qualifiers = "w1440dp-h860dp-xhdpi"
    )
    fun renderE34fPreview() {
        composeTestRule.setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFFFF9D00),
                    background = Color(0xFFFAF4F2),
                    onBackground = Color(0xFF1A1A1A),
                    surface = Color(0xFFFFFFFF),
                    onSurface = Color(0xFF1A1A1A)
                )
            ) {
                E34fDesignScreen()
            }
        }

        composeTestRule.waitForIdle()

        val bitmap: Bitmap = try {
            composeTestRule.onRoot().captureToImage().asAndroidBitmap()
        } catch (t: Throwable) {
            captureComposeViewViaSkia(2880, 1720)
        }

        println("E34f captured bitmap dimensions: ${bitmap.width} x ${bitmap.height}")

        val targetFile = File("../../output/test_e34f/rendered_compose.png")
        targetFile.parentFile?.mkdirs()
        FileOutputStream(targetFile).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        }
        assertTrue("E34f rendered screenshot must exist", targetFile.exists() && targetFile.length() > 0)
    }

    private fun captureComposeViewViaSkia(width: Int, height: Int): Bitmap {
        val activity = composeTestRule.activity
        val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)

        rootLayout.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        rootLayout.layout(0, 0, width, height)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.WHITE)
        rootLayout.draw(canvas)
        return bitmap
    }
}
