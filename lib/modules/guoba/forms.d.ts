import type { Schemas } from 'trss-yunzai/guoba';
import type { Config } from '../../types/index.js';
import { type MusicForm, type PlatformRow } from '../music-card-sign/config-form.js';
export type FormConfig = Omit<Config, 'platforms' | 'testMusic' | 'timeoutMs'> & {
    timeoutSeconds: number;
    platforms: string;
    testMusic: string;
    platformEntries: PlatformRow[];
    testSong: MusicForm;
    targetFriend: Array<string | number>;
};
export declare const editorSchemas: (platformOptions: Array<{
    label: string;
    value: string;
}>) => Schemas<FormConfig>;
export declare const applyFormData: (data: Record<string, unknown>, previous: Config) => {
    [x: string]: unknown;
};
