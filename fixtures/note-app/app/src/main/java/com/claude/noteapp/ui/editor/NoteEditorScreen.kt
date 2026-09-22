package com.claude.noteapp.ui.editor

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.claude.noteapp.presentation.NoteAppTestTags
import com.claude.noteapp.presentation.editor.NoteEditorAction
import com.claude.noteapp.presentation.editor.NoteEditorUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteEditorScreen(
    uiState: NoteEditorUiState,
    onAction: (NoteEditorAction) -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showAddTagDialog by remember { mutableStateOf(false) }
    var newTagText by remember { mutableStateOf("") }

    // Intercept Android hardware Back button / KeyEvent KEYCODE_BACK and dispatch to onNavigateBack
    BackHandler(enabled = true, onBack = onNavigateBack)

    LaunchedEffect(uiState.isDeleted) {
        if (uiState.isDeleted) {
            onNavigateBack()
        }
    }

    Scaffold(
        modifier = modifier.testTag(NoteAppTestTags.SCREEN_NOTE_EDITOR),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = when {
                            uiState.isSaving -> "Saving..."
                            uiState.lastSavedTimestamp > 0L -> "Saved"
                            else -> ""
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_STATUS_INDICATOR)
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_BACK_BUTTON)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back to notes list"
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { onAction(NoteEditorAction.OnTogglePin) },
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_PIN_BUTTON)
                    ) {
                        Icon(
                            imageVector = if (uiState.isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                            contentDescription = if (uiState.isPinned) "Unpin Note" else "Pin Note",
                            tint = if (uiState.isPinned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
                        )
                    }
                    if (!uiState.isNewNote) {
                        IconButton(
                            onClick = { onAction(NoteEditorAction.OnDeleteNote) },
                            modifier = Modifier.testTag(NoteAppTestTags.EDITOR_DELETE_BUTTON)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete Note",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            // Title Input
            TextField(
                value = uiState.title,
                onValueChange = { onAction(NoteEditorAction.OnTitleChanged(it)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(NoteAppTestTags.EDITOR_TITLE_INPUT),
                placeholder = {
                    Text("Title", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                },
                textStyle = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                ),
                singleLine = true
            )

            // Tags row
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .testTag(NoteAppTestTags.EDITOR_TAGS_ROW),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                items(uiState.tags) { tag ->
                    InputChip(
                        selected = true,
                        onClick = { onAction(NoteEditorAction.OnRemoveTag(tag)) },
                        label = { Text("#$tag") },
                        trailingIcon = {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Remove tag $tag",
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    )
                }
                item {
                    AssistChip(
                        onClick = { showAddTagDialog = true },
                        label = { Text("+ Tag") },
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_ADD_TAG_BUTTON)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Content Input
            TextField(
                value = uiState.content,
                onValueChange = { onAction(NoteEditorAction.OnContentChanged(it)) },
                modifier = Modifier
                    .fillMaxSize()
                    .testTag(NoteAppTestTags.EDITOR_CONTENT_INPUT),
                placeholder = { Text("Note content...") },
                textStyle = MaterialTheme.typography.bodyLarge,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                )
            )
        }

        if (showAddTagDialog) {
            AlertDialog(
                onDismissRequest = {
                    showAddTagDialog = false
                    newTagText = ""
                },
                title = { Text("Add Tag") },
                text = {
                    OutlinedTextField(
                        value = newTagText,
                        onValueChange = { newTagText = it },
                        label = { Text("Tag name") },
                        singleLine = true,
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_ADD_TAG_INPUT)
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            if (newTagText.isNotBlank()) {
                                onAction(NoteEditorAction.OnAddTag(newTagText.trim()))
                                newTagText = ""
                                showAddTagDialog = false
                            }
                        }
                    ) {
                        Text("Add")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            showAddTagDialog = false
                            newTagText = ""
                        }
                    ) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}
