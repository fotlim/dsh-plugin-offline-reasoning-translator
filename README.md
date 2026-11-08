# dsh-plugin-offline-reasoning-translator

把 DSH 会话里模型**思考中的英文**在**本地**翻成中文——不发网络请求、不上传任何文本。

## 它解决什么

DSH 的思考区（reasoning / Think 行）默认展示模型原文。英文思考对中文读者是阅读负担，而官方的 `cot-translation` 是**联网**机器翻译（Bing / Google / DeepSeek 账号），需要外发文本、要网络、按请求付费或匿名受限。

这个插件用一条 **OPUS-MT en→zh INT8 ONNX** 模型（首次使用时下载，约 108 MiB），在 Host 进程的 **worker 线程**里做推理：

- **离线**：模型随插件分发，运行时 `allowRemoteModels=false`，全程不出本机。
- **低占用**：INT8 权重 ~108 MiB，单 worker 峰值 RSS ~557 MB（Phase 0 实测）。worker **按需启动**——从不展开思考的会话既不加载模型、也不占用内存；插件卸载时先等在途原生推理调用排空再终止 worker。
- **不卡 UI**：ONNX 推理是同步原生调用（实测单次占住事件循环 130–212 ms），因此全部放进 `worker_threads`，主线程事件循环不受影响。
- **可取消**：每次翻译带 `AbortSignal`，思考内容增长或折叠时丢弃在途结果。

## 行为

- 思考正文按空行分段；已闭合的段落立刻送翻，未闭合的尾巴保留原文，闭合并翻译后再替换——不会出现"半句被翻"的跳动。
- **送进模型的永远是句子，不是整段**（按 `. ! ?` 与换行切句，超长句再在空白处切成 ≤320 字符的片段，`e.g.`/`i.e.`/版本号/点分路径不算句末）。这是实测必须项：量化 Marian 遇到整段输入会进入复读循环，逐句翻译则干净。
- **已经是中文的句子不会被送去翻译**（`lib/language.js` 的 `needsTranslation`）。模型是单向 en→zh，喂中文进去出来的是噪声（真实故障：一个中文段落被翻成 `?~ ~.~.~7****` 和错乱的日期）。判定逐句做：汉字数 ≥ 拉丁词数 ×2 视为「本来就是中文」，原样保留；纯符号/纯数字/只有占位符的片段也跳过。好处是纯中文思考**连 worker 都不启动**（实测 20 ms、0 次解码），混排段落里只有英文句子会被翻。
- **复读防护**：译文还原占位符前先检测退化（同字符连跑 >12、短单元重复 ≥6 次、长单元重复 ≥3 次、长度超原文 4 倍），命中就丢弃该句译文、**保留英文原文**并计入 `stats.degraded`——宁可显示原文，也不显示 `皮尔斯皮尔斯皮尔斯…`。
- `=====`、`////` 这类装饰性符号串整体掩码：模型对它们会无界重复。
- 代码块、行内代码、URL、文件路径、`@` 引用先做占位符掩码，翻完原样还原（8B 级模型直译这些会毁掉内容）。
- 术语两层处理：**标识符层**（约 70 个命令行/格式/ML 词汇，如 `grep`、`BLEU`、`tokenizer`、`JSON`）用占位符保护，保证原样输出；**概念层**（约 50 条实测观察到的误译，如「边缘情况→边界情况」「工人线→工作线程」「输油管→流水线」）在中文侧修正。全量术语掩码实测**更差**（3 个以上占位符会让模型整句重排），因此只保护标识符。
- 后处理清掉模型多吐的空格与引号（汉字间空格、全角标点前空格、英文词外多余引号），并把中文语境里的半角标点补成全角（`，。？！`）。
- 译文与原文一键切换；翻译失败保留原文并提供「重试」。
- Host 侧 LRU（5000 条）按 `sha256(targetLanguage + modelId + 修正开关 + 术语表 + text)` 缓存；重复的思考片段零成本。

