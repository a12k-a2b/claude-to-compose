package com.claude.compose.motion

import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween

object MotionTokens {
    const val DurationShort1: Int = 50
    const val DurationShort2: Int = 100
    const val DurationMedium1: Int = 200
    const val DurationMedium2: Int = 250
    const val DurationLong1: Int = 300
    const val DurationLong2: Int = 400

    val EasingStandard = FastOutSlowInEasing
    val EasingLinear = LinearEasing
    val EasingIn = FastOutLinearInEasing
    val EasingOut = LinearOutSlowInEasing

    fun <T> defaultSpring() = spring<T>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow
    )

    fun <T> standardTween(durationMillis: Int = DurationMedium2) = tween<T>(
        durationMillis = durationMillis,
        easing = EasingStandard
    )
}
