const { ApiError } = require('../vision-forge/errors');

function commandCenterStorageError(error) {
  if (error && error.code === '42P01') {
    return new ApiError(503, 'Command Center telemetry store is not migrated yet.');
  }

  return error;
}

module.exports = {
  commandCenterStorageError
};
