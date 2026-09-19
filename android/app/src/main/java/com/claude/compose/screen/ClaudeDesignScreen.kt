package com.claude.compose.screen

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.claude.compose.components.*
import com.claude.compose.icons.*
import com.claude.compose.motion.*
import com.claude.compose.theme.*

@Composable
fun ClaudeDesignScreen(
    modifier: Modifier = Modifier
) {
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }

    Scaffold(modifier = modifier) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Start,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "@sarah_design",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Start,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AppIconButton(
                                onClick = { /* Icon Action */ }
                            ) {
                                Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null)
                            }
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Start,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = ClaudeIcons.Icon1Icon,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(24.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.Top,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "142",
                                    style = MaterialTheme.typography.titleLarge
                                )
                                Text(
                                    text = "Posts",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.Top,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "24.5k",
                                    style = MaterialTheme.typography.titleLarge
                                )
                                Text(
                                    text = "Followers",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.Top,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "618",
                                    style = MaterialTheme.typography.titleLarge
                                )
                                Text(
                                    text = "Following",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Start,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Sarah Chen",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Text(
                            text = "Design Lead & Mobile Architect. Exploring the frontiers of Compose & Generative UI 🎨✨",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = "sarahchen.design",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    PrimaryActionButton(
                        text = "Action",
                        onClick = { /* Action */ },
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Start,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AppIconButton(
                            onClick = { /* Icon Action */ }
                        ) {
                            Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null)
                        }
                        AppIconButton(
                            onClick = { /* Icon Action */ }
                        ) {
                            Icon(imageVector = ClaudeIcons.Icon1Icon, contentDescription = null)
                        }
                    }
                }
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    horizontalAlignment = Alignment.Start
                ) {
                    AppCard(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            AppCard(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        text = "Sarah Chen",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = "2h ago",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }
                            Text(
                                text = "Just shipped the new design token system! Moving from Figma to Compose Material 3 in under 10 seconds. Here is a sneak peek at the typography and elevation tokens in action.",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(20.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
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
                }
            }

        }
    }
}
