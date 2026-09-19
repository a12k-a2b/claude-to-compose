package com.claude.compose.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.claude.compose.components.*
import com.claude.compose.icons.*
import com.claude.compose.motion.*
import com.claude.compose.theme.*

@Composable
fun Da63DesignScreen(
    modifier: Modifier = Modifier
) {
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }
    var isBannerVisible by rememberSaveable { mutableStateOf(true) }
    val animatedCardElevation by animateDpAsState(
        targetValue = if (selectedTabIndex == 0) 4.dp else 1.dp,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "cardElevation"
    )
    val animatedTabColor by animateColorAsState(
        targetValue = if (selectedTabIndex == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
        animationSpec = tween(durationMillis = 300),
        label = "tabColor"
    )

    Scaffold(modifier = modifier) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {
            AnimatedVisibility(
                visible = isBannerVisible,
                enter = fadeIn(animationSpec = tween(300)) + expandVertically(),
                exit = fadeOut(animationSpec = tween(225)) + shrinkVertically()
            ) {
                AppCard(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                onClick = { isBannerVisible = false }
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Live Workspace Active — Tap to dismiss",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    StatusBadge(text = "Active")
                }
            }
            }

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.Top,
                horizontalAlignment = Alignment.Start
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.Top,
                    horizontalAlignment = Alignment.Start
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.Top,
                        horizontalAlignment = Alignment.Start
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.Top,
                            horizontalAlignment = Alignment.Start
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.Top,
                                horizontalAlignment = Alignment.Start
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(start = 64.dp, top = 150.dp, end = 64.dp, bottom = 30.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "The Meridian",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        horizontalArrangement = Arrangement.spacedBy(32.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "World",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "Cities",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "Climate",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "Ideas",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                    }
                                }
                                Column(
                                    modifier = Modifier.fillMaxWidth().padding(start = 72.dp, top = 48.dp, end = 72.dp),
                                    verticalArrangement = Arrangement.Top,
                                    horizontalAlignment = Alignment.Start
                                ) {
                                    Text(
                                        text = "Climate · 9 min read",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = "The quiet economics of planting a city forest",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalArrangement = Arrangement.Top,
                                        horizontalAlignment = Alignment.Start
                                    ) {
                                        Text(
                                            text = "For a century the ledger of a growing city was written in concrete and asphalt, materials that hold the day's heat long after the sun has gone. The new arithmetic is greener, and stranger. A maturing street tree returns far more than its planting cost in cooling, drainage and slowed traffic — a fact the accountants took a decade to trust.",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "Planners in three coastal cities now treat the canopy as infrastructure, mapped and budgeted like a bridge. The result is a slower construction, measured in seasons rather than quarters, and a skyline that softens at its edges.",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "What surprised them was not the shade but the water. A single mature plane can intercept thousands of litres of stormwater a year, water the drains no longer have to carry, and a pilot block dropped four degrees against its neighbours last July.",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "The maintenance crews doubled as the budget line moved from parks to public works, and the forest, once an ornament, became a system with a return.",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                    }
                                }
                            }
                            Icon(
                                imageVector = ClaudeIcons.Icon1Icon,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(20.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                AppCard(
                                    modifier = Modifier.weight(1f).padding(4.dp),
                                    onClick = { /* Card Action */ }
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                    }
                                }
                                AppCard(
                                    modifier = Modifier.weight(1f).padding(4.dp),
                                    onClick = { /* Card Action */ }
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        AppIconButton(
                                            onClick = { /* Icon Action */ }
                                        ) {
                                            Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                        }
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        AppIconButton(
                                            onClick = { /* Icon Action */ }
                                        ) {
                                            Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                        }
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                    }
                                }
                                AppCard(
                                    modifier = Modifier.weight(1f).padding(4.dp),
                                    onClick = { /* Card Action */ }
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                        PrimaryActionButton(
                                            text = "Action",
                                            onClick = { /* Action */ },
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                    }
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 26.dp, vertical = 14.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(
                                    verticalArrangement = Arrangement.Top,
                                    horizontalAlignment = Alignment.Start
                                ) {
                                    Text(
                                        text = "Annotate",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                                Text(
                                    text = "·",
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Column(
                                    verticalArrangement = Arrangement.Top,
                                    horizontalAlignment = Alignment.Start
                                ) {
                                    Text(
                                        text = "79%",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 10.dp, end = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = ClaudeIcons.Icon1Icon,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Made with Claude Design",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    AppIconButton(
                        onClick = { /* Icon Action */ }
                    ) {
                        Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }

        }
    }
}
