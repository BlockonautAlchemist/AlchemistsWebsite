const { ApiError } = require('../vision-forge/errors');

function commandCenterStorageError(error) {
  if (error && ['42P01', '42703'].includes(error.code)) {
    return new ApiError(503, 'Command Center telemetry store is not migrated yet.');
  }

  return error;
}

module.exports = {
  commandCenterStorageError
};
