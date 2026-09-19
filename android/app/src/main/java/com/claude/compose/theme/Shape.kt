package com.claude.compose.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val ClaudeShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(48.dp),
    large = RoundedCornerShape(100.dp),
    extraLarge = CircleShape
)

val CardShape = RoundedCornerShape(48.dp)
val PillShape = CircleShape