## 自动纠错与文本矫正

三层，全部是确定性规则（纯正则/字符串操作，**不额外跑一次模型**，因此不增加延迟）：

1. **译前：源文本矫正**（`lib/normalize.js`）
   - 解硬折行：模型自己的思考经常在 80 列处硬折行。按「前行无句末标点 + 尾部是字母/逗号/左括号 + 后行以小写字母开头」合并成一句；行尾 `-` 视为断词直接拼接。不合并列表项、标题、引用、表格、代码围栏。
   - 清零宽字符 / BOM / 软连字符 / NBSP、全角空格；全角拉丁字母数字折回 ASCII；智能引号折回直引号；`…`→`...`、`–—`→`-`。
   - 折叠行内重复空格、连续空行。
2. **译中：结构保护**（`lib/mask.js`）
   - 占位符用 `[0]` 方形括号形式。实测五种写法各 5 句：`[0]` **5/5** 原样返回，`<0>` 2/5，`#0#` 1/5，`<<0>>` 与 `{{0}}` 0/5（模型会把尖括号/花括号拆散）。还原时兼容三种回归写法，并检测残缺 token。
   - 所有跨度规则（代码围栏、行内代码、URL、路径、`@` 引用、`arr[0]` 字面下标、`=====`/`////` 装饰符串）**合成一条正则单趟替换**。串行替换会让后一条规则吃掉前一条刚生成的占位符（`arr[0]` 规则曾把 `npm test` 的 `[0]` 又掩码一次，正文露出 `[0]`）。
   - 标识符按**结构**掩码（不只是查词表）：SCREAMING_SNAKE、3 段以上 snake/kebab、`-node`/`-js`/`-cli`/`-wasm` 等后缀的两段 kebab、点分成员访问、camelCase、`--flag`。这解决了 `onnxruntime-node`→`onxruntime-node`、`DSH_OFFLINE_TRANSLATOR_MODEL_ROOT`→`DSH_ OFFFLINE_MODEL_...` 这类走样；上限 3 个槽位，超过就退回词表保护。
   - 切句器不会切进代码跨度或未闭合括号（`protectedMask`），否则 `map.get(key)!` 会被按 `.` 切成两半、前半当散文翻译。
3. **译后：质量判定 + 一次重试**（`lib/quality.js`）
   - `assess()` 判定五类问题：退化复读、空输出、未翻译回显（源里英文词 ≥6 且汉字 ≤2）、过短（源 >15 词却只有 <5 个汉字）、占位符残缺。
   - 首次不合格 → 用更严的生成参数重试**一次**（`repetition_penalty` 1.15→1.35、`no_repeat_ngram_size` 4→2），仍不合格才放弃该句并保留英文原文。命中的句子才付重试成本，正常句子零额外开销。
   - `stats` 区分 `degraded`（最终放弃）与 `retries`（重试过但救回）与 `fragments`（逐句调用次数）。

## 质量回归集

`scripts/eval/corpus.jsonl` 有 100 句真实技术英文思考文本（散文 50 / 标识符 15 / 代码 15 / 列表 10 / 混合 10），带 `category` 与 `must` 期望（必须原样保留的术语）。`node scripts/eval/run.mjs --label=xxx` 走完整管线（含缓存、切句、掩码、矫正、重试），输出 `results/eval-xxx.json` 与并排对照的 `.md`。

同一台机、q8 模型、逐版本实测：

