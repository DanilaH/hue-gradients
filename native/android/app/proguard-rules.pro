# The application namespace owns its native bridge. SDKs need their own verified rules.
-keep @com.getcapacitor.annotation.CapacitorPlugin class com.danilah.huegradients.** { @com.getcapacitor.PluginMethod public <methods>; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepclassmembers class com.danilah.huegradients.** { @com.getcapacitor.annotation.ActivityCallback <methods>; }
-keepattributes SourceFile,LineNumberTable,*Annotation*
