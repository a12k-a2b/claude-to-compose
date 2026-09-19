package com.claude.compose.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector

data class NavigationItemData(
    val title: String,
    val icon: ImageVector? = null,
    val route: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {}
) {
    TopAppBar(
        title = { Text(text = title) },
        navigationIcon = navigationIcon,
        actions = actions,
        modifier = modifier
    )
}

@Composable
fun AppNavigationBar(
    items: List<NavigationItemData>,
    selectedIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(modifier = modifier) {
        items.forEachIndexed { index, item ->
            NavigationBarItem(
                selected = selectedIndex == index,
                onClick = { onItemSelected(index) },
                label = { Text(item.title) },
                icon = {
                    if (item.icon != null) {
                        Icon(imageVector = item.icon, contentDescription = item.title)
                    }
                }
            )
        }
    }
}
