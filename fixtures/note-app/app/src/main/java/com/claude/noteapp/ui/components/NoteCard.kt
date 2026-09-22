package com.claude.noteapp.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.presentation.NoteAppTestTags
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun NoteCard(
    note: NoteEntity,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("${NoteAppTestTags.NOTE_CARD_PREFIX}${note.id}")
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = note.title.ifBlank { "Untitled" },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("${NoteAppTestTags.NOTE_CARD_TITLE_PREFIX}${note.id}")
                )
                IconButton(
                    onClick = onTogglePin,
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("${NoteAppTestTags.NOTE_CARD_PIN_PREFIX}${note.id}")
                ) {
                    Icon(
                        imageVector = if (note.isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                        contentDescription = if (note.isPinned) "Unpin Note" else "Pin Note",
                        tint = if (note.isPinned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
                    )
                }
            }

            if (note.content.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = note.content,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("${NoteAppTestTags.NOTE_CARD_CONTENT_PREFIX}${note.id}")
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(note.timestamp)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                if (note.tags.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        note.tags.take(3).forEach { tag ->
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = MaterialTheme.colorScheme.surface,
                                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline)
                            ) {
                                Text(
                                    text = "#$tag",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
