package com.claude.noteapp.ui.list

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.claude.noteapp.presentation.NoteAppTestTags
import com.claude.noteapp.presentation.list.NotesListAction
import com.claude.noteapp.presentation.list.NotesListUiState
import com.claude.noteapp.ui.components.NoteCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesListScreen(
    uiState: NotesListUiState,
    onAction: (NotesListAction) -> Unit,
    onNavigateToEditor: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier.testTag(NoteAppTestTags.SCREEN_NOTES_LIST),
        topBar = {
            TopAppBar(
                title = { Text("Notes", fontWeight = FontWeight.Bold) }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { onNavigateToEditor(0L) },
                modifier = Modifier.testTag(NoteAppTestTags.ADD_NOTE_FAB)
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Add Note")
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Search Input
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { onAction(NotesListAction.OnSearchQueryChanged(it)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag(NoteAppTestTags.SEARCH_INPUT),
                placeholder = { Text("Search notes...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(
                            onClick = { onAction(NotesListAction.OnClearSearch) },
                            modifier = Modifier.testTag(NoteAppTestTags.SEARCH_CLEAR_BUTTON)
                        ) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                singleLine = true
            )

            // Tag Filters
            if (uiState.availableTags.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .testTag(NoteAppTestTags.TAG_FILTER_ROW),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(uiState.availableTags) { tag ->
                        FilterChip(
                            selected = uiState.selectedTagFilter == tag,
                            onClick = { onAction(NotesListAction.OnTagFilterSelected(tag)) },
                            label = { Text("#$tag") },
                            modifier = Modifier.testTag("${NoteAppTestTags.TAG_FILTER_CHIP_PREFIX}$tag")
                        )
                    }
                }
            }

            // Body: Empty State or Notes List
            if (uiState.isEmpty) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag(NoteAppTestTags.EMPTY_STATE_VIEW),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.padding(32.dp)
                    ) {
                        Text(
                            text = "No notes found",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (uiState.searchQuery.isNotEmpty()) "Try a different search query." else "Tap the + button to create your first note.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp)
                        .testTag(NoteAppTestTags.NOTES_CONTAINER),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    if (uiState.pinnedNotes.isNotEmpty()) {
                        item {
                            Text(
                                text = "PINNED",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        }
                        items(uiState.pinnedNotes, key = { it.id }) { note ->
                            NoteCard(
                                note = note,
                                onClick = { onNavigateToEditor(note.id) },
                                onTogglePin = { onAction(NotesListAction.OnTogglePin(note.id, note.isPinned)) }
                            )
                        }
                    }

                    if (uiState.otherNotes.isNotEmpty()) {
                        if (uiState.pinnedNotes.isNotEmpty()) {
                            item {
                                Text(
                                    text = "OTHERS",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.secondary,
                                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
                                )
                            }
                        }
                        items(uiState.otherNotes, key = { it.id }) { note ->
                            NoteCard(
                                note = note,
                                onClick = { onNavigateToEditor(note.id) },
                                onTogglePin = { onAction(NotesListAction.OnTogglePin(note.id, note.isPinned)) }
                            )
                        }
                    }
                }
            }
        }
    }
}
