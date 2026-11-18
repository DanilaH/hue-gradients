import type { CapacitorConfig } from '@capacitor/cli';
import project from './android-project.json' with {type:'json'};
const config: CapacitorConfig = {
  appId: project.appId, appName: project.appName, webDir: 'dist', backgroundColor: '#f4f6fa',
  android: { path: 'native/android', webContentsDebuggingEnabled: false, allowMixedContent: false },
  loggingBehavior: 'debug',
  // Native root owns all system/cutout insets. Never add the same CSS env padding.
  plugins: { SystemBars: { style: 'LIGHT', insetsHandling: 'disable' } },
};
export default config;
