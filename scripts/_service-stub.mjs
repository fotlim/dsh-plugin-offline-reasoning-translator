// Minimal Host mount for tests that do not need a real model.
//
// The plugin is a Cordis Service: instantiating it needs a Context and the one
// service it injects (`typert`). A stub of that service is enough, because the
// Remote registry is only reachable through the browser gateway, which does not
// exist in a Node test.
import { Context, Service } from '@deepseek-ai/cordis'

import OfflineReasoningTranslator from '../index.js'

class StubTypert extends Service {
  constructor(ctx) {
    super(ctx, 'typert')
  }
}

/**
 * Mount the plugin and return its service instance.
 * @returns {Promise<import('../index.js').default>}
 */
export async function mountService() {
  const ctx = new Context()
  ctx.plugin(StubTypert)
  ctx.plugin(OfflineReasoningTranslator)
  // Cordis instantiates plugins on a microtask; one turn of the event loop is
  // enough for a plugin with no asynchronous apply.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const service = ctx.offlineReasoningTranslator
  if (service === undefined) throw new Error('plugin did not mount')
  return service
}