| 版本 | 术语命中 | 最终放弃 | 重试 | 残英文词 | 中位 | p95 | RSS |
|---|---|---|---|---|---|---|---|
| v1 基线 | 4/7 | 0 | 0 | 25 | 674 ms | 1073 ms | 518 MB |
| v2 +结构标识符 | 5/7 | 0 | 0 | 26 | 625 ms | 961 ms | 555 MB |
| v3 +切句保护 | 7/7 | **5** | 0 | 89 | 669 ms | 988 ms | 541 MB |
| v4 +残缺重试 | 7/7 | 4 | 4 | 76 | 665 ms | 1141 ms | 545 MB |
| v5 `[n]` 占位 | 2/7 | 0 | 0 | 17 | 684 ms | 1022 ms | 546 MB |
| **v6 单趟掩码** | **7/7** | **0** | **0** | **24** | **679 ms** | 1320 ms | 553 MB |

结论：术语命中 4/7 → **7/7**、退化 → **0**，中位耗时只涨 0.7%（多数句子不触发重试）；p95 上升来自少数双占位符长句。冷启动 1376 ms（含模型加载）。

## 左侧栏面板

左侧栏图标栏会多一个「离线翻译」按钮（`sidebar.panellist`，order 30），点开是独立中央面板（`main`，key `offline-translation`）。面板就是本插件的设置页：切换/下载/删除模型、编辑术语表、开关误译修正，改完保存立即生效，不用重启。

两个 slot 必须成对注册：侧栏按钮的 `id` 与 `main` 的 `key` 同值。只注册侧栏会得到「点不开的按钮」，只注册 `main` 会得到「打不开的面板」（`layout.selectPanel` 会校验 `hasMainPanel`）。面板在收起态（56px rail）下只显示图标。

界面用一张注入式样式表（`<style data-plugin-css="dsh-plugin-offline-reasoning-translator/panel.css">`，按属性去重、可重复挂载）而不是内联 `style` 对象——内联样式写不出 hover / focus / 进度条布局。所有颜色都取自官方主题 token（`--dsw-alias-*`），因此跟随明暗主题；模型卡片、行内徽章、进度条与设置表单在两个入口（侧栏面板、插件页）复用同一组件，外观一致。

## 设置面板（插件页）

同一份设置也可以在 **设置 → 插件 → 离线思考翻译** 的插件页里改，两处读写同一份数据：

- **模型管理**：三档可选（q8 约 108 MiB / fp16 约 213 MiB 未实测 / fp32 约 425 MiB，精度最高、单句实测 341 ms），首次使用前需要下载一次；下载支持断点续传、SHA-256 校验、官方/镜像双端点回退；除当前正在用的那一档外都可删除以回收空间。权重不随 npm 包分发（包本体只有几十 KB），所以换机器/换 profile 不会重复占体积。
- **术语表**：`term=译法` 每行一条，只写 `term` 则原样保护该词不翻译。
- **误译修开关**：关闭后不做中文侧概念修正（默认开启）。

配置项 schema 由 `@deepseek-ai/schemastery` 声明（zod 声明 Config 会让插件静默加载失败）。

改动会写进插件目录下的 `models/settings.json`（原子写：先写 `.tmp` 再 rename），不依赖你去编辑 profile 的组合文件。生效优先级：`settings.json` > loader 传入的 Config > 模型目录清单里的默认值。换模型或改术语表会同时清空翻译缓存（缓存 key 含 modelId / 术语表 / 修正开关）。

## 安装

```bash
dsh plugin --profile web add <npm 包名>
```

或从源码目录：

```bash
dsh plugin --profile web add github:owner/repo
```

装好后在 **设置 → 插件** 里启用 `离线思考翻译`。**首次使用前下载模型**：点左侧栏的「离线翻译」图标 → 在模型卡片上点「下载」（q8 约 108 MiB，走官方源失败会自动切镜像，可断点续传）。没下载时思考区不会瞎翻，只会提示「模型还没下载」。

插件通过 `conversation.chat.reasoning.body` slot 以 `priority: 50` 承接思考正文渲染（官方 entry 为 100，数值小者生效），并复用官方 `conversation.chat.reasoning.content` factory 渲染 Markdown，因此代码块高亮、折叠策略、复制按钮等行为保持一致。

