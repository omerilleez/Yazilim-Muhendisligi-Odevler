package org.ortakakil.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import org.ortakakil.app.ui.OrtakAkilApp
import org.ortakakil.app.ui.theme.OrtakAkilTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OrtakAkilTheme {
                OrtakAkilApp()
            }
        }
    }
}
