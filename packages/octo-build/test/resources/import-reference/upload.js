/**
 * Leaves source maps out of an upload.
 */
export function skipSourceMaps(filePath) {
  return !filePath.endsWith('.map');
}
