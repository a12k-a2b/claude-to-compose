plugins { id("com.android.application") }
android {
  namespace = "fixture.app"
  buildTypes {
    debug { isMinifyEnabled = false }
  }
}
