import path from 'path';
import type { CliContext } from './context';

export function configFilePath(ctx: CliContext): string {
  if (ctx.platform === 'win32') {
    const appData = ctx.env.APPDATA || path.join(ctx.homedir, 'AppData', 'Roaming');
    return path.join(appData, '1msg', 'config.yaml');
  }
  const xdg = ctx.env.XDG_CONFIG_HOME || path.join(ctx.homedir, '.config');
  return path.join(xdg, '1msg', 'config.yaml');
}

export function cacheFilePath(ctx: CliContext): string {
  if (ctx.platform === 'win32') {
    const local = ctx.env.LOCALAPPDATA || path.join(ctx.homedir, 'AppData', 'Local');
    return path.join(local, '1msg', 'completion.json');
  }
  const xdg = ctx.env.XDG_CACHE_HOME || path.join(ctx.homedir, '.cache');
  return path.join(xdg, '1msg', 'completion.json');
}

export function resolveUserPath(ctx: CliContext, filePath: string): string {
  if (filePath === '-') return filePath;
  if (filePath.startsWith('~/')) return path.join(ctx.homedir, filePath.slice(2));
  return path.isAbsolute(filePath) ? filePath : path.join(ctx.cwd, filePath);
}
