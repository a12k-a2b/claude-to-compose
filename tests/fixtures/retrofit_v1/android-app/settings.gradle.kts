pluginManagement { repositories { gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS) }
rootProject.name = "RetrofitFixture"
include(":app", ":feature:notes")
// include(":comment-is-not-a-module")
val fake = "include(\":string-is-not-a-module\")"