## 实测数据（Phase 0，本机 Ryzen 7 3700X / Node 24.21）

| 变体 | 磁盘 | 冷启 | 单句中位 | 峰值 RSS |
|---|---|---|---|---|
| **q8（默认）** | 108 MiB | 1114 ms | **493 ms** | **557 MB** |
| int8 | 113 MiB | 1782 ms | 605 ms | 560 MB |
| fp32 | 446 MiB | 2658 ms | 341 ms | 1052 MB |
| q8 + WebGPU | 108 MiB | 1955 ms | 974 ms | 456 MB |

batched 推理实测**退化**（4 句出现复读、8 句全部劣化），因此实现为单句串行 + 缓存，不批处理。

## 集成验证（本机 desktop profile，实测）

| 检查项 | 结果 |
|---|---|
| Host 服务注册 / `remoteMethods` 标记 | ✅ namespace `offlineReasoningTranslator`，方法 `translate`、`status`、`models`、`download`、`removeModel`、`settings`、`saveSettings` |
| 浏览器 bundle 发布 | ✅ 组合 URL 200，`len=17212`，有 `rev` 指纹 |
| `ctx.remote.$mount()` | ✅ 通过客户端网关校验（strict codec + `typeSymbol` + `create()`） |
| Slot 抢占 | ✅ `{priority: 50, active: true}` 生效，官方 `{priority: 100}` 被置 `active: false` |
| 插件页配置入口 | ✅ `plugins.bundle.config` 占位 key `dsh-plugin-offline-reasoning-translator`；Host Config status `schema` |
| 左侧栏入口 | ✅ `sidebar.panellist` `{id: "offline-translation", order: 30}` + `main` `{key: "offline-translation"}` 成对生效 |
| 面板设置读写 | ✅ `settings()` 返回 `{modelId:"opus-mt-en-zh-q8", glossary:"", repair:true, variants:3}`；`saveSettings` 写入后读回一致，变更即时生效 |
| 拒绝安装未下载的模型 | ✅ `offlineReasoningTranslator/model-not-installed` |
| 首次翻译（含 worker 冷启 + 模型加载） | 1910 ms（单句，含按句切分） |
| 同句缓存命中 | 0 ms |
| 整段 vs 逐句（24s 思考片段） | 整段 8244 ms 且会复读；逐句 5206 ms、4 片段、0 次退化 |
| 取消（AbortSignal） | ✅ 保留原文并标记 aborted |
| 卸载排空 | ✅ drain 219 ms 后 terminate，未触发 `STATUS_STACK_BUFFER_OVERRUN` |

### 七个会让整条插件静默降级或静默失效的坑（已修，已加回归测试）

