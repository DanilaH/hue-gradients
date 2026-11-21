import { registerPlugin } from '@capacitor/core';
import type { Haptic } from '../game/feedback';
const plugin = registerPlugin<{ pulse(options: { win: boolean }): Promise<void> }>('HueFeedback');
export const nativeHaptic: Haptic = cue => { void plugin.pulse({ win: cue === 'win' }).catch(() => {}); };
