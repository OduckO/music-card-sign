import type { MusicRequest, PlatformInput } from '../../types/index.js';
export interface PlatformRow extends PlatformInput {
    name: string;
    originalName?: string;
}
export declare const platformRows: (platforms: Record<string, PlatformInput>) => PlatformRow[];
export declare const platformsFromRows: (rows: PlatformRow[], previous?: Record<string, PlatformInput>) => Record<string, Partial<PlatformInput>>;
export declare const platformRowErrors: (row: PlatformRow, rows: PlatformRow[]) => {
    name: string;
    appid: string;
};
export interface MusicForm {
    mode: 'custom' | 'id';
    type: string;
    id: string;
    title: string;
    singer: string;
    url: string;
    audio: string;
    image: string;
    platform: string;
}
export declare const musicForm: (request: MusicRequest) => MusicForm;
export declare const musicFromForm: (form: MusicForm, previous?: MusicRequest) => MusicRequest;
export declare const musicFormErrors: (form: MusicForm) => Partial<Record<keyof MusicForm, string>>;
