# bench: beams=1 norepeat=off glossary=off cleanup=off  vs  beams=1 norepeat=off mask=on repair=on cleanup=on

| # | EN | A: beams=1 norepeat=off glossary=off cleanup=off | B: beams=1 norepeat=off mask=on repair=on cleanup=on |
|---|---|---|---|
| 1 | When a grep over the log finds nothing, the parser may still be skipping the empty list. | 当日志上的角角没有找到任何结果时, 分析器仍然可能跳过空列表 。 | 当对日志的 grep 上找不到任何时, 分析器仍然可能跳过空列表。 |
| 2 | The BLEU score dropped because the store never updated its index. | 百老汇分数下降是因为商店从未更新指数。 | BLEU分数下降是因为商店从未更新指数。 |
| 3 | This is an edge case: a race condition between the worker thread and the event loop. | 这是一个边缘情况:工人线和事件环之间的种族状况。 | 这是一个边界情况:工作线程和事件循环之间的竞态条件。 |
| 4 | Make the handler idempotent so a retried request cannot apply the side effects twice. | 使处理者能满足以下条件:重新审理的请求不能两次应用副作用。 | 使处理者能满足以下条件:重试的请求不能两次应用副作用。 |
| 5 | The dependency injection container resolves the middleware on first use. | 依赖注射容器首先使用时可解决中间器械问题。 | 依赖注入容器首先使用时可解决中间件问题。 |
| 6 | Fix the memory leak by clearing the tokenizer cache after each batch. | 每批后清除代号器缓存,以弥补内存泄漏。 | 每批之后清除 " tokenizer 缓存,以弥补内存泄漏。 |
| 7 | The stack trace points at the serializer, not at the recursive function. | 序列器上的堆叠跟踪点, 而不是递归函数 。 | 序列器上的堆叠跟踪点, 而不是递归函数。 |
| 8 | A cold start costs eleven hundred milliseconds, so warm up the pipeline once. | 冷冻启动耗资1100毫秒 所以一次暖和输油管 | 冷启动耗资1100毫秒所以一次预热流水线 |
| 9 | The instruction says to refactor the runner into eight independent arms. | 指令要求把跑者重新装进八个独立的手臂 | 指令要求把跑者重构进八个独立的手臂 |
| 10 | We cut network round trips by caching the response for five minutes. | 我们把回应时间缩短五分钟 切断网络的往返飞行 | 我们把回应时间缩短五分钟切断网络的往返飞行 |
| 11 | The type inference fails because the closure captures a mutable variable. | 类型推论失败, 因为封闭点捕捉到可变变量 。 | 类型推断失败, 因为闭包捕捉到可变变量。 |
| 12 | Please review the pull request before the breaking change lands. | 请在拆迁土地之前审查拉动请求。 | 请在冲破土地变换之前审查 pull request。 |
| 13 | Run the integration test with `pnpm test --filter core` and paste the output. | 以 `pnpm test --filter core` 运行整合测试,并粘贴输出。 | 以 `pnpm test --filter core` 运行整合测试,并粘贴输出。 |
| 14 | The throughput of the thread pool is bounded by the garbage collection pauses. | 线索池的输送量 被垃圾收集暂停的 连接起来 | 线索池的吞吐量被垃圾回收暂停的连接起来 |
| 15 | Serialization of the embedding table dominates the latency budget. | 嵌入表的分级化在长期预算中占主导地位。 | " embedding表的序列化在长期预算中占主导地位。 |
| 16 | Check https://example.com/docs for the exact CLI flags. | 检查 CLI 的准确旗帜 https://example.com/docs 。 | 检查 https://example.com/docs 的准确 CLI 旗帜。 |
| 17 | The worker threads share no memory, which removes most of the race conditions. | 工人的线条没有记忆,这消除了大部分种族条件。 | 工作线程没有记忆,这消除了大部分竞态条件。 |
| 18 | If the source map is missing, the error points at the bundled file. | 如果缺少源地图,则在捆绑文件处的错误点为错误点。 | 如果缺少源映射,则在捆绑文件处的错误点为错误点。 |
| 19 | The hash table grows without bound because the iterator never releases keys. | 散列表的生长没有约束 因为传动器从不释放键。 | 哈希表的生长没有约束因为迭代器从不释放键。 |
| 20 | Idempotency matters here: replaying the event must not duplicate the record. | 在此处理有关能力的事项:重播事件时不得重复记录。 | 在此处理有关能力的事项:重放事件时不得重复记录。 |

A: load 1049 ms, median 617 ms, rss 583 MB
B: load 1134 ms, median 512 ms, rss 592 MB
