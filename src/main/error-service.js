const ERROR_MAP = {
  ERR_EXE_NOT_FOUND: {
    message: 'Game executable was not found.',
    troubleshooting: 'Open Edit Game and verify the executable path points to a valid .exe file.',
    retryable: false,
  },
  ERR_PERMISSION_DENIED: {
    message: 'Permission denied while trying to launch the game.',
    troubleshooting: 'Run GameDock as administrator or update file permissions for the game folder.',
    retryable: true,
  },
  ERR_BLOCKED_PATH: {
    message: 'This path is blocked for security reasons.',
    troubleshooting: 'Use a local absolute .exe path. Network shares are not allowed.',
    retryable: false,
  },
  ERR_WORKING_DIR_NOT_FOUND: {
    message: 'Working directory does not exist.',
    troubleshooting: 'Open Edit Game and set a valid working directory.',
    retryable: false,
  },
  ERR_GAME_NOT_FOUND: {
    message: 'Game entry could not be found.',
    troubleshooting: 'Refresh the library and try again.',
    retryable: true,
  },
  ERR_INVALID_LAUNCH: {
    message: 'Launch request is invalid.',
    troubleshooting: 'Remove and re-add the game if this continues.',
    retryable: false,
  },
  ERR_PATH_MISMATCH: {
    message: 'Launch blocked because path does not match stored entry.',
    troubleshooting: 'Edit the game entry and confirm the executable path.',
    retryable: false,
  },
  ERR_EXPORT_FAIL: {
    message: 'Backup export failed.',
    troubleshooting: 'Check write permissions for the target folder and try again.',
    retryable: true,
  },
  ERR_IMPORT_FAIL: {
    message: 'Backup import failed.',
    troubleshooting: 'Verify the JSON file is valid and was created by GameDock.',
    retryable: true,
  },
  ERR_RAWG_API_FAIL: {
    message: 'Discovery service is unavailable.',
    troubleshooting: 'Verify RAWG_API_KEY in .env and check network connectivity.',
    retryable: true,
  },
  ERR_NEWS_API_FAIL: {
    message: 'Community feed could not be loaded.',
    troubleshooting: 'Verify NEWS_API_KEY in .env and try again later.',
    retryable: true,
  },
  ERR_STEAM_DETECT_FAIL: {
    message: 'Steam library scan failed.',
    troubleshooting: 'Make sure Steam is installed and game libraries are accessible.',
    retryable: true,
  },
  ERR_STEAMGRIDDB_FAIL: {
    message: 'SteamGridDB artwork lookup failed.',
    troubleshooting: 'Verify STEAMGRIDDB_API_KEY in .env. Import can continue without artwork.',
    retryable: true,
  },
  ERR_IMAGE_DOWNLOAD_FAIL: {
    message: 'Could not download the selected image.',
    troubleshooting: 'Confirm the URL is reachable and points to a PNG/JPG/WebP image.',
    retryable: true,
  },
  ERR_IMAGE_INVALID: {
    message: 'Invalid image file.',
    troubleshooting: 'Use a valid PNG, JPG, or WebP image file.',
    retryable: false,
  },
  ERR_UNKNOWN: {
    message: 'An unexpected error occurred.',
    troubleshooting: 'Try again. If this persists, restart GameDock.',
    retryable: true,
  },
};

function getErrorDefinition(code) {
  return ERROR_MAP[code] || ERROR_MAP.ERR_UNKNOWN;
}

function makeError(code, details = {}) {
  const def = getErrorDefinition(code);
  return {
    code,
    message: def.message,
    troubleshooting: def.troubleshooting,
    retryable: Boolean(def.retryable),
    context: typeof details.context === 'string' ? details.context : '',
    details: typeof details.details === 'string' ? details.details : '',
  };
}

function fail(code, details = {}) {
  return { success: false, error: makeError(code, details) };
}

function toMessage(errorLike) {
  if (!errorLike) return getErrorDefinition('ERR_UNKNOWN').message;
  if (typeof errorLike === 'string') return errorLike;
  if (typeof errorLike?.message === 'string') return errorLike.message;
  return getErrorDefinition('ERR_UNKNOWN').message;
}

module.exports = {
  ERROR_MAP,
  makeError,
  fail,
  toMessage,
};

