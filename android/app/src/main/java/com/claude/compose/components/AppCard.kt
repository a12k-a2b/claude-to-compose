package com.claude.compose.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Material 3 Card component with support for interactive clicks, native ripples,
 * and animated pressed elevation feedback.
 */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    elevation: Dp = 2.dp,
    pressedElevation: Dp = 6.dp,
    shape: RoundedCornerShape = RoundedCornerShape(12.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val animatedElevation by animateDpAsState(
        targetValue = if (isPressed && onClick != null) pressedElevation else elevation,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "cardElevation"
    )

    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier
                .fillMaxWidth()
                .minimumInteractiveComponentSize(),
            shape = shape,
            elevation = CardDefaults.cardElevation(
                defaultElevation = animatedElevation,
                pressedElevation = pressedElevation
            ),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface
            ),
            interactionSource = interactionSource,
            content = content
        )
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            elevation = CardDefaults.cardElevation(defaultElevation = elevation),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface
            ),
            content = content
        )
    }
}

/**
 * MetricCard displaying a KPI metric with title, value, optional badge, and interactive click ripple.
 */
@Composable
fun MetricCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    badgeText: String? = null,
    onClick: (() -> Unit)? = null
) {
    AppCard(
        modifier = modifier,
        onClick = onClick,
        elevation = 2.dp,
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (badgeText != null) {
                StatusBadge(
                    text = badgeText,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}
