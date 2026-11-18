package com.danilah.huegradients;
import android.os.Bundle;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;
/** The native content root is the single system/cutout-inset owner. */
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState){
    SplashScreen.installSplashScreen(this);registerPlugin(GameStoragePlugin.class);registerPlugin(HueSQLitePlugin.class);registerPlugin(HueFeedbackPlugin.class);super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
    WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).setAppearanceLightStatusBars(false);
    WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
    View content=findViewById(android.R.id.content);content.setBackgroundColor(0xff161323);
    ViewCompat.setOnApplyWindowInsetsListener(content,(view,insets)->{Insets safe=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());view.setPadding(safe.left,safe.top,safe.right,safe.bottom);return WindowInsetsCompat.CONSUMED;});ViewCompat.requestApplyInsets(content);
  }
}