1. **Remote 方法名不能与 namespace service 成员重名**。客户端网关把方法装到 `RemoteNamespaceService` 实例上，`assertMethodAvailable` 会拒绝 `ctx`/`empty`/`invokeRemote`/`methods`/`name`/`namespace`/`install`/`installDirect`/`installScoped`/`remove`/`has`/`assertMethodAvailable` 这些已有成员。最初把删除模型的方法命名为 `remove`，整个 `$mount` 抛错、插件退化到 `priority: 49` 的降级渲染，但错误只在浏览器控制台里。现改名 `removeModel`，并在 `scripts/client-test.mjs` 里加了保留名断言。
2. **Config 必须用 `@deepseek-ai/schemastery` 声明**，用 zod 会让 `ctx.plugin()` 静默失败（fiber 状态异常、无 error 上报）。
3. **量化 NMT 不能喂整段**（v0.3 踩过）。一段 1200 字符的思考送进去，出来是 `皮尔斯皮尔斯皮尔斯…`、`造人造人造人…`、`==========` 这种复读循环；同一文本逐句翻译则完全正常。修法是切句 + 退化检测，不是调 `repetition_penalty`（试过，只能推迟复发）。
4. **零参 Remote 方法必须一个实参都不传**（v0.4 踩过）。网关按 spec 里声明的参数个数校验实参，`models()` 传 `{}` 会得到 `client api: offlineReasoningTranslator/models expected 0 business argument(s) plus an optional AbortSignal, got 2`。调用层分 `callPlain`（无参）与 `callInput`（1 参）两路，并在 `scripts/client-test.mjs` 里加 `ARITY` 断言。
5. **`.volatile()` 字段读出来不是值，是 holder**（v0.4 踩过，最隐蔽）。`schemastery` 把 volatile 字段包成冻结对象 `{ get() }`，直接读 `config.glossary` 得到 `{}`、`typeof x === 'string'` 全失败，设置项静默不生效。要用 `readField(value, fallback)` 先 `typeof value?.get === 'function'` 再 `.get()`。
6. **主题 token 写错不会报错，只会不生效**（v0.5 踩过）。`var(--dsw-alias-border-l4)`、`var(--dsw-alias-label-tertiary)`、`var(--dsw-radius-md)` 这类名字谁都不拦你，但它们在主题里不存在——CSS 变量解析失败让整条声明在计算值阶段作废，于是边框消失、次要文字继承了主色，看起来「没样式」。官方只有 14 个 `--dsw-alias-*` token（含 `border-l1`/`border-l2`/`bg-layer-1`/`bg-layer-2`/`brand-primary`/`label-secondary`/`state-*-primary`）。`scripts/client-test.mjs` 现在会把样式表里出现的每个 token 与白名单比对，写错直接测试失败。
7. **掩码规则不能串行跑**（v0.6 踩过）。每条规则替换完就产出占位符 `[0]`，后一条规则若能匹配这个形状（如保护源码字面下标 `arr[0]` 的 `/\[\d+\]/`），就会把占位符当成源码再掩一次——`slots` 里多出一个 `"[0]"`，正文最终露出 `[0]` 而丢失真正的内容。修法是把全部跨度规则合成**一条**正则单趟替换，规则之间互不可见；同时占位符形状从 `<<0>>` 换成 `[0]`（实测 5/5 原样返回，尖括号写法 0/5）。

环境：Windows 10.0.26300、Ryzen 7 3700X、Node 24.21.0（DSH Electron 44.7.0，ABI 149）。

## 已知限制（如实）

- **术语**：标识符层已用掩码 + 概念层修正覆盖约 120 条，但自然语言里的技术表达仍可能走样（模型只有 ~77M 参数）。术语表只能补词，不能解决语法级误译。
- **单向下模型**：只做 en→zh。中文句子原样保留（见上），所以混排思考里中文不会被「再翻一遍」，但也不会被润色。
- **速度**：本地单句约 0.5 s，比云端慢；价值在离线、不外传、确定性与可缓存。换 fp32 可降到约 0.34 s，代价是内存翻倍。
- **可选模型有限**：`models.json` 目前只列 en→zh 的三个量化档（q8/fp16/fp32），其中只有 q8 与 fp32 实测过；fp16 未实测。
- **目标语言固定**：客户端请求固定 `targetLanguage: 'zh'`，配置里没有语言选项（与官方 cot-translation 的 provider 选择不同，本地只有这一条 en→zh 模型）。
- **平台**：`onnxruntime-node` 官方 prebuild 覆盖 win32/darwin/linux × x64/arm64；Windows + Electron 44.7（Node 24.21 / ABI 149）已实测可用。

## 许可证

插件代码 Apache-2.0。权重来自 [Helsinki-NLP/opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh)（Apache-2.0），ONNX 转换来自 [Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh)，下载后存放在 `~/.dsh-offline-reasoning-translator/models`（可用 `DSH_OFFLINE_TRANSLATOR_MODEL_ROOT` 改）。运行时依赖 `@huggingface/transformers`（Apache-2.0）与 `onnxruntime-node`（MIT）。
