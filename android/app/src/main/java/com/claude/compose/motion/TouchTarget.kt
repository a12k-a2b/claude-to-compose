package com.claude.compose.motion

import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Material 3 Touch Target Compliance utilities guaranteeing minimum 48dp bounding box.
 */
val MinimumTouchTargetSize: Dp = 48.dp

/**
 * Enforces Material 3 recommended 48dp minimum interactive component size.
 */
fun Modifier.enforceTouchTarget(): Modifier = this.minimumInteractiveComponentSize()

/**
 * Enforces explicit minimum interactive bounding box of 48dp x 48dp.
 */
fun Modifier.touchTargetSize(): Modifier = this.sizeIn(
    minWidth = MinimumTouchTargetSize,
    minHeight = MinimumTouchTargetSize
)
