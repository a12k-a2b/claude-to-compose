package com.claude.compose.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val ClaudeShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(24.dp),
    large = RoundedCornerShape(42.dp),
    extraLarge = CircleShape
)

val CardShape = RoundedCornerShape(24.dp)
val PillShape = CircleShape
