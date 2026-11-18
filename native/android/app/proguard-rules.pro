# The application namespace owns its native bridge. SDKs need their own verified rules.
-keep @com.getcapacitor.annotation.CapacitorPlugin class com.danilah.huegradients.** { @com.getcapacitor.PluginMethod public <methods>; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes SourceFile,LineNumberTable,*Annotation*
