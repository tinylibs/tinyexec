import {
  delimiter as pathDelimiter,
  resolve as resolvePath,
  dirname
} from 'node:path';

export type EnvLike = (typeof process)['env'];

export interface EnvPathInfo {
  key: string;
  value: string;
}

const isPathLikePattern = /^path$/i;
const defaultEnvPathInfo = {key: 'PATH', value: ''};

export function getPathFromEnv(env: EnvLike): EnvPathInfo {
  for (const key in env) {
    if (
      !Object.prototype.hasOwnProperty.call(env, key) ||
      !isPathLikePattern.test(key)
    ) {
      continue;
    }

    const value = env[key];

    if (!value) {
      return defaultEnvPathInfo;
    }

    return {key, value};
  }
  return defaultEnvPathInfo;
}

function addNodeBinToPath(cwd: string, path: EnvPathInfo): EnvPathInfo {
  const parts = path.value.split(pathDelimiter);
  const nodeModulesBinPaths: string[] = [];

  let currentPath = cwd;
  let lastPath: string;

  do {
    nodeModulesBinPaths.push(resolvePath(currentPath, 'node_modules', '.bin'));
    lastPath = currentPath;
    currentPath = dirname(currentPath);
  } while (currentPath !== lastPath);

  const newPath = nodeModulesBinPaths.concat(parts).join(pathDelimiter);

  return {key: path.key, value: newPath};
}

export function computeEnv(cwd: string, env?: EnvLike): EnvLike {
  const envWithDefault = {
    ...process.env,
    ...env
  };
  const envPathInfo = addNodeBinToPath(cwd, getPathFromEnv(envWithDefault));
  envWithDefault[envPathInfo.key] = envPathInfo.value;

  return envWithDefault;
}
