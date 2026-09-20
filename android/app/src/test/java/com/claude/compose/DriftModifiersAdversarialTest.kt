package com.claude.compose

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.claude.compose.theme.BaseLineHeightStyle
import com.claude.compose.theme.BasePlatformTextStyle
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DriftModifiersAdversarialTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun testOffsetModifierSyntaxAndRendering() {
        composeTestRule.setContent {
            Box(
                modifier = Modifier
                    .offset(x = (-10).dp, y = 5.dp)
                    .offset(x = 1000.5.dp, y = (-2500.25).dp)
                    .offset(x = 0.dp, y = 0.dp)
            ) {
                Text("Offset Test")
            }
        }
        composeTestRule.waitForIdle()
    }

    @Test
    fun testArrangementSpacedBySyntaxAndRendering() {
        composeTestRule.setContent {
            Column(
                verticalArrangement = Arrangement.spacedBy((-4).dp)
            ) {
                Text("Item 1")
                Text("Item 2")
            }
        }
        composeTestRule.waitForIdle()
    }

    @Test
    fun testPositivePaddingAndSizeRendering() {
        composeTestRule.setContent {
            Box(
                modifier = Modifier
                    .padding(start = 20.dp, top = 15.dp)
                    .size(width = 100.dp, height = 50.dp)
                    .width(140.dp)
                    .height(30.dp)
            ) {
                Text("Positive Padding & Size")
            }
        }
        composeTestRule.waitForIdle()
    }

    @Test
    fun testNegativePaddingRendering() {
        // Test whether Modifier.padding accepts negative values at layout time in Compose
        var error: Throwable? = null
        try {
            composeTestRule.setContent {
                Box(
                    modifier = Modifier.padding(start = (-20).dp, top = (-15).dp)
                ) {
                    Text("Negative Padding")
                }
            }
            composeTestRule.waitForIdle()
        } catch (t: Throwable) {
            error = t
        }
        println("Negative padding runtime error: $error")
    }

    @Test
    fun testNegativeWidthRendering() {
        // Test whether Modifier.width accepts negative values at layout time in Compose
        var error: Throwable? = null
        try {
            composeTestRule.setContent {
                Box(
                    modifier = Modifier.width((-20).dp)
                ) {
                    Text("Negative Width")
                }
            }
            composeTestRule.waitForIdle()
        } catch (t: Throwable) {
            error = t
        }
        println("Negative width runtime error: $error")
    }

    @Test
    fun testTextStyleSyntaxAndRendering() {
        composeTestRule.setContent {
            Text(
                text = "Typography Test",
                style = TextStyle(
                    fontSize = 58.sp,
                    lineHeight = 63.8.sp,
                    letterSpacing = (-2.61).sp,
                    platformStyle = BasePlatformTextStyle,
                    lineHeightStyle = BaseLineHeightStyle
                )
            )
        }
        composeTestRule.waitForIdle()
    }
}
