# eval correction-v1

- model: `opus-mt-en-zh-q8`
- items: 100 (cold 1574 ms, median 674 ms, p95 1073 ms)
- identifier hits: 4/7
- degraded: 0, retried: 0, errors: 0, empty: 0
- residual English words: 25

| id | ms | deg | retry | han | res | en | zh |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p01 | 648 |  |  | 22 | 0 | The parser fails on the second pass because the token stream is not reset between documents. | 第二遍解析器失败，因为符号流没有在文档之间重置。 |
| p02 | 710 |  |  | 23 | 0 | I need to check whether the cache returns a stale entry after the model is switched. | 我需要检查缓存是否返回了模型转换后的一个缓存项。 |
| p03 | 610 |  |  | 18 | 0 | This is an edge case where the worker exits before the drain loop observes the outstanding call. | 工人在排水管观察未完成的电话时，就离开。 |
| p04 | 647 |  |  | 22 | 0 | The race condition only appears when two requests arrive within the same millisecond. | 只有在两个请求在相同秒内提出时，才出现竞态条件。 |
| p05 | 758 |  |  | 25 | 0 | Reading the whole file into memory is wasteful here, since we only need the first hundred lines. | 将整个文件读入记忆中是浪费的，因为我们只需要第一百行。 |
| p06 | 530 |  |  | 21 | 0 | The pipeline stalls because the previous stage never signals that it is finished. | 管道的拖延是因为前一阶段从未表明它已经完成。 |
| p07 | 546 |  |  | 24 | 0 | Every fragment is translated on its own, so the model never sees the sentence that came before. | 每个碎片都是自己翻译的所以模型从未看到之前的判决 |
| p08 | 492 |  |  | 18 | 0 | If the endpoint refuses the range request, the download has to start over from the beginning. | 如果终点拒绝范围请求，下载必须从头开始。 |
| p09 | 586 |  |  | 22 | 0 | The settings file is written through a temporary file so a partial write cannot be read back. | 设置文件通过临时文件写入，所以部分写作无法读取。 |
| p10 | 614 |  |  | 24 | 0 | I should verify that the checksum matches before moving the file into place. | 我应该在把文件移到原地之前核实核对和匹配是否吻合 |
| p11 | 712 |  |  | 31 | 0 | The decoder repeats the same clause until the token budget runs out, which means the output is unusable. | 解码器重复同样的条款，直到象征性预算用完为止，这意味着输出无法使用。 |
| p12 | 744 |  |  | 25 | 0 | Because the native call is synchronous, every inference blocks the event loop for about two hundred milliseconds. | 因为本地电话同步，每一个推论都将事件循环绕阻断约200毫秒。 |
| p13 | 783 |  |  | 31 | 0 | The user asked for a sidebar entry, so the panel has to be registered under two slots that share one identifier. | 用户要求侧边栏条目，因此面板必须在共享一个识别符的两个空位下注册。 |
| p14 | 967 |  |  | 34 | 0 | Registering only the icon leaves a button that cannot be opened, and registering only the panel leaves a panel nothing can reach. | 只注册图标，留下一个无法打开的按钮，而只登记面板，却看不到任何可触及的面板。 |
| p15 | 824 |  |  | 28 | 0 | The default bundle cannot be removed because the plugin ships with those weights and has nothing else to fall back to. | 无法删除默认的捆包，因为有这些重量且没有其它可返回的插件船。 |
| p16 | 797 |  |  | 28 | 0 | Switching precision rebuilds the worker, because the old weights would otherwise stay resident. | 精确转换可以重建工人，因为如果旧的重量不变，他们就会留在原地。 |
| p17 | 802 |  |  | 22 | 0 | A long sentence is cut into pieces of roughly one hundred and eighty characters before it is sent to the model. | 长刑期在送交模型前，被切割成大约一百八十个字块。 |
| p18 | 902 |  |  | 26 | 0 | Abbreviations such as e.g. and i.e. must not be treated as the end of a sentence. | 诸如例如，以及不得将缩写如字和即不得作为句子的结尾处理。 |
| p19 | 905 |  |  | 27 | 0 | The guard recognises a loop by looking for a short substring that repeats many times in a row. | 警卫通过寻找一个短小的子字符串，连续重复很多次来识别环形。 |
| p20 | 842 |  |  | 26 | 0 | When the guard fires, the English sentence is shown instead, since a visible loop is worse than untranslated text. | 当防火时，将用英文句表示，因为可见环比未翻译的文字更糟糕。 |
| p21 | 669 |  |  | 22 | 0 | The retry uses a stricter repetition penalty and forbids even two-token repeats. | 重试使用更严格的重复处罚，甚至禁止两吨重的重复。 |
| p22 | 931 |  |  | 28 | 0 | Measured on the same sample, the whole paragraph took about eight seconds and looped, while sentence by sentence took five. | 在同一样本中，整个段落用大约8秒钟的时间绕圈，而按刑期判刑为5秒。 |
| p23 | 774 |  |  | 32 | 0 | Nothing in this path writes to the session log, so a translation can never change what the model actually said. | 此路径中没有任何东西写入会话日志，因此翻译无法改变模型实际所说的话。 |
| p24 | 837 |  |  | 33 | 0 | The cache key includes the model identifier and the glossary, otherwise an edited term would keep serving the old rendering. | 缓存键包括示范识别符号和词汇表，否则经过编辑的术语将一直用于旧的拼写。 |
| p25 | 630 |  |  | 25 | 0 | Short answers are not judged on length, because a two-word reply is legitimately shorter than its source. | 短期答复不按长度来判断，因为两字的答复比其来源合理短。 |
| p26 | 665 |  |  | 32 | 0 | The style element is looked up by a data attribute, so a hot reload replaces the rules instead of appending a second copy. | 样式元素由数据属性向上查找，因此热重装入取代规则而不是附加第二副本。 |
| p27 | 620 |  |  | 27 | 0 | Colours come from theme variables, and a variable that does not exist silently disables the whole declaration. | 颜色来自主题变量，而一个不存在的变量会静默地禁用整个声明。 |
| p28 | 738 |  |  | 30 | 0 | The panel reads and writes the same settings file as the plugin page, so both surfaces stay consistent. | 面板读取并写入与插件页面相同的设置文件，所以两个表面都保持一致。 |
| p29 | 578 |  |  | 25 | 0 | A zero-argument method must be called with no arguments at all, because the gateway checks the argument count. | 零参数方法必须完全没有争论，因为网关检查了论点的计算。 |
| p30 | 656 |  |  | 28 | 0 | The field is volatile, which means reading it returns a holder rather than the value itself. | 字段是挥发性的，这意味着读取它返回一个持有者而不是数值本身。 |
| p31 | 645 |  |  | 28 | 0 | I want to confirm the memory footprint stays flat across a hundred sentences before claiming the plugin is cheap. | 我要确认记忆足迹保持平坦超过一百个句子在声称插件便宜之前 |
| p32 | 581 |  |  | 21 | 0 | The model loads in about one second from disk and answers the first sentence in half a second after that. | 模型从磁盘上载约一秒钟，然后半秒后回答第一句。 |
| p33 | 822 |  |  | 31 | 0 | More threads did not help, and the graphics card was slower than the processor for a model this small. | 更多的线条没有帮助，而图形卡比处理器慢，用于这个小模型的处理器更慢。 |
| p34 | 755 |  |  | 30 | 0 | Batching two sentences gave no speedup, and batching four produced repeated clauses in the output. | 将两句加在一起，没有加快速度，而四批归并产生输出中反复出现的条款。 |
| p35 | 702 |  |  | 27 | 0 | The downloader falls back to the mirror because the primary endpoint fails every request from this machine. | 下载器回到镜子里因为主端点无法满足这台机器的每一项要求 |
| p36 | 813 |  |  | 31 | 0 | Progress is reported per byte, and the panel polls the status method twice a second while a transfer runs. | 据报，每个字节都有进展，小组调查了现状方法，每次两次，转调时间为第二次。 |
| p37 | 537 |  |  | 22 | 0 | An interrupted download resumes from where it stopped instead of starting over. | 中断的下载回执从停止的地方开始，而不是重新开始。 |
| p38 | 702 |  |  | 27 | 0 | The identifier is masked before translation, so the model cannot translate a command name into a Chinese word. | 翻译前先掩码身份识别符号，因此模型无法将命令名翻译成中文。 |
| p39 | 926 |  |  | 38 | 0 | Masking every technical term made the output worse, because three placeholders in one sentence make the model reorder clauses. | 掩盖每个技术术语使产出恶化，因为一个句子中的3个占位符使得示范重订条款变得更糟糕。 |
| p40 | 550 |  |  | 21 | 0 | Concept repairs run on the Chinese side and only fix renderings that were actually observed to be wrong. | 概念修复在中方进行，只修补实际发现的错误图案。 |
| p41 | 642 |  |  | 21 | 0 | The glossary accepts one term per line, and an equals sign pins a specific rendering. | 词汇表接受每行一个术语，而等号则标出具体拼写。 |
| p42 | 649 |  |  | 31 | 0 | The worker is spawned on the first sentence that needs translation, so a session that never expands its reasoning pays nothing. | 工人的产卵是第一句需要翻译，所以一个从来不扩大推理的届会一无所获。 |
| p43 | 406 |  |  | 14 | 0 | Teardown waits for the outstanding native call to finish, because terminating the thread mid-inference crashes the process. | 终结中推论断线会破坏整个过程。 |
| p44 | 531 |  |  | 20 | 0 | The request is refused when the model is configured but its weights are not on disk. | 当模型配置时，请求被拒绝，但其重量不在磁盘上。 |
| p45 | 626 |  |  | 26 | 0 | I would rather keep the English sentence than show a translation that reads like a rendering bug. | 我宁愿保留英语句子也不愿显示一个翻译读起来像一个错误。 |
| p46 | 674 |  |  | 27 | 0 | The whole correction pass costs microseconds, so it runs on every request instead of being cached. | 整张更正通行证花费微秒，所以它会按每个请求进行而不是缓存。 |
| p47 | 854 |  |  | 41 | 0 | Joining wrapped lines back together is what makes a wrapped paragraph translate as one context instead of many fragments. | 将包装的线条连接在一起，是使包装的段落能够将一个上下文而不是许多碎片翻译成一种上下文。 |
| p48 | 661 |  |  | 26 | 0 | If the source ends with a comma, the next line is almost certainly the rest of the same sentence. | 如果源端以逗号结束，下一行几乎肯定就是同一句的其余部分。 |
| p49 | 657 |  |  | 26 | 0 | The result is checked before the placeholders are restored, because a restored address would look like a repetition. | 在恢复占位符之前检查结果，因为恢复的地址将看起来像重复。 |
| p50 | 606 |  |  | 26 | 0 | Two failures in a row means the model cannot handle the sentence, and the reader gets the original text. | 连续两次失败意味着模型无法处理句子，而读者得到原始文本。 |
| i01 | 791 |  |  | 16 | 0 | Run `npm test` before committing, and check that the grep output contains no warnings. | 在承诺前运行 `npm test`, 检查 grep 输出是否包含警告。 |
| i02 | 839 |  |  | 16 | 0 | The script prints the BLEU score, which dropped because the tokenizer was not updated. | 脚本指纹为 BLEU 分，由于 tokenizer 分没有更新而掉落。 |
| i03 | 1132 |  |  | 25 | 2 | The worker calls onnxruntime-node directly, so the ONNX runtime version must match the prebuilt binary. | 工人直接拨打 onxruntime-node ",因此 ONNX 运行时间版本必须与预建的二进制匹配。 |
| i04 | 786 |  |  | 23 | 0 | Set dtype to q8 to load the quantized weights instead of the full precision ones. | 将 d类型设为 q8 以装载被激活的重量，而不是全精度的重量。 |
| i05 | 647 |  |  | 23 | 0 | The function returns a Promise that resolves to the translation text, and rejects on abort. | 函数返回一个对翻译文本有决定的“承诺”,在中止时拒绝。 |
| i06 | 810 |  |  | 16 | 2 | The JSON schema declares additionalProperties false, so unknown keys are rejected. | JSON schema 宣布额外属性为假，因此拒绝未知密钥。 |
| i07 | 784 |  |  | 28 | 1 | Marian exposes an encoder and a merged decoder, and the merged decoder keeps its own cache. | Marian揭露了编码器和合并的编码器，而合并的编码者保留着自己的缓存。 |
| i08 | 685 |  |  | 15 | 1 | The LRU cache holds five thousand entries, keyed by a hash of the source text. | LRU缓存有5000个条目，由源文本的散列键制。 |
| i09 | 632 |  |  | 25 | 0 | The remote method must not be named remove, because that name is taken by the namespace service. | 远程方法不能被命名为删除，因为名称空间服务使用该名称。 |
| i10 | 772 |  |  | 22 | 1 | A TypeScript declaration would be nicer, but the runtime only reads the prototype marker. | 一种类型Script声明会更好些，但运行时间只读取原型标记。 |
| i11 | 488 |  |  | 18 | 0 | The panel polls status every five hundred milliseconds while the download is in progress. | 电视板块投票每五百毫秒下载正在进行中 |
| i12 | 1210 |  |  | 15 | 5 | Set DSH_OFFLINE_TRANSLATOR_MODEL_ROOT to point the plugin at a different weights directory. | 设置 DSH_ OFFFLINE_TRANSLATOR_MODEL_ROOT 以将插件指向不同的重量目录。 |
| i13 | 893 |  |  | 26 | 1 | The CLI reports an ignored build script for protobufjs, but the prebuilt binaries are already present. | CLI 报告了被忽略的原生虫构建脚本，但预建的二进制书已经存在。 |
| i14 | 628 |  |  | 21 | 0 | Use the useCallback hook so the effect does not refetch on every render. | 使用回扣钩，这样效果不会对每个变换都产生反延。 |
| i15 | 765 |  |  | 33 | 0 | The function returns ok false with an error object instead of throwing, so callers must check the flag. | 函数返回错误对象，则返回错误对象即可，而不是丢弃。因此呼叫者必须检查旗帜。 |
| c01 | 556 |  |  | 15 | 0 | Open `src/index.ts` and change the default export to the controller class. | 打开 `src/index.ts` 并将默认导出更改为控制器类。 |
| c02 | 1122 |  |  | 18 | 2 | The failing line is `const value = map.get(key)!`, which asserts non-null without checking. | 失败行是“ 星值=映射。 get( Key)!”`,即未经核对不作无遗嘱。 |
| c03 | 712 |  |  | 13 | 1 | Replace `worker.postMessage(...)` with a message that carries the generation options. | 替换“工人.maessage(...)”包含代际选择的信息。 |
| c04 | 627 |  |  | 16 | 0 | The error came from `requireStrictCodec`, which throws when the codec mode is not strict. | 错误来自 `requireStrictCodec`, 当代码模式不严格时会丢弃。 |
| c05 | 451 |  |  | 13 | 3 | Call `postprocess(parts.join(''))` once at the end, not per fragment. | 结尾处一次拨打 `postprocess(parts.join(''))`,不是每个碎片。 |
| c06 | 526 |  |  | 14 | 0 | The regular expression `/\u200b/g` removes zero-width spaces from the source. | 正则表达式 `/\u200b/g` 从源中去除零维空格。 |
| c07 | 645 |  |  | 27 | 0 | Wrap the read in a try block, because the file may not exist on first launch. | 将读取内容在试写块中环绕，因为文件第一次启动时可能不存在。 |
| c08 | 444 |  |  | 17 | 0 | The settings object is frozen, so writing to it throws in strict mode. | 设置对象被冻结，因此将其写入严格模式。 |
| c09 | 446 |  |  | 10 | 3 | Guard the call with `typeof fn === 'function'` before invoking it. | 在援引前，用 `typeof fn === 'function'` 来保护呼叫。 |
| c10 | 524 |  |  | 21 | 0 | The test asserts that the injected style element count stays at one after two renders. | 试验声称，注入式样元素数保持在两分之一后一秒。 |
| c11 | 571 |  |  | 26 | 0 | Move the abort listener into a finally block, otherwise it leaks on the success path. | 将堕胎听众移动到最后一个街区，否则它会泄漏在成功道路上。 |
| c12 | 527 |  |  | 18 | 0 | The loop skips empty pieces so that a double newline does not produce an empty request. | 循环跳过空块，这样双行不会产生空白请求。 |
| c13 | 572 |  |  | 25 | 0 | Iterate the catalog synchronously, since reading a small file at boot is cheaper than an await chain. | 同步使用目录，因为阅读一个小文件在靴子上比等待链便宜。 |
| c14 | 627 |  |  | 26 | 0 | The reducer mutates the array it receives, which breaks the memoised selector downstream. | 减小器将它收到的数组调和，从而打破了记忆中的下游选择器。 |
| c15 | 476 |  |  | 19 | 0 | Return early when the identifier is already installed and the size matches. | 身份识别符安装完毕且大小匹配后，提前返回。 |
| l01 | 525 |  |  | 24 | 0 | Three things remain: verify the checksum, register the second slot, and document the settings file. | 剩下的三件事是：验证校验和，登记第二个槽，记录设置文件。 |
| l02 | 580 |  |  | 25 | 0 | The plan is short: measure first, then decide whether a bigger model is worth the memory. | 计划很短：首先测量，然后决定一个更大的模型是否值得记忆。 |
| l03 | 803 |  |  | 33 | 0 | Order matters here: normalise the source, split it into sentences, translate each, then clean the punctuation. | 这里的秩序问题：使源代码正常化，将其分成句子，翻译每个字，然后清理标点符号。 |
| l04 | 703 |  |  | 34 | 0 | Candidates are the small quantised model, the full precision one, and a larger multilingual model that needs more memory. | 候选人是小型的被批准模式、完全精确的模式和需要更多记忆的更大多语文模式。 |
| l05 | 451 |  |  | 20 | 0 | Two knobs are exposed: the repetition penalty and the maximum number of new tokens. | 有两个按钮被暴露：重复处罚和新牌的最大数量。 |
| l06 | 787 |  |  | 30 | 0 | Remaining risks: the mirror may rate limit, the disk may fill, and the user may switch model mid-sentence. | 其余风险：镜像可能设定的利率限度、磁盘可以填充，用户可转换中点模型。 |
| l07 | 594 |  |  | 29 | 0 | Steps one and two are done; step three needs the browser to be open, which I cannot do from here. | 第一步和第二步已经完成；第三步需要浏览器打开，我无法从这里开始。 |
| l08 | 528 |  |  | 23 | 0 | The settings page groups model selection, the glossary, and the repair switch into one card each. | 设置页面组合模式选择、词汇表和修理各转换为一张卡。 |
| l09 | 538 |  |  | 16 | 2 | Accept either an absolute path, a file URL, or a data URL for the input image. | 接受输入图像的绝对路径、文件 URL或数据 URL。 |
| l10 | 870 |  |  | 36 | 0 | Before shipping, confirm three facts: the package declares a bundle manifest, the repository is old enough, and the description matches the code. | 在发货前，确认三个事实：包裹上公布一个包装清单、存储库足够老并且说明与代码相符。 |
| m01 | 974 |  |  | 33 | 0 | The bug is subtle: `JSON.parse` throws on a file that starts with a byte order mark, and the message only says unexpected token. | 错误是微妙的： < <% > 丢弃在以字节顺序标记开头的文件上，而信件只标出意外的符号。 |
| m02 | 874 |  |  | 46 | 0 | Because the panel and the plugin page read the same file, editing a term in one place must show up in the other without a reload. | 因为面板和插件页面读取的是同一个文件，在一个地方编辑一个术语时必须显示在另一个地方而不重新加载。 |
| m03 | 929 |  |  | 35 | 0 | The downloader writes to a partial file, verifies the checksum, then renames it, so a crash mid-transfer never leaves a half file behind. | 下载器写到部分文件，验证校验和，然后重命名它，所以坠机中转时不会留下半个文件。 |
| m04 | 1116 |  |  | 39 | 0 | I expected the smaller model to be faster, but at full precision it answered in three hundred milliseconds against five hundred for the quantised one. | 我本以为小模型会更快但精确到完全准确它以300毫秒的速度接了被授与的1个，则以500秒的速度接 |
| m05 | 994 |  |  | 48 | 0 | The slot contract says a replacement must use a lower priority number and must keep access to the original text, so the panel always offers a way back to the English. | 时间档合同规定替换人必须使用较低的优先号码，而且必须保持查阅原始文本，因此小组总是提供返回英文的方法。 |
| m06 | 772 |  |  | 34 | 0 | If the same sentence appears twice in a session, the second request is served from memory in under a millisecond. | 如果同一句子在一届会议上出现两次，则第二个请求在一毫秒以下从记忆中发出。 |
| m07 | 666 |  |  | 37 | 0 | The mirror answered where the primary endpoint failed, which is why the downloader takes a list of endpoints instead of a single base address. | 镜子回答主端点失败的地方，这就是为什么下载器取了一个端点列表而不是一个基地址。 |
| m08 | 1003 |  |  | 42 | 0 | Nothing leaves the machine: the weights are local, the runtime is local, and the only network call is an optional model download the user starts by hand. | 机器一无所有：加权是本地的，运行时间是本地的。唯一的网络呼叫是非选用模式下载用户手动启动的。 |
| m09 | 1073 |  |  | 44 | 0 | A wrapped paragraph arrives as five short lines, and translating each line separately loses the connection between them, so the lines are joined before the splitter runs. | 包裹的段落以5条短线到达，将每条线分别翻译会失去它们之间的连接，因此在拆分器运行前将行连在一起。 |
| m10 | 1277 |  |  | 41 | 1 | The failure was silent: the configuration declared with the wrong schema library made the plugin load and then do nothing, with no error in the log. | 失败时没有音量：以错误的 schema 库宣布的配置，显示插件负载，然后不做任何操作，在日志中没有任何错误。 |
