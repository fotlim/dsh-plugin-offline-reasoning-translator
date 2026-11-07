/**
 * Host-side mount probe: reproduce the DSH Loader's view of this plugin.
 *
 * It resolves cordis the way the profile does, resolves this plugin the way the
 * profile does, then compares the `Service` constructor identity between the two
 * module copies and attempts a real mount in a host-like Context.
 *
 * Usage: node scripts/host-mount-test.mjs [profileDir]
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const profileDir = process.argv[2] ?? 'C:/Users/LinOcean/.dsh/profiles/desktop';
const profileRequire = createRequire(path.join(profileDir, 'package.json'));

function resolveFrom(req, spec) {
  try {
    return req.resolve(spec);
  } catch (error) {
    return null;
  }
}

const hostCordisPath = resolveFrom(profileRequire, '@deepseek-ai/cordis');
console.log('HOST_CORDIS_PATH', hostCordisPath ?? 'UNRESOLVED');

const pluginPath = resolveFrom(profileRequire, 'dsh-plugin-offline-reasoning-translator');
console.log('PLUGIN_ENTRY', pluginPath ?? 'UNRESOLVED');
if (!pluginPath) {
  console.log('RESULT unresolved-plugin');
  process.exit(1);
}

const pluginRequire = createRequire(pluginPath);
const pluginCordisPath = resolveFrom(pluginRequire, '@deepseek-ai/cordis');
console.log('PLUGIN_CORDIS_PATH', pluginCordisPath ?? 'UNRESOLVED');

const plugin = await import(pathToFileURL(pluginPath).href);
console.log('PLUGIN_EXPORT', typeof plugin.default, plugin.default?.name);

if (!hostCordisPath || !pluginCordisPath) {
  console.log('RESULT missing-cordis');
  process.exit(1);
}

const hostCordis = await import(pathToFileURL(hostCordisPath).href);
const pluginCordis = await import(pathToFileURL(pluginCordisPath).href);
console.log('SAME_CORDIS_MODULE', hostCordisPath === pluginCordisPath);
console.log('SAME_SERVICE_CLASS', hostCordis.Service === pluginCordis.Service);

const { Context } = hostCordis;
const ctx = new Context();
const stub = {
  name: 'typert',
  typert: { namespace: 'typert', register: () => ({}) },
};
ctx.plugin(stub, {});

let mountError = null;
try {
  ctx.plugin(plugin.default, {});
} catch (error) {
  mountError = error;
}
console.log('MOUNT_ERROR', mountError ? `${mountError.name}: ${mountError.message}` : 'none');
console.log('SERVICE_PRESENT', Boolean(ctx.offlineReasoningTranslator));
console.log(
  'SERVICE_NAMESPACE',
  ctx.offlineReasoningTranslator?.typertRemote?.namespace ?? 'none',
);

try {
  await ctx.offlineReasoningTranslator?.status();
  console.log('STATUS_OK');
} catch (error) {
  console.log('STATUS_ERROR', `${error.name}: ${error.message}`);
}

await ctx.stop?.();
console.log('RESULT done');