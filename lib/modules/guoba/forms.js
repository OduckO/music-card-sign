import { musicFormErrors, musicFromForm, musicSourceOptions, platformRowErrors, platformsFromRows } from '../music-card-sign/config-form.js';
export const editorSchemas = (platformOptions) => [
    {
        field: 'platformEntries',
        label: '自定义平台',
        component: 'GSubForm',
        bottomHelpMessage: '添加或编辑平台。平台名称用于引用；应用信息固定为 appid、appname、appsign，后两项选填。',
        componentProps: {
            multiple: true,
            modalProps: { title: '编辑自定义平台' },
            schemas: [
                { field: 'originalName', label: '原平台名称', component: 'Input', ifShow: false },
                { field: 'name', label: '平台名称', component: 'Input', required: true },
                {
                    field: 'appid',
                    label: '应用 ID · appid',
                    component: 'InputNumber',
                    required: true,
                    componentProps: { min: 1, precision: 0 }
                },
                {
                    field: 'appname',
                    label: '包名 · appname',
                    component: 'Input',
                    bottomHelpMessage: '选填，留空不写入 JSON。'
                },
                {
                    field: 'appsign',
                    label: '签名 · appsign',
                    component: 'Input',
                    bottomHelpMessage: '选填，留空不写入 JSON。'
                }
            ]
        }
    },
    {
        field: 'platforms',
        label: '平台 JSON',
        component: 'InputTextArea',
        bottomHelpMessage: '保存后更新，可选中复制。',
        componentProps: { rows: 6, readonly: true }
    },
    // 直接绑定字段，避开锅巴 Next 单条 GSubForm 的双向 watch 循环。
    { component: 'Divider', label: '测试歌曲' },
    {
        field: 'testSong.mode',
        label: '填写方式',
        component: 'RadioGroup',
        required: true,
        componentProps: {
            options: [
                { label: '歌曲信息', value: 'custom' },
                { label: '歌曲 ID', value: 'id' }
            ]
        }
    },
    { component: 'Divider', label: '歌曲信息模式' },
    {
        field: 'testSong.title',
        label: '歌曲名称 · title',
        component: 'Input',
        bottomHelpMessage: '歌曲信息模式必填。'
    },
    {
        field: 'testSong.url',
        label: '跳转链接 · url',
        component: 'Input',
        bottomHelpMessage: '歌曲信息模式必填，HTTP(S) 地址。'
    },
    {
        field: 'testSong.singer',
        label: '歌手 · singer',
        component: 'Input',
        bottomHelpMessage: '选填，留空不写入 JSON。'
    },
    {
        field: 'testSong.audio',
        label: '音频链接 · audio',
        component: 'Input',
        bottomHelpMessage: '选填，留空不写入 JSON。'
    },
    {
        field: 'testSong.image',
        label: '封面链接 · image',
        component: 'Input',
        bottomHelpMessage: '选填，留空不写入 JSON。'
    },
    { component: 'Divider', label: '歌曲 ID 模式' },
    {
        field: 'testSong.type',
        label: '查询来源 · type',
        component: 'AutoComplete',
        bottomHelpMessage: 'ID 模式必填，可选内置来源或输入其他插件注册的来源名称。',
        componentProps: {
            options: musicSourceOptions,
            placeholder: '选择内置来源或输入扩展来源'
        }
    },
    {
        field: 'testSong.id',
        label: '歌曲 ID · id',
        component: 'Input',
        bottomHelpMessage: 'ID 模式必填。'
    },
    { component: 'Divider', label: '签名平台' },
    {
        field: 'testSong.platform',
        label: '强制平台 · _platform',
        component: 'AutoComplete',
        bottomHelpMessage: '留空自动识别；填写内置或自定义平台名称。__inline__ 表示保留已配置的扩展平台对象。',
        componentProps: { options: platformOptions }
    },
    {
        field: 'testMusic',
        label: '测试歌曲 JSON',
        component: 'InputTextArea',
        bottomHelpMessage: '保存后更新。供 #音之测测 与请求页载入，可选中复制。',
        componentProps: { rows: 8, readonly: true }
    }
];
export const applyFormData = (data, previous) => {
    const { platformEntries, testSong: nestedSong, timeoutSeconds, ...settings } = data;
    if (timeoutSeconds !== undefined) {
        if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds))
            throw new Error('回传超时请填写秒数');
        settings.timeoutMs = Math.round(timeoutSeconds * 1000);
    }
    // 普通锅巴提交点号字段，Next 提交嵌套对象。
    const songFields = Object.keys(settings).filter((key) => key.startsWith('testSong.'));
    const testSong = songFields.length
        ? Object.fromEntries(songFields.map((key) => {
            const value = settings[key];
            delete settings[key];
            return [key.slice('testSong.'.length), value];
        }))
        : nestedSong;
    if (platformEntries !== undefined) {
        if (!Array.isArray(platformEntries))
            throw new Error('自定义平台必须为列表');
        const rows = platformEntries.map((row) => {
            if (!row || typeof row !== 'object' || Array.isArray(row))
                throw new Error('自定义平台必须逐项填写');
            const value = row;
            if (typeof value.name !== 'string' ||
                (typeof value.appid !== 'string' && typeof value.appid !== 'number'))
                throw new Error('请填写平台名称与 appid');
            for (const key of ['originalName', 'appname', 'appsign']) {
                if (value[key] !== undefined && typeof value[key] !== 'string')
                    throw new Error(`平台 ${value.name} 的 ${key} 必须为文本`);
            }
            return value;
        });
        for (const row of rows) {
            const error = Object.values(platformRowErrors(row, rows)).find(Boolean);
            if (error)
                throw new Error(error);
        }
        settings.platforms = platformsFromRows(rows, previous.platforms);
    }
    if (testSong !== undefined) {
        if (!testSong || typeof testSong !== 'object' || Array.isArray(testSong))
            throw new Error('请逐项填写测试歌曲');
        const value = testSong;
        if (value.mode !== 'custom' && value.mode !== 'id')
            throw new Error('请选择测试歌曲填写方式');
        const form = {
            mode: value.mode,
            type: '',
            id: '',
            title: '',
            singer: '',
            url: '',
            audio: '',
            image: '',
            platform: ''
        };
        for (const key of [
            'type',
            'id',
            'title',
            'singer',
            'url',
            'audio',
            'image',
            'platform'
        ]) {
            if (value[key] !== undefined && typeof value[key] !== 'string')
                throw new Error(`测试歌曲 ${key} 必须为文本`);
            form[key] = value[key] ?? '';
        }
        const error = Object.values(musicFormErrors(form)).find(Boolean);
        if (error)
            throw new Error(error);
        settings.testMusic = musicFromForm(form, previous.testMusic);
    }
    return settings;
};